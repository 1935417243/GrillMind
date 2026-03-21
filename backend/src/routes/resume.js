// 简历管理路由
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs/promises';
import { db } from '../db/index.js';
import { parseResumeAsync } from '../services/resumeParser.js';
import { UPLOADS_DIR, ensureUploadsDir } from '../utils/fileUtils.js';
import { nowCSTShort } from '../utils/time.js';

/**
 * 注册简历相关路由
 * @param {import('fastify').FastifyInstance} fastify
 */
export default async function resumeRoutes(fastify) {

  // 上传简历文件
  fastify.post('/api/v1/resumes/upload', async (req, reply) => {
    await ensureUploadsDir();
    const data = await req.file();

    if (!data) {
      return reply.code(400).send({
        success: false,
        error: { code: 'FILE_REQUIRED', message: '请上传文件' },
      });
    }

    const originalName = data.filename;
    const ext = path.extname(originalName).toLowerCase();

    // 检查文件类型
    if (!['.pdf', '.docx'].includes(ext)) {
      return reply.code(400).send({
        success: false,
        error: { code: 'FILE_TYPE_UNSUPPORTED', message: `不支持的文件类型: ${ext}` },
      });
    }

    // 保存文件
    const id = uuidv4();
    const fileName = `${id}${ext}`;
    const filePath = path.join(UPLOADS_DIR, fileName);
    const buffer = await data.toBuffer();

    // 检查文件大小（10MB 限制）
    if (buffer.length > 10 * 1024 * 1024) {
      return reply.code(413).send({
        success: false,
        error: { code: 'FILE_TOO_LARGE', message: '文件超过 10MB 限制' },
      });
    }

    await fs.writeFile(filePath, buffer);

    // 写入数据库
    db.prepare(`
      INSERT INTO resumes (id, name, file_path, parse_status, created_at)
      VALUES (?, ?, ?, 'pending', ?)
    `).run(id, originalName, filePath, nowCSTShort());

    // 异步触发解析（不阻塞上传响应）
    parseResumeAsync(id, filePath, originalName).catch(err => {
      console.error(`简历解析后台任务失败 [${id}]:`, err);
    });

    return { success: true, data: { id, name: originalName, status: 'pending' } };
  });

  // 获取简历列表
  fastify.get('/api/v1/resumes', async (req, reply) => {
    const rows = db.prepare(`
      SELECT r.id, r.name, r.job_type, r.is_active, r.parse_status, r.created_at,
             jp.name as job_name
      FROM resumes r
      LEFT JOIN job_positions jp ON r.job_type = jp.id
      ORDER BY r.created_at DESC
    `).all();

    const resumes = rows.map(row => {
      // 尝试解析 parsed 获取技术栈等信息
      let parsed = null;
      const fullRow = db.prepare('SELECT parsed FROM resumes WHERE id = ?').get(row.id);
      if (fullRow?.parsed) {
        try { parsed = JSON.parse(fullRow.parsed); } catch { }
      }
      return {
        id: row.id,
        name: row.name,
        jobType: row.job_type,
        jobName: row.job_name || null,
        isActive: !!row.is_active,
        parseStatus: row.parse_status,
        createdAt: row.created_at,
        yearsOfExperience: parsed?.yearsOfExperience,
        techStack: parsed?.techStack || [],
      };
    });

    return { success: true, data: resumes };
  });

  // 获取单份简历详情
  fastify.get('/api/v1/resumes/:id', async (req, reply) => {
    const row = db.prepare('SELECT * FROM resumes WHERE id = ?').get(req.params.id);
    if (!row) {
      return reply.code(404).send({
        success: false,
        error: { code: 'RESUME_NOT_FOUND', message: '简历不存在' },
      });
    }

    return {
      success: true,
      data: {
        id: row.id,
        name: row.name,
        jobType: row.job_type,
        isActive: !!row.is_active,
        parseStatus: row.parse_status,
        parseError: row.parse_error,
        parsed: row.parsed ? JSON.parse(row.parsed) : null,
        createdAt: row.created_at,
      },
    };
  });

  // 删除简历
  fastify.delete('/api/v1/resumes/:id', async (req, reply) => {
    const row = db.prepare('SELECT file_path FROM resumes WHERE id = ?').get(req.params.id);
    if (!row) {
      return reply.code(404).send({
        success: false,
        error: { code: 'RESUME_NOT_FOUND', message: '简历不存在' },
      });
    }

    // 检查是否有关联的面试记录
    const sessionCount = db.prepare(
      'SELECT COUNT(*) as count FROM interview_sessions WHERE resume_id = ?'
    ).get(req.params.id).count;

    // force 参数表示用户已确认强制删除
    const force = req.query.force === 'true';

    if (sessionCount > 0 && !force) {
      return reply.code(409).send({
        success: false,
        error: {
          code: 'RESUME_HAS_SESSIONS',
          message: `该简历关联了 ${sessionCount} 场面试记录，删除后相关记录也会一并删除。`,
          sessionCount,
        },
      });
    }

    // 删除文件
    try { await fs.unlink(row.file_path); } catch { }

    // 级联删除：面试报告 → 面试会话 → 简历
    const deleteAll = db.transaction((resumeId) => {
      db.prepare(`
        DELETE FROM interview_reports WHERE session_id IN (
          SELECT id FROM interview_sessions WHERE resume_id = ?
        )
      `).run(resumeId);
      db.prepare('DELETE FROM interview_sessions WHERE resume_id = ?').run(resumeId);
      db.prepare('DELETE FROM resumes WHERE id = ?').run(resumeId);
    });
    deleteAll(req.params.id);

    return { success: true, data: null };
  });

  // 设为当前使用简历
  fastify.put('/api/v1/resumes/:id/activate', async (req, reply) => {
    const row = db.prepare('SELECT id FROM resumes WHERE id = ?').get(req.params.id);
    if (!row) {
      return reply.code(404).send({
        success: false,
        error: { code: 'RESUME_NOT_FOUND', message: '简历不存在' },
      });
    }

    // 先清除所有 active，再设当前
    db.prepare('UPDATE resumes SET is_active = 0').run();
    db.prepare('UPDATE resumes SET is_active = 1 WHERE id = ?').run(req.params.id);
    return { success: true, data: { id: req.params.id } };
  });

  // 轮询解析状态
  fastify.get('/api/v1/resumes/:id/parse-status', async (req, reply) => {
    const row = db.prepare(
      'SELECT parse_status, parse_error FROM resumes WHERE id = ?'
    ).get(req.params.id);

    if (!row) {
      return reply.code(404).send({
        success: false,
        error: { code: 'RESUME_NOT_FOUND', message: '简历不存在' },
      });
    }

    return {
      success: true,
      data: {
        status: row.parse_status,
        error: row.parse_error,
      },
    };
  });

  // 重新解析简历（用于解析失败后重试）
  fastify.post('/api/v1/resumes/:id/reparse', async (req, reply) => {
    const row = db.prepare(
      'SELECT id, file_path, name, parse_status FROM resumes WHERE id = ?'
    ).get(req.params.id);

    if (!row) {
      return reply.code(404).send({
        success: false,
        error: { code: 'RESUME_NOT_FOUND', message: '简历不存在' },
      });
    }

    // 重置状态
    db.prepare(
      "UPDATE resumes SET parse_status = 'pending', parse_error = NULL, parsed = NULL WHERE id = ?"
    ).run(req.params.id);

    // 异步触发重新解析
    parseResumeAsync(row.id, row.file_path, row.name).catch(err => {
      console.error(`简历重新解析失败 [${row.id}]:`, err);
    });

    return { success: true, data: { id: row.id, status: 'pending' } };
  });
}
