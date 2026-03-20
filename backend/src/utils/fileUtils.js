// 文件工具函数
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 上传文件存储目录
export const UPLOADS_DIR = path.join(__dirname, '../../uploads');

/**
 * 确保上传目录存在
 */
export async function ensureUploadsDir() {
  try {
    await fs.access(UPLOADS_DIR);
  } catch {
    await fs.mkdir(UPLOADS_DIR, { recursive: true });
  }
}

/**
 * 安全解析 AI 返回的 JSON
 * AI 偶尔返回带代码块标记的 JSON，需清洗
 * @param {string} raw - AI 返回的原始内容
 * @returns {object} - 解析后的对象
 */
export function safeParseAIJson(raw) {
  const cleaned = raw
    .replace(/^```json?\s*/m, '')
    .replace(/\s*```$/m, '')
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    throw new Error('AI returned invalid JSON');
  }
}
