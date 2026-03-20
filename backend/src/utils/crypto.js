// API Key 加解密工具
// 使用 AES-256-GCM 加密存储
import crypto from 'crypto';

// 加密密钥（生产环境应从环境变量读取）
const ENCRYPTION_KEY = process.env.GRILLMIND_ENC_KEY
  || 'grillmind-default-encryption-key!!'; // 32 bytes

// 确保密钥长度为 32 bytes
function getKey() {
  const key = Buffer.alloc(32);
  const src = Buffer.from(ENCRYPTION_KEY, 'utf-8');
  src.copy(key, 0, 0, Math.min(src.length, 32));
  return key;
}

/**
 * 加密字符串
 * @param {string} plaintext - 明文
 * @returns {string} - iv:tag:ciphertext（十六进制编码）
 */
export function encrypt(plaintext) {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const tag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${tag}:${encrypted}`;
}

/**
 * 解密字符串
 * @param {string} encryptedStr - iv:tag:ciphertext 格式
 * @returns {string} - 明文
 */
export function decrypt(encryptedStr) {
  const key = getKey();
  const [ivHex, tagHex, ciphertext] = encryptedStr.split(':');

  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}
