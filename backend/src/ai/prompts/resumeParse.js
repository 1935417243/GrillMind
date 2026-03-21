// 简历解析 Prompt
// 将简历原文解析为结构化 JSON

/**
 * 构建简历解析的 messages
 * @param {string} rawText - 简历原始文本
 * @param {Array} jobPositions - 已启用的岗位列表 [{id, name, tags}]
 * @param {'tech' | 'non-tech'} category - 岗位类型（可选，影响 prompt 措辞）
 * @returns {Array} - OpenAI messages 数组
 */
export function buildResumeParsePrompt(rawText, jobPositions = [], category = 'tech') {
  // 动态生成 jobTendency 选项
  const jobOptions = jobPositions.map(jp =>
    `- "${jp.id}"：${jp.name}${jp.tags ? `（${jp.tags}）` : ''}`
  ).join('\n');

  // 如果没有配置任何岗位，提供一个 null 默认值
  const jobTendencyDesc = jobPositions.length > 0
    ? `【jobTendency】岗位倾向。优先取简历中明确写的求职意向/目标岗位，映射到以下最匹配的选项；未明确写出时根据项目经历和技术栈综合判断：
${jobOptions}
- null：无法匹配到任何已配置岗位`
    : `【jobTendency】岗位倾向，当前系统未配置任何岗位，请固定输出 null`;

  // 生成 jobTendency 类型定义
  const jobTendencyType = jobPositions.length > 0
    ? jobPositions.map(jp => `"${jp.id}"`).join(' | ') + ' | null'
    : 'null';

  const isTech = category === 'tech';
  const roleDesc = isTech
    ? '你是一个经验丰富的技术面试官，负责在面试前精读候选人简历，提炼关键信息供面试使用。'
    : '你是一个经验丰富的面试官，负责在面试前精读候选人简历，提炼关键信息供面试使用。';

  const techStackDesc = isTech
    ? '【techStack】候选人掌握的技术栈列表，只列出简历中明确出现的，不要推断或补充。每项为一个简短名词（如 "Spring Boot"、"Redis"、"React"）。'
    : '【techStack】候选人掌握的专业技能列表，只列出简历中明确出现的，不要推断或补充。每项为一个简短名词。';

  const deepDiveDesc = isTech
    ? '- deepDivePoints: 值得在面试中深入追问的技术点。判断标准：该决策有多种替代方案、涉及性能或架构权衡、或候选人声称取得了显著成果但未说明原因'
    : '- deepDivePoints: 值得在面试中深入追问的关键点。判断标准：该决策有多种替代方案、涉及重要策略或方案权衡、或候选人声称取得了显著成果但未说明原因';

  return [
    {
      role: 'system',
      content: `${roleDesc}
只输出合法 JSON，不要输出任何其他内容，不要有代码块标记。
所有文本字段统一使用简体中文输出，禁止使用任何 emoji、表情符号或特殊装饰字符，保持纯文本。

字段说明与判断规则：

【candidateName】候选人姓名，无法确定时输出 null。

【yearsOfExperience】工作年限（数字，单位：年）。
- 优先提取简历中明确写出的年限（如"5年工作经验"、"3年Java开发经验"），直接取该数字。
- 若简历未明确写出年限，再根据工作经历起止时间推算，四舍五入到 0.5。
- 仅有在校经历或无任何工作经历时输出 0。

${jobTendencyDesc}

${techStackDesc}

【projects】项目经历列表，按简历中出现顺序排列。每个项目包含：
- name: 项目名称
- role: 候选人在该项目中的角色（如 "后端开发"、"项目负责人"）
- techUsed: 该项目实际使用的技术，只列简历中明确提到的
- responsibilities: 候选人具体做了什么，每条是一个独立的职责陈述，保留原文意思，不要美化或扩展
${deepDiveDesc}
- vaguePoints: 简历中表述不清晰的地方。判断标准：使用了"参与"、"协助"等模糊动词而非具体行为；给出了结论性数据但缺乏上下文（如"性能提升50%"）；职责描述和团队贡献边界不清

【selfIntroHints】面试官提示：基于该候选人的背景，自我介绍阶段应重点关注哪些内容来快速判断候选人水平。每条是一个具体的关注方向，而不是泛泛的建议。

信息缺失处理规则：
- 字符串字段无法确定时输出 null
- 数组字段无内容时输出 []
- yearsOfExperience 无法判断时输出 null

输出格式：
{
  "candidateName": string | null,
  "yearsOfExperience": number | null,
  "jobTendency": ${jobTendencyType},
  "techStack": string[],
  "projects": [
    {
      "name": string,
      "role": string | null,
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

