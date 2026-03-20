// 统一时间工具 — 所有时间统一使用 Asia/Shanghai (UTC+8)

/**
 * 获取当前中国标准时间的 ISO 格式字符串
 * 格式: YYYY-MM-DDTHH:mm:ss.sss+08:00
 * @returns {string}
 */
export function nowCST() {
  const now = new Date();
  const offset = 8 * 60; // UTC+8 分钟偏移
  const cst = new Date(now.getTime() + (offset + now.getTimezoneOffset()) * 60000);

  const pad = (n, len = 2) => String(n).padStart(len, '0');
  const y = cst.getFullYear();
  const M = pad(cst.getMonth() + 1);
  const d = pad(cst.getDate());
  const h = pad(cst.getHours());
  const m = pad(cst.getMinutes());
  const s = pad(cst.getSeconds());
  const ms = pad(cst.getMilliseconds(), 3);

  return `${y}-${M}-${d}T${h}:${m}:${s}.${ms}+08:00`;
}

/**
 * 获取当前中国标准时间的短格式（适用于数据库存储）
 * 格式: YYYY-MM-DD HH:mm:ss
 * @returns {string}
 */
export function nowCSTShort() {
  const now = new Date();
  const offset = 8 * 60;
  const cst = new Date(now.getTime() + (offset + now.getTimezoneOffset()) * 60000);

  const pad = (n) => String(n).padStart(2, '0');
  const y = cst.getFullYear();
  const M = pad(cst.getMonth() + 1);
  const d = pad(cst.getDate());
  const h = pad(cst.getHours());
  const m = pad(cst.getMinutes());
  const s = pad(cst.getSeconds());

  return `${y}-${M}-${d} ${h}:${m}:${s}`;
}
