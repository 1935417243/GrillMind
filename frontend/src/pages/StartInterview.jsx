// 开始面试页面
import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAppState } from '../store/AppContext';
import { sessionApi, modelApi } from '../api/client';
import './StartInterview.css';

export default function StartInterview() {
  const navigate   = useNavigate();
  const { activeResume } = useAppState();
  const [jobType,    setJobType]    = useState('backend');
  const [duration,   setDuration]   = useState(30);
  const [difficulty, setDifficulty] = useState('pressure');
  const [focus,      setFocus]      = useState('mixed');
  const [binding,    setBinding]    = useState(null);
  const [starting,   setStarting]   = useState(false);

  // 加载模型绑定
  useEffect(() => {
    modelApi.getBinding().then(setBinding).catch(() => {});
  }, []);

  // 简历解析结果推荐岗位
  useEffect(() => {
    if (activeResume?.jobType) {
      setJobType(activeResume.jobType);
    }
  }, [activeResume]);

  const handleStart = async () => {
    if (!activeResume || starting) return;
    setStarting(true);
    try {
      const { sessionId } = await sessionApi.create({
        resumeId: activeResume.id,
        jobType,
        duration,
        difficulty,
        focus,
      });
      navigate(`/interview/${sessionId}`);
    } catch (err) {
      alert('创建面试失败：' + err.message);
    } finally {
      setStarting(false);
    }
  };

  const difficultyMap = { normal: '普通', pressure: '有压力', high: '高压' };
  const focusMap      = { mixed: '综合', project: '项目深挖', basic: '基础能力' };

  return (
    <div className="main">
      <div className="topbar">
        <span className="topbar-title">开始面试</span>
        <span className="topbar-meta">选择简历与参数，开始一场模拟</span>
      </div>
      <div className="content">

        {/* 当前简历 */}
        <div className="card">
          <div className="card-label">当前简历</div>
          {activeResume ? (
            <div className="resume-selector">
              <div style={{width:'38px',height:'38px',background:'var(--accent-light)',borderRadius:'4px',display:'flex',alignItems:'center',justifyContent:'center',color:'var(--accent)',fontSize:'18px'}}>📄</div>
              <div style={{flex:1}}>
                <div className="resume-name">{activeResume.name}</div>
                <div className="resume-meta">
                  {activeResume.yearsOfExperience ? `${activeResume.yearsOfExperience}年经验 · ` : ''}
                  {activeResume.parseStatus === 'done' ? '解析完成' : activeResume.parseStatus === 'processing' ? '解析中...' : '待解析'}
                  {activeResume.createdAt ? ` · ${activeResume.createdAt.split('T')[0] || activeResume.createdAt.split(' ')[0]} 上传` : ''}
                </div>
              </div>
              <span className="tag tag-green">当前使用</span>
              <Link to="/resumes" className="btn btn-ghost btn-sm">切换</Link>
            </div>
          ) : (
            <div style={{color:'var(--text-muted)', fontSize:'13px'}}>
              暂无简历，请先 <Link to="/resumes" style={{color:'var(--accent)'}}>上传简历</Link>
            </div>
          )}
        </div>

        {/* 岗位类型 */}
        <div className="card">
          <div className="card-label">岗位类型</div>
          <div style={{fontSize:'12px',color:'var(--text-muted)',marginBottom:'10px'}}>系统已从简历识别推荐，可手动切换</div>
          <div className="role-selector">
            <div
              className={`role-option ${jobType === 'backend' ? 'selected' : ''}`}
              onClick={() => setJobType('backend')}
            >
              <div className="role-title">后端工程师</div>
              <div className="role-desc">项目架构 · 数据库 · 并发</div>
            </div>
            <div
              className={`role-option ${jobType === 'test' ? 'selected' : ''}`}
              onClick={() => setJobType('test')}
            >
              <div className="role-title">软件测试工程师</div>
              <div className="role-desc">测试策略 · 用例设计 · 自动化</div>
            </div>
          </div>
        </div>

        {/* 面试参数 */}
        <div className="card">
          <div className="card-label">面试参数</div>
          <div className="param-row">
            <div className="param-item">
              <div className="param-label">时长</div>
              <select className="param-select" value={duration} onChange={e => setDuration(+e.target.value)}>
                <option value={20}>20 分钟</option>
                <option value={30}>30 分钟</option>
                <option value={45}>45 分钟</option>
              </select>
            </div>
            <div className="param-item">
              <div className="param-label">难度</div>
              <select className="param-select" value={difficulty} onChange={e => setDifficulty(e.target.value)}>
                <option value="normal">普通</option>
                <option value="pressure">有压力</option>
                <option value="high">高压</option>
              </select>
            </div>
            <div className="param-item">
              <div className="param-label">侧重点</div>
              <select className="param-select" value={focus} onChange={e => setFocus(e.target.value)}>
                <option value="mixed">综合</option>
                <option value="project">项目深挖</option>
                <option value="basic">基础能力</option>
              </select>
            </div>
          </div>
        </div>

        {/* 模型绑定 */}
        <div className="card">
          <div className="card-label">当前模型绑定</div>
          <div className="model-summary">
            {binding?.interviewModel ? (
              <>
                <div className="model-tag">
                  <span style={{color:'var(--accent)'}}>●</span>
                  简历解析 → {binding.parseModel?.split('::')[1] || '未设置'}
                </div>
                <div className="model-tag">
                  <span style={{color:'var(--accent)'}}>●</span>
                  面试对话 → {binding.interviewModel?.split('::')[1] || '未设置'}
                </div>
              </>
            ) : (
              <span style={{color:'var(--text-muted)', fontSize:'12px'}}>尚未配置模型</span>
            )}
            <Link to="/settings" className="btn btn-ghost btn-sm" style={{marginLeft:'auto'}}>修改配置</Link>
          </div>
        </div>

        {/* 开始按钮 */}
        <div className="start-footer">
          <button
            className="btn btn-primary"
            style={{padding:'10px 28px',fontSize:'14px'}}
            onClick={handleStart}
            disabled={!activeResume || activeResume.parseStatus !== 'done' || !binding?.interviewModel || starting}
          >
            {starting ? '创建中...' : '开始面试'}
          </button>
          <span className="start-hint">
            预计 {duration} 分钟 · {jobType === 'backend' ? '后端工程师' : '测试工程师'} · {difficultyMap[difficulty]}
          </span>
        </div>

      </div>
    </div>
  );
}
