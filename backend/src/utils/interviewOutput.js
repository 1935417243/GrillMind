// 面试官输出清洗：去掉模型泄露的舞台指令、Markdown 和固定口头垫词

const META_ASIDE_KEYWORDS = [
  '稍作',
  '稍微',
  '略微',
  '等待',
  '停顿',
  '沉默',
  '确认候选人',
  '候选人已',
  '语气',
  '语速',
  '语调',
  '表情',
  '动作',
  '点头',
  '微笑',
  '看向',
  '皱眉',
  '思考',
  '内心',
  '提高语速',
  '降低语速',
];

const LEADING_FILLER_RE = /^(?:好(?:的)?|嗯|明白|收到|可以)[，,。.\s]+/;
const LEADING_FILLER_WORDS = ['好', '好的', '嗯', '明白', '收到', '可以'];

function isMetaAside(text) {
  return META_ASIDE_KEYWORDS.some(keyword => text.includes(keyword));
}

function stripMarkdown(text) {
  return text
    .replace(/\*\*/g, '')
    .replace(/__([^_]+)__/g, '$1');
}

function stripMetaAsides(text) {
  return text.replace(/[（(]([^（）()]*)[）)]/g, (match, inner) => (
    isMetaAside(inner) ? '' : match
  ));
}

/**
 * 清洗完整的面试官回复。
 * @param {string} raw
 * @returns {string}
 */
export function sanitizeInterviewOutputText(raw = '') {
  return stripMarkdown(stripMetaAsides(raw))
    .replace(/^\s+/, '')
    .replace(LEADING_FILLER_RE, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * 创建流式清洗器。括号内容会先缓冲到闭合后再判断是否输出。
 * @returns {{ push: (chunk: string) => string, flush: () => string }}
 */
export function createInterviewOutputStreamSanitizer() {
  let pending = '';
  let leadingPending = '';
  let emittedAny = false;

  const normalizeChunk = (text) => {
    let output = stripMarkdown(text);
    if (!emittedAny) {
      leadingPending += output;
      const candidate = leadingPending.replace(/^\s+/, '');
      const withoutFiller = candidate.replace(LEADING_FILLER_RE, '').replace(/^\s+/, '');

      if (withoutFiller !== candidate) {
        leadingPending = '';
        output = withoutFiller;
      } else if (
        candidate.length <= 4 &&
        LEADING_FILLER_WORDS.some(word => word.startsWith(candidate) || candidate === word)
      ) {
        return '';
      } else {
        leadingPending = '';
        output = candidate;
      }
    }
    if (output) emittedAny = true;
    return output;
  };

  const processPending = () => {
    let output = '';

    while (pending.length > 0) {
      const fullOpen = pending.indexOf('（');
      const halfOpen = pending.indexOf('(');
      const openIndex = [fullOpen, halfOpen].filter(i => i >= 0).sort((a, b) => a - b)[0];

      if (openIndex == null) {
        output += pending;
        pending = '';
        break;
      }

      output += pending.slice(0, openIndex);
      const openChar = pending[openIndex];
      const closeChar = openChar === '（' ? '）' : ')';
      const closeIndex = pending.indexOf(closeChar, openIndex + 1);

      if (closeIndex === -1) {
        pending = pending.slice(openIndex);
        break;
      }

      const aside = pending.slice(openIndex + 1, closeIndex);
      if (!isMetaAside(aside)) {
        output += pending.slice(openIndex, closeIndex + 1);
      }
      pending = pending.slice(closeIndex + 1);
    }

    return normalizeChunk(output);
  };

  return {
    push(chunk = '') {
      pending += chunk;
      return processPending();
    },
    flush() {
      let output = normalizeChunk(pending);
      if (!emittedAny && leadingPending) {
        const candidate = leadingPending.replace(/^\s+/, '');
        output = LEADING_FILLER_WORDS.includes(candidate)
          ? ''
          : candidate.replace(LEADING_FILLER_RE, '').replace(/^\s+/, '');
        leadingPending = '';
      }
      pending = '';
      return output;
    },
  };
}
