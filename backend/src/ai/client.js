// AI 客户端工厂与调用封装
import OpenAI from 'openai';
import { db } from '../db/index.js';
import { decrypt } from '../utils/crypto.js';

/**
 * 根据 'provider::modelName' 格式动态构造 OpenAI 兼容客户端
 * @param {string} providerModel - 格式如 'deepseek::deepseek-chat'
 * @returns {OpenAI} - OpenAI 客户端实例
 */
export function getAIClient(providerModel) {
  const [provider] = providerModel.split('::');

  const row = db.prepare(
    'SELECT api_key_enc, base_url, is_connected FROM model_providers WHERE provider = ?'
  ).get(provider);

  if (!row?.is_connected) {
    throw new Error(`Provider "${provider}" not configured or not connected`);
  }

  return new OpenAI({
    apiKey: decrypt(row.api_key_enc),
    baseURL: row.base_url,
    timeout: 300 * 1000,  // 300秒超时（推理模型如 deepseek-reasoner 思考时间较长）
    maxRetries: 0,        // 由 chatCompletionWithRetry 统一管理重试
  });
}

/**
 * 从 providerModel 字符串中提取模型名
 * @param {string} providerModel
 * @returns {string}
 */
export function getModelName(providerModel) {
  return providerModel.split('::')[1];
}

/**
 * 获取任务对应的 providerModel 字符串
 * @param {'parse' | 'interview' | 'report'} task
 * @returns {string}
 */
export function getTaskModel(task) {
  const binding = db.prepare(
    "SELECT * FROM task_model_binding WHERE id = 'singleton'"
  ).get();

  const map = {
    parse:     binding?.parse_model,
    interview: binding?.interview_model,
    report:    binding?.report_model || binding?.interview_model,
    base:      binding?.base_model,
  };

  if (!map[task]) throw new Error(`Task model for "${task}" not bound`);
  return map[task];
}

/**
 * 调用 AI Chat Completion
 * @param {object} options
 * @param {string} options.providerModel - 'provider::model'
 * @param {Array} options.messages - 消息数组
 * @param {boolean} [options.stream=false] - 是否流式
 * @param {object} [options.extraBody={}] - 透传给供应商的扩展参数（如百炼的 enable_thinking）
 * @returns {Promise}
 */
export async function chatCompletion({ providerModel, messages, stream = false, extraBody = {} }) {
  const client = getAIClient(providerModel);
  const model  = getModelName(providerModel);

  return client.chat.completions.create({ model, messages, stream, ...extraBody });
}

/**
 * 带重试的非流式调用（用于解析、报告生成）
 * 429（限流）和 500+（服务器错误）会自动重试
 * @param {object} options - chatCompletion 参数
 * @param {number} [maxRetries=2] - 最大重试次数
 * @returns {Promise<string>} - AI 返回的文本内容
 */
export async function chatCompletionWithRetry(options, maxRetries = 2) {
  let lastError;
  for (let i = 0; i <= maxRetries; i++) {
    try {
      const resp = await chatCompletion({ ...options, stream: false });
      return resp.choices[0].message.content;
    } catch (err) {
      lastError = err;
      console.warn(`AI 调用失败 (第${i + 1}次):`, err.message || err);

      // 401/403 等认证错误不重试
      if (err.status && err.status < 500 && err.status !== 429) {
        throw err;
      }

      // 429 限流：递增等待
      if (err.status === 429) { await sleep(2000 * (i + 1)); continue; }
      // 500+ 服务器错误 或 网络层错误（无 status，如 Premature close、ECONNRESET）：短暂等待后重试
      await sleep(1000 * (i + 1));
    }
  }
  throw lastError;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
