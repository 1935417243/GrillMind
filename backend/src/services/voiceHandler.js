// 语音通话核心处理器
// ASR(百炼 Paraformer) → LLM(复用面试引擎) → TTS(百炼 CosyVoice)
import WebSocket from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/index.js';
import { InterviewEngine } from './interviewEngine.js';
import { chatCompletion, getTaskModel, buildThinkingExtraBody } from '../ai/client.js';
import { nowCST } from '../utils/time.js';
import { decrypt } from '../utils/crypto.js';
import { createInterviewOutputStreamSanitizer, sanitizeInterviewOutputText } from '../utils/interviewOutput.js';

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
    this.firstAsrTime = null;      // 首次 ASR 识别到用户语音的时间（思考时长计算用）
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

    // 播放开场白：字幕里已有这条消息，只做 TTS 播放，不发 ai_text
    try {
      const messages = JSON.parse(
        db.prepare('SELECT messages FROM interview_sessions WHERE id = ?').pluck().get(this.sessionId) || '[]'
      );
      const opening = messages.find(m => m.role === 'assistant' && m.stage === 'opening');
      if (opening && opening.content && messages.length === 1) {
        console.log(`🎤 播放开场白: "${opening.content.substring(0, 30)}..."`);
        // 只通知前端「面试官正在说话」，暂停 ASR 采集
        this.sendToClient({ type: 'ai_start', silent: true });
        await this.synthesizeAndPlay(opening.content);
        this.sendToClient({ type: 'ai_end', stage: this.engine.stage, isClosing: false });
      }
    } catch (err) {
      console.warn('⚠️ 播放开场白失败:', err.message);
    }
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
              max_sentence_silence: 2000, // 静默 2 秒后才算一句话结束
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
          // 记录首次 ASR 识别到用户语音的时间（用于思考时长计算）
          if (!this.firstAsrTime) {
            this.firstAsrTime = nowCST();
          }
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
      // 1. 先追加用户消息（推进面试阶段），再构建 AI 消息
      //    与文字模式保持一致的调用顺序
      const stageBefore = this.engine.stage;
      const userStartedAt = this.firstAsrTime || nowCST();
      this.firstAsrTime = null; // 重置，下一轮重新记录
      this.engine.appendMessage('user', userText, { startedAt: userStartedAt });
      console.log(`📊 阶段推进: ${stageBefore} → ${this.engine.stage} (stageTurns=${this.engine.stageTurns})`);
      const aiMessages = this.engine.buildAIMessages(userText);

      // 语音模式：注入简短回复提示
      aiMessages.push({
        role: 'system',
        content: '【语音模式约束】1.每次回复控制在80字以内；开场白、过渡句控制在30字以内 2.语气自然、专业，像真人面试对话 3.一次只问一个问题 4.不要用列表、编号、括号等书面格式 5.不要用"好""好的""嗯"等口头垫词开头，不连续重复过渡词 6.不要输出动作、心理活动或语气说明 7.不要重复用户刚说过的话来凑字数',
      });

      const interviewModel = getTaskModel('interview');
      const extraBody = buildThinkingExtraBody(interviewModel, false);

      console.log(`🤖 调用 LLM [model=${interviewModel}] [stage=${this.engine.stage}]`);

      // 通知前端 AI 开始回复
      this.sendToClient({ type: 'ai_start' });

      const stream = await chatCompletion({
        providerModel: interviewModel,
        messages: aiMessages,
        stream: true,
        extraBody,
      });

      const sanitizer = createInterviewOutputStreamSanitizer();
      let rawAiContent = '';
      let visibleAiContent = '';

      for await (const chunk of stream) {
        const delta = chunk.choices?.[0]?.delta;
        if (!delta) continue;
        // 跳过 reasoning_content（深度思考内容）
        const token = delta.content || '';
        if (token) {
          rawAiContent += token;
          const cleanToken = sanitizer.push(token);
          if (!cleanToken) continue;
          visibleAiContent += cleanToken;
          // 发送文字给前端（字幕用）
          this.sendToClient({ type: 'ai_text', text: visibleAiContent });
        }
      }

      const tail = sanitizer.flush();
      if (tail) {
        visibleAiContent += tail;
        this.sendToClient({ type: 'ai_text', text: visibleAiContent });
      }

      const fullAiContent = sanitizeInterviewOutputText(visibleAiContent || rawAiContent);

      console.log(`🤖 LLM 回复完成 (${fullAiContent.length} 字)`);

      if (!fullAiContent.trim()) {
        console.warn('⚠️ LLM 返回空内容，跳过 TTS');
        this.sendToClient({ type: 'ai_end' });
        return;
      }

      if (fullAiContent !== visibleAiContent) {
        this.sendToClient({ type: 'ai_text', text: fullAiContent });
      }

      // 2. 追加 AI 回复并持久化
      this.engine.appendMessage('assistant', fullAiContent);
      this.engine.persist();

      // 3. TTS 合成语音
      console.log(`🔊 开始 TTS 合成...`);
      await this.synthesizeAndPlay(fullAiContent);

      // 4. TTS 播放完成后，更新 assistant 消息的 timestamp 为当前时间
      //    这样思考时间 = 用户首次 ASR 识别时间 - 面试官语音播报完成时间
      //    而不是包含 LLM 生成 + TTS 合成播放的时间
      const lastMsg = this.engine.messages[this.engine.messages.length - 1];
      if (lastMsg && lastMsg.role === 'assistant') {
        lastMsg.timestamp = nowCST();
        this.engine.persist();
      }

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
      } catch { }
      this.asrWs.close();
    }

    // 关闭 TTS
    if (this.ttsWs?.readyState === WebSocket.OPEN) {
      this.ttsWs.close();
    }
  }
}
