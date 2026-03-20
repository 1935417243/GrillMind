// 面试报告页面
import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { reportApi } from '../api/client';
import './InterviewReport.css';

export default function InterviewReport() {
  const { sessionId } = useParams();
  const [report, setReport]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);

  // 轮询报告状态
  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;

    const poll = async () => {
      try {
        const data = await reportApi.get(sessionId);
        if (cancelled) return;
        setReport(data);
        if (data.status === 'done' || data.status === 'failed') {
          setLoading(false);
          return;
        }
        // 继续轮询
        setTimeout(poll, 2000);
      } catch {
        if (!cancelled) setTimeout(poll, 2000);
      }
    };

    poll();
    return () => { cancelled = true; };
  }, [sessionId, retrying]);

  // 重试生成报告
  const handleRetry = async () => {
    try {
      setRetrying(prev => !prev);
      setLoading(true);
      setReport(null);
      await reportApi.retry(sessionId);
    } catch (err) {
      console.error('重试失败:', err);
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="main">
        <div className="topbar">
          <span className="topbar-title">面试报告</span>
          <span className="topbar-meta">生成中...</span>
        </div>
        <div className="content" style={{display:'flex',alignItems:'center',justifyContent:'center',minHeight:'300px'}}>
          <div style={{textAlign:'center',color:'var(--text-muted)'}}>
            <div style={{fontSize:'24px',marginBottom:'12px'}}>⏳</div>
            <div>AI 正在分析你的面试表现，请稍候...</div>
            <div style={{fontSize:'11px',marginTop:'8px',color:'var(--text-muted)'}}>深度思考模型可能需要较长时间</div>
          </div>
        </div>
      </div>
    );
  }

  if (!report || report.status === 'failed') {
    return (
      <div className="main">
        <div className="topbar">
          <span className="topbar-title">面试报告</span>
        </div>
        <div className="content" style={{textAlign:'center', padding:'60px',color:'var(--text-muted)'}}>
          <div style={{marginBottom:'16px'}}>报告生成失败，可能是 AI 调用超时</div>
          <button className="btn btn-primary" onClick={handleRetry}>重新生成报告</button>
        </div>
      </div>
    );
  }

  return (
    <div className="main">
      <div className="topbar">
        <span className="topbar-title">面试报告</span>
        <span className="topbar-meta">{report.createdAt?.split('T')[0] || ''}</span>
      </div>
      <div className="content">

        {/* 评分卡 */}
        <div className="report-score-row">
          <div className="score-box">
            <div className="score-num">{report.overallScore}</div>
            <div className="score-label">总体评分</div>
          </div>
          <div className="score-box">
            <div className="score-num" style={{color:'var(--accent-dim)'}}>{report.qaBreakdown?.length || 0}</div>
            <div className="score-label">提问轮次</div>
          </div>
          <div className="score-box">
            <div className="score-num" style={{color:'var(--warn)'}}>{report.riskPoints?.length || 0}</div>
            <div className="score-label">主要风险点</div>
          </div>
        </div>

        {/* 总评 */}
        <div className="card" style={{marginBottom:'16px'}}>
          <div className="card-label">总评</div>
          <div style={{fontSize:'13px',lineHeight:'1.8',color:'var(--text-secondary)'}}>
            {report.summary}
          </div>
        </div>

        {/* 逐题拆解 */}
        <div className="card-label" style={{marginBottom:'8px'}}>逐题拆解</div>
        {report.qaBreakdown?.map((qa, i) => (
          <div key={i} className="qa-item">
            <div className="qa-question">
              <span className="qa-num">Q{i + 1}</span>
              <span>{qa.question}</span>
            </div>
            <div className="qa-answer-summary">{qa.answerSummary}</div>
            {qa.issues?.map((issue, j) => (
              <div key={j} className="qa-issue">⚠ {issue}</div>
            ))}
            {qa.suggestions?.map((sug, j) => (
              <div key={j} className="qa-suggest">💡 {sug}</div>
            ))}
          </div>
        ))}

        {/* 风险点 */}
        {report.riskPoints?.length > 0 && (
          <>
            <div className="divider"></div>
            <div className="card-label" style={{marginBottom:'8px'}}>风险点</div>
            <div className="card" style={{marginBottom:'16px'}}>
              <ul className="risk-list">
                {report.riskPoints.map((point, i) => (
                  <li key={i} className="risk-item">
                    <div className="risk-dot"></div>
                    <div>{point}</div>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}

        {/* 改进建议 */}
        {report.suggestions && (
          <>
            <div className="card-label" style={{marginBottom:'8px'}}>改进建议</div>
            <div className="card">
              <div style={{fontSize:'13px',color:'var(--text-secondary)',lineHeight:'1.9'}}>
                {report.suggestions.nextPractice?.map((item, i) => (
                  <div key={i}>① {item}</div>
                ))}
                {report.suggestions.selfIntroImprovement && (
                  <div>② {report.suggestions.selfIntroImprovement}</div>
                )}
                {report.suggestions.projectExpressionTips && (
                  <div>③ {report.suggestions.projectExpressionTips}</div>
                )}
              </div>
            </div>
          </>
        )}

        <div style={{marginTop:'20px',display:'flex',gap:'10px'}}>
          <Link to="/" className="btn btn-primary">再练一场</Link>
          <Link to="/records" className="btn btn-ghost">查看历史记录</Link>
        </div>

      </div>
    </div>
  );
}
