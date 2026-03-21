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

  // 迁移：为 task_model_binding 添加 base_model 列（已有则忽略）
  try {
    db.exec('ALTER TABLE task_model_binding ADD COLUMN base_model TEXT');
  } catch {
    // 列已存在，忽略
  }

  // 迁移：为 task_model_binding 添加深度思考开关列（已有则忽略）
  const thinkingCols = ['parse_thinking', 'interview_thinking', 'report_thinking', 'base_thinking'];
  for (const col of thinkingCols) {
    try {
      db.exec(`ALTER TABLE task_model_binding ADD COLUMN ${col} INTEGER DEFAULT 0`);
    } catch {
      // 列已存在，忽略
    }
  }

  // 迁移：为 job_positions 添加 category 列（已有则忽略）
  try {
    db.exec("ALTER TABLE job_positions ADD COLUMN category TEXT DEFAULT 'non-tech'");
  } catch {
    // 列已存在，忽略
  }

  // 内置岗位种子数据（使用固定 UUID + INSERT OR IGNORE 保证幂等）
  const seedPositions = [
    {
      id: '00000000-0000-0000-0000-000000000001',
      name: '后端工程师',
      tags: '项目架构 · 数据库 · 并发',
      category: 'tech',
      scripts: JSON.stringify({
        mixed: `- 项目架构：服务划分、依赖关系、遇到的瓶颈\n- 数据库：索引设计、慢查询排查、事务与锁\n- 缓存：一致性、穿透/击穿/雪崩、更新策略\n- 消息队列：可靠性、幂等性、消费者重试\n- 并发：线程安全、限流、超时处理\n- 故障处理：定位过程、止血手段、复盘`,
        project: `- 项目架构：整体架构、服务划分、依赖关系\n- 技术选型：为什么选这个方案，和其他方案的对比\n- 核心难点：遇到的最大技术挑战是什么，如何解决\n- 性能优化：瓶颈在哪，做了哪些优化，效果如何\n- 容错设计：高可用方案、降级策略、故障恢复\n- 协作推进：跨团队协调、上线流程、复盘改进`,
        basic: `- 数据库：索引原理与设计、事务隔离级别、锁机制、慢查询排查\n- 缓存：Redis 数据结构、一致性方案、穿透/击穿/雪崩\n- 消息队列：消息可靠性、顺序性、幂等性、消费者重试\n- 并发：线程安全、锁机制、线程池、限流算法\n- 网络：HTTP/TCP 核心机制、连接复用、超时处理\n- 设计原则：SOLID、常用设计模式、DDD 基本概念`,
      }),
      sort_order: 1,
    },
    {
      id: '00000000-0000-0000-0000-000000000002',
      name: '软件测试工程师',
      tags: '测试策略 · 用例设计 · 自动化',
      category: 'tech',
      scripts: JSON.stringify({
        mixed: `- 测试策略：范围划定、优先级\n- 用例设计：边界值、等价类、场景覆盖\n- 缺陷分析：根因定位、推动修复\n- 自动化：框架选型、用例稳定性、维护成本\n- 质量保障：回归策略、上线质量保障`,
        project: `- 测试规划：如何制定项目测试策略，覆盖范围如何确定\n- 关键场景：项目中最复杂的测试场景是什么，如何设计用例\n- 缺陷成效：发现过哪些关键缺陷，如何定位和推动修复\n- 自动化实践：项目中自动化的覆盖范围、框架选型原因\n- 质量度量：如何衡量测试效果，用了哪些指标\n- 协作流程：与开发的协作模式、质量门禁、上线流程`,
        basic: `- 用例设计方法：边界值分析、等价类划分、判定表、场景法\n- 测试类型：功能/性能/安全/兼容性测试的区别与适用场景\n- 缺陷管理：缺陷生命周期、严重级别划分、根因分析方法\n- 自动化基础：框架原理、元素定位、断言设计、数据驱动\n- 性能测试：压测指标（TPS/RT/并发数）、瓶颈定位思路\n- 质量理论：测试左移/右移、持续测试、风险驱动测试`,
      }),
      sort_order: 2,
    },
  ];

  const insertSeed = db.prepare(`
    INSERT OR IGNORE INTO job_positions (id, name, tags, category, scripts, sort_order)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  for (const pos of seedPositions) {
    insertSeed.run(pos.id, pos.name, pos.tags, pos.category || 'non-tech', pos.scripts, pos.sort_order);
  }

  console.log('✅ 数据库初始化完成');
}

export { db, initDB };
