// 简单下拉选择组件（复用 ModelDropdown 的样式风格）
import { useState, useRef, useEffect } from 'react';
import './ModelDropdown.css';

/**
 * @param {Array} options - [{ value, label }]
 * @param {string} value - 当前选中值
 * @param {Function} onChange - 选中回调
 */
export default function SimpleDropdown({ options = [], value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // 点击外部关闭
  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const selected = options.find(o => o.value === value);
  const displayName = selected?.label || value || '请选择';

  return (
    <div className={`model-dropdown ${open ? 'open' : ''}`} ref={ref}>
      <div className="model-dropdown-trigger" onClick={() => setOpen(!open)}>
        <span className="dd-value">{displayName}</span>
        <svg className="model-dropdown-arrow" viewBox="0 0 10 6" fill="none">
          <path d="M0 0l5 6 5-6z" fill="currentColor"/>
        </svg>
      </div>
      <div className="model-dropdown-menu">
        <div className="model-dd-list">
          {options.map(opt => (
            <div
              key={opt.value}
              className={`model-dd-option ${value === opt.value ? 'selected' : ''}`}
              onClick={() => { onChange(opt.value); setOpen(false); }}
            >
              {opt.label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
