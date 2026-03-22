// 面试记录列表页面
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { sessionApi } from '../api/client';
import './InterviewRecords.css';

export default function InterviewRecords() {
  const navigate = useNavigate();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState(null); // 待删除的记录

  useEffect(() => {
    sessionApi.list().then(data => {
      setRecords(data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const difficultyMap = { normal: '普通', pressure: '有压力', high: '高压' };
  const depthMap = { quick: '快速', standard: '标准', deep: '深度' };

  // 确认删除
  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await sessionApi.delete(deleteTarget.id);
      setRecords(prev => prev.filter(r => r.id !== deleteTarget.id));
    } catch (err) {
      console.error('删除失败:', err);
    }
    setDeleteTarget(null);
  };

  return (
    <div className="main">
      <div className="topbar">
        <span className="topbar-title">面试记录</span>
        <span className="topbar-meta">共 {records.length} 场历史记录</span>
      </div>
      <div className="content">
        {loading ? (
          <div style={{color:'var(--text-muted)', textAlign:'center', padding:'40px'}}>加载中...</div>
        ) : records.length === 0 ? (
          <div style={{color:'var(--text-muted)', textAlign:'center', padding:'40px'}}>
            暂无面试记录
          </div>
        ) : (
          records.map(record => (
            <div
              key={record.id}
              className="record-item"
              onClick={() => {
                if (record.status === 'completed') {
                  navigate(`/report/${record.id}`);
                } else if (record.status === 'in_progress') {
                  navigate(`/interview/${record.id}`);
                }
              }}
            >
              <div className="record-date">
                {(() => {
                  const raw = record.startedAt || '';
                  const d = raw.includes('T') ? raw.split('T') : raw.split(' ');
                  const date = (d[0] || '').slice(5);
                  const time = (d[1] || '').slice(0, 5);
                  return date && time ? `${date} ${time}` : date || '';
                })()}
              </div>
              <div className="record-main">
                  <div className="record-name">
                  {record.jobName || '未知岗位'}
                  {record.resumeName ? ` · ${record.resumeName}` : ''}
                </div>
                <div className="record-sub">
                  {depthMap[record.depth] || (typeof record.depth === 'number' ? `${record.depth}分钟` : record.depth)} · {record.turnsCount} 轮追问 · {difficultyMap[record.difficulty] || record.difficulty}
                </div>
              </div>
              {record.status === 'in_progress' ? (
                <span className="tag tag-green">面试中</span>
              ) : record.reportStatus === 'generating' ? (
                <span className="tag tag-processing"><span className="parse-spinner" />解析中</span>
              ) : record.reportStatus === 'failed' ? (
                <span className="tag tag-warn">生成失败</span>
              ) : (
                <div className={`record-score ${record.overallScore >= 80 ? 'good' : record.overallScore < 60 ? 'low' : ''}`}>
                  {record.overallScore ?? '—'}
                </div>
              )}
              <button
                className="record-delete-btn"
                title="删除"
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleteTarget(record);
                }}
              >
                ×
              </button>
            </div>
          ))
        )}
      </div>

      {/* 删除确认弹窗 */}
      {deleteTarget && (
        <div className="confirm-overlay" onClick={() => setDeleteTarget(null)}>
          <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-title">确认删除</div>
            <div className="confirm-body">
              确定要删除这条面试记录吗？
              <div className="confirm-detail">
                {deleteTarget.jobName || '未知岗位'}
                {deleteTarget.resumeName ? ` · ${deleteTarget.resumeName}` : ''}
              </div>
              <div className="confirm-warn">删除后将无法恢复，关联的面试报告也会一并删除。</div>
            </div>
            <div className="confirm-actions">
              <button className="btn btn-ghost btn-sm" onClick={() => setDeleteTarget(null)}>取消</button>
              <button className="btn btn-danger btn-sm" onClick={handleDelete}>确认删除</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
