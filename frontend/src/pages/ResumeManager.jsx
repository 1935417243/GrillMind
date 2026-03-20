// 简历管理页面
import { useRef, useState } from 'react';
import { useResume } from '../hooks/useResume';
import ResumeCard from '../components/ResumeCard';
import ResumeDrawer from '../components/ResumeDrawer';
import './ResumeManager.css';

export default function ResumeManager() {
  const { resumes, loading, uploadResume, activateResume, deleteResume, getResumeDetail, reparseResume } = useResume();
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerResume, setDrawerResume] = useState(null);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await uploadResume(file);
    } catch (err) {
      alert('上传失败：' + err.message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  // 打开解析详情抽屉
  const handleViewParse = async (resume) => {
    try {
      const detail = await getResumeDetail(resume.id);
      setDrawerResume(detail);
      setDrawerOpen(true);
    } catch (err) {
      alert('获取解析详情失败：' + err.message);
    }
  };

  // 关闭抽屉
  const handleCloseDrawer = () => {
    setDrawerOpen(false);
    // 延迟清空数据，等动画结束
    setTimeout(() => setDrawerResume(null), 300);
  };

  return (
    <div className="main">
      <div className="topbar">
        <span className="topbar-title">简历管理</span>
        <span className="topbar-meta">上传并管理多份简历</span>
      </div>
      <div className="content">

        <div className="resume-list">
          {loading && resumes.length === 0 && (
            <div style={{color:'var(--text-muted)', textAlign:'center', padding:'40px'}}>加载中...</div>
          )}
          {resumes.map(resume => (
            <ResumeCard
              key={resume.id}
              resume={resume}
              onActivate={activateResume}
              onDelete={deleteResume}
              onView={handleViewParse}
              onReparse={reparseResume}
            />
          ))}
        </div>

        <div className="upload-zone" onClick={() => fileRef.current?.click()}>
          <div style={{fontSize:'20px',marginBottom:'8px',opacity:0.5}}>＋</div>
          {uploading ? '上传中...' : '点击上传新简历 · 支持 PDF、Word'}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.docx"
          style={{ display: 'none' }}
          onChange={handleUpload}
        />

        <div className="divider"></div>
        <div style={{fontSize:'12px',color:'var(--text-muted)',padding:'4px 0'}}>
          简历解析后可查看：候选人年限、岗位倾向、技术栈、项目列表、可深挖点
        </div>

        {/* 解析详情抽屉 */}
        <ResumeDrawer
          open={drawerOpen}
          resume={drawerResume}
          onClose={handleCloseDrawer}
        />

      </div>
    </div>
  );
}
