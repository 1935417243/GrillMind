// 模型供应商管理服务
import OpenAI from 'openai';
import { db } from '../db/index.js';
import { encrypt, decrypt } from '../utils/crypto.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * 获取所有供应商配置（Key 脱敏）
 * @returns {Array}
 */
export function getAllProviders() {
  const rows = db.prepare('SELECT * FROM model_providers ORDER BY provider').all();
  return rows.map(row => ({
    id: row.id,
    provider: row.provider,
    baseUrl: row.base_url,
    hasApiKey: !!row.api_key_enc,
    isConnected: !!row.is_connected,
    models: row.models ? JSON.parse(row.models) : [],
    updatedAt: row.updated_at,
  }));
}

/**
 * 保存供应商配置
 * @param {string} providerName - 供应商名称
 * @param {object} config - { apiKey, baseUrl }
 */
export function saveProvider(providerName, { apiKey, baseUrl }) {
  const existing = db.prepare(
    'SELECT id FROM model_providers WHERE provider = ?'
  ).get(providerName);

  const apiKeyEnc = apiKey ? encrypt(apiKey) : null;

  if (existing) {
    // 更新
    if (apiKey) {
      db.prepare(`
        UPDATE model_providers
        SET api_key_enc = ?, base_url = ?, updated_at = datetime('now', '+8 hours')
        WHERE provider = ?
      `).run(apiKeyEnc, baseUrl, providerName);
    } else {
      db.prepare(`
        UPDATE model_providers
        SET base_url = ?, updated_at = datetime('now', '+8 hours')
        WHERE provider = ?
      `).run(baseUrl, providerName);
    }
  } else {
    // 新建
    db.prepare(`
      INSERT INTO model_providers (id, provider, api_key_enc, base_url)
      VALUES (?, ?, ?, ?)
    `).run(uuidv4(), providerName, apiKeyEnc, baseUrl);
  }
}

/**
 * 测试供应商连接并拉取模型列表
 * @param {string} providerName
 * @param {object} config - { apiKey, baseUrl }
 * @returns {Promise<{connected: boolean, models: string[]}>}
 */
export async function testProviderConnection(providerName, { apiKey, baseUrl }) {
  try {
    // 如果前端没传新 Key，从数据库取已保存的
    let actualKey = apiKey;
    if (!actualKey) {
      const existing = db.prepare(
        'SELECT api_key_enc FROM model_providers WHERE provider = ?'
      ).get(providerName);
      if (!existing?.api_key_enc) {
        return { connected: false, models: [], error: '未保存 API Key' };
      }
      actualKey = decrypt(existing.api_key_enc);
    }

    const client = new OpenAI({ apiKey: actualKey, baseURL: baseUrl });
    const response = await client.models.list();

    // 收集模型 ID
    const models = [];
    for await (const model of response) {
      models.push(model.id);
    }

    // 加密存储
    const apiKeyEnc = encrypt(actualKey);
    const existing = db.prepare(
      'SELECT id FROM model_providers WHERE provider = ?'
    ).get(providerName);

    if (existing) {
      db.prepare(`
        UPDATE model_providers
        SET api_key_enc = ?, base_url = ?, models = ?, is_connected = 1, updated_at = datetime('now', '+8 hours')
        WHERE provider = ?
      `).run(apiKeyEnc, baseUrl, JSON.stringify(models), providerName);
    } else {
      db.prepare(`
        INSERT INTO model_providers (id, provider, api_key_enc, base_url, models, is_connected)
        VALUES (?, ?, ?, ?, ?, 1)
      `).run(uuidv4(), providerName, apiKeyEnc, baseUrl, JSON.stringify(models));
    }

    return { connected: true, models };
  } catch (err) {
    return { connected: false, models: [], error: err.message };
  }
}

/**
 * 获取任务模型绑定
 * @returns {object}
 */
export function getModelBinding() {
  return db.prepare(
    "SELECT * FROM task_model_binding WHERE id = 'singleton'"
  ).get();
}

/**
 * 更新任务模型绑定
 * @param {object} binding - { parseModel, interviewModel, reportModel, baseModel }
 */
export function updateModelBinding({ parseModel, interviewModel, reportModel, baseModel }) {
  db.prepare(`
    UPDATE task_model_binding
    SET parse_model = ?, interview_model = ?, report_model = ?, base_model = ?
    WHERE id = 'singleton'
  `).run(parseModel, interviewModel, reportModel || null, baseModel || null);
}
