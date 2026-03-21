// 报告生成服务
// 提取 Q&A 对 → AI 评估 → 写入数据库
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/index.js';
import { chatCompletionWithRetry, getTaskModel, getTaskThinking, buildThinkingExtraBody } from '../ai/client.js';
import { buildReportPrompt } from '../ai/prompts/reportGen.js';
import { safeParseAIJson } from '../utils/fileUtils.js';
import { nowCSTShort } from '../utils/time.js';

/**
 * 异步生成面试报告（后台任务）
 * @param {string} sessionId - 面试会话 ID
 */
export async function generateReportAsync(sessionId) {
  const reportId = uuidv4();

  try {
    // 创建报告记录（状态：generating）
    db.prepare(`
      INSERT INTO interview_reports (id, session_id, created_at)
      VALUES (?, ?, ?)
    `).run(reportId, sessionId, nowCSTShort());

    // 更新 session 的 report_id
    db.prepare(
      'UPDATE interview_sessions SET report_id = ? WHERE id = ?'
    ).run(reportId, sessionId);

    // 加载会话和简历数据
    const session = db.prepare(
      'SELECT * FROM interview_sessions WHERE id = ?'
    ).get(sessionId);

    const resume = db.prepare(
      'SELECT * FROM resumes WHERE id = ?'
    ).get(session.resume_id);

    const messages = JSON.parse(session.messages);
    const parsed   = JSON.parse(resume.parsed);

    // 查询岗位名称和类型
    const jobPos = db.prepare('SELECT name, category FROM job_positions WHERE id = ?').get(session.job_type);
    const jobName = jobPos ? jobPos.name : (session.job_type || '未知岗位');
    const category = jobPos ? (jobPos.category || 'non-tech') : 'non-tech';

    // 构建 prompt 并调用 AI（非流式）
    const reportModel = getTaskModel('report');
    const promptMessages = buildReportPrompt({
      messages,
      parsed,
      jobName,
      category,
    });

    const aiResult = await chatCompletionWithRetry({
      providerModel: reportModel,
      messages: promptMessages,
      extraBody: buildThinkingExtraBody(reportModel, getTaskThinking('report')),
    });

    // 解析报告结果
    const report = safeParseAIJson(aiResult);

    // 写入数据库
    db.prepare(`
      UPDATE interview_reports
      SET overall_score = ?,
          summary = ?,
          qa_breakdown = ?,
          risk_points = ?,
          suggestions = ?,
          status = 'done'
      WHERE id = ?
    `).run(
      report.overallScore,
      report.summary,
      JSON.stringify(report.qaBreakdown),
      JSON.stringify(report.riskPoints),
      JSON.stringify(report.suggestions),
      reportId
    );

  } catch (err) {
    console.error(`报告生成失败 [${sessionId}]:`, err);
    db.prepare(`
      UPDATE interview_reports
      SET status = 'failed'
      WHERE id = ?
    `).run(reportId);
  }
}
