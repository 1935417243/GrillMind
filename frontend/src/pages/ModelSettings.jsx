// 设置页面（模型设置 + 关于）
import { useState, useEffect, useCallback } from 'react';
import { modelApi } from '../api/client';
import { useAppDispatch } from '../store/AppContext';
import { useToast } from '../components/Toast';
import ModelDropdown from '../components/ModelDropdown';
import SimpleDropdown from '../components/SimpleDropdown';
import './ModelSettings.css';

export default function ModelSettings() {
  const dispatch = useAppDispatch();
  const toast = useToast();

  // 二级 Tab 状态
  const [activeTab, setActiveTab] = useState('model');
  // 复制按钮反馈状态
  const [copyStatus, setCopyStatus] = useState({});

  // 复制到剪贴板（兼容 Electron 打包环境）
  const handleCopy = useCallback((key, text) => {
    const onSuccess = () => {
      setCopyStatus(prev => ({ ...prev, [key]: true }));
      setTimeout(() => setCopyStatus(prev => ({ ...prev, [key]: false })), 1500);
    };

    // 优先使用 Clipboard API
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      navigator.clipboard.writeText(text).then(onSuccess).catch(() => {
        // Clipboard API 被拒绝时，回退到传统方案
        fallbackCopy(text) && onSuccess();
      });
    } else {
      fallbackCopy(text) && onSuccess();
    }
  }, []);

  // 传统复制方案（兼容 Electron 中 Clipboard API 不可用的场景）
  const fallbackCopy = useCallback((text) => {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      return true;
    } catch {
      return false;
    }
  }, []);

  // 供应商配置
  const [providers, setProviders] = useState([]);
  const [providerForms, setProviderForms] = useState({
    deepseek: { apiKey: '', baseUrl: 'https://api.deepseek.com' },
    bailian: { apiKey: '', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
  });
  const [testStatus, setTestStatus] = useState({});
  // 折叠卡片：当前展开的供应商（null = 全部收起，同一时间只展开一个）
  const [expandedProvider, setExpandedProvider] = useState(null);

  // 任务绑定
  const [binding, setBinding] = useState({
    parseModel: '', interviewModel: '', reportModel: '', baseModel: '',
    parseThinking: false, interviewThinking: false, reportThinking: false, baseThinking: false,
    asrModel: 'paraformer-realtime-v2', ttsModel: 'cosyvoice-v1', ttsVoice: 'longxiaochun',
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
        asrModel: data.asrModel || 'paraformer-realtime-v2',
        ttsModel: data.ttsModel || 'cosyvoice-v1',
        ttsVoice: data.ttsVoice || 'longxiaochun',
      });
    }).catch(() => { });
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
    } catch { }
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
   * ── 深度思考开关规则配置 ──
   * 新增供应商/模型时只需在对应规则表中追加条目即可
   */

  // 任务级规则：某些任务强制禁用深度思考（优先级最高）
  const TASK_THINKING_RULES = {
    interviewModel: { visible: true, enabled: false, tooltip: '面试对话需保证实时响应速度，不支持开启深度思考' },
  };

  // 模型级规则：按 match 函数匹配模型名，优先级按数组顺序（先匹配先命中）
  const MODEL_THINKING_RULES = [
    { match: m => m === 'deepseek-v4-pro', state: { visible: true, enabled: true, tooltip: '' } },
    { match: m => m === 'deepseek-v4-flash', state: { visible: true, enabled: false, tooltip: 'DeepSeek-V4-Flash 不支持开启深度思考' } },
    { match: m => m === 'deepseek-reasoner', state: { visible: true, enabled: false, forceOn: true, tooltip: '旧模型名称即将下架，建议改用 deepseek-v4-pro' } },
    { match: m => m === 'deepseek-chat', state: { visible: true, enabled: false, tooltip: '旧模型名称即将下架，建议改用 deepseek-v4-flash 或 deepseek-v4-pro' } },
    // 扩展示例：{ match: m => m.startsWith('qwen3-'), state: { visible: true, enabled: true, tooltip: '' } },
  ];

  // 供应商级默认规则：模型级未命中时，按供应商决定默认行为
  const PROVIDER_THINKING_DEFAULTS = {
    bailian: { visible: true, enabled: true, tooltip: '' },
    // 扩展示例：openai: { visible: true, enabled: false, tooltip: '该供应商暂不支持深度思考' },
  };

  /**
   * 判断深度思考开关是否应该显示和可用
   * 优先级：任务级 > 模型级 > 供应商级 > 兜底
   * @param {string} taskKey - 任务标识（如 'parseModel'）
   * @param {string} modelValue - 当前选择的模型值 'provider::model'
   * @returns {{ visible: boolean, enabled: boolean, tooltip: string, forceOn?: boolean }}
   */
  const getThinkingState = (taskKey, modelValue) => {
    // 1. 任务级规则
    if (TASK_THINKING_RULES[taskKey]) return TASK_THINKING_RULES[taskKey];

    // 未选择模型时隐藏
    if (!modelValue) return { visible: false, enabled: false, tooltip: '' };

    const [provider, ...rest] = modelValue.split('::');
    const modelName = rest.join('::').toLowerCase();

    // 2. 模型级规则
    for (const rule of MODEL_THINKING_RULES) {
      if (rule.match(modelName)) return rule.state;
    }

    // 3. 供应商级默认
    if (PROVIDER_THINKING_DEFAULTS[provider]) return PROVIDER_THINKING_DEFAULTS[provider];

    // 4. 兜底：显示开关但置灰
    return { visible: true, enabled: false, tooltip: '该模型不支持深度思考' };
  };

  /** 深度思考 Toggle 组件 */
  const ThinkingToggle = ({ taskKey, thinkingKey, modelValue }) => {
    const state = getThinkingState(taskKey, modelValue);
    if (!state.visible) return null;

    const checked = state.forceOn ? true : (!state.enabled ? false : binding[thinkingKey]);

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

  // 供应商 API Key 申请链接配置
  const PROVIDER_API_KEY_URLS = {
    deepseek: 'https://platform.deepseek.com/api_keys',
    bailian: 'https://bailian.console.aliyun.com/',
  };

  const isExpanded = (name) => expandedProvider === name;
  const toggleProvider = (name) => setExpandedProvider(prev => prev === name ? null : name);

  const renderProviderCard = (name, label) => (
    <div className={`provider-card ${isExpanded(name) ? 'expanded' : ''}`} key={name}>
      <div className="provider-header" onClick={() => toggleProvider(name)}>
        <div className="provider-header-left">
          <span className="provider-name">{label}</span>
          <div className="status-badge">
            <div className={`status-dot ${getProviderStatus(name) ? 'ok' : getProviderHasKey(name) ? 'saved' : 'off'}`}></div>
            {getProviderStatus(name) ? (
              <span style={{ color: 'var(--accent)' }}>已连接 · {getProviderModelCount(name)} 个模型</span>
            ) : getProviderHasKey(name) ? (
              <span style={{ color: 'var(--text-secondary)' }}>已保存 · 未测试连接</span>
            ) : (
              <span style={{ color: 'var(--text-muted)' }}>未配置</span>
            )}
          </div>
        </div>
        <span className={`provider-arrow ${isExpanded(name) ? 'up' : ''}`}>▾</span>
      </div>
      <div className="provider-body">
        <div className="provider-body-inner">
          <div className="form-row">
            <div className="form-item">
              <div className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>API KEY</span>
                {PROVIDER_API_KEY_URLS[name] && (
                  <a
                    href={PROVIDER_API_KEY_URLS[name]}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      fontSize: '12px',
                      color: '#6b9b6b',
                      textDecoration: 'none',
                      fontWeight: 'normal',
                    }}
                    onMouseEnter={e => e.target.style.textDecoration = 'underline'}
                    onMouseLeave={e => e.target.style.textDecoration = 'none'}
                  >
                    → 没有 Key？点击申请
                  </a>
                )}
              </div>
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
          <div style={{ display: 'flex', gap: '8px', marginTop: '10px', alignItems: 'center' }}>
            <button className="btn btn-ghost btn-sm" onClick={() => handleTest(name)}>
              {testStatus[name] === 'testing' ? '连接中...' : '测试连接'}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => handleSave(name)}>保存</button>
            {testStatus[name] === 'success' && (
              <span className="test-hint" style={{ color: 'var(--accent)' }}>连接成功</span>
            )}
            {testStatus[name] === 'failed' && (
              <span className="test-hint" style={{ color: 'var(--warn)' }}>连接失败</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="main">
      <div className="topbar">
        <span className="topbar-title">设置</span>
        <span className="topbar-meta">{activeTab === 'model' ? '配置供应商与任务绑定' : '关于此应用'}</span>
      </div>
      <div className="content">

        {/* 二级 Tab */}
        <div className="settings-tabs">
          <button
            className={`settings-tab ${activeTab === 'model' ? 'active' : ''}`}
            onClick={() => setActiveTab('model')}
          >
            模型设置
          </button>
          <button
            className={`settings-tab ${activeTab === 'about' ? 'active' : ''}`}
            onClick={() => setActiveTab('about')}
          >
            关于
          </button>
        </div>

        {activeTab === 'model' && (<>

          <div className="card-label" style={{ marginBottom: '8px' }}>供应商配置</div>
          {renderProviderCard('deepseek', 'DeepSeek')}
          {renderProviderCard('bailian', '阿里百炼')}

          <div className="divider"></div>

          <div className="card-label" style={{ marginBottom: '8px' }}>任务模型分配</div>
          <div className="thinking-tip">
            深度思考模式会增加响应时间，建议仅对简历解析/报告生成启用
          </div>
          <div className="card">
            <div className="binding-row">
              <span className="binding-label" style={{ flex: 1 }}>
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
              <span className="binding-label" style={{ flex: 1 }}>
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
              <span className="binding-label" style={{ flex: 1 }}>
                报告生成模型
                <span className="binding-hint">可复用解析模型</span>
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
            <div className="binding-row" style={{ borderBottom: 'none' }}>
              <span className="binding-label" style={{ flex: 1 }}>
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
            <div style={{ marginTop: '12px' }}>
              <button className="btn btn-primary btn-sm" onClick={handleBindingSave}>保存绑定</button>
            </div>
          </div>

          <div style={{ marginTop: '4px', fontSize: '12px', color: 'var(--text-muted)', lineHeight: '1.7' }}>
            连接成功的供应商模型自动出现在上方下拉列表中。
          </div>

          <div className="divider"></div>

          <div className="card-label" style={{ marginBottom: '8px' }}>语音通话配置</div>
          <div className="thinking-tip">
            语音通话功能需要百炼 API Key 已配置且连接成功
          </div>
          <div className="card">
            <div className="binding-row">
              <span className="binding-label" style={{ flex: 1 }}>
                语音识别模型
                <span className="binding-hint">ASR，实时语音转文字</span>
              </span>
              <SimpleDropdown
                options={[
                  { value: 'paraformer-realtime-v2', label: 'paraformer-realtime-v2（推荐）' },
                  { value: 'paraformer-realtime-v1', label: 'paraformer-realtime-v1' },
                  { value: 'paraformer-realtime-8k-v2', label: 'paraformer-realtime-8k-v2（8kHz）' },
                  { value: 'paraformer-realtime-8k-v1', label: 'paraformer-realtime-8k-v1（8kHz）' },
                ]}
                value={binding.asrModel}
                onChange={v => setBinding(prev => ({ ...prev, asrModel: v }))}
              />
            </div>
            <div className="binding-row">
              <span className="binding-label" style={{ flex: 1 }}>
                语音合成模型
                <span className="binding-hint">TTS，文字转语音</span>
              </span>
              <SimpleDropdown
                options={[
                  { value: 'cosyvoice-v1', label: 'cosyvoice-v1（生成式）' },
                  { value: 'cosyvoice-v2', label: 'cosyvoice-v2（音色丰富）' },
                  { value: 'cosyvoice-v3-flash', label: 'cosyvoice-v3-flash（低延迟推荐）' },
                  { value: 'cosyvoice-v3-plus', label: 'cosyvoice-v3-plus（高品质）' },
                ]}
                value={binding.ttsModel}
                onChange={v => {
                  // 切换模型时自动选该模型的默认音色
                  const voiceMap = {
                    'cosyvoice-v1': 'longxiaochun',
                    'cosyvoice-v2': 'longanli',
                    'cosyvoice-v3-flash': 'longanyang',
                    'cosyvoice-v3-plus': 'longanyang',
                  };
                  setBinding(prev => ({ ...prev, ttsModel: v, ttsVoice: voiceMap[v] || prev.ttsVoice }));
                }}
              />
            </div>
            <div className="binding-row" style={{ borderBottom: 'none' }}>
              <span className="binding-label" style={{ flex: 1 }}>
                面试官发音人
                <span className="binding-hint">音色，不同模型可选不同音色</span>
              </span>
              <SimpleDropdown
                options={
                  binding.ttsModel === 'cosyvoice-v1'
                    ? [
                      { value: 'longxiaochun', label: '龙小淳（温柔女声）' },
                      { value: 'longhua', label: '龙华（标准男声）' },
                      { value: 'longwan', label: '龙婉（温婉女声）' },
                      { value: 'longshu', label: '龙书（沉稳男声）' },
                      { value: 'longshuo', label: '龙硕（商务男声）' },
                      { value: 'longjing', label: '龙婧（播音女声）' },
                      { value: 'longmiao', label: '龙妙（活泼女声）' },
                      { value: 'longyue', label: '龙悦（温暖女声）' },
                      { value: 'longxiaocheng', label: '龙小诚（磁性男声）' },
                    ]
                    : binding.ttsModel === 'cosyvoice-v2'
                      ? [
                        { value: 'longanli', label: '龙安莉（利落从容女）' },
                        { value: 'longanlang', label: '龙安朗（清爽利落男）' },
                        { value: 'longanwen', label: '龙安温（优雅知性女）' },
                        { value: 'longanyun', label: '龙安昀（居家暖男）' },
                        { value: 'longanzhi', label: '龙安智（睿智轻熟男）' },
                        { value: 'longanqin', label: '龙安亲（亲和活泼女）' },
                        { value: 'longanya', label: '龙安雅（高雅气质女）' },
                        { value: 'longanshuo', label: '龙安朔（干净清爽男）' },
                        { value: 'longanling', label: '龙安灵（思维灵动女）' },
                      ]
                      : binding.ttsModel === 'cosyvoice-v3-plus'
                        ? [
                          { value: 'longanyang', label: '龙安洋（阳光大男孩）' },
                          { value: 'longanhuan', label: '龙安欢（元气少女）' },
                        ]
                        : [
                          // cosyvoice-v3-flash
                          { value: 'longanyang', label: '龙安洋（阳光大男孩）' },
                          { value: 'longanhuan', label: '龙安欢（元气少女）' },
                          { value: 'longxiaochun_v3', label: '龙小淳（知性积极女）' },
                          { value: 'longcheng_v3', label: '龙橙（智慧青年男）' },
                          { value: 'longtian_v3', label: '龙天（磁性理智男）' },
                          { value: 'longanzhi_v3', label: '龙安智（睿智轻熟男）' },
                          { value: 'longanlang_v3', label: '龙安朗（清爽利落男）' },
                          { value: 'longanwen_v3', label: '龙安温（优雅知性女）' },
                          { value: 'longanyun_v3', label: '龙安昀（居家暖男）' },
                        ]
                }
                value={binding.ttsVoice}
                onChange={v => setBinding(prev => ({ ...prev, ttsVoice: v }))}
              />
            </div>
            <div style={{ marginTop: '12px' }}>
              <button className="btn btn-primary btn-sm" onClick={handleBindingSave}>保存配置</button>
            </div>
          </div>

        </>)}

        {activeTab === 'about' && (
          <div className="about-section">
            {/* 产品描述 */}
            <div className="about-card">
              <div className="about-product-name">智面 · AI Interview Sim</div>
              <p className="about-desc">
                AI 驱动的模拟面试练习工具，帮助求职者提前熟悉面试场景、获得反馈报告。
              </p>
              <p className="about-desc about-privacy">
                本工具使用用户自有 API Key，数据不上传，保护隐私。
              </p>
            </div>

            {/* 联系作者 */}
            <div className="about-card">
              <div className="about-card-title">联系作者</div>
              <div className="about-info-row">
                <span className="about-label">作者</span>
                <span className="about-value">birdy</span>
              </div>
              <div className="about-info-row">
                <span className="about-label">微信</span>
                <span className="about-value about-copyable">
                  gg19354
                  <button className="about-copy-btn" onClick={() => handleCopy('wechat', 'gg19354')}>
                    {copyStatus.wechat ? '已复制 ✓' : '复制'}
                  </button>
                </span>
              </div>
              <div className="about-info-row">
                <span className="about-label">QQ</span>
                <span className="about-value about-copyable">
                  1935417243
                  <button className="about-copy-btn" onClick={() => handleCopy('qq', '1935417243')}>
                    {copyStatus.qq ? '已复制 ✓' : '复制'}
                  </button>
                </span>
              </div>
              <div className="about-info-row" style={{ borderBottom: 'none' }}>
                <span className="about-label">版本</span>
                <span className="about-value">V{__APP_VERSION__}</span>
              </div>
            </div>

            {/* GitHub 突出展示 */}
            <a
              href="https://github.com/1935417243/GrillMind"
              target="_blank"
              rel="noopener noreferrer"
              className="about-github-banner"
            >
              <svg className="about-github-icon" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
              </svg>
              <span className="about-github-text">github.com/1935417243/GrillMind</span>
              <span className="about-github-arrow">→</span>
            </a>

            {/* 问题反馈 */}
            <div className="about-card about-feedback">
              <div className="about-card-title">遇到问题？</div>
              <p className="about-desc">
                如果你在使用中遇到 bug、有功能建议，欢迎通过以下方式联系我。
              </p>
              <div className="about-feedback-actions">
                <button className="about-feedback-btn" onClick={() => handleCopy('wechat_fb', 'gg19354')}>
                  <span className="about-feedback-btn-label">微信</span>
                  <span className="about-feedback-btn-value">gg19354</span>
                  <span className="about-feedback-btn-hint">{copyStatus.wechat_fb ? '已复制 ✓' : '点击复制'}</span>
                </button>
                <button className="about-feedback-btn" onClick={() => handleCopy('qq_fb', '1935417243')}>
                  <span className="about-feedback-btn-label">QQ</span>
                  <span className="about-feedback-btn-value">1935417243</span>
                  <span className="about-feedback-btn-hint">{copyStatus.qq_fb ? '已复制 ✓' : '点击复制'}</span>
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
