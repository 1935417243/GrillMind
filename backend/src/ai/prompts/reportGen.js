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
