// 语音通话组件
import { useState, useEffect, useRef, useCallback } from 'react';
import './VoiceCall.css';

/**
 * 语音通话界面 - 替换 chat 区域的消息列表和输入栏
 * @param {string} sessionId - 面试会话 ID
 * @param {function} onHangup - 挂断回调
 * @param {function} onSwitchText - 切文字回调
 */
export default function VoiceCall({ sessionId, onHangup, onSwitchText, initialMessages = [] }) {
  const [muted, setMuted] = useState(false);
  const [showSubtitle, setShowSubtitle] = useState(false);
  const [connStatus, setConnStatus] = useState('connecting');
  const [aiSpeaking, setAiSpeaking] = useState(false);
  const [userSpeaking, setUserSpeaking] = useState(false);
  // 对话气泡列表：从已有消息初始化
  const [chatMessages, setChatMessages] = useState(() => {
    let idCounter = 0;
    return initialMessages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({
        id: ++idCounter,
        role: m.role === 'assistant' ? 'interviewer' : 'user',
        text: m.content,
        isTyping: false,
      }));
  });

  // 引用
  const wsRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const audioContextRef = useRef(null);
  const processorRef = useRef(null);
  const vadFrameRef = useRef(null);
  const analyserRef = useRef(null);
  const mutedRef = useRef(false);
  const aiSpeakingRef = useRef(false); // 面试官说话时暂停用户音频采集
  // 音频播放相关
  const audioQueueRef = useRef([]);
  const currentAudioRef = useRef(null);  // 当前播放的 Audio 实例
  const chatEndRef = useRef(null);        // 聊天列表底部锚点
  const msgIdRef = useRef(initialMessages.length);  // 消息 ID 计数器（从已有消息数开始）
  const currentUserMsgIdRef = useRef(null);  // 当前用户消息 ID（ASR 未结束时持续更新）
  const currentAiMsgIdRef = useRef(null);    // 当前 AI 消息 ID

  // 同步 muted / aiSpeaking 到 ref
  useEffect(() => { mutedRef.current = muted; }, [muted]);
  useEffect(() => { aiSpeakingRef.current = aiSpeaking; }, [aiSpeaking]);

  // 自动滚动到最新消息
  useEffect(() => {
    if (showSubtitle && chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, showSubtitle]);

  // ── WebSocket 连接 ──
  const connectWS = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/ws/voice?sessionId=${sessionId}`;

    console.log('🎙️ 正在连接语音 WebSocket:', wsUrl);
    setConnStatus('connecting');

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    ws.binaryType = 'arraybuffer';

    ws.onopen = () => { console.log('✅ WebSocket 已连接'); };

    ws.onmessage = (event) => {
      if (typeof event.data === 'string') {
        try {
          const msg = JSON.parse(event.data);
          handleServerMessage(msg);
        } catch {
          console.warn('无法解析服务端消息:', event.data);
        }
      } else {
        handleAudioData(event.data);
      }
    };

    ws.onclose = () => {
      console.log('🔌 WebSocket 已断开');
      setConnStatus('disconnected');
    };

    ws.onerror = (err) => {
      console.error('❌ WebSocket 错误:', err);
    };
  }, [sessionId]);

  // ── 处理服务端 JSON 消息 ──
  const handleServerMessage = useCallback((msg) => {
    switch (msg.type) {
      case 'connected':
        setConnStatus('connected');
        break;

      case 'asr_result':
        if (msg.text) {
          const currentId = currentUserMsgIdRef.current;
          if (currentId != null) {
            // 更新当前用户消息的文字
            setChatMessages(prev =>
              prev.map(m => m.id === currentId ? { ...m, text: msg.text } : m)
            );
          } else {
            // 新建用户消息（同步设置 ref，不放在 setState 回调里）
            const newId = ++msgIdRef.current;
            currentUserMsgIdRef.current = newId;
            setChatMessages(prev => [...prev, { id: newId, role: 'user', text: msg.text, isTyping: false }]);
          }
          // ASR 句子结束 → 置空当前用户消息 ID，下一句话新建
          if (msg.isFinal) {
            currentUserMsgIdRef.current = null;
          }
        }
        break;

      case 'ai_start':
        setAiSpeaking(true);
        setUserSpeaking(false);
        audioQueueRef.current = [];
        // 新建 AI 消息（打字动画）
        {
          const newId = ++msgIdRef.current;
          currentAiMsgIdRef.current = newId;
          setChatMessages(prev => [...prev, { id: newId, role: 'interviewer', text: '', isTyping: true }]);
        }
        break;

      case 'ai_text':
        if (msg.text) {
          const id = currentAiMsgIdRef.current;
          if (id != null) {
            setChatMessages(prev =>
              prev.map(m => m.id === id ? { ...m, text: msg.text } : m)
            );
          }
        }
        break;

      case 'ai_end':
        // 结束打字动画
        {
          const id = currentAiMsgIdRef.current;
          if (id != null) {
            setChatMessages(prev =>
              prev.map(m => m.id === id ? { ...m, isTyping: false } : m)
            );
          }
          currentAiMsgIdRef.current = null;
        }
        playBufferedAudio();
        break;

      case 'error':
        console.error('服务端错误:', msg.message);
        setAiSpeaking(false);
        break;

      default:
        console.log('未知消息类型:', msg.type);
    }
  }, []);

  // ── 缓冲收到的音频数据 ──
  const handleAudioData = useCallback((data) => {
    if (data instanceof ArrayBuffer) {
      audioQueueRef.current.push(data);
    } else if (data instanceof Blob) {
      data.arrayBuffer().then(buf => audioQueueRef.current.push(buf));
    }
  }, []);

  // ── 合并缓冲的音频块并一次性播放 ──
  const playBufferedAudio = useCallback(() => {
    const chunks = audioQueueRef.current;
    audioQueueRef.current = [];

    if (chunks.length === 0) {
      setAiSpeaking(false);
      return;
    }

    const blob = new Blob(chunks, { type: 'audio/mpeg' });
    const url = URL.createObjectURL(blob);

    const audio = new Audio(url);
    currentAudioRef.current = audio;  // 保存引用，以便挂断时停止
    audio.onended = () => {
      setAiSpeaking(false);
      currentAudioRef.current = null;
      URL.revokeObjectURL(url);
    };
    audio.onerror = () => {
      console.warn('音频播放失败');
      setAiSpeaking(false);
      currentAudioRef.current = null;
      URL.revokeObjectURL(url);
    };
    audio.play().catch(err => {
      console.warn('音频播放被阻止:', err.message);
      setAiSpeaking(false);
      currentAudioRef.current = null;
      URL.revokeObjectURL(url);
    });
  }, []);

  // ── 麦克风采集（ScriptProcessorNode → PCM 16-bit） ──
  const startMicrophone = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, sampleRate: 16000, echoCancellation: true, noiseSuppression: true },
      });
      mediaStreamRef.current = stream;

      const audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
      audioContextRef.current = audioCtx;

      const source = audioCtx.createMediaStreamSource(stream);

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;
      startVAD(analyser);

      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (e) => {
        // 静音或面试官正在说话时，不发送音频
        if (mutedRef.current || aiSpeakingRef.current) return;
        const ws = wsRef.current;
        if (!ws || ws.readyState !== WebSocket.OPEN) return;

        const float32 = e.inputBuffer.getChannelData(0);
        const pcm16 = new Int16Array(float32.length);
        for (let i = 0; i < float32.length; i++) {
          const s = Math.max(-1, Math.min(1, float32[i]));
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        ws.send(pcm16.buffer);
      };

      source.connect(processor);
      processor.connect(audioCtx.destination);
      console.log('🎤 麦克风采集已启动 (PCM 16-bit, 16kHz)');
    } catch (err) {
      console.error('❌ 麦克风权限获取失败:', err);
    }
  }, []);

  // ── VAD ──
  const startVAD = useCallback((analyser) => {
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    const check = () => {
      analyser.getByteFrequencyData(dataArray);
      const avg = dataArray.reduce((sum, v) => sum + v, 0) / dataArray.length;
      setUserSpeaking(avg > 15);
      vadFrameRef.current = requestAnimationFrame(check);
    };
    vadFrameRef.current = requestAnimationFrame(check);
  }, []);

  // ── 组件挂载 ──
  useEffect(() => {
    const timer = setTimeout(() => {
      connectWS();
      startMicrophone();
    }, 200);

    return () => {
      clearTimeout(timer);
      if (vadFrameRef.current) cancelAnimationFrame(vadFrameRef.current);
      if (processorRef.current) processorRef.current.disconnect();
      mediaStreamRef.current?.getTracks().forEach(t => t.stop());
      audioContextRef.current?.close();
      audioQueueRef.current = [];
      // 停止正在播放的音频
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current = null;
      }
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'hangup' }));
        wsRef.current.close();
      }
    };
  }, [connectWS, startMicrophone]);

  // 波形条渲染
  const renderWaveform = (type) => {
    const isActive = type === 'interviewer' ? aiSpeaking : userSpeaking;
    const className = isActive ? `active-${type}` : 'idle';
    return (
      <div className={`voice-waveform ${className}`}>
        {Array.from({ length: 7 }, (_, i) => (
          <span key={i} className="bar" />
        ))}
      </div>
    );
  };

  // 打字动画（三个点）
  const TypingDots = () => (
    <div className="vc-typing-dots">
      <span /><span /><span />
    </div>
  );

  // 连接状态
  const connLabel = { connecting: '连接中…', connected: '', disconnected: '已断开' };

  return (
    <>
      <div className="voice-call">
        {connStatus !== 'connected' && (
          <div className="voice-conn-status">{connLabel[connStatus]}</div>
        )}

        {showSubtitle ? (
          /* ── 对话气泡列表模式 ── */
          <div className="vc-chat-list">
            {chatMessages.length === 0 && (
              <div className="vc-chat-empty">对话内容将在这里显示…</div>
            )}
            {chatMessages.map(msg => (
              <div key={msg.id} className={`vc-chat-row ${msg.role}`}>
                {msg.role === 'interviewer' && (
                  <div className="vc-chat-avatar interviewer">面</div>
                )}
                <div className={`vc-chat-bubble ${msg.role}`}>
                  {msg.isTyping && !msg.text ? (
                    <TypingDots />
                  ) : (
                    <>
                      {msg.text}
                      {msg.isTyping && <TypingDots />}
                    </>
                  )}
                </div>
                {msg.role === 'user' && (
                  <div className="vc-chat-avatar user">你</div>
                )}
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
        ) : (
          /* ── 头像 + 波形模式 ── */
          <>
            <div className="voice-participant">
              <div className="voice-avatar interviewer">面</div>
              <div className="voice-status">
                <span className="status-role">面试官</span>
                {' · '}
                {aiSpeaking ? '发言中' : '等待中'}
              </div>
              {renderWaveform('interviewer')}
            </div>

            <div className="voice-divider" />

            <div className="voice-participant">
              <div className="voice-avatar user">你</div>
              <div className="voice-status">
                <span className="status-role">
                  {muted ? '已静音' : userSpeaking ? '正在聆听…' : '等待发言…'}
                </span>
              </div>
              {renderWaveform('user')}
            </div>
          </>
        )}
      </div>

      {/* 底部操作栏（不变） */}
      <div className="voice-controls">
        <button
          className={`voice-ctrl-btn ${muted ? 'active' : ''}`}
          onClick={() => setMuted(prev => !prev)}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {muted ? (
              <>
                <line x1="1" y1="1" x2="23" y2="23" />
                <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
                <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2c0 .76-.13 1.49-.36 2.18" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </>
            ) : (
              <>
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </>
            )}
          </svg>
          <span>{muted ? '已静音' : '静音'}</span>
        </button>

        <button
          className={`voice-ctrl-btn ${showSubtitle ? 'active' : ''}`}
          onClick={() => setShowSubtitle(prev => !prev)}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="4" width="20" height="16" rx="2" />
            <path d="M7 15h4M13 15h4M7 11h10" />
          </svg>
          <span>字幕</span>
        </button>

        <button className="voice-ctrl-btn hangup" onClick={onHangup}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91" />
            <line x1="23" y1="1" x2="1" y2="23" />
          </svg>
          <span>挂断</span>
        </button>

        <button className="voice-ctrl-btn" onClick={onSwitchText}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          <span>切文字</span>
        </button>
      </div>
    </>
  );
}
