// 聊天气泡组件
import './ChatBubble.css';

/**
 * @param {object} props
 * @param {'assistant' | 'user'} props.role
 * @param {string} props.content
 * @param {boolean} [props.isStreaming] - 是否是正在流式输出的消息
 */
export default function ChatBubble({ role, content, isStreaming }) {
  const isAI = role === 'assistant';

  return (
    <div className={`msg ${isAI ? 'ai' : 'user'}`}>
      <div className="msg-avatar">{isAI ? '面' : '我'}</div>
      <div>
        <div className="msg-label">{isAI ? '面试官' : '你'}</div>
        <div className="msg-bubble">
          {content}
          {isStreaming && <span className="streaming-cursor">|</span>}
        </div>
      </div>
    </div>
  );
}
