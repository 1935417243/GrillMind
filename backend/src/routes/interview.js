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
    const { resumeId, jobType, depth, difficulty, focus } = req.body;

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

    // 验证岗位存在且已启用
    const finalJobType = jobType || resume.job_type;
    let jobCategory = 'non-tech';
    if (finalJobType) {
      const jobPos = db.prepare('SELECT id, enabled, category FROM job_positions WHERE id = ?').get(finalJobType);
      if (jobPos && !jobPos.enabled) {
        return reply.code(400).send({
          success: false,
          error: { code: 'POSITION_DISABLED', message: '该岗位已被禁用' },
        });
      }
      if (jobPos) {
        jobCategory = jobPos.category || 'non-tech';
      }
    }

    const id = uuidv4();

    // 根据深度和侧重点动态生成开场白
    const depthValue = depth || 'standard';
    const focusValue = focus || 'mixed';

    // 侧重点描述（根据岗位类型分支）
    const isTech = jobCategory === 'tech';
    const focusDesc = isTech
      ? { mixed: '技术背景和项目经历', project: '项目经历和架构设计', basic: '技术基础和核心原理' }[focusValue] || '技术背景和项目经历'
      : { mixed: '工作背景和过往经历', project: '工作经历和实操能力', basic: '专业基础和核心能力' }[focusValue] || '工作背景和过往经历';

    const briefChat = isTech ? '技术交流' : '交流';

    // 深度模板
    const openingTexts = {
      quick:    `你好，我是今天的面试官。我们做一次简短的${briefChat}，主要围绕你的${focusDesc}来展开。准备好了的话，先请你做一个简单的自我介绍吧。`,
      standard: `你好，我是今天的面试官。我们这场面试会围绕你的${focusDesc}来展开。准备好了的话，先请你做一个简单的自我介绍吧。`,
      deep:     `你好，我是今天的面试官。我们今天会比较深入地聊一聊你的${focusDesc}。准备好了的话，先请你做一个简单的自我介绍吧。`,
    };
    const openingMessage = {
      role: 'assistant',
      content: openingTexts[depthValue] || openingTexts.standard,
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
      finalJobType || null,
      depthValue,
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
             rp.overall_score,
             jp.name as job_name
      FROM interview_sessions s
      LEFT JOIN resumes r ON s.resume_id = r.id
      LEFT JOIN interview_reports rp ON s.report_id = rp.id
      LEFT JOIN job_positions jp ON s.job_type = jp.id
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

      // 岗位名称
      const jobName = row.job_name || row.job_type || '未知岗位';

      return {
        id: row.id,
        resumeName: row.resume_name,
        jobType: row.job_type,
        jobName,
        depth: row.duration,
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
    const jobPos = db.prepare('SELECT name, category FROM job_positions WHERE id = ?').get(session.job_type);

    return {
      success: true,
      data: {
        ...session,
        messages: JSON.parse(session.messages),
        resumeName: resume?.name,
        parsed: resume?.parsed ? JSON.parse(resume.parsed) : null,
        jobName: jobPos?.name || session.job_type || '未知岗位',
        jobCategory: jobPos?.category || 'non-tech',
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

    // 百炼（Qwen3 系列）默认开启深度思考，面试对话需关闭以缩短响应时间
    const isBailian = interviewModel.startsWith('bailian::');
    const extraBody = isBailian ? { enable_thinking: false } : {};

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
        extraBody,
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
