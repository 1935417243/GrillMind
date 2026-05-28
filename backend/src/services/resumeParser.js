// 简历解析服务
// 文件解析（PDF/DOCX → 文本）+ AI 结构化
import pdfParse from 'pdf-parse';
import mammoth  from 'mammoth';
import fs       from 'fs/promises';
import path     from 'path';
import { db }   from '../db/index.js';
import { chatCompletionWithRetry, getTaskModel, getTaskThinking, buildThinkingExtraBody } from '../ai/client.js';
import { buildResumeParsePrompt } from '../ai/prompts/resumeParse.js';
import { safeParseAIJson } from '../utils/fileUtils.js';

/**
 * 从文件中提取文本内容
 * @param {string} filePath - 文件路径
 * @param {string} originalName - 原始文件名
 * @returns {Promise<string>} - 提取的文本
 */
export async function extractText(filePath, originalName) {
  const ext    = path.extname(originalName).toLowerCase();
  const buffer = await fs.readFile(filePath);

  if (ext === '.pdf') {
    const result = await pdfParse(buffer);
    return result.text;
  }

  if (ext === '.docx') {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  throw new Error(`FILE_TYPE_UNSUPPORTED: ${ext}`);
}

/**
 * 异步解析简历（后台任务）
 * 上传后立即返回，此函数在后台执行
 * @param {string} resumeId
 * @param {string} filePath
 * @param {string} originalName
 */
export async function parseResumeAsync(resumeId, filePath, originalName) {
  try {
    // 更新状态为处理中
    db.prepare(
      'UPDATE resumes SET parse_status = ? WHERE id = ?'
    ).run('processing', resumeId);

    // 提取文本
    const rawText = await extractText(filePath, originalName);

    // 更新原始文本
    db.prepare(
      'UPDATE resumes SET raw_text = ? WHERE id = ?'
    ).run(rawText, resumeId);

    // AI 结构化解析
    const parseModel = getTaskModel('parse');

    // 查询已启用岗位列表，注入到 Prompt 中
    const jobPositions = db.prepare(
      'SELECT id, name, tags FROM job_positions WHERE enabled = 1 ORDER BY sort_order ASC'
    ).all();

    const messages = buildResumeParsePrompt(rawText, jobPositions);

    const aiResult = await chatCompletionWithRetry({
      providerModel: parseModel,
      messages,
      jsonMode: true,
      extraBody: buildThinkingExtraBody(parseModel, getTaskThinking('parse')),
    });

    // 安全解析 JSON
    const parsed = safeParseAIJson(aiResult);

    // 验证 AI 返回的岗位 ID 是否有效，无效则降级为 null
    const validIds = new Set(jobPositions.map(jp => jp.id));
    const jobType = (parsed.jobTendency && validIds.has(parsed.jobTendency))
      ? parsed.jobTendency
      : null;

    // 写入数据库
    db.prepare(`
      UPDATE resumes
      SET parsed = ?, job_type = ?, parse_status = 'done'
      WHERE id = ?
    `).run(JSON.stringify(parsed), jobType, resumeId);

  } catch (err) {
    console.error(`简历解析失败 [${resumeId}]:`, err);
    db.prepare(`
      UPDATE resumes
      SET parse_status = 'failed', parse_error = ?
      WHERE id = ?
    `).run(err.message, resumeId);
  }
}
