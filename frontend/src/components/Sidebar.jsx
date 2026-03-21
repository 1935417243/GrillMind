// 侧边栏导航组件
import { NavLink } from 'react-router-dom';
import { useAppState } from '../store/AppContext';
import './Sidebar.css';

export default function Sidebar() {
  const { providers } = useAppState();

  // 查找第一个已连接的供应商
  const connectedProvider = Object.entries(providers).find(([, p]) => p.isConnected);
  const statusText = connectedProvider
    ? `${connectedProvider[0]} · 已就绪`
    : '未配置模型';

  return (
    <aside className="sidebar">
      <div className="logo">
        <div className="logo-zh">智面</div>
        <div className="logo-sub">AI INTERVIEW SIM · MVP</div>
      </div>

      <nav>
        <NavLink to="/" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} end>
          <svg className="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="8" cy="8" r="6.5"/>
            <polygon points="6.5,5.5 11,8 6.5,10.5" fill="currentColor" stroke="none"/>
          </svg>
          开始面试
        </NavLink>
        <NavLink to="/resumes" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <svg className="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="2.5" y="1.5" width="11" height="13" rx="1.5"/>
            <line x1="5" y1="5.5" x2="11" y2="5.5"/>
            <line x1="5" y1="8" x2="11" y2="8"/>
            <line x1="5" y1="10.5" x2="9" y2="10.5"/>
          </svg>
          简历管理
        </NavLink>
        <NavLink to="/jobs" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <svg className="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="1.5" y="4.5" width="13" height="9" rx="1.5"/>
            <path d="M5.5 4.5V3a1.5 1.5 0 0 1 1.5-1.5h2A1.5 1.5 0 0 1 10.5 3v1.5"/>
            <line x1="1.5" y1="8.5" x2="14.5" y2="8.5"/>
          </svg>
          岗位管理
        </NavLink>
        <NavLink to="/records" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <svg className="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="1.5" y="3.5" width="13" height="9" rx="1.5"/>
            <line x1="4.5" y1="7" x2="11.5" y2="7"/>
            <line x1="4.5" y1="9.5" x2="8.5" y2="9.5"/>
          </svg>
          面试记录
        </NavLink>
        <NavLink to="/settings" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <svg className="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="8" cy="8" r="2"/>
            <path d="M6.8 1.5h2.4l.3 1.8.9.4 1.5-1 1.7 1.7-1 1.5.4.9 1.8.3v2.4l-1.8.3-.4.9 1 1.5-1.7 1.7-1.5-1-.9.4-.3 1.8H6.8l-.3-1.8-.9-.4-1.5 1-1.7-1.7 1-1.5-.4-.9-1.8-.3V6.8l1.8-.3.4-.9-1-1.5 1.7-1.7 1.5 1 .9-.4z"/>
          </svg>
          模型设置
        </NavLink>
      </nav>

      <div className="sidebar-footer">
        <div className="model-badge">
          <div className={`model-dot ${connectedProvider ? '' : 'off'}`}></div>
          {statusText}
        </div>
      </div>
    </aside>
  );
}
