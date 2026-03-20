// 简历解析服务
// 文件解析（PDF/DOCX → 文本）+ AI 结构化
import pdfParse from 'pdf-parse';
import mammoth  from 'mammoth';
import fs       from 'fs/promises';
import path     from 'path';
import { db }   from '../db/index.js';
import { chatCompletionWithRetry, getTaskModel } from '../ai/client.js';
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
    const messages = buildResumeParsePrompt(rawText);

    const aiResult = await chatCompletionWithRetry({
      providerModel: parseModel,
      messages,
    });

    // 安全解析 JSON
    const parsed = safeParseAIJson(aiResult);

    // 推断岗位类型
    const jobType = parsed.jobTendency === 'test' ? 'test' : 'backend';

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
