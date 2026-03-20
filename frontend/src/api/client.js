// 统一 API 请求封装
const BASE_URL = '/api/v1';

/**
 * 封装 fetch 请求
 * @param {string} endpoint - API 路径（不含 /api/v1 前缀）
 * @param {object} [options={}] - fetch 选项
 * @returns {Promise<object>} - 响应数据
 */
async function request(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const config = { ...options };

  // 只在有 body 且不是 FormData 时才设 Content-Type
  if (options.body && !(options.body instanceof FormData)) {
    config.headers = { 'Content-Type': 'application/json', ...options.headers };
  }

  const response = await fetch(url, config);
  const data = await response.json();

  if (!data.success) {
    const err = new Error(data.error?.message || '请求失败');
    err.code = data.error?.code;
    err.detail = data.error;
    throw err;
  }

  return data.data;
}

// ── 简历 API ──
export const resumeApi = {
  upload: (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return request('/resumes/upload', { method: 'POST', body: formData });
  },
  list: () => request('/resumes'),
  get: (id) => request(`/resumes/${id}`),
  delete: (id) => request(`/resumes/${id}`, { method: 'DELETE' }),
  forceDelete: (id) => request(`/resumes/${id}?force=true`, { method: 'DELETE' }),
  activate: (id) => request(`/resumes/${id}/activate`, { method: 'PUT' }),
  parseStatus: (id) => request(`/resumes/${id}/parse-status`),
  reparse: (id) => request(`/resumes/${id}/reparse`, { method: 'POST' }),
};

// ── 面试会话 API ──
export const sessionApi = {
  create: (data) => request('/sessions', { method: 'POST', body: JSON.stringify(data) }),
  list: () => request('/sessions'),
  get: (id) => request(`/sessions/${id}`),
  end: (id) => request(`/sessions/${id}/end`, { method: 'POST' }),
  delete: (id) => request(`/sessions/${id}`, { method: 'DELETE' }),
  // chat 使用 SSE，不经过这个封装
};

// ── 报告 API ──
export const reportApi = {
  get: (sessionId) => request(`/reports/${sessionId}`),
  retry: (sessionId) => request(`/reports/${sessionId}/retry`, { method: 'POST' }),
};

// ── 模型配置 API ──
export const modelApi = {
  getProviders: () => request('/models/providers'),
  saveProvider: (name, data) => request(`/models/providers/${name}`, { method: 'PUT', body: JSON.stringify(data) }),
  testProvider: (name, data) => request(`/models/providers/${name}/test`, { method: 'POST', body: JSON.stringify(data) }),
  getBinding: () => request('/models/binding'),
  updateBinding: (data) => request('/models/binding', { method: 'PUT', body: JSON.stringify(data) }),
};
