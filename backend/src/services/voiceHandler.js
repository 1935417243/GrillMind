// 语音通话核心处理器
// ASR(百炼 Paraformer) → LLM(复用面试引擎) → TTS(百炼 CosyVoice)
import WebSocket from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/index.js';
import { InterviewEngine } from './interviewEngine.js';
import { chatCompletion, getTaskModel, buildThinkingExtraBody } from '../ai/client.js';
import { decrypt } from '../utils/crypto.js';

// 百炼 WebSocket 服务地址
const DASHSCOPE_WS_URL = 'wss://dashscope.aliyuncs.com/api-ws/v1/inference/';

/**
 * 获取百炼 API Key（解密后的明文）
 */
function getBailianApiKey() {
  const row = db.prepare(
    "SELECT api_key_enc FROM model_providers WHERE provider = 'bailian'"
  ).get();
  if (!row?.api_key_enc) throw new Error('百炼 API Key 未配置');
  return decrypt(row.api_key_enc);
}

/**
 * 获取语音配置（ASR 模型、TTS 模型、发音人）
 */
function getVoiceConfig() {
  const binding = db.prepare(
    "SELECT * FROM task_model_binding WHERE id = 'singleton'"
  ).get();
  return {
    asrModel: binding?.asr_model || 'paraformer-realtime-v2',
    ttsModel: binding?.tts_model || 'cosyvoice-v1',
    ttsVoice: binding?.tts_voice || 'longxiaochun',
  };
}

/**
 * VoiceSession - 管理一次语音通话的完整生命周期
 */
export class VoiceSession {
  constructor(clientSocket, sessionId) {
    this.clientSocket = clientSocket; // 前端 WebSocket
    this.sessionId = sessionId;
    this.apiKey = getBailianApiKey();
    this.voiceConfig = getVoiceConfig();

    // ASR 连接
    this.asrWs = null;
    this.asrTaskId = uuidv4().replace(/-/g, '');
    this.asrStarted = false;

    // TTS 连接
    this.ttsWs = null;
    this.ttsTaskId = null;
    this.ttsStarted = false;

    // 面试引擎
    this.engine = null;
    this.initEngine();

    // 状态
    this.isProcessing = false;     // 是否正在处理 LLM+TTS
    this.pendingSentences = [];    // 等待处理的完整句子
    this.destroyed = false;
    this._started = false;         // 防止重复启动
  }

  /**
   * 初始化面试引擎
   */
  initEngine() {
    const session = db.prepare(
      'SELECT * FROM interview_sessions WHERE id = ?'
    ).get(this.sessionId);
    const resume = db.prepare(
      'SELECT * FROM resumes WHERE id = ?'
    ).get(session.resume_id);
    this.engine = new InterviewEngine(session, resume);
  }

  /**
   * 启动语音会话：建立 ASR 连接（防止重复调用）
   */
  async start() {
    if (this._started) return;
    this._started = true;
    console.log(`🎙️ VoiceSession 启动 [${this.sessionId}]`);
    await this.connectASR();
  }

  /**
   * 建立百炼 ASR WebSocket 连接
   */
  connectASR() {
    return new Promise((resolve, reject) => {
      this.asrWs = new WebSocket(DASHSCOPE_WS_URL, {
        headers: { Authorization: `bearer ${this.apiKey}` },
      });

      this.asrWs.on('open', () => {
        console.log('🟢 ASR WebSocket 已连接');
        const runTask = {
          header: {
            action: 'run-task',
            task_id: this.asrTaskId,
            streaming: 'duplex',
          },
          payload: {
            task_group: 'audio',
            task: 'asr',
            function: 'recognition',
            model: this.voiceConfig.asrModel,
            parameters: {
              format: 'pcm',
              sample_rate: 16000,
              disfluency_removal_enabled: true,
            },
            input: {},
          },
        };
        this.asrWs.send(JSON.stringify(runTask));
        resolve();
      });

      this.asrWs.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          this.handleASREvent(msg);
        } catch (err) {
          console.error('ASR 消息解析失败:', err);
        }
      });

      this.asrWs.on('close', () => {
        console.log('🔴 ASR WebSocket 已关闭');
        this.asrStarted = false;
      });

