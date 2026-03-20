// 自定义下拉选择器组件 —— 替代原生 select，匹配项目 UI 风格
import { useState, useRef, useEffect } from 'react';
import './CustomSelect.css';

export default function CustomSelect({ value, options, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // 点击外部关闭下拉
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 当前选中项的显示文本
  const selectedOption = options.find(o => o.value === value);
  const displayText = selectedOption?.label || '';

  const handleSelect = (optionValue) => {
    onChange(optionValue);
    setOpen(false);
  };

  return (
    <div className={`custom-select ${open ? 'open' : ''}`} ref={ref}>
      <div className="custom-select-trigger" onClick={() => setOpen(!open)}>
        <span>{displayText}</span>
        {/* 箭头 SVG */}
        <svg className="custom-select-arrow" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
      <div className="custom-select-options">
        {options.map(opt => (
          <div
            key={opt.value}
            className={`custom-select-option ${opt.value === value ? 'selected' : ''}`}
            onClick={() => handleSelect(opt.value)}
          >
            <span>{opt.label}</span>
            {/* 选中对勾 */}
            <svg className="custom-select-check" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M2 6L5 9L10 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        ))}
      </div>
    </div>
  );
}
