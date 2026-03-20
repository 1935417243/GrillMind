// 面试进行页面
import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useInterview } from '../hooks/useInterview';
import { sessionApi } from '../api/client';
import ChatBubble from '../components/ChatBubble';
import './InterviewRoom.css';

const STAGE_LABELS = {
  opening:        '开场',
  intro:          '自我介绍',
  intro_followup: '介绍追问',
  project_dive:   '项目深挖',
  basic_verify:   '能力验证',
  closing:        '收尾',
};

const STAGE_ORDER = ['opening', 'intro', 'intro_followup', 'project_dive', 'basic_verify', 'closing'];

export default function InterviewRoom() {
  const { id }      = useParams();
  const navigate     = useNavigate();
  const inputRef     = useRef(null);
  const messagesRef  = useRef(null);
  const [inputText, setInputText] = useState('');
  const [sessionInfo, setSessionInfo] = useState(null);
  const [ending, setEnding] = useState(false);

  const { messages, stage, isStreaming, streamingContent, isClosing, sendMessage, loadMessages } = useInterview(id);

  // 加载会话数据
  useEffect(() => {
    if (!id) return;
    sessionApi.get(id).then(data => {
      setSessionInfo(data);
      loadMessages(data.messages, data.stage);
    }).catch(err => {
      console.error('加载会话失败:', err);
    });
  }, [id, loadMessages]);

  // 自动滚到底部
  useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [messages, streamingContent]);

  // closing 阶段：不再自动跳转，改为显示"结束面试"按钮让用户自行操作
  const handleEndAndReport = async () => {
    if (ending) return;
    setEnding(true);
    try {
      await sessionApi.end(id);
      navigate(`/report/${id}`);
    } catch (err) {
      console.error('结束面试失败:', err);
      setEnding(false);
    }
  };

  const handleSend = () => {
    const text = inputText.trim();
    if (!text || isStreaming || isClosing) return;
    sendMessage(text);
    setInputText('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleEnd = async () => {
    if (ending) return;
    if (!confirm('确定要结束面试吗？结束后将自动生成报告。')) return;
    setEnding(true);
    try {
      await sessionApi.end(id);
      navigate(`/report/${id}`);
    } catch (err) {
      alert('结束面试失败：' + err.message);
      setEnding(false);
    }
  };

  const currentStageIndex = STAGE_ORDER.indexOf(stage);

  return (
    <div className="main interview-page">
      <div className="topbar">
        <span className="topbar-title">面试进行中</span>
        <span className="topbar-meta">
          {sessionInfo?.job_type === 'backend' ? '后端工程师' : '测试工程师'}
          {sessionInfo?.resumeName ? ` · ${sessionInfo.resumeName}` : ''}
        </span>
      </div>

      <div className="interview-layout">
        <div className="chat-area">
          <div className="chat-meta-bar">
            {isClosing ? (
              <span className="tag tag-green" style={{fontSize:'11px'}}>● 面试结束</span>
            ) : (
              <span className="tag tag-warn" style={{fontSize:'11px'}}>● 进行中</span>
            )}
            <span style={{color:'var(--text-muted)',fontSize:'11px'}}>{STAGE_LABELS[stage] || stage}阶段</span>
            <div className="progress-steps" style={{marginLeft:'auto'}}>
              {STAGE_ORDER.map((s, i) => (
                <div
                  key={s}
                  className={`step-dot ${i < currentStageIndex ? 'done' : ''} ${i === currentStageIndex ? 'active' : ''}`}
                  title={STAGE_LABELS[s]}
                />
              ))}
            </div>
          </div>

          <div className="messages" ref={messagesRef}>
            {messages.map((msg, i) => (
              <ChatBubble key={i} role={msg.role} content={msg.content} />
            ))}
            {isStreaming && streamingContent && (
              <ChatBubble role="assistant" content={streamingContent} isStreaming />
            )}
          </div>

          {isClosing ? (
            <div className="input-area" style={{justifyContent:'center', gap:'12px'}}>
              <span style={{color:'var(--text-muted)', fontSize:'13px'}}>
                {ending ? '正在生成报告，即将跳转...' : '面试已结束'}
              </span>
              {!ending && (
                <button className="btn btn-primary" onClick={handleEndAndReport} style={{padding:'8px 20px', fontSize:'13px'}}>
                  结束面试并查看报告
                </button>
              )}
            </div>
          ) : (
            <div className="input-area">
              <textarea
                ref={inputRef}
                className="chat-input"
                placeholder="输入你的回答…"
                rows="1"
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isStreaming}
              />
              <button className="btn btn-primary" onClick={handleSend} disabled={isStreaming || !inputText.trim()}>
                发送
              </button>
            </div>
          )}
        </div>

        <div className="side-info">
          <div className="side-section">
            <div className="side-title">简历摘要</div>
            {sessionInfo?.parsed && (
              <>
                <div className="side-item">
                  <span>经验</span>
                  <span className="tag tag-gray">{sessionInfo.parsed.yearsOfExperience}年</span>
                </div>
                <div className="side-item">
                  <span>技术栈</span>
                  <span style={{fontSize:'11px',color:'var(--text-muted)'}}>{sessionInfo.parsed.techStack?.slice(0,3).join(' · ')}</span>
                </div>
                <div className="side-item" style={{border:'none'}}>
                  <span>核心项目</span>
                  <span style={{fontSize:'11px',color:'var(--text-muted)'}}>{sessionInfo.parsed.projects?.map(p => p.name).join('、')}</span>
                </div>
              </>
            )}
          </div>

          <div className="side-section">
            <div className="side-title">当前阶段</div>
            <div style={{fontSize:'12px',color:'var(--text-secondary)',lineHeight:'1.6'}}>
              {STAGE_LABELS[stage]}
            </div>
          </div>

          {!isClosing && (
            <button
              className="btn btn-ghost btn-sm end-btn"
              style={{color:'var(--warn)',borderColor:'var(--warn)',marginTop:'8px'}}
              onClick={handleEnd}
              disabled={ending}
            >
              {ending ? '结束中...' : '结束面试'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
