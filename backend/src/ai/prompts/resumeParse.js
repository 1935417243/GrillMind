// 简历解析 Prompt
// 将简历原文解析为结构化 JSON

/**
 * 构建简历解析的 messages
 * @param {string} rawText - 简历原始文本
 * @returns {Array} - OpenAI messages 数组
 */
export function buildResumeParsePrompt(rawText) {
  return [
    {
      role: 'system',
      content: `你是一个专业的简历解析助手。
将候选人的简历文本解析为结构化 JSON。
只输出合法 JSON，不要输出任何其他内容，不要有代码块标记。

输出格式：
{
  "candidateName": string,
  "yearsOfExperience": number,
  "jobTendency": "backend" | "test" | "mixed",
  "techStack": string[],
  "projects": [
    {
      "name": string,
      "role": string,
      "techUsed": string[],
      "responsibilities": string[],
      "deepDivePoints": string[],
      "vaguePoints": string[]
    }
  ],
  "selfIntroHints": string[]
}`
    },
    {
      role: 'user',
      content: `以下是候选人简历原文：\n\n${rawText}`
    }
  ];
}
