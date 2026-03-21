// 岗位管理路由
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/index.js';
import { getTaskModel, chatCompletionWithRetry } from '../ai/client.js';

/**
 * 注册岗位管理相关路由
 * @param {import('fastify').FastifyInstance} fastify
 */
export default async function jobPositionRoutes(fastify) {

  // 获取岗位列表（按 sort_order 排序，附带使用次数）
  fastify.get('/api/v1/job-positions', async () => {
    const rows = db.prepare(`
      SELECT jp.*,
             COUNT(s.id) AS use_count
      FROM job_positions jp
      LEFT JOIN interview_sessions s ON s.job_type = jp.id
      GROUP BY jp.id
      ORDER BY jp.sort_order ASC, jp.created_at ASC
    `).all();

    return {
      success: true,
      data: rows.map(row => ({
        id: row.id,
        name: row.name,
        tags: row.tags,
        scripts: JSON.parse(row.scripts),
        enabled: !!row.enabled,
        sortOrder: row.sort_order,
        useCount: row.use_count,
        createdAt: row.created_at,
      })),
    };
  });

  // 获取岗位详情
  fastify.get('/api/v1/job-positions/:id', async (req, reply) => {
    const row = db.prepare('SELECT * FROM job_positions WHERE id = ?').get(req.params.id);
    if (!row) {
      return reply.code(404).send({
        success: false,
        error: { code: 'POSITION_NOT_FOUND', message: '岗位不存在' },
      });
    }

    return {
      success: true,
      data: {
        id: row.id,
        name: row.name,
        tags: row.tags,
        scripts: JSON.parse(row.scripts),
        enabled: !!row.enabled,
        sortOrder: row.sort_order,
        createdAt: row.created_at,
      },
    };
  });

  // 新增岗位
  fastify.post('/api/v1/job-positions', async (req, reply) => {
    const { name, tags, scripts, enabled, sortOrder } = req.body;

    if (!name || !name.trim()) {
      return reply.code(400).send({
        success: false,
        error: { code: 'NAME_REQUIRED', message: '岗位名称不能为空' },
      });
    }

    // 检查名称是否重复
    const existing = db.prepare('SELECT id FROM job_positions WHERE name = ?').get(name.trim());
    if (existing) {
      return reply.code(400).send({
        success: false,
        error: { code: 'NAME_DUPLICATE', message: '岗位名称已存在' },
      });
    }

    // 校验考察脚本
    if (!scripts || !scripts.mixed || !scripts.project || !scripts.basic) {
      return reply.code(400).send({
        success: false,
        error: { code: 'SCRIPTS_REQUIRED', message: '请填写三套考察脚本（综合、项目深挖、基础能力）' },
      });
    }

    const id = uuidv4();
    db.prepare(`
      INSERT INTO job_positions (id, name, tags, scripts, enabled, sort_order)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      id,
      name.trim(),
      tags || '',
      JSON.stringify(scripts),
      enabled !== false ? 1 : 0,
      sortOrder ?? 0,
    );

    return {
      success: true,
      data: { id },
    };
  });

  // 编辑岗位
  fastify.put('/api/v1/job-positions/:id', async (req, reply) => {
    const row = db.prepare('SELECT * FROM job_positions WHERE id = ?').get(req.params.id);
    if (!row) {
      return reply.code(404).send({
        success: false,
        error: { code: 'POSITION_NOT_FOUND', message: '岗位不存在' },
      });
    }

    const { name, tags, scripts, enabled, sortOrder } = req.body;

    if (!name || !name.trim()) {
      return reply.code(400).send({
        success: false,
        error: { code: 'NAME_REQUIRED', message: '岗位名称不能为空' },
      });
    }

    // 检查名称是否与其他岗位重复
    const dup = db.prepare('SELECT id FROM job_positions WHERE name = ? AND id != ?').get(name.trim(), req.params.id);
    if (dup) {
      return reply.code(400).send({
        success: false,
        error: { code: 'NAME_DUPLICATE', message: '岗位名称已存在' },
      });
    }

    if (!scripts || !scripts.mixed || !scripts.project || !scripts.basic) {
      return reply.code(400).send({
        success: false,
        error: { code: 'SCRIPTS_REQUIRED', message: '请填写三套考察脚本（综合、项目深挖、基础能力）' },
      });
    }

    db.prepare(`
      UPDATE job_positions
      SET name = ?, tags = ?, scripts = ?, enabled = ?, sort_order = ?
      WHERE id = ?
    `).run(
      name.trim(),
      tags || '',
      JSON.stringify(scripts),
      enabled !== false ? 1 : 0,
      sortOrder ?? row.sort_order,
      req.params.id,
    );

    return { success: true, data: { updated: true } };
  });

  // 删除岗位（已被面试引用的禁止删除）
  fastify.delete('/api/v1/job-positions/:id', async (req, reply) => {
    const row = db.prepare('SELECT * FROM job_positions WHERE id = ?').get(req.params.id);
    if (!row) {
      return reply.code(404).send({
        success: false,
        error: { code: 'POSITION_NOT_FOUND', message: '岗位不存在' },
      });
    }

    // 检查是否有面试记录引用
    const useCount = db.prepare(
      'SELECT COUNT(*) AS cnt FROM interview_sessions WHERE job_type = ?'
    ).get(req.params.id);

    if (useCount.cnt > 0) {
      return reply.code(400).send({
        success: false,
        error: { code: 'POSITION_IN_USE', message: `该岗位已被 ${useCount.cnt} 场面试使用，无法删除` },
      });
    }

    db.prepare('DELETE FROM job_positions WHERE id = ?').run(req.params.id);
    return { success: true, data: { deleted: true } };
  });

  // 启用/禁用切换
  fastify.put('/api/v1/job-positions/:id/toggle', async (req, reply) => {
    const row = db.prepare('SELECT * FROM job_positions WHERE id = ?').get(req.params.id);
    if (!row) {
      return reply.code(404).send({
        success: false,
        error: { code: 'POSITION_NOT_FOUND', message: '岗位不存在' },
      });
    }

    const newEnabled = row.enabled ? 0 : 1;
    db.prepare('UPDATE job_positions SET enabled = ? WHERE id = ?').run(newEnabled, req.params.id);

    return {
      success: true,
      data: { enabled: !!newEnabled },
    };
  });

  // AI 一键生成岗位标签与考察脚本
  fastify.post('/api/v1/job-positions/generate', async (req, reply) => {
    const { jobName } = req.body;

    if (!jobName || !jobName.trim()) {
      return reply.code(400).send({
        success: false,
        error: { code: 'NAME_REQUIRED', message: '岗位名称不能为空' },
      });
    }

    // 获取基础模型绑定
    let providerModel;
    try {
      providerModel = getTaskModel('base');
    } catch {
      return reply.code(400).send({
        success: false,
        error: { code: 'MODEL_NOT_BOUND', message: '请先在模型设置中绑定基础模型' },
      });
    }

    const prompt = `你是一位经验丰富的人力资源专家，擅长为各类岗位设计面试考察方案。
请根据岗位名称"${jobName.trim()}"，生成该岗位的标签和三套面试考察脚本。

注意：
- 请先判断这是什么类型的岗位（技术类、服务类、管理类、销售类、创意类等）
- 根据岗位实际特点设计考察内容，不要套用技术岗模板
- 考察点要贴近该岗位日常工作场景，接地气、有针对性

生成规则：
1. tags：3 个该岗位核心能力关键词，用 " · " 分隔
2. mixed（综合考察）：综合评估候选人的经验与综合素质，6-8 条
3. project（实操深挖）：深入了解候选人处理实际工作场景的能力，6-8 条  
4. basic（基础能力）：考察该岗位所需的基本素养与核心能力，6-8 条

每条格式为"- 考察方向：具体问题点1、问题点2、问题点3"，每行一条。

请严格返回以下 JSON 格式，不要添加任何其他文字：
{
  "tags": "标签1 · 标签2 · 标签3",
  "mixed": "- 方向A：考察点1、考察点2\\n- 方向B：考察点3、考察点4",
  "project": "- 方向A：考察点1、考察点2\\n- 方向B：考察点3、考察点4",
  "basic": "- 方向A：考察点1、考察点2\\n- 方向B：考察点3、考察点4"
}`;

    try {
      const content = await chatCompletionWithRetry({
        providerModel,
        messages: [{ role: 'user', content: prompt }],
      });

      // 从返回内容中提取 JSON（兼容 markdown 代码块包裹）
      let jsonStr = content;
      const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (codeBlockMatch) {
        jsonStr = codeBlockMatch[1].trim();
      } else {
        // 尝试提取第一个 { ... } 块
        const braceMatch = content.match(/\{[\s\S]*\}/);
        if (braceMatch) jsonStr = braceMatch[0];
      }

      const result = JSON.parse(jsonStr);

      return {
        success: true,
        data: {
          tags: result.tags || '',
          scripts: {
            mixed: result.mixed || '',
            project: result.project || '',
            basic: result.basic || '',
          },
        },
      };
    } catch (err) {
      return reply.code(500).send({
        success: false,
        error: { code: 'GENERATE_FAILED', message: err.message || '生成失败' },
      });
    }
  });
}
