// 简历管理页面
import { useRef, useState } from 'react';
import { useResume } from '../hooks/useResume';
import ResumeCard from '../components/ResumeCard';
import ResumeDrawer from '../components/ResumeDrawer';
import './ResumeManager.css';

export default function ResumeManager() {
  const { resumes, loading, uploadResume, activateResume, deleteResume, forceDeleteResume, getResumeDetail, reparseResume } = useResume();
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerResume, setDrawerResume] = useState(null);

  // 删除确认弹窗状态
  const [deleteTarget, setDeleteTarget] = useState(null);     // 待删除的简历对象
  const [deleteMessage, setDeleteMessage] = useState('');      // 弹窗提示文案
  const [hasSessionConflict, setHasSessionConflict] = useState(false); // 是否有关联面试
  const [deleting, setDeleting] = useState(false);             // 删除中状态

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

  // 点击删除按钮 → 弹窗确认
  const handleDeleteClick = (id) => {
    const resume = resumes.find(r => r.id === id);
    setDeleteTarget(resume || { id });
    setDeleteMessage('');
    setHasSessionConflict(false);
  };

  // 用户确认删除
  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      if (hasSessionConflict) {
        // 已确认有关联面试，走强制删除
        await forceDeleteResume(deleteTarget.id);
      } else {
        // 普通删除
        await deleteResume(deleteTarget.id);
      }
      closeDeleteDialog();
    } catch (err) {
      if (err.code === 'RESUME_HAS_SESSIONS') {
        // 后端返回有关联面试，切换弹窗内容让用户再次确认
        setDeleteMessage(err.message);
        setHasSessionConflict(true);
      } else {
        alert('删除失败：' + err.message);
        closeDeleteDialog();
      }
    } finally {
      setDeleting(false);
    }
  };

  // 关闭删除弹窗
  const closeDeleteDialog = () => {
    setDeleteTarget(null);
    setDeleteMessage('');
    setHasSessionConflict(false);
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
              onDelete={handleDeleteClick}
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

      {/* 删除确认弹窗 */}
      {deleteTarget && (
        <div className="confirm-overlay" onClick={closeDeleteDialog}>
          <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-title">
              {hasSessionConflict ? '无法直接删除' : '确认删除'}
            </div>
            <div className="confirm-body">
              {hasSessionConflict ? (
                <>
                  {deleteMessage}
                  <div className="confirm-detail">
                    📄 {deleteTarget.name || '未知简历'}
                  </div>
                  <div className="confirm-warn">确认后将一并删除关联的面试记录和报告，且无法恢复。</div>
                </>
              ) : (
                <>
                  确定要删除简历「{deleteTarget.name}」吗？
                  <div className="confirm-warn">删除后将无法恢复。</div>
                </>
              )}
            </div>
            <div className="confirm-actions">
              <button className="btn btn-ghost btn-sm" onClick={closeDeleteDialog}>取消</button>
              <button className="btn btn-danger btn-sm" onClick={handleConfirmDelete} disabled={deleting}>
                {deleting ? '删除中...' : '确认删除'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