      this.asrWs.on('error', (err) => {
        console.error('❌ ASR WebSocket 错误:', err.message);
        reject(err);
      });
    });
  }

  /**
   * 处理 ASR 服务端事件
   */
  handleASREvent(msg) {
    const event = msg.header?.event;
    switch (event) {
      case 'task-started':
        console.log('✅ ASR 任务已启动');
        this.asrStarted = true;
        break;

      case 'result-generated': {
        const sentence = msg.payload?.output?.sentence;
        if (!sentence || sentence.heartbeat) break;

        // 发送实时 ASR 结果给前端（用于字幕）
        this.sendToClient({
          type: 'asr_result',
          text: sentence.text,
          isFinal: !!sentence.sentence_end,
        });

        // 句子结束 → 加入待处理队列
        if (sentence.sentence_end && sentence.text?.trim()) {
          console.log(`📝 ASR 完整句子: "${sentence.text}"`);
          this.pendingSentences.push(sentence.text);
          this.processNext();
        }
        break;
      }

      case 'task-finished':
        console.log('✅ ASR 任务已完成');
        break;

      case 'task-failed':
        console.error('❌ ASR 任务失败:', msg.header?.error_message);
        this.sendToClient({ type: 'error', message: 'ASR 识别失败: ' + (msg.header?.error_message || '未知错误') });
        break;
    }
  }

  /**
   * 处理队列中的下一个完整句子
   */
  async processNext() {
    if (this.isProcessing || this.pendingSentences.length === 0 || this.destroyed) return;

    this.isProcessing = true;

    // 合并所有待处理句子为一段话
    const userText = this.pendingSentences.join('');
    this.pendingSentences = [];

    console.log(`💬 开始处理用户语音: "${userText}"`);

    try {
      // 1. 构建 AI 消息（注意：buildAIMessages 内部会追加用户消息，
      //    不要先调 appendMessage，否则会重复）
      const aiMessages = this.engine.buildAIMessages(userText);
      const interviewModel = getTaskModel('interview');
      const extraBody = buildThinkingExtraBody(interviewModel, false);

      console.log(`🤖 调用 LLM [model=${interviewModel}]`);

      // 通知前端 AI 开始回复
      this.sendToClient({ type: 'ai_start' });

      const stream = await chatCompletion({
        providerModel: interviewModel,
        messages: aiMessages,
        stream: true,
        extraBody,
      });

      let fullAiContent = '';

      for await (const chunk of stream) {
        const delta = chunk.choices?.[0]?.delta;
        if (!delta) continue;
        // 跳过 reasoning_content（深度思考内容）
        const token = delta.content || '';
        if (token) {
          fullAiContent += token;
          // 发送文字给前端（字幕用）
          this.sendToClient({ type: 'ai_text', text: fullAiContent });
        }
      }

      console.log(`🤖 LLM 回复完成 (${fullAiContent.length} 字)`);

      if (!fullAiContent.trim()) {
        console.warn('⚠️ LLM 返回空内容，跳过 TTS');
        this.sendToClient({ type: 'ai_end' });
        return;
      }

      // 2. 追加消息到面试引擎并持久化
      //    先追加用户消息，再追加 AI 回复
      this.engine.appendMessage('user', userText);
      this.engine.appendMessage('assistant', fullAiContent);
      this.engine.persist();

      // 3. TTS 合成语音
      console.log(`🔊 开始 TTS 合成...`);
      await this.synthesizeAndPlay(fullAiContent);

      // 通知前端 AI 回复结束
      this.sendToClient({
        type: 'ai_end',
        stage: this.engine.stage,
        isClosing: this.engine.stage === 'closing',
      });

    } catch (err) {
      console.error('❌ LLM/TTS 处理失败:', err.message || err);
      this.sendToClient({ type: 'error', message: 'AI 回复生成失败: ' + err.message });
      // 确保前端不会卡在"发言中"
      this.sendToClient({ type: 'ai_end' });
    } finally {
      this.isProcessing = false;
      // 检查是否还有待处理的句子
      if (this.pendingSentences.length > 0) {
        this.processNext();
      }
    }
  }

  /**
   * TTS 合成并将音频流推送给前端
   */
  synthesizeAndPlay(text) {
    return new Promise((resolve, reject) => {
      if (this.destroyed || !text?.trim()) return resolve();

      this.ttsTaskId = uuidv4().replace(/-/g, '');

      const ttsWs = new WebSocket(DASHSCOPE_WS_URL, {
        headers: { Authorization: `bearer ${this.apiKey}` },
      });
      this.ttsWs = ttsWs;

      // 超时保护：30 秒后自动关闭
      const timeout = setTimeout(() => {
        console.warn('⚠️ TTS 超时 30s，强制关闭');
        ttsWs.close();
        resolve();
      }, 30000);

      ttsWs.on('open', () => {
        console.log('🟢 TTS WebSocket 已连接');

        // 发送 run-task
        const runTask = {
          header: {
            action: 'run-task',
            task_id: this.ttsTaskId,
            streaming: 'duplex',
          },
          payload: {
            task_group: 'audio',
            task: 'tts',
            function: 'SpeechSynthesizer',
            model: this.voiceConfig.ttsModel,
            parameters: {
              voice: this.voiceConfig.ttsVoice,
              format: 'mp3',
              sample_rate: 22050,
              rate: 1.0,
              volume: 50,
            },
            input: {},
          },
        };
        ttsWs.send(JSON.stringify(runTask));
      });

      ttsWs.on('message', (data, isBinary) => {
        // 二进制音频数据 → 转发给前端
        if (isBinary) {
          if (this.clientSocket.readyState === WebSocket.OPEN) {
            this.clientSocket.send(data);
          }
          return;
        }

        // JSON 控制消息
        try {
          const msg = JSON.parse(data.toString());
          const event = msg.header?.event;

          switch (event) {
            case 'task-started':
              console.log('✅ TTS 任务已启动');
              this.ttsStarted = true;

              // 发送文本（continue-task）
              ttsWs.send(JSON.stringify({
                header: {
                  action: 'continue-task',
                  task_id: this.ttsTaskId,
                  streaming: 'duplex',
                },
                payload: {
                  input: { text },
                },
              }));

              // 发送 finish-task 结束文本输入
              ttsWs.send(JSON.stringify({
                header: {
                  action: 'finish-task',
                  task_id: this.ttsTaskId,
                  streaming: 'duplex',
                },
                payload: {
                  input: {},
                },
              }));
              break;

            case 'result-generated':
              // TTS 中间结果，通常伴随二进制音频
              break;

            case 'task-finished':
              console.log('✅ TTS 任务已完成');
              clearTimeout(timeout);
              ttsWs.close();
              resolve();
              break;

            case 'task-failed':
              console.error('❌ TTS 任务失败:', msg.header?.error_message);
              clearTimeout(timeout);
              ttsWs.close();
              reject(new Error('TTS 失败: ' + (msg.header?.error_message || '未知错误')));
              break;
          }
        } catch (err) {
          console.error('TTS 消息解析失败:', err);
        }
      });

      ttsWs.on('close', () => {
        console.log('🔴 TTS WebSocket 已关闭');
        clearTimeout(timeout);
        this.ttsStarted = false;
        resolve(); // 确保不卡住
      });

      ttsWs.on('error', (err) => {
        console.error('❌ TTS WebSocket 错误:', err.message);
        clearTimeout(timeout);
        reject(err);
      });
    });
  }

  /**
   * 将前端发送的音频数据转发到 ASR
   */
  forwardAudioToASR(audioData) {
    if (this.asrStarted && this.asrWs?.readyState === WebSocket.OPEN) {
      this.asrWs.send(audioData);
    }
  }

  /**
   * 发送 JSON 消息给前端
   */
  sendToClient(msg) {
    if (this.clientSocket.readyState === WebSocket.OPEN) {
      this.clientSocket.send(JSON.stringify(msg));
    }
  }

  /**
   * 销毁会话，释放所有资源
   */
  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    console.log(`🎙️ VoiceSession 销毁 [${this.sessionId}]`);

    // 关闭 ASR
    if (this.asrWs?.readyState === WebSocket.OPEN) {
      try {
        this.asrWs.send(JSON.stringify({
          header: { action: 'finish-task', task_id: this.asrTaskId, streaming: 'duplex' },
          payload: { input: {} },
        }));
      } catch {}
      this.asrWs.close();
    }

    // 关闭 TTS
    if (this.ttsWs?.readyState === WebSocket.OPEN) {
      this.ttsWs.close();
    }
  }
}
