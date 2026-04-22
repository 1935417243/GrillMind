// 主题切换组件
import { useState, useRef, useEffect } from 'react';
import { useTheme, THEME_MODES } from '../store/ThemeContext';
import { useToast } from './Toast';
import './ThemeToggle.css';

const THEME_LABELS = {
  [THEME_MODES.LIGHT]: '浅色模式',
  [THEME_MODES.DARK]: '深色模式',
  [THEME_MODES.SYSTEM]: '跟随系统',
};

const THEME_ICONS = {
  [THEME_MODES.LIGHT]: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="8" cy="8" r="3.5"/>
      <line x1="8" y1="1" x2="8" y2="3"/>
      <line x1="8" y1="13" x2="8" y2="15"/>
      <line x1="1" y1="8" x2="3" y2="8"/>
      <line x1="13" y1="8" x2="15" y2="8"/>
      <line x1="3.05" y1="3.05" x2="4.46" y2="4.46"/>
      <line x1="11.54" y1="11.54" x2="12.95" y2="12.95"/>
      <line x1="3.05" y1="12.95" x2="4.46" y2="11.54"/>
      <line x1="11.54" y1="4.46" x2="12.95" y2="3.05"/>
    </svg>
  ),
  [THEME_MODES.DARK]: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M13.5 9.5A6 6 0 0 1 6.5 2.5 6 6 0 1 0 13.5 9.5z"/>
    </svg>
  ),
  [THEME_MODES.SYSTEM]: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="1.5" y="2" width="13" height="9" rx="1.5"/>
      <line x1="5.5" y1="14" x2="10.5" y2="14"/>
      <line x1="8" y1="11" x2="8" y2="14"/>
    </svg>
  ),
};

export default function ThemeToggle() {
  const { preference, setTheme, isTransitioning } = useTheme();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  function handleSelect(mode) {
    if (mode === preference) {
      setOpen(false);
      return;
    }
    setTheme(mode);
    setOpen(false);
    toast.success(`已切换至${THEME_LABELS[mode]}`);
  }

  function handleToggleClick() {
    setOpen(prev => !prev);
  }

  return (
    <div className={`theme-toggle${open ? ' open' : ''}`} ref={dropdownRef}>
      <button
        className="theme-toggle-btn"
        onClick={handleToggleClick}
        aria-label="切换主题"
        aria-expanded={open}
        aria-haspopup="listbox"
        disabled={isTransitioning}
      >
        <span className="theme-toggle-icon">
          {THEME_ICONS[preference]}
        </span>
        <span className="theme-toggle-label">{THEME_LABELS[preference]}</span>
        <svg className="theme-toggle-arrow" width="10" height="10" viewBox="0 0 10 6" fill="none">
          <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {open && (
        <div className="theme-toggle-menu" role="listbox" aria-label="主题选项">
          {Object.values(THEME_MODES).map(mode => (
            <button
              key={mode}
              className={`theme-toggle-option${preference === mode ? ' active' : ''}`}
              role="option"
              aria-selected={preference === mode}
              onClick={() => handleSelect(mode)}
            >
              <span className="theme-toggle-option-icon">{THEME_ICONS[mode]}</span>
              <span className="theme-toggle-option-label">{THEME_LABELS[mode]}</span>
              {preference === mode && (
                <svg className="theme-toggle-check" width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
