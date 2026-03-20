// 报告生成 Prompt
// 评估面试全过程，输出结构化报告

/**
 * 从对话消息中提取 Q&A 对
 * 过滤 opening 和 closing 阶段
 * @param {Array} messages - 面试消息列表
 * @returns {Array} - [{question, answer}]
 */
export function extractQAPairs(messages) {
  const pairs = [];
  let lastQ = null;
  for (const msg of messages) {
    if (msg.role === 'assistant' &&
        msg.stage !== 'opening' &&
        msg.stage !== 'closing') {
      lastQ = msg.content;
    } else if (msg.role === 'user' && lastQ) {
      pairs.push({ question: lastQ, answer: msg.content });
      lastQ = null;
    }
  }
  return pairs;
}

/**
 * 构建报告生成的 messages
 * @param {object} params
 * @param {Array} params.messages - 面试消息列表
 * @param {object} params.parsed - 简历解析结果
 * @param {string} params.jobType - 岗位类型
 * @returns {Array} - OpenAI messages 数组
 */
export function buildReportPrompt({ messages, parsed, jobType }) {
  const qaList = extractQAPairs(messages);

  return [
    {
      role: 'system',
      content: `你是一位专业的面试评估专家。
评估候选人的技术面试表现，只输出合法 JSON，不要有代码块标记。

## 评分标准（overallScore，范围 10 ~ 100）
- 90-100：卓越 — 回答精准深入，对底层原理有独到理解，能举一反三，表达清晰有条理，完全达到高级工程师水平
- 80-89：优秀 — 核心知识点掌握扎实，能结合实际项目经验回答，逻辑清晰，有少量细节不足
- 70-79：良好 — 大部分问题能正确回答，但深度不够，部分回答停留在表面，项目经验表达一般
- 60-69：合格 — 基础知识基本掌握，但有明显知识盲区，回答缺乏深度和实践支撑
- 40-59：不足 — 多个核心知识点回答错误或不会，技术广度和深度都有明显欠缺
- 10-39：较差 — 大部分问题无法回答或回答严重错误，技术基础薄弱，与岗位要求差距较大
请严格按照以上标准打分，分数必须为 10 到 100 之间的整数。

输出格式：
{
  "overallScore": number,
  "summary": string,
  "qaBreakdown": [
    {
      "question": string,
      "answerSummary": string,
      "issues": string[],
      "suggestions": string[],
      "realInterviewImpact": string
    }
  ],
  "riskPoints": string[],
  "suggestions": {
    "nextPractice": string[],
    "selfIntroImprovement": string,
    "projectExpressionTips": string
  }
}`
    },
    {
      role: 'user',
      content: `岗位：${jobType === 'backend' ? '后端工程师' : '软件测试工程师'}
年限：${parsed.yearsOfExperience} 年

面试记录：
${qaList.map((qa, i) =>
  `Q${i + 1}: ${qa.question}\nA${i + 1}: ${qa.answer}`
).join('\n\n')}`
    }
  ];
}
