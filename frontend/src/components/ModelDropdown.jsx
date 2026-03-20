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
  const [searchTerm, setSearchTerm] = useState('');
  const ref = useRef(null);
  const searchInputRef = useRef(null);
  const listRef = useRef(null);

  // 点击外部关闭
  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
        setSearchTerm('');
      }
    }
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  // 打开时自动聚焦搜索框 & 滚动到已选中项
  useEffect(() => {
    if (open) {
      searchInputRef.current?.focus();
      // 双帧延迟确保 display:none→flex 后布局已完成
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const list = listRef.current;
          const selectedEl = list?.querySelector('.model-dd-option.selected');
          if (list && selectedEl) {
            const listRect = list.getBoundingClientRect();
            const elRect = selectedEl.getBoundingClientRect();
            // 将选中项滚动到列表中央
            list.scrollTop = selectedEl.offsetTop - list.offsetTop - listRect.height / 2 + elRect.height / 2;
          }
        });
      });
    }
  }, [open]);

  const displayName = value ? value.split('::')[1] : '请选择';

  // 按搜索词过滤
  const lowerSearch = searchTerm.toLowerCase();
  const filteredProviders = providers
    .map(provider => {
      const filteredModels = (provider.models || []).filter(model =>
        model.toLowerCase().includes(lowerSearch)
      );
      return { ...provider, models: filteredModels };
    })
    .filter(provider => provider.models.length > 0 || (!searchTerm && provider.models.length === 0));

  const hasResults = filteredProviders.some(p => p.models.length > 0);

  return (
    <div className={`model-dropdown ${open ? 'open' : ''}`} ref={ref}>
      <div className="model-dropdown-trigger" onClick={() => { setOpen(!open); if (open) setSearchTerm(''); }}>
        <span className="dd-value">{displayName}</span>
        <svg className="model-dropdown-arrow" viewBox="0 0 10 6" fill="none">
          <path d="M0 0l5 6 5-6z" fill="currentColor"/>
        </svg>
      </div>
      <div className="model-dropdown-menu">
        {/* 搜索框 */}
        <div className="model-dd-search">
          <svg className="model-dd-search-icon" viewBox="0 0 16 16" fill="none">
            <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M10.5 10.5L14.5 14.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <input
            ref={searchInputRef}
            className="model-dd-search-input"
            type="text"
            placeholder="搜索模型..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            onClick={e => e.stopPropagation()}
          />
          {searchTerm && (
            <button
              className="model-dd-search-clear"
              onClick={e => { e.stopPropagation(); setSearchTerm(''); searchInputRef.current?.focus(); }}
            >
              ×
            </button>
          )}
        </div>

        {/* 模型列表 */}
        <div className="model-dd-list" ref={listRef}>
          {filteredProviders.map(provider => {
            if (searchTerm && provider.models.length === 0) return null;
            return (
              <div key={provider.name}>
                <div className={`model-dd-group-label ${!provider.connected ? 'disabled' : ''}`}>
                  {provider.label}{!provider.connected ? ' · 未连接' : ''}
                </div>
                {provider.models.map(model => {
                  const val = `${provider.name}::${model}`;
                  return (
                    <div
                      key={val}
                      className={`model-dd-option ${!provider.connected ? 'disabled' : ''} ${value === val ? 'selected' : ''}`}
                      onClick={() => {
                        if (!provider.connected) return;
                        onChange(val);
                        setOpen(false);
                        setSearchTerm('');
                      }}
                    >
                      {model}
                    </div>
                  );
                })}
              </div>
            );
          })}
          {searchTerm && !hasResults && (
            <div className="model-dd-empty">无匹配模型</div>
          )}
        </div>
      </div>
    </div>
  );
}
