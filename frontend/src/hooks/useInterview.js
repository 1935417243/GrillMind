// 面试会话核心 Hook
import { useState, useCallback, useRef } from 'react';

/**
 * 面试核心 Hook - 管理消息列表和流式通信
 * @param {string} sessionId
 */
export function useInterview(sessionId) {
  const [messages,         setMessages]         = useState([]);
  const [stage,            setStage]            = useState('opening');
  const [isStreaming,      setIsStreaming]      = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [isClosing,        setIsClosing]        = useState(false);

  // 思考计时：记录 AI 回复完成的时间点，供外部计算思考时长
  const thinkingStartRef = useRef(null);

  const sendMessage = useCallback(async (content, startedAt) => {
    if (isStreaming || isClosing || !sessionId) return;

    // 追加用户消息
    setMessages(prev => [...prev, { role: 'user', content, timestamp: Date.now() }]);
    setIsStreaming(true);
    setStreamingContent('');

    try {
      const response = await fetch(`/api/v1/sessions/${sessionId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, startedAt }),
      });

      const reader  = response.body.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value);
        const lines = text.split('\n').filter(l => l.startsWith('data: '));

        for (const line of lines) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.token) {
              fullContent += data.token;
              setStreamingContent(fullContent);
            }
            if (data.done) {
              const assistantContent = data.content || fullContent;
              setMessages(prev => [
                ...prev,
                { role: 'assistant', content: assistantContent, timestamp: Date.now() }
              ]);
              setStreamingContent('');
              // AI 回复完成，记录思考计时起点
              thinkingStartRef.current = new Date().toISOString();
              if (data.stage) {
                setStage(data.stage);
                // 进入 closing 阶段后标记，阻止继续发消息
                if (data.stage === 'closing') setIsClosing(true);
              }
            }
            if (data.error) {
              console.error('AI 调用错误:', data.message);
            }
          } catch {}
        }
      }
    } catch (err) {
      console.error('发送消息失败:', err);
    } finally {
      setIsStreaming(false);
    }
  }, [sessionId, isStreaming, isClosing]);

  // 加载已有消息（恢复会话用）
  const loadMessages = useCallback((msgs, currentStage) => {
    setMessages(msgs || []);
    if (currentStage) {
      setStage(currentStage);
      if (currentStage === 'closing') setIsClosing(true);
    }
    // 恢复会话时，设置思考计时起点为当前时间
    thinkingStartRef.current = new Date().toISOString();
  }, []);

  return { messages, stage, setStage, isStreaming, streamingContent, isClosing, sendMessage, loadMessages, thinkingStartRef };
}
