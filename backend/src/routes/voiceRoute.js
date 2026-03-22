// 语音通话 WebSocket 路由
import { db } from '../db/index.js';
import { VoiceSession } from '../services/voiceHandler.js';

/**
 * 注册语音通话 WebSocket 路由
 * @param {import('fastify').FastifyInstance} fastify
 */
export default async function voiceRoute(fastify) {

  // WebSocket 路由 /ws/voice
  fastify.get('/ws/voice', { websocket: true }, (socket, req) => {
    const sessionId = req.query.sessionId;
    console.log(`🎙️ 语音连接建立 [session=${sessionId}]`);

    // 验证会话存在且进行中
    const session = db.prepare(
      'SELECT id, status FROM interview_sessions WHERE id = ?'
    ).get(sessionId);

    if (!session || session.status !== 'in_progress') {
      console.warn(`⚠️ 语音连接拒绝：会话不存在或已结束 [session=${sessionId}]`);
      socket.send(JSON.stringify({ type: 'error', message: '会话不存在或已结束' }));
      socket.close();
      return;
    }

    // 创建语音会话处理器
    let voiceSession = null;

    try {
      voiceSession = new VoiceSession(socket, sessionId);

      // 发送连接成功确认
      socket.send(JSON.stringify({ type: 'connected', sessionId }));

      // 启动 ASR 连接
      voiceSession.start().catch(err => {
        console.error('VoiceSession 启动失败:', err);
        socket.send(JSON.stringify({ type: 'error', message: 'ASR 连接失败: ' + err.message }));
      });
    } catch (err) {
      console.error('VoiceSession 创建失败:', err);
      socket.send(JSON.stringify({ type: 'error', message: '语音会话初始化失败: ' + err.message }));
      socket.close();
      return;
    }

    // 接收消息
    socket.on('message', (data) => {
      if (typeof data === 'string') {
        // JSON 控制消息
        try {
          const msg = JSON.parse(data);
          if (msg.type === 'hangup') {
            console.log(`📞 用户挂断 [session=${sessionId}]`);
            voiceSession?.destroy();
          }
        } catch {
          // 忽略不合法的文本消息
        }
      } else {
        // 二进制音频数据 → 转发到 ASR
        voiceSession?.forwardAudioToASR(data);
      }
    });

    socket.on('close', () => {
      console.log(`🎙️ 语音连接断开 [session=${sessionId}]`);
      voiceSession?.destroy();
      voiceSession = null;
    });

    socket.on('error', (err) => {
      console.error(`❌ 语音连接错误 [session=${sessionId}]:`, err.message);
      voiceSession?.destroy();
      voiceSession = null;
    });
  });
}
