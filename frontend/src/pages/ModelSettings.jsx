// 模型设置页面
import { useState, useEffect } from 'react';
import { modelApi } from '../api/client';
import { useAppDispatch } from '../store/AppContext';
import { useToast } from '../components/Toast';
import ModelDropdown from '../components/ModelDropdown';
import './ModelSettings.css';

export default function ModelSettings() {
  const dispatch = useAppDispatch();
  const toast = useToast();

  // 供应商配置
  const [providers, setProviders] = useState([]);
  const [providerForms, setProviderForms] = useState({
    deepseek: { apiKey: '', baseUrl: 'https://api.deepseek.com' },
    bailian:  { apiKey: '', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
  });
  const [testStatus, setTestStatus] = useState({});

  // 任务绑定
  const [binding, setBinding] = useState({
    parseModel: '', interviewModel: '', reportModel: '', baseModel: '',
    parseThinking: false, interviewThinking: false, reportThinking: false, baseThinking: false,
  });

  // 加载数据
  useEffect(() => {
    loadProviders();
    modelApi.getBinding().then(data => {
      setBinding({
        parseModel: data.parseModel || '',
        interviewModel: data.interviewModel || '',
        reportModel: data.reportModel || '',
        baseModel: data.baseModel || '',
        parseThinking: !!data.parseThinking,
        interviewThinking: false, // 面试对话强制关闭
        reportThinking: !!data.reportThinking,
        baseThinking: !!data.baseThinking,
      });
    }).catch(() => {});
  }, []);

  const loadProviders = async () => {
    try {
      const data = await modelApi.getProviders();
      setProviders(data);
      // 更新全局状态
      const map = {};
      data.forEach(p => {
        map[p.provider] = { isConnected: p.isConnected, models: p.models };
      });
      dispatch({ type: 'SET_PROVIDERS', payload: map });

      // 更新表单：回填 baseUrl，如果已保存过 Key 则显示脱敏占位
      data.forEach(p => {
        setProviderForms(prev => ({
          ...prev,
          [p.provider]: {
            ...prev[p.provider],
            apiKey: p.hasApiKey ? 'sk-••••••••••••••••••••••' : (prev[p.provider]?.apiKey || ''),
            baseUrl: p.baseUrl || prev[p.provider]?.baseUrl || '',
          },
        }));
      });
    } catch {}
  };

  // 判断是否是脱敏占位符
  const isMaskedKey = (key) => key && key.startsWith('sk-••');

  const handleTest = async (name) => {
    const form = providerForms[name];
    if (!form.apiKey && !getProviderHasKey(name)) {
      toast.error('请先输入 API Key');
      return;
    }
    // 脱敏占位符或空值时不传 apiKey，后端会用已保存的
    const apiKey = isMaskedKey(form.apiKey) ? undefined : (form.apiKey || undefined);
    setTestStatus(prev => ({ ...prev, [name]: 'testing' }));
    try {
      await modelApi.testProvider(name, { apiKey, baseUrl: form.baseUrl });
      setTestStatus(prev => ({ ...prev, [name]: 'success' }));
      await loadProviders();
      setTimeout(() => setTestStatus(prev => ({ ...prev, [name]: '' })), 2000);
    } catch (err) {
      setTestStatus(prev => ({ ...prev, [name]: 'failed' }));
      setTimeout(() => setTestStatus(prev => ({ ...prev, [name]: '' })), 3000);
    }
  };

  const handleSave = async (name) => {
    const form = providerForms[name];
    // 如果是脱敏占位符则不传 apiKey（只更新 baseUrl）
    const apiKey = isMaskedKey(form.apiKey) ? undefined : (form.apiKey || undefined);
    try {
      await modelApi.saveProvider(name, { apiKey, baseUrl: form.baseUrl });
      toast.success('保存成功');
      await loadProviders();
    } catch (err) {
      toast.error('保存失败：' + err.message);
    }
  };

  const handleBindingSave = async () => {
    try {
      await modelApi.updateBinding(binding);
      dispatch({ type: 'SET_MODEL_BINDING', payload: binding });
      toast.success('绑定已保存');
    } catch (err) {
      toast.error('保存绑定失败：' + err.message);
    }
  };

  // 构建下拉数据
  const dropdownProviders = [
    {
      name: 'deepseek',
      label: 'DeepSeek',
      connected: providers.find(p => p.provider === 'deepseek')?.isConnected || false,
      models: providers.find(p => p.provider === 'deepseek')?.models || [],
    },
    {
      name: 'bailian',
      label: '阿里百炼',
      connected: providers.find(p => p.provider === 'bailian')?.isConnected || false,
      models: providers.find(p => p.provider === 'bailian')?.models || [],
    },
  ];

  const getProvider = (name) => providers.find(p => p.provider === name);
  const getProviderStatus = (name) => getProvider(name)?.isConnected;
  const getProviderHasKey = (name) => getProvider(name)?.hasApiKey;
  const getProviderModelCount = (name) => getProvider(name)?.models?.length || 0;

  /**
   * 判断深度思考开关是否应该显示和可用
   * @param {string} taskKey - 任务标识（如 'parseModel'）
   * @param {string} modelValue - 当前选择的模型值 'provider::model'
   * @returns {{ visible: boolean, enabled: boolean, tooltip: string }}
   */
  const getThinkingState = (taskKey, modelValue) => {
    // 面试对话：始终置灰锁定
    if (taskKey === 'interviewModel') {
      return { visible: true, enabled: false, tooltip: '面试对话需保证实时响应速度，不支持开启深度思考' };
    }

    // 选了 DeepSeek 系列模型时，隐藏开关
    if (modelValue) {
      const modelName = modelValue.split('::')[1] || '';
      if (modelName.toLowerCase().includes('deepseek')) {
        return { visible: false, enabled: false, tooltip: '' };
      }
    }

    // 选了 bailian 供应商的模型 → 可用
    if (modelValue && modelValue.startsWith('bailian::')) {
      return { visible: true, enabled: true, tooltip: '' };
    }

    // 其他模型（未选择 / 不支持深度思考）
    if (modelValue) {
      return { visible: true, enabled: false, tooltip: '该模型不支持深度思考' };
    }

    // 未选择模型
    return { visible: false, enabled: false, tooltip: '' };
  };

  /** 深度思考 Toggle 组件 */
  const ThinkingToggle = ({ taskKey, thinkingKey, modelValue }) => {
    const state = getThinkingState(taskKey, modelValue);
    if (!state.visible) return null;

    const checked = binding[thinkingKey];

    const toggle = (
      <label className={`thinking-toggle ${!state.enabled ? 'disabled' : ''}`}>
        <input
          type="checkbox"
          checked={checked}
          disabled={!state.enabled}
          onChange={e => {
            if (!state.enabled) return;
            setBinding(prev => ({ ...prev, [thinkingKey]: e.target.checked }));
          }}
        />
        <span className="thinking-toggle-track" />
      </label>
    );

    if (!state.enabled && state.tooltip) {
      return (
        <div className="thinking-toggle-wrap">
          <span className="thinking-toggle-label">深度思考</span>
          <div className="thinking-tooltip-wrap">
            {toggle}
            <span className="thinking-tooltip">{state.tooltip}</span>
          </div>
        </div>
      );
    }

    return (
      <div className="thinking-toggle-wrap">
        <span className="thinking-toggle-label">深度思考</span>
        {toggle}
      </div>
    );
  };

  const renderProviderCard = (name, label) => (
    <div className="provider-card" key={name}>
      <div className="provider-header">
        <span className="provider-name">{label}</span>
        <div className="status-badge">
          <div className={`status-dot ${getProviderStatus(name) ? 'ok' : getProviderHasKey(name) ? 'saved' : 'off'}`}></div>
          {getProviderStatus(name) ? (
            <span style={{color:'var(--accent)'}}>已连接 · {getProviderModelCount(name)} 个模型</span>
          ) : getProviderHasKey(name) ? (
            <span style={{color:'var(--text-secondary)'}}>已保存 · 未测试连接</span>
          ) : (
            <span style={{color:'var(--text-muted)'}}>未配置</span>
          )}
        </div>
      </div>
      <div className="form-row">
        <div className="form-item">
          <div className="form-label">API KEY</div>
          <input
            className="form-input"
            type="password"
            placeholder="填入 API Key"
            value={providerForms[name]?.apiKey || ''}
            onFocus={() => {
              if (isMaskedKey(providerForms[name]?.apiKey)) {
                setProviderForms(prev => ({
                  ...prev,
                  [name]: { ...prev[name], apiKey: '' },
                }));
              }
            }}
            onChange={e => setProviderForms(prev => ({
              ...prev,
              [name]: { ...prev[name], apiKey: e.target.value },
            }))}
          />
        </div>
        <div className="form-item">
          <div className="form-label">BASE URL</div>
          <input
            className="form-input"
            type="text"
            value={providerForms[name]?.baseUrl || ''}
            onChange={e => setProviderForms(prev => ({
              ...prev,
              [name]: { ...prev[name], baseUrl: e.target.value },
            }))}
          />
        </div>
      </div>
      <div style={{display:'flex',gap:'8px',marginTop:'10px',alignItems:'center'}}>
        <button className="btn btn-ghost btn-sm" onClick={() => handleTest(name)}>
          {testStatus[name] === 'testing' ? '连接中...' : '测试连接'}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => handleSave(name)}>保存</button>
        {testStatus[name] === 'success' && (
          <span className="test-hint" style={{color:'var(--accent)'}}>连接成功</span>
        )}
        {testStatus[name] === 'failed' && (
          <span className="test-hint" style={{color:'var(--warn)'}}>连接失败</span>
        )}
      </div>
    </div>
  );

  return (
    <div className="main">
      <div className="topbar">
        <span className="topbar-title">模型设置</span>
        <span className="topbar-meta">配置供应商与任务绑定</span>
      </div>
      <div className="content">

        <div className="card-label" style={{marginBottom:'8px'}}>供应商配置</div>
        {renderProviderCard('deepseek', 'DeepSeek')}
        {renderProviderCard('bailian', '阿里百炼')}

        <div className="divider"></div>

        <div className="card-label" style={{marginBottom:'8px'}}>任务模型分配</div>
        <div className="thinking-tip">
          <span className="thinking-tip-icon">💡</span>
          深度思考模式会增加响应时间，建议仅对质量要求高的任务启用
        </div>
        <div className="card">
          <div className="binding-row">
            <span className="binding-label" style={{flex:1}}>
              简历解析模型
              <span className="binding-hint">结构化稳定性优先</span>
            </span>
            <div className="binding-row-right">
              <ThinkingToggle taskKey="parseModel" thinkingKey="parseThinking" modelValue={binding.parseModel} />
              <ModelDropdown
                providers={dropdownProviders}
                value={binding.parseModel}
                onChange={v => setBinding(prev => ({ ...prev, parseModel: v }))}
              />
            </div>
          </div>
          <div className="binding-row">
            <span className="binding-label" style={{flex:1}}>
              面试对话模型
              <span className="binding-hint">响应速度优先</span>
            </span>
            <div className="binding-row-right">
              <ThinkingToggle taskKey="interviewModel" thinkingKey="interviewThinking" modelValue={binding.interviewModel} />
              <ModelDropdown
                providers={dropdownProviders}
                value={binding.interviewModel}
                onChange={v => setBinding(prev => ({ ...prev, interviewModel: v }))}
              />
            </div>
          </div>
          <div className="binding-row">
            <span className="binding-label" style={{flex:1}}>
              报告生成模型
              <span className="binding-hint">可复用对话模型</span>
            </span>
            <div className="binding-row-right">
              <ThinkingToggle taskKey="reportModel" thinkingKey="reportThinking" modelValue={binding.reportModel} />
              <ModelDropdown
                providers={dropdownProviders}
                value={binding.reportModel}
                onChange={v => setBinding(prev => ({ ...prev, reportModel: v }))}
              />
            </div>
          </div>
          <div className="binding-row" style={{borderBottom:'none'}}>
            <span className="binding-label" style={{flex:1}}>
              基础模型
              <span className="binding-hint">通用辅助，如 AI 生成岗位等</span>
            </span>
            <div className="binding-row-right">
              <ThinkingToggle taskKey="baseModel" thinkingKey="baseThinking" modelValue={binding.baseModel} />
              <ModelDropdown
                providers={dropdownProviders}
                value={binding.baseModel}
                onChange={v => setBinding(prev => ({ ...prev, baseModel: v }))}
              />
            </div>
          </div>
          <div style={{marginTop:'12px'}}>
            <button className="btn btn-primary btn-sm" onClick={handleBindingSave}>保存绑定</button>
          </div>
        </div>

        <div style={{marginTop:'4px',fontSize:'12px',color:'var(--text-muted)',lineHeight:'1.7'}}>
          连接成功的供应商模型自动出现在上方下拉列表中。
        </div>

      </div>
    </div>
  );
}

