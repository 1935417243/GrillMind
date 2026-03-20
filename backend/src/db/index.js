// 后端数据库连接和初始化
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 数据库文件路径
const DB_PATH = path.join(__dirname, '../../data/grillmind.db');

// 确保 data 目录存在
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// 创建数据库连接
const db = new Database(DB_PATH);

// 启用 WAL 模式（写入性能更好）
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// 初始化表结构
function initDB() {
  const schemaSQL = fs.readFileSync(
    path.join(__dirname, 'schema.sql'),
    'utf-8'
  );
  db.exec(schemaSQL);

  // 确保 task_model_binding 有默认的 singleton 行
  const binding = db.prepare(
    'SELECT id FROM task_model_binding WHERE id = ?'
  ).get('singleton');

  if (!binding) {
    db.prepare(
      'INSERT INTO task_model_binding (id) VALUES (?)'
    ).run('singleton');
  }

  console.log('✅ 数据库初始化完成');
}

export { db, initDB };
