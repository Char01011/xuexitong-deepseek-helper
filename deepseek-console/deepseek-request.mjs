import { StringDecoder } from 'node:string_decoder';

export const SERVICE_VERSION = '4.7.5';
export const PROTOCOL_VERSION = 2;
const API_URL = 'https://api.deepseek.com/chat/completions';
const ATTEMPTS = [
    { thinking: { type: 'enabled' }, reasoning_effort: 'low', max_tokens: 8000 },
];

export function questionFormatError(questions) {
    if (!Array.isArray(questions)) return 'questions 必须是题目数组';
    if (questions.length < 1 || questions.length > 30) return `每批须为 1～30 题，实际 ${questions.length} 题`;
    for (const [index, question] of questions.entries()) {
        const prefix = `本批第 ${index + 1} 题`;
        if (!question || typeof question !== 'object') return `${prefix}：缺少题目对象`;
        if (!Number.isInteger(question.id) || question.id !== index + 1) return `${prefix}：id 必须从 1 连续编号`;
        if (!['单选题', '多选题', '判断题', '填空题'].includes(question.type))
            return `${prefix}：不支持的 type（${String(question.type).slice(0, 20)}）`;
        if (typeof question.question !== 'string' || !question.question.trim()) return `${prefix}：题干为空或不是文字`;
        if (question.question.length > 500) return `${prefix}：题干长度 ${question.question.length}，上限 500`;
        if (question.type === '填空题') {
            if (!Number.isInteger(question.blank_count) || question.blank_count < 1 || question.blank_count > 100)
                return `${prefix}：blank_count 必须为 1～100 的整数，实际 ${String(question.blank_count).slice(0, 20)}`;
            if (question.options !== undefined && (!Array.isArray(question.options) || question.options.length !== 0))
                return `${prefix}：填空题 options 必须为空数组或省略`;
            continue;
        }
        if (!Array.isArray(question.options) || question.options.length < 2 || question.options.length > 8)
            return `${prefix}：options 必须包含 2～8 个选项`;
        const letters = new Set();
        for (const [optionIndex, option] of question.options.entries()) {
            if (!option || !/^[A-H]$/.test(option.letter)) return `${prefix}第 ${optionIndex + 1} 个选项：字母必须为 A～H`;
            if (letters.has(option.letter)) return `${prefix}：选项字母 ${option.letter} 重复`;
            letters.add(option.letter);
            if (typeof option.text !== 'string' || !option.text.length) return `${prefix}选项 ${option.letter}：文字为空`;
            if (option.text.length > 500) return `${prefix}选项 ${option.letter}：文字长度 ${option.text.length}，上限 500`;
        }
    }
    return null;
}

export function validQuestions(questions) {
    return questionFormatError(questions) === null;
}

export async function readQuestionPayload(stream, limit = 100000) {
    const decoder = new StringDecoder('utf8');
    let raw = '';
    for await (const chunk of stream) {
        raw += typeof chunk === 'string' ? chunk : decoder.write(chunk);
        if (raw.length > limit) throw new Error('请求内容过大');
    }
    raw += decoder.end();
    if (raw.length > limit) throw new Error('请求内容过大');
    let body;
    try { body = JSON.parse(raw); } catch (_) { throw new Error('请求不是有效 JSON'); }
    return body?.questions;
}

export async function requestAnswers(questions, apiKey, fetchImpl = fetch) {
    const formatError = questionFormatError(questions);
    if (formatError) throw new Error(`题目格式不正确：${formatError}`);
    let lastProblem = '';
    for (const [index, settings] of ATTEMPTS.entries()) {
        const body = {
            model: 'deepseek-flash',
            stream: false,
            response_format: { type: 'json_object' },
            ...settings,
            messages: [
                { role: 'system', content: '按题意回答全部题目。题干或选项可能经过网页防复制处理，出现替换字或无关字符，请结合上下文理解，勿将明显替换字当专业术语。id须严格对应题号，全部题目各返回一个答案对象。单选题、多选题、判断题使用letters数组，只用该题提供的选项字母且不可重复；单选和判断选一个，多选列出正确项。填空题使用blanks字符串数组，长度必须等于blank_count，按题干[第1空]、[第2空]及页面输入框的顺序，一空一个答案，不能合并、缺少或增加答案。填空答案仅用简洁的纯文字，不附编号、解释、HTML或Markdown，不换行；无法确定某一空时返回空字符串，由程序停止提交。选择题不确定时选最可能的答案。只输出JSON，格式示例：{"answers":[{"id":1,"letters":["A"]},{"id":2,"blanks":["第一空答案","第二空答案"]}]}。' },
                { role: 'user', content: JSON.stringify(questions) },
            ],
        };
        const response = await fetchImpl(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(120000),
        });
        const data = await response.json().catch(() => null);
        if (!response.ok) {
            const detail = data?.error?.message || data?.error || data?.message || '';
            throw new Error(`DeepSeek API 返回 HTTP ${response.status}${detail ? `：${detail}` : ''}`);
        }
        const choice = data?.choices?.[0];
        const reason = choice?.finish_reason;
        if (reason === 'length') {
            lastProblem = `DeepSeek 输出达到长度上限（已生成 ${data.usage?.completion_tokens ?? '未知'} tokens）`;
        } else if (reason !== 'stop') {
            throw new Error(`DeepSeek 未正常结束（finish_reason=${reason ?? '缺失'}）`);
        } else {
            try {
                const answer = JSON.parse(choice.message?.content || '');
                if (Array.isArray(answer.answers) && answer.answers.length === questions.length) return answer.answers;
                lastProblem = 'DeepSeek 返回格式不完整';
            } catch {
                lastProblem = 'DeepSeek 返回空内容或无法解析 JSON';
            }
        }
        if (index + 1 < ATTEMPTS.length) console.warn(`${lastProblem}，正在重试`);
    }
    throw new Error(`${lastProblem}；未获得完整答案，没有选择或提交题目`);
}
