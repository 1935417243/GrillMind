// 面试官状态机
// 管理面试阶段流转和对话构建
import { db } from '../db/index.js';
import { buildInterviewSystemPrompt } from '../ai/prompts/interviewChat.js';
import { nowCST } from '../utils/time.js';

// 阶段流转配置
const STAGE_FLOW = {
  opening:        { minTurns: 1, next: 'intro' },
  intro:          { minTurns: 1, next: 'intro_followup' },
  intro_followup: { minTurns: 1, maxTurns: 2, next: 'project_dive' },
  project_dive:   { minTurns: 2, maxTurns: 4, next: 'basic_verify' },
  basic_verify:   { minTurns: 2, maxTurns: 3, next: 'closing' },
  closing:        { minTurns: 1, next: null },
};

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
  }

  /**
   * 判断是否应该推进阶段
   */
  shouldAdvanceStage() {
    const config = STAGE_FLOW[this.stage];
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
      const maxProjects = Math.min(this.parsed.projects.length, 2);
      if (this.projectIndex < maxProjects - 1) {
        this.projectIndex++;
        this.stageTurns = 0;
        return;
      }
    }
    const next = STAGE_FLOW[this.stage]?.next;
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
      jobType:        this.session.job_type,
      parsed:         this.parsed,
      difficulty:     this.session.difficulty,
      stage:          this.stage,
      currentProject: this.getCurrentProject(),
    });
    return [
      { role: 'system', content: systemPrompt },
      ...this.messages.map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: userContent },
    ];
  }

  /**
   * 追加消息，用户消息时自动推进阶段
   * @param {'assistant' | 'user'} role
   * @param {string} content
   */
  appendMessage(role, content) {
    this.messages.push({
      role,
      content,
      timestamp: nowCST(),
      stage: this.stage,
    });
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
