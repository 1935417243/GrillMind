// 面试会话核心 Hook
import { useState, useCallback } from 'react';

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

  const sendMessage = useCallback(async (content) => {
    if (isStreaming || isClosing || !sessionId) return;

    // 追加用户消息
    setMessages(prev => [...prev, { role: 'user', content, timestamp: Date.now() }]);
    setIsStreaming(true);
    setStreamingContent('');

    try {
      const response = await fetch(`/api/v1/sessions/${sessionId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
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
              setMessages(prev => [
                ...prev,
                { role: 'assistant', content: fullContent, timestamp: Date.now() }
              ]);
              setStreamingContent('');
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
  }, []);

  return { messages, stage, setStage, isStreaming, streamingContent, isClosing, sendMessage, loadMessages };
}
