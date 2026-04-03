// Fastify 后端入口文件
import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { initDB } from './db/index.js';

// 路由模块
import modelRoutes     from './routes/model.js';
import resumeRoutes    from './routes/resume.js';
import interviewRoutes from './routes/interview.js';
import reportRoutes      from './routes/report.js';
import jobPositionRoutes from './routes/jobPosition.js';
import voiceRoute        from './routes/voiceRoute.js';
import websocket         from '@fastify/websocket';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// 初始化数据库
initDB();

// 创建 Fastify 实例
const fastify = Fastify({
  logger: true,
});

// 注册插件
await fastify.register(cors, {
  origin: true, // 开发模式允许所有来源
});

await fastify.register(multipart, {
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
});

// 注册 WebSocket 插件
await fastify.register(websocket);

// 静态文件托管（生产模式用，serve 前端 build 产物）
const publicDir = path.join(__dirname, '../public');
try {
  await fastify.register(fastifyStatic, {
    root: publicDir,
    prefix: '/',
  });
} catch {
  // public 目录不存在时跳过（开发模式）
}

// 注册路由
await fastify.register(modelRoutes);
await fastify.register(resumeRoutes);
await fastify.register(interviewRoutes);
await fastify.register(reportRoutes);
await fastify.register(jobPositionRoutes);
await fastify.register(voiceRoute);

// SPA 路由回退：非 API 请求且非静态文件，返回 index.html
const indexHtml = path.join(publicDir, 'index.html');
fastify.setNotFoundHandler((req, reply) => {
  // API 路由返回标准 JSON 404
  if (req.url.startsWith('/api/')) {
    return reply.code(404).send({
      success: false,
      error: { code: 'NOT_FOUND', message: '接口不存在' },
    });
  }
  // SPA 回退：返回 index.html（仅在生产模式 public 目录存在时）
  if (fs.existsSync(indexHtml)) {
    return reply.type('text/html').sendFile('index.html');
  }
  return reply.code(404).send('Not Found');
});

// 启动服务
const PORT = process.env.PORT || 3001;
try {
  await fastify.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`\n🚀 智面后端已启动: http://localhost:${PORT}\n`);
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}
