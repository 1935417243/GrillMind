-- 简历表
CREATE TABLE IF NOT EXISTS resumes (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  file_path    TEXT NOT NULL,
  raw_text     TEXT,
  parsed       TEXT,                    -- JSON 字符串，结构化结果
  job_type     TEXT,                    -- 'backend' | 'test' | null
  is_active    INTEGER DEFAULT 0,       -- 当前使用的简历（全局只有 1 条为 1）
  parse_status TEXT DEFAULT 'pending',  -- pending | processing | done | failed
  parse_error  TEXT,
  created_at   TEXT DEFAULT (datetime('now', '+8 hours'))
);

-- 模型供应商配置
CREATE TABLE IF NOT EXISTS model_providers (
  id           TEXT PRIMARY KEY,
  provider     TEXT UNIQUE NOT NULL,    -- 'deepseek' | 'bailian'
  api_key_enc  TEXT,                    -- AES-256-GCM 加密后的 API Key
  base_url     TEXT,
  models       TEXT,                    -- JSON 字符串，可用模型列表
  is_connected INTEGER DEFAULT 0,
  updated_at   TEXT DEFAULT (datetime('now', '+8 hours'))
);

-- 任务模型绑定（单例，id 固定为 'singleton'）
CREATE TABLE IF NOT EXISTS task_model_binding (
  id              TEXT PRIMARY KEY DEFAULT 'singleton',
  parse_model     TEXT,   -- 'deepseek::deepseek-reasoner'
  interview_model TEXT,
  report_model    TEXT,   -- null 表示复用 interview_model
  base_model      TEXT    -- 通用辅助模型（如 AI 生成岗位等）
);

-- 面试会话
CREATE TABLE IF NOT EXISTS interview_sessions (
  id            TEXT PRIMARY KEY,
  resume_id     TEXT NOT NULL,
  job_type      TEXT NOT NULL,
  duration      INTEGER,
  difficulty    TEXT,      -- 'normal' | 'pressure' | 'high'
  focus         TEXT,      -- 'mixed' | 'project' | 'basic'
  stage         TEXT DEFAULT 'opening',
  project_index INTEGER DEFAULT 0,
  stage_turns   INTEGER DEFAULT 0,
  messages      TEXT DEFAULT '[]',   -- JSON 字符串
  status        TEXT DEFAULT 'in_progress',
  report_id     TEXT,
  started_at    TEXT DEFAULT (datetime('now', '+8 hours')),
  ended_at      TEXT,
  FOREIGN KEY (resume_id) REFERENCES resumes(id)
);

-- 面试报告
CREATE TABLE IF NOT EXISTS interview_reports (
  id            TEXT PRIMARY KEY,
  session_id    TEXT NOT NULL UNIQUE,
  overall_score INTEGER,
  summary       TEXT,
  qa_breakdown  TEXT,   -- JSON
  risk_points   TEXT,   -- JSON
  suggestions   TEXT,   -- JSON
  status        TEXT DEFAULT 'generating',  -- generating | done | failed
  created_at    TEXT DEFAULT (datetime('now', '+8 hours')),
  FOREIGN KEY (session_id) REFERENCES interview_sessions(id)
);

-- 岗位定义
CREATE TABLE IF NOT EXISTS job_positions (
  id           TEXT PRIMARY KEY,           -- UUID
  name         TEXT NOT NULL UNIQUE,       -- 岗位名称（如"后端工程师"）
  tags         TEXT,                       -- 岗位标签（如"项目架构 · 数据库 · 并发"）
  category     TEXT DEFAULT 'non-tech',    -- 岗位类型：'tech' 技术岗 | 'non-tech' 非技术岗
  scripts      TEXT NOT NULL,              -- JSON: { mixed, project, basic } 三套考察脚本
  enabled      INTEGER DEFAULT 1,          -- 是否启用
  sort_order   INTEGER DEFAULT 0,          -- 排序权重（小的在前）
  created_at   TEXT DEFAULT (datetime('now', '+8 hours'))
);
