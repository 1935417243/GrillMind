// 面试报告路由

import { db } from '../db/index.js';
import { generateReportAsync } from '../services/reportGenerator.js';

/**
 * 安全解析 JSON 字符串，解析失败时返回默认值
 * @param {string|null} str - 待解析的 JSON 字符串
 * @param {*} fallback - 解析失败时的默认值
 * @returns {*} 解析结果或默认值
 */
function safeJsonParse(str, fallback) {
  if (!str) return fallback;
  try {
    const parsed = JSON.parse(str);
    return parsed ?? fallback;
  } catch {
    console.warn('报告 JSON 字段解析失败:', str.slice(0, 100));
    return fallback;
  }
}

/**
 * 注册报告相关路由
 * @param {import('fastify').FastifyInstance} fastify
 */
export default async function reportRoutes(fastify) {

  // 获取报告（按 sessionId 查询，支持轮询直到 status=done）
  fastify.get('/api/v1/reports/:sessionId', async (req, reply) => {
    const report = db.prepare(
      'SELECT * FROM interview_reports WHERE session_id = ?'
    ).get(req.params.sessionId);

    if (!report) {
      return reply.code(404).send({
        success: false,
        error: { code: 'REPORT_NOT_FOUND', message: '报告尚未生成' },
      });
    }

    return {
      success: true,
      data: {
        id: report.id,
        sessionId: report.session_id,
        overallScore: report.overall_score,
        summary: report.summary,
        qaBreakdown: safeJsonParse(report.qa_breakdown, []),
        riskPoints: safeJsonParse(report.risk_points, []),
        suggestions: safeJsonParse(report.suggestions, null),
        status: report.status,
        createdAt: report.created_at,
      },
    };
  });

  // 重试生成报告（删除旧的 failed 记录后重新生成）
  fastify.post('/api/v1/reports/:sessionId/retry', async (req, reply) => {
    const { sessionId } = req.params;

    // 检查 session 是否存在且已完成
    const session = db.prepare(
      'SELECT * FROM interview_sessions WHERE id = ?'
    ).get(sessionId);

    if (!session) {
      return reply.code(404).send({
        success: false,
        error: { code: 'SESSION_NOT_FOUND', message: '面试会话不存在' },
      });
    }

    // 删除旧的 failed 报告记录
    db.prepare(
      "DELETE FROM interview_reports WHERE session_id = ? AND status = 'failed'"
    ).run(sessionId);

    // 同时清除 session 中旧的 report_id 引用
    db.prepare(
      'UPDATE interview_sessions SET report_id = NULL WHERE id = ?'
    ).run(sessionId);

    // 异步重新生成报告
    generateReportAsync(sessionId).catch(err => {
      console.error('重试报告生成失败:', err);
    });

    return { success: true, data: { message: '正在重新生成报告' } };
  });
}
