// 自定义模型选择下拉组件
import { useState, useRef, useEffect } from 'react';
import './ModelDropdown.css';

/**
 * @param {object} props
 * @param {Array} props.providers - [{name, label, connected, models: []}]
 * @param {string} props.value - 当前选中值 'provider::model'
 * @param {Function} props.onChange - 选中回调
 */
export default function ModelDropdown({ providers = [], value, onChange }) {
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

  const displayName = value ? value.split('::')[1] : '请选择';

  return (
    <div className={`model-dropdown ${open ? 'open' : ''}`} ref={ref}>
      <div className="model-dropdown-trigger" onClick={() => setOpen(!open)}>
        <span className="dd-value">{displayName}</span>
        <svg className="model-dropdown-arrow" viewBox="0 0 10 6" fill="none">
          <path d="M0 0l5 6 5-6z" fill="currentColor"/>
        </svg>
      </div>
      <div className="model-dropdown-menu">
        {providers.map(provider => (
          <div key={provider.name}>
            <div className={`model-dd-group-label ${!provider.connected ? 'disabled' : ''}`}>
              {provider.label}{!provider.connected ? ' · 未连接' : ''}
            </div>
            {(provider.models || []).map(model => {
              const val = `${provider.name}::${model}`;
              return (
                <div
                  key={val}
                  className={`model-dd-option ${!provider.connected ? 'disabled' : ''} ${value === val ? 'selected' : ''}`}
                  onClick={() => {
                    if (!provider.connected) return;
                    onChange(val);
                    setOpen(false);
                  }}
                >
                  {model}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
