// 开始面试页面
import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAppState, useAppDispatch } from '../store/AppContext';
import { sessionApi, resumeApi, jobPositionApi, modelApi } from '../api/client';
import CustomSelect from '../components/CustomSelect';
import './StartInterview.css';

export default function StartInterview() {
  const navigate   = useNavigate();
  const dispatch   = useAppDispatch();
  const { activeResume } = useAppState();

  // 页面挂载时主动加载简历列表，确保 activeResume 被正确设置
  useEffect(() => {
    if (!activeResume) {
      resumeApi.list().then(data => {
        const active = data.find(r => r.isActive);
        if (active) {
          dispatch({ type: 'SET_ACTIVE_RESUME', payload: active });
        }
        dispatch({ type: 'SET_RESUMES', payload: data });
      }).catch(err => {
        console.error('加载简历列表失败:', err);
      });
    }
  }, [activeResume, dispatch]);
  const [jobType,    setJobType]    = useState('');
  const [depth,      setDepth]      = useState('standard');
  const [difficulty, setDifficulty] = useState('pressure');
  const [focus,      setFocus]      = useState('mixed');

  const [starting,   setStarting]   = useState(false);
  const [jobList,    setJobList]    = useState([]);  // 已启用岗位列表
  const [interviewModel, setInterviewModel] = useState(null); // 对话模型绑定
  const [showModelDialog, setShowModelDialog] = useState(false); // 模型未配置弹窗

  // 加载岗位列表
  useEffect(() => {
    jobPositionApi.list().then(data => {
      const enabled = data.filter(p => p.enabled);
      setJobList(enabled);
      // 默认选中第一个
      if (enabled.length > 0 && !jobType) {
        setJobType(enabled[0].id);
      }
    }).catch(() => {});
  }, []);

  // 加载模型绑定（用于校验对话模型是否已配置）
  useEffect(() => {
    modelApi.getBinding().then(data => {
      setInterviewModel(data.interviewModel || '');
    }).catch(() => {
      setInterviewModel('');
    });
  }, []);

  // 简历解析结果推荐岗位（job_type 现在存的是岗位 ID）
  useEffect(() => {
    if (activeResume?.jobType && jobList.some(j => j.id === activeResume.jobType)) {
      setJobType(activeResume.jobType);
    }
  }, [activeResume, jobList]);

  const handleStart = async () => {
    if (!activeResume || starting) return;
    // 校验对话模型是否已配置
    if (!interviewModel) {
      setShowModelDialog(true);
      return;
    }
    setStarting(true);
    try {
      const { sessionId } = await sessionApi.create({
        resumeId: activeResume.id,
        jobType,
        depth,
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
  const depthMap      = { quick: '快速面试', standard: '标准面试', deep: '深度面试' };
  const currentJob    = jobList.find(j => j.id === jobType);

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
          {jobList.length > 0 ? (
            <div className="job-select-wrapper">
              <CustomSelect
                value={jobType}
                options={jobList.map(job => ({
                  value: job.id,
                  label: job.tags ? `${job.name} · ${job.tags}` : job.name,
                }))}
                onChange={setJobType}
              />
            </div>
          ) : (
            <div style={{color:'var(--text-muted)', fontSize:'12px', padding:'8px 0'}}>
              暂无已启用的岗位，请先在 <a href="/jobs" style={{color:'var(--accent)'}}>岗位管理</a> 中配置
            </div>
          )}
        </div>

        {/* 面试参数 */}
        <div className="card">
          <div className="card-label">面试参数</div>
          <div className="param-row">
            <div className="param-item">
              <div className="param-label">深度</div>
              <CustomSelect
                value={depth}
                options={[
                  { value: 'quick', label: '快速面试' },
                  { value: 'standard', label: '标准面试' },
                  { value: 'deep', label: '深度面试' },
                ]}
                onChange={setDepth}
              />
            </div>
            <div className="param-item">
              <div className="param-label">难度</div>
              <CustomSelect
                value={difficulty}
                options={[
                  { value: 'normal', label: '普通' },
                  { value: 'pressure', label: '有压力' },
                  { value: 'high', label: '高压' },
                ]}
                onChange={setDifficulty}
              />
            </div>
            <div className="param-item">
              <div className="param-label">侧重点</div>
              <CustomSelect
                value={focus}
                options={[
                  { value: 'mixed', label: '综合' },
                  { value: 'project', label: '项目深挖' },
                  { value: 'basic', label: '基础能力' },
                ]}
                onChange={setFocus}
              />
            </div>
          </div>
        </div>



        {/* 开始按钮 */}
        <div className="start-footer">
          <button
            className="btn btn-primary"
            style={{padding:'10px 28px',fontSize:'14px'}}
            onClick={handleStart}
            disabled={!activeResume || activeResume.parseStatus !== 'done' || starting}
          >
            {starting ? '创建中...' : '开始面试'}
          </button>
          <span className="start-hint">
            {depthMap[depth]} · {currentJob?.name || '未选择岗位'} · {difficultyMap[difficulty]}
          </span>
        </div>

      </div>

      {/* 对话模型未配置弹窗 */}
      {showModelDialog && (
        <div className="confirm-overlay" onClick={() => setShowModelDialog(false)}>
          <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-title">无法开始面试</div>
            <div className="confirm-body">
              尚未配置面试对话模型，请先前往模型设置页面配置后再开始面试。
            </div>
            <div className="confirm-actions">
              <button className="btn btn-ghost btn-sm" onClick={() => setShowModelDialog(false)}>取消</button>
              <button className="btn btn-primary btn-sm" onClick={() => navigate('/settings')}>去设置</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
