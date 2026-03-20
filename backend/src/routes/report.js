// 面试报告路由

import { db } from '../db/index.js';
import { generateReportAsync } from '../services/reportGenerator.js';

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
        qaBreakdown: report.qa_breakdown ? JSON.parse(report.qa_breakdown) : [],
        riskPoints: report.risk_points ? JSON.parse(report.risk_points) : [],
        suggestions: report.suggestions ? JSON.parse(report.suggestions) : null,
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
