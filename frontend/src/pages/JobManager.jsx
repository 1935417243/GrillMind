// 岗位管理页面
import { useState, useEffect } from 'react';
import { jobPositionApi } from '../api/client';
import './JobManager.css';

export default function JobManager() {
  const [positions, setPositions] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [formOpen, setFormOpen]   = useState(false);   // 新增/编辑弹窗
  const [editing, setEditing]     = useState(null);    // 编辑时的岗位数据
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [toggleTarget, setToggleTarget] = useState(null);  // 启用/禁用确认
  const [saving, setSaving]       = useState(false);
  const [generating, setGenerating] = useState(false);     // AI 生成中
  const [genError, setGenError]     = useState('');

  // 表单数据
  const [formName, setFormName]         = useState('');
  const [formTags, setFormTags]         = useState('');
  const [formScripts, setFormScripts]   = useState({ mixed: '', project: '', basic: '' });
  const [formSortOrder, setFormSortOrder] = useState(0);
  const [formEnabled, setFormEnabled]   = useState(true);
  const [activeTab, setActiveTab]       = useState('mixed');
  const [formError, setFormError]       = useState('');

  // 加载岗位列表
  const loadList = () => {
    jobPositionApi.list().then(data => {
      setPositions(data);
      setLoading(false);
    }).catch(() => setLoading(false));
  };

  useEffect(() => { loadList(); }, []);

  // 打开新增弹窗
  const openCreate = () => {
    setEditing(null);
    setFormName('');
    setFormTags('');
    setFormScripts({ mixed: '', project: '', basic: '' });
    setFormSortOrder(0);
    setFormEnabled(true);
    setActiveTab('mixed');
    setFormError('');
    setGenerating(false);
    setGenError('');
    setFormOpen(true);
  };

  // 打开编辑弹窗
  const openEdit = (pos) => {
    setEditing(pos);
    setFormName(pos.name);
    setFormTags(pos.tags || '');
    setFormScripts({ ...pos.scripts });
    setFormSortOrder(pos.sortOrder);
    setFormEnabled(pos.enabled);
    setActiveTab('mixed');
    setFormError('');
    setGenerating(false);
    setGenError('');
    setFormOpen(true);
  };

  // 保存
  const handleSave = async () => {
    if (!formName.trim()) {
      setFormError('岗位名称不能为空');
      return;
    }
    if (!formScripts.mixed.trim() || !formScripts.project.trim() || !formScripts.basic.trim()) {
      setFormError('请填写三套考察脚本');
      return;
    }

    setSaving(true);
    setFormError('');

    try {
      const payload = {
        name: formName.trim(),
        tags: formTags.trim(),
        scripts: formScripts,
        sortOrder: formSortOrder,
        enabled: formEnabled,
      };

      if (editing) {
        await jobPositionApi.update(editing.id, payload);
      } else {
        await jobPositionApi.create(payload);
      }

      setFormOpen(false);
      loadList();
    } catch (err) {
      setFormError(err.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  // 确认切换启用/禁用
  const handleToggle = async () => {
    if (!toggleTarget) return;
    try {
      await jobPositionApi.toggle(toggleTarget.id);
      loadList();
    } catch (err) {
      console.error('切换失败:', err);
    }
    setToggleTarget(null);
  };

  // 确认删除
  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await jobPositionApi.delete(deleteTarget.id);
      loadList();
    } catch (err) {
      alert(err.message || '删除失败');
    }
    setDeleteTarget(null);
  };

  // AI 一键生成标签与考察脚本
  const handleGenerate = async () => {
    if (!formName.trim() || generating) return;
    setGenerating(true);
    setGenError('');
    try {
      const data = await jobPositionApi.generate(formName.trim());
      setFormTags(data.tags || '');
      setFormScripts({
        mixed:   data.scripts?.mixed || '',
        project: data.scripts?.project || '',
        basic:   data.scripts?.basic || '',
      });
    } catch (err) {
      setGenError(err.message || '生成失败，请重试');
    } finally {
      setGenerating(false);
    }
  };

  const tabLabels = { mixed: '综合考察', project: '项目深挖', basic: '基础能力' };

  return (
    <div className="main">
      <div className="topbar">
        <span className="topbar-title">岗位管理</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span className="topbar-meta">共 {positions.length} 个岗位</span>
          <button className="btn btn-primary btn-sm" onClick={openCreate}>+ 新增岗位</button>
        </div>
      </div>

      <div className="content">
        {loading ? (
          <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px' }}>加载中...</div>
        ) : positions.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px' }}>
            暂无岗位，点击上方按钮新增
          </div>
        ) : (
          positions.map(pos => (
            <div key={pos.id} className="job-item">
              <div className="job-main">
                <div className="job-name">
                  {pos.name}
                  <span className={`tag ${pos.enabled ? 'tag-green' : 'tag-gray'}`} style={{ marginLeft: '8px' }}>
                    {pos.enabled ? '已启用' : '未启用'}
                  </span>
                </div>
                <div className="job-tags">{pos.tags || '—'}</div>
              </div>
              <div className="job-actions">
                <button className="job-action-btn" onClick={() => openEdit(pos)}>编辑</button>
                <button className="job-action-btn" onClick={() => setToggleTarget(pos)}>
                  {pos.enabled ? '禁用' : '启用'}
                </button>
                {pos.useCount === 0 && (
                  <button
                    className="job-action-btn danger"
                    onClick={() => setDeleteTarget(pos)}
                  >
                    删除
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* 新增/编辑弹窗 */}
      {formOpen && (
        <div className="job-form-overlay" onClick={() => setFormOpen(false)}>
          <div className="job-form-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="job-form-title">{editing ? '编辑岗位' : '新增岗位'}</div>

            {/* 岗位名称 */}
            <div className="job-form-field">
              <div className="form-label">岗位名称</div>
              <input
                className="form-input"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="如 前端工程师"
              />
              {/* AI 一键生成按钮 */}
              {formName.trim() && (
                <div className="ai-gen-row">
                  <button
                    className="ai-gen-btn"
                    disabled={generating}
                    onClick={handleGenerate}
                  >
                    {generating ? '生成中…' : '✦ 一键生成标签与考察脚本'}
                  </button>
                  {genError && <span className="ai-gen-error">{genError}</span>}
                </div>
              )}
            </div>

            {/* 岗位标签 */}
            <div className="job-form-field">
              <div className="form-label">岗位标签</div>
              <input
                className="form-input"
                value={formTags}
                onChange={(e) => setFormTags(e.target.value)}
                placeholder="如 React · CSS · 性能优化"
              />
            </div>

            {/* 考察脚本 */}
            <div className="job-form-field">
              <div className="form-label">考察脚本</div>
              <div className="script-tabs">
                {Object.entries(tabLabels).map(([key, label]) => (
                  <button
                    key={key}
                    className={`script-tab ${activeTab === key ? 'active' : ''}`}
                    onClick={() => setActiveTab(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <textarea
                className="script-textarea"
                value={formScripts[activeTab]}
                onChange={(e) => setFormScripts(prev => ({ ...prev, [activeTab]: e.target.value }))}
                placeholder={`每行一条，如：\n- 项目架构：服务划分、依赖关系\n- 数据库：索引设计、慢查询排查`}
              />
            </div>

            {/* 排序权重 */}
            <div className="job-form-field">
              <div className="form-label">排序权重</div>
              <input
                className="form-input"
                type="number"
                min="0"
                style={{ width: '100px' }}
                value={formSortOrder}
                onChange={(e) => setFormSortOrder(parseInt(e.target.value) || 0)}
              />
            </div>

            {/* 错误提示 */}
            {formError && (
              <div style={{ marginTop: '12px', fontSize: '12px', color: 'var(--warn)' }}>{formError}</div>
            )}

            {/* 按钮 */}
            <div className="job-form-actions">
              <button className="btn btn-ghost btn-sm" onClick={() => setFormOpen(false)}>取消</button>
              <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 启用/禁用确认弹窗 */}
      {toggleTarget && (
        <div className="job-form-overlay" onClick={() => setToggleTarget(null)}>
          <div className="job-form-dialog" style={{ width: '360px' }} onClick={(e) => e.stopPropagation()}>
            <div className="job-form-title">{toggleTarget.enabled ? '确认禁用' : '确认启用'}</div>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.7', marginBottom: '20px' }}>
              确定要{toggleTarget.enabled ? '禁用' : '启用'}岗位「{toggleTarget.name}」吗？
              {toggleTarget.enabled && (
                <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--warn)' }}>
                  禁用后该岗位将不会出现在面试岗位选择中。
                </div>
              )}
            </div>
            <div className="job-form-actions" style={{ marginTop: '0', paddingTop: '0', borderTop: 'none' }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setToggleTarget(null)}>取消</button>
              <button className="btn btn-primary btn-sm" onClick={handleToggle}>
                确认{toggleTarget.enabled ? '禁用' : '启用'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 删除确认弹窗 */}
      {deleteTarget && (
        <div className="job-form-overlay" onClick={() => setDeleteTarget(null)}>
          <div className="job-form-dialog" style={{ width: '360px' }} onClick={(e) => e.stopPropagation()}>
            <div className="job-form-title">确认删除</div>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.7', marginBottom: '20px' }}>
              确定要删除岗位「{deleteTarget.name}」吗？
              <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--warn)' }}>
                删除后将无法恢复。
              </div>
            </div>
            <div className="job-form-actions" style={{ marginTop: '0', paddingTop: '0', borderTop: 'none' }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setDeleteTarget(null)}>取消</button>
              <button className="btn btn-sm" style={{ background: 'var(--warn)', color: '#fff', borderColor: 'var(--warn)' }} onClick={handleDelete}>确认删除</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
