// 简历解析详情抽屉组件
import { useState, useEffect } from 'react';
import { jobPositionApi } from '../api/client';
import './ResumeDrawer.css';

/**
 * @param {object} props
 * @param {boolean} props.open - 是否打开
 * @param {object|null} props.resume - 简历详情数据（含 parsed）
 * @param {Function} props.onClose - 关闭回调
 */
export default function ResumeDrawer({ open, resume, onClose }) {
  const [jobMap, setJobMap] = useState({});

  // 加载岗位列表用于名称映射
  useEffect(() => {
    jobPositionApi.list().then(data => {
      const map = {};
      data.forEach(jp => { map[jp.id] = jp.name; });
      setJobMap(map);
    }).catch(() => {});
  }, []);

  if (!resume) return null;

  const parsed = resume.parsed || {};

  // 构建基本信息键值对
  const baseInfo = [
    ['候选人', parsed.candidateName || resume.name?.replace(/\.[^.]+$/, '') || '未知'],
    ['工作年限', parsed.yearsOfExperience ? `${parsed.yearsOfExperience} 年` : '未知'],
    ['岗位倾向', formatJobTendency(parsed.jobTendency, jobMap)],
    ['技术栈', (parsed.techStack || []).join(' · ') || '未提取'],
  ];

  const projects = parsed.projects || [];
  const selfIntroHints = parsed.selfIntroHints || [];

  return (
    <>
      {/* 遮罩层 */}
      <div
        className={`drawer-mask ${open ? 'open' : ''}`}
        onClick={onClose}
      />

      {/* 抽屉面板 */}
      <div className={`drawer ${open ? 'open' : ''}`}>
        {/* 头部 */}
        <div className="drawer-header">
          <div>
            <div className="drawer-title">{resume.name || '解析结果'}</div>
            <div className="drawer-sub">
              {resume.parseStatus === 'done' ? '解析完成' : resume.parseStatus}
              {resume.createdAt ? ` · ${formatDate(resume.createdAt)} 上传` : ''}
            </div>
          </div>
          <button className="drawer-close" onClick={onClose}>✕</button>
        </div>

        {/* 内容区 */}
        <div className="drawer-body">
          {/* 基本信息 */}
          <div className="parse-section">
            <div className="parse-section-title">基本信息</div>
            {baseInfo.map(([key, value], i) => (
              <div className="parse-kv" key={i}>
                <span className="parse-k">{key}</span>
                <span className="parse-v">{value}</span>
              </div>
            ))}
          </div>

          {/* 项目列表 */}
          {projects.length > 0 && (
            <div className="parse-section">
              <div className="parse-section-title">项目列表</div>
              {projects.map((project, i) => (
                <div className="project-card" key={i}>
                  <div className="project-name">{project.name}</div>
                  {project.role && (
                    <div className="project-role">{project.role}</div>
                  )}
                  {/* 职责描述 */}
                  {project.responsibilities?.length > 0 && (
                    <div className="project-desc">
                      {project.responsibilities.join('；')}
                    </div>
                  )}
                  {/* 深挖点 & 模糊点 */}
                  <div className="dig-points">
                    {(project.vaguePoints || []).map((point, j) => (
                      <div className="dig-point warn" key={`w-${j}`}>⚠ {point}</div>
                    ))}
                    {(project.deepDivePoints || []).map((point, j) => (
                      <div className="dig-point tip" key={`t-${j}`}>💡 {point}</div>
                    ))}
                  </div>
                  {/* 技术栈标签 */}
                  {project.techUsed?.length > 0 && (
                    <div className="skill-chips" style={{ marginTop: '8px' }}>
                      {project.techUsed.map((tech, j) => (
                        <span className="skill-chip" key={j}>{tech}</span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* 自我介绍提示 */}
          {selfIntroHints.length > 0 && (
            <div className="parse-section">
              <div className="parse-section-title">自我介绍提示</div>
              <div className="intro-hints">
                {selfIntroHints.map((hint, i) => (
                  <div className="intro-hint" key={i}>💡 {hint}</div>
                ))}
              </div>
            </div>
          )}

          {/* 无解析数据时 */}
          {!parsed.yearsOfExperience && projects.length === 0 && (
            <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px 0' }}>
              暂无解析数据
            </div>
          )}
        </div>
      </div>
    </>
  );
}

/**
 * 岗位倾向格式化 — 从岗位表查名称
 */
function formatJobTendency(tendency, jobMap = {}) {
  if (!tendency) return '未识别';
  return jobMap[tendency] || tendency;
}

/**
 * 日期格式化（取 YYYY-MM-DD 部分）
 */
function formatDate(dateStr) {
  if (!dateStr) return '';
  return dateStr.split('T')[0] || dateStr.split(' ')[0] || dateStr;
}

