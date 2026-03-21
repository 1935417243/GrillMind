// 模型配置路由
import {
  getAllProviders,
  saveProvider,
  testProviderConnection,
  getModelBinding,
  updateModelBinding,
} from '../services/modelManager.js';

/**
 * 注册模型配置相关路由
 * @param {import('fastify').FastifyInstance} fastify
 */
export default async function modelRoutes(fastify) {

  // 获取所有供应商配置（Key 脱敏）
  fastify.get('/api/v1/models/providers', async (req, reply) => {
    const providers = getAllProviders();
    return { success: true, data: providers };
  });

  // 保存供应商配置
  fastify.put('/api/v1/models/providers/:name', async (req, reply) => {
    const { name } = req.params;
    const { apiKey, baseUrl } = req.body;
    saveProvider(name, { apiKey, baseUrl });
    return { success: true, data: { provider: name } };
  });

  // 测试供应商连接并拉取模型列表
  fastify.post('/api/v1/models/providers/:name/test', async (req, reply) => {
    const { name } = req.params;
    const { apiKey, baseUrl } = req.body;
    const result = await testProviderConnection(name, { apiKey, baseUrl });

    if (!result.connected) {
      return reply.code(400).send({
        success: false,
        error: { code: 'PROVIDER_NOT_CONNECTED', message: result.error },
      });
    }
    return { success: true, data: result };
  });

  // 获取任务模型绑定
  fastify.get('/api/v1/models/binding', async (req, reply) => {
    const binding = getModelBinding();
    return {
      success: true,
      data: {
        parseModel: binding?.parse_model,
        interviewModel: binding?.interview_model,
        reportModel: binding?.report_model,
        baseModel: binding?.base_model,
      },
    };
  });

  // 更新任务模型绑定
  fastify.put('/api/v1/models/binding', async (req, reply) => {
    const { parseModel, interviewModel, reportModel, baseModel } = req.body;
    updateModelBinding({ parseModel, interviewModel, reportModel, baseModel });
    return { success: true, data: { parseModel, interviewModel, reportModel, baseModel } };
  });
}
