// 面试会话路由
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/index.js';
import { InterviewEngine } from '../services/interviewEngine.js';
import { chatCompletion, getTaskModel } from '../ai/client.js';
import { generateReportAsync } from '../services/reportGenerator.js';
import { nowCST, nowCSTShort } from '../utils/time.js';

/**
 * 注册面试会话相关路由
 * @param {import('fastify').FastifyInstance} fastify
 */
export default async function interviewRoutes(fastify) {

  // 创建面试会话
  fastify.post('/api/v1/sessions', async (req, reply) => {
    const { resumeId, jobType, duration, difficulty, focus } = req.body;

    // 检查简历
    const resume = db.prepare('SELECT * FROM resumes WHERE id = ?').get(resumeId);
    if (!resume) {
      return reply.code(404).send({
        success: false,
        error: { code: 'RESUME_NOT_FOUND', message: '简历不存在' },
      });
    }
    if (resume.parse_status !== 'done') {
      return reply.code(400).send({
        success: false,
        error: { code: 'RESUME_NOT_PARSED', message: '简历尚未完成解析' },
      });
    }

    const id = uuidv4();

    // 生成开场白（本地模板，不调用 AI）
    const openingMessage = {
      role: 'assistant',
      content: '你好，我是今天的面试官。我们这场面试时间大约在 30 分钟左右，主要围绕你的技术背景和项目经历来展开。准备好了的话，先请你做一个简单的自我介绍吧。',
      timestamp: nowCST(),
      stage: 'opening',
    };

    const startedAt = nowCSTShort();
    db.prepare(`
      INSERT INTO interview_sessions (id, resume_id, job_type, duration, difficulty, focus, messages, started_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      resumeId,
      jobType || resume.job_type || 'backend',
      duration || 30,
      difficulty || 'pressure',
      focus || 'mixed',
      JSON.stringify([openingMessage]),
      startedAt
    );

    return {
      success: true,
      data: {
        sessionId: id,
        openingMessage,
      },
    };
  });

  // 获取历史会话列表
  fastify.get('/api/v1/sessions', async (req, reply) => {
    const rows = db.prepare(`
      SELECT s.id, s.resume_id, s.job_type, s.duration, s.difficulty, s.status,
             s.started_at, s.ended_at, s.report_id,
             r.name as resume_name,
             rp.overall_score
      FROM interview_sessions s
      LEFT JOIN resumes r ON s.resume_id = r.id
      LEFT JOIN interview_reports rp ON s.report_id = rp.id
      ORDER BY s.started_at DESC
    `).all();

    const sessions = rows.map(row => {
      // 计算对话轮次
      let turnsCount = 0;
      try {
        const session = db.prepare('SELECT messages FROM interview_sessions WHERE id = ?').get(row.id);
        if (session?.messages) {
          const msgs = JSON.parse(session.messages);
          turnsCount = msgs.filter(m => m.role === 'assistant' && m.stage !== 'opening' && m.stage !== 'closing').length;
        }
      } catch {}

      return {
        id: row.id,
        resumeName: row.resume_name,
        jobType: row.job_type,
        duration: row.duration,
        difficulty: row.difficulty,
        status: row.status,
        startedAt: row.started_at,
        endedAt: row.ended_at,
        overallScore: row.overall_score,
        turnsCount,
      };
    });

    return { success: true, data: sessions };
  });

  // 获取会话详情
  fastify.get('/api/v1/sessions/:id', async (req, reply) => {
    const session = db.prepare(
      'SELECT * FROM interview_sessions WHERE id = ?'
    ).get(req.params.id);

    if (!session) {
      return reply.code(404).send({
        success: false,
        error: { code: 'SESSION_NOT_FOUND', message: '会话不存在' },
      });
    }

    const resume = db.prepare('SELECT * FROM resumes WHERE id = ?').get(session.resume_id);

    return {
      success: true,
      data: {
        ...session,
        messages: JSON.parse(session.messages),
        resumeName: resume?.name,
        parsed: resume?.parsed ? JSON.parse(resume.parsed) : null,
      },
    };
  });

  // 发送消息（SSE 流式响应）
  fastify.post('/api/v1/sessions/:id/chat', async (req, reply) => {
    const { content } = req.body;
    const session = db.prepare(
      'SELECT * FROM interview_sessions WHERE id = ?'
    ).get(req.params.id);

    if (!session || session.status !== 'in_progress') {
      return reply.code(400).send({
        success: false,
        error: { code: 'SESSION_NOT_ACTIVE', message: '面试会话不在进行中' },
      });
    }

    const resume = db.prepare('SELECT * FROM resumes WHERE id = ?').get(session.resume_id);
    const engine = new InterviewEngine(session, resume);

    // 追加用户消息
    engine.appendMessage('user', content);

    // 构建 AI 消息
    const aiMessages     = engine.buildAIMessages(content);
    const interviewModel = getTaskModel('interview');

    // 设置 SSE 响应头
    reply.raw.writeHead(200, {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
    });

    try {
      const stream = await chatCompletion({
        providerModel: interviewModel,
        messages:      aiMessages,
        stream:        true,
      });

      let fullContent = '';

      for await (const chunk of stream) {
        const token = chunk.choices[0]?.delta?.content || '';
        if (token) {
          fullContent += token;
          reply.raw.write(`data: ${JSON.stringify({ token })}\n\n`);
        }
      }

      // 追加 AI 回复并持久化
      engine.appendMessage('assistant', fullContent);
      engine.persist();

      reply.raw.write(`data: ${JSON.stringify({ done: true, stage: engine.stage })}\n\n`);
    } catch (err) {
      console.error('面试对话 AI 调用失败:', err);
      reply.raw.write(`data: ${JSON.stringify({ error: true, message: err.message })}\n\n`);
    }

    reply.raw.end();
  });

  // 结束面试
  fastify.post('/api/v1/sessions/:id/end', async (req, reply) => {
    const session = db.prepare(
      'SELECT * FROM interview_sessions WHERE id = ?'
    ).get(req.params.id);

    if (!session) {
      return reply.code(404).send({
        success: false,
        error: { code: 'SESSION_NOT_FOUND', message: '会话不存在' },
      });
    }

    // 更新状态
    const endedAt = nowCSTShort();
    db.prepare(`
      UPDATE interview_sessions
      SET status = 'completed', ended_at = ?
      WHERE id = ?
    `).run(endedAt, req.params.id);

    // 异步触发报告生成
    generateReportAsync(req.params.id).catch(err => {
      console.error(`报告生成任务失败 [${req.params.id}]:`, err);
    });

    return {
      success: true,
      data: { reportStatus: 'generating' },
    };
  });

  // 删除面试会话（级联删除关联报告）
  fastify.delete('/api/v1/sessions/:id', async (req, reply) => {
    const session = db.prepare(
      'SELECT * FROM interview_sessions WHERE id = ?'
    ).get(req.params.id);

    if (!session) {
      return reply.code(404).send({
        success: false,
        error: { code: 'SESSION_NOT_FOUND', message: '会话不存在' },
      });
    }

    // 删除关联的报告
    db.prepare(
      'DELETE FROM interview_reports WHERE session_id = ?'
    ).run(req.params.id);

    // 删除会话
    db.prepare(
      'DELETE FROM interview_sessions WHERE id = ?'
    ).run(req.params.id);

    return { success: true, data: { deleted: true } };
  });
}
