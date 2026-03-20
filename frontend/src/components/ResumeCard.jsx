// 简历卡片组件
import './ResumeCard.css';

/**
 * 解析状态映射
 */
const STATUS_MAP = {
  pending: { label: '等待解析', className: 'tag-gray', icon: '⏳' },
  processing: { label: '解析中...', className: 'tag-processing', icon: '' },
  done: { label: '解析完成', className: 'tag-green', icon: '' },
  failed: { label: '解析失败', className: 'tag-warn', icon: '✗' },
};

/**
 * @param {object} props
 * @param {object} props.resume - 简历数据
 * @param {Function} [props.onActivate] - 设为当前简历
 * @param {Function} [props.onDelete] - 删除
 * @param {Function} [props.onView] - 查看解析
 * @param {Function} [props.onReparse] - 重新解析
 */
export default function ResumeCard({ resume, onActivate, onDelete, onView, onReparse }) {
  const parseInfo = STATUS_MAP[resume.parseStatus] || STATUS_MAP.pending;
  const MAX_CHIPS = 6;
  const visibleTech = (resume.techStack || []).slice(0, MAX_CHIPS);
  const extraCount = (resume.techStack || []).length - MAX_CHIPS;

  return (
    <div className={`resume-card ${resume.isActive ? 'current' : ''}`}>
      <div className="resume-info-row">
        <div className={`resume-icon ${resume.isActive ? '' : 'inactive'}`}>📄</div>
        <div>
          <div className="resume-title">{resume.name}</div>
          <div className="resume-detail">
            {resume.yearsOfExperience ? `${resume.yearsOfExperience}年经验 · ` : ''}
            {resume.jobType === 'backend' ? '后端工程师' : resume.jobType === 'test' ? '测试工程师' : ''}
            {resume.jobType ? ' · ' : ''}
            上传于 {resume.createdAt?.split('T')[0] || resume.createdAt?.split(' ')[0]}
          </div>
          {visibleTech.length > 0 && (
            <div className="skill-chips" style={{ marginTop: '6px' }}>
              {visibleTech.map((skill, i) => (
                <span key={i} className="skill-chip">{skill}</span>
              ))}
              {extraCount > 0 && (
                <span className="skill-chip skill-chip-more">+{extraCount}</span>
              )}
            </div>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {/* 使用状态标签 */}
        {resume.isActive ? (
          <span className="tag tag-green">当前使用</span>
        ) : (
          <span className="tag tag-gray">未使用</span>
        )}

        {/* 解析状态标签 */}
        {resume.parseStatus && resume.parseStatus !== 'done' && (
          <span className={`tag ${parseInfo.className}`}>
            {parseInfo.icon && <span style={{ marginRight: '3px' }}>{parseInfo.icon}</span>}
            {resume.parseStatus === 'processing' && <span className="parse-spinner" />}
            {parseInfo.label}
          </span>
        )}

        {!resume.isActive && onActivate && (
          <button className="btn btn-ghost btn-sm" onClick={() => onActivate(resume.id)}>设为当前</button>
        )}
        {onView && resume.parseStatus === 'done' && (
          <button className="btn btn-ghost btn-sm" onClick={() => onView(resume)}>查看解析</button>
        )}
        {onReparse && resume.parseStatus === 'failed' && (
          <button className="btn btn-ghost btn-sm" onClick={() => onReparse(resume.id)}>重新解析</button>
        )}
        {onDelete && (
          <button className="btn btn-ghost btn-sm" onClick={() => onDelete(resume.id)} style={{ color: 'var(--warn)' }}>删除</button>
        )}
      </div>
    </div>
  );
}
