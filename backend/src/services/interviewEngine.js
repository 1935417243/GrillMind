// 面试官状态机
// 管理面试阶段流转和对话构建
import { db } from '../db/index.js';
import { buildInterviewSystemPrompt } from '../ai/prompts/interviewChat.js';
import { nowCST } from '../utils/time.js';
import { sanitizeInterviewOutputText } from '../utils/interviewOutput.js';

/**
 * 根据面试深度生成阶段流转配置
 * @param {'quick' | 'standard' | 'deep'} depth
 * @returns {object}
 */
function getStageFlow(depth) {
  const flows = {
    // 快速模式 ~10轮
    quick: {
      opening:        { minTurns: 1, next: 'intro' },
      intro:          { minTurns: 1, maxTurns: 2, next: 'intro_followup' },
      intro_followup: { minTurns: 2, maxTurns: 2, next: 'project_dive' },
      project_dive:   { minTurns: 3, maxTurns: 4, next: 'basic_verify', maxProjects: 1 },
      basic_verify:   { minTurns: 2, maxTurns: 3, next: 'closing' },
      closing:        { minTurns: 1, next: null },
    },
    // 标准模式 ~20轮
    standard: {
      opening:        { minTurns: 1, next: 'intro' },
      intro:          { minTurns: 2, maxTurns: 2, next: 'intro_followup' },
      intro_followup: { minTurns: 3, maxTurns: 3, next: 'project_dive' },
      project_dive:   { minTurns: 3, maxTurns: 4, next: 'basic_verify', maxProjects: 2 },
      basic_verify:   { minTurns: 4, maxTurns: 5, next: 'closing' },
      closing:        { minTurns: 1, next: null },
    },
    // 深入模式 ~30轮
    deep: {
      opening:        { minTurns: 1, next: 'intro' },
      intro:          { minTurns: 2, maxTurns: 2, next: 'intro_followup' },
      intro_followup: { minTurns: 4, maxTurns: 5, next: 'project_dive' },
      project_dive:   { minTurns: 3, maxTurns: 5, next: 'basic_verify', maxProjects: 3 },
      basic_verify:   { minTurns: 6, maxTurns: 8, next: 'closing' },
      closing:        { minTurns: 1, next: null },
    },
  };
  return flows[depth] || flows.standard;
}

export class InterviewEngine {
  /**
   * @param {object} session - 数据库中的面试会话记录
   * @param {object} resume - 数据库中的简历记录
   */
  constructor(session, resume) {
    this.session      = session;
    this.parsed       = JSON.parse(resume.parsed);
    this.messages     = JSON.parse(session.messages);
    this.stage        = session.stage;
    this.projectIndex = session.project_index || 0;
    this.stageTurns   = session.stage_turns   || 0;
    // 从 duration 字段读取 depth 值，兼容旧数据
    this.depth        = typeof session.duration === 'string' ? session.duration : 'standard';
    this.stageFlow    = getStageFlow(this.depth);

    // 从数据库查询岗位信息（scripts + name + category）
    const jobPos = db.prepare('SELECT name, scripts, category FROM job_positions WHERE id = ?').get(session.job_type);
    if (jobPos) {
      this.jobName   = jobPos.name;
      this.scripts   = JSON.parse(jobPos.scripts);
      this.category  = jobPos.category || 'non-tech';
    } else {
      this.jobName   = session.job_type || '未知岗位';
      this.scripts   = { mixed: '', project: '', basic: '' };
      this.category  = 'non-tech';
    }
  }

  /**
   * 判断是否应该推进阶段
   */
  shouldAdvanceStage() {
    const config = this.stageFlow[this.stage];
    if (!config) return false;
    if (this.stageTurns < (config.minTurns || 1)) return false;
    if (config.maxTurns && this.stageTurns >= config.maxTurns) return true;
    return true;  // 达到 minTurns 且未设置 maxTurns → 允许推进
  }

  /**
   * 推进阶段
   */
  advanceStage() {
    // project_dive 阶段先切项目，再切阶段
    if (this.stage === 'project_dive') {
      const stageConfig = this.stageFlow[this.stage];
      const maxProjects = Math.min(this.parsed.projects.length, stageConfig.maxProjects || 2);
      if (this.projectIndex < maxProjects - 1) {
        this.projectIndex++;
        this.stageTurns = 0;
        return;
      }
    }
    const next = this.stageFlow[this.stage]?.next;
    if (next) {
      this.stage = next;
      this.stageTurns = 0;
    }
  }

  /**
   * 获取当前深挖的项目
   */
  getCurrentProject() {
    if (this.stage !== 'project_dive') return null;
    return this.parsed.projects[this.projectIndex] || null;
  }

  /**
   * 构建发送给 AI 的 messages 数组
   * @param {string} userContent - 用户消息
   * @returns {Array}
   */
  buildAIMessages(userContent) {
    const systemPrompt = buildInterviewSystemPrompt({
      jobName:        this.jobName,
      scripts:        this.scripts,
      parsed:         this.parsed,
      difficulty:     this.session.difficulty,
      focus:          this.session.focus,
      stage:          this.stage,
      currentProject: this.getCurrentProject(),
      category:       this.category,
    });

    // closing 阶段：将收尾指令直接注入用户消息，确保 AI 无法忽略
    const finalUserContent = this.stage === 'closing'
      ? `${userContent}\n\n---\n[面试官内部提示：面试时间已到，上面是候选人的最后一个回答。你现在必须做收尾总结，严禁再提出任何新问题或追问。请简要回应候选人的回答，然后用2-3句话总结其整体表现，最后感谢参与。]`
      : userContent;

    return [
      { role: 'system', content: systemPrompt },
      ...this.messages.map(m => ({
        role: m.role,
        content: m.role === 'assistant' ? sanitizeInterviewOutputText(m.content) : m.content,
      })),
      { role: 'user', content: finalUserContent },
    ];
  }

  /**
   * 追加消息，用户消息时自动推进阶段
   * @param {'assistant' | 'user'} role
   * @param {string} content
   * @param {object} [extraFields] - 额外字段，如 { startedAt } 记录用户开始回答的时间
   */
  appendMessage(role, content, extraFields = {}) {
    const msg = {
      role,
      content: role === 'assistant' ? sanitizeInterviewOutputText(content) : content,
      timestamp: nowCST(),
      stage: this.stage,
    };
    // 将额外字段（如 startedAt）合并到消息对象
    if (role === 'user' && extraFields.startedAt) {
      msg.startedAt = extraFields.startedAt;
    }
    this.messages.push(msg);
    if (role === 'user') {
      this.stageTurns++;
      if (this.shouldAdvanceStage()) this.advanceStage();
    }
  }

  /**
   * 持久化当前状态到数据库
   */
  persist() {
    db.prepare(`
      UPDATE interview_sessions
      SET messages = ?, stage = ?, project_index = ?, stage_turns = ?
      WHERE id = ?
    `).run(
      JSON.stringify(this.messages),
      this.stage,
      this.projectIndex,
      this.stageTurns,
      this.session.id
    );
  }
}
