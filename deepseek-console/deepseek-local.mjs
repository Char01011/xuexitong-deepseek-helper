import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { requestAnswers, questionFormatError, readQuestionPayload, SERVICE_VERSION, PROTOCOL_VERSION } from './deepseek-request.mjs';
import { buildUserscript } from './build-userscript.mjs';

const PORT = 37841;
const scriptPath = fileURLToPath(new URL('./xuexitong-console.js', import.meta.url));
const userscriptPath = fileURLToPath(new URL('./xuexitong-deepseek.user.js', import.meta.url));
const token = randomBytes(24).toString('hex');
const allowedOrigin = (origin) => /^https:\/\/([a-z0-9-]+\.)*chaoxing\.com$/i.test(origin || '');

async function readApiKey() {
    if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function') {
        const rl = createInterface({ input: process.stdin, output: process.stdout });
        const value = await rl.question('DeepSeek API Key: ');
        rl.close();
        return value.trim();
    }
    process.stdout.write('请粘贴 DeepSeek API Key 后按 Enter（输入不显示）：');
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    return new Promise((resolve, reject) => {
        let value = '';
        const onData = (chunk) => {
            for (const char of chunk) {
                if (char === '\r' || char === '\n') {
                    process.stdin.off('data', onData);
                    process.stdin.setRawMode(false);
                    process.stdout.write('\n');
                    resolve(value.trim());
                    return;
                }
                if (char === '\u0003') {
                    process.stdin.off('data', onData);
                    process.stdin.setRawMode(false);
                    reject(new Error('已取消'));
                    return;
                }
                if (char === '\u007f' || char === '\b') value = value.slice(0, -1);
                else value += char;
            }
        };
        process.stdin.on('data', onData);
    });
}

const script = readFileSync(scriptPath, 'utf8');
if (!/const LOCAL_TOKEN = '[^']*';/.test(script)) throw new Error('控制台脚本缺少本地令牌位置');
const updatedScript = script.replace(/const LOCAL_TOKEN = '[^']*';/, `const LOCAL_TOKEN = '${token}';`);
const userscript = buildUserscript(updatedScript);

function send(res, status, data, origin) {
    res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': origin,
        'Vary': 'Origin',
    });
    res.end(JSON.stringify(data));
}

let apiKey = '';
let ready = false;
let busy = false;
const server = createServer(async (req, res) => {
    const origin = req.headers.origin;
    if (!allowedOrigin(origin)) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('Origin not allowed');
        return;
    }
    if (req.method === 'OPTIONS') {
        res.writeHead(204, {
            'Access-Control-Allow-Origin': origin,
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, X-Xuexitong-Token',
            'Access-Control-Allow-Private-Network': 'true',
            'Access-Control-Max-Age': '600',
            'Vary': 'Origin',
        });
        res.end();
        return;
    }
    if (req.headers['x-xuexitong-token'] !== token) {
        send(res, 403, { error: '本地令牌不匹配，请重新导入油猴脚本或复制控制台脚本' }, origin);
        return;
    }
    if (!ready) {
        send(res, 503, { error: '本地服务正在等待 API Key 或更新启动文件' }, origin);
        return;
    }
    if (req.method === 'GET' && req.url === '/health') {
        send(res, 200, { ok: true, version: SERVICE_VERSION, protocolVersion: PROTOCOL_VERSION,
            supportedTypes: ['单选题', '多选题', '判断题', '填空题'] }, origin);
        return;
    }
    if (req.method !== 'POST' || req.url !== '/answer') {
        send(res, 404, { error: '未找到接口' }, origin);
        return;
    }
    if (busy) {
        send(res, 429, { error: '上一批题目仍在处理' }, origin);
        return;
    }
    if (!String(req.headers['content-type'] || '').startsWith('application/json')) {
        send(res, 415, { error: '仅接受 JSON' }, origin);
        return;
    }
    busy = true;
    let stage = 'request';
    try {
        const questions = await readQuestionPayload(req);
        const problem = questionFormatError(questions);
        if (problem) {
            send(res, 422, { error: `题目格式不正确：${problem}`, stage: 'validation', version: SERVICE_VERSION }, origin);
            return;
        }
        stage = 'provider';
        const answers = await requestAnswers(questions, apiKey);
        send(res, 200, { answers }, origin);
    } catch (error) {
        send(res, stage === 'provider' ? 502 : 400, { error: error.message, stage, version: SERVICE_VERSION }, origin);
    } finally {
        busy = false;
    }
});

server.on('error', (error) => {
    console.error(error.code === 'EADDRINUSE'
        ? '37841 端口已被旧服务占用；本次新服务未启动。请关闭旧服务窗口后重试。'
        : `本地服务启动失败：${error.message}`);
    process.exit(1);
});

// Bind before requesting the key: an occupied port must fail before the user
// enters credentials, and must never rewrite either client file.
await new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve));
try {
    console.log(`准备启动服务 V${SERVICE_VERSION}（接口版本 ${PROTOCOL_VERSION}），端口 ${PORT} 已就绪。`);
    console.log(`当前目录：${fileURLToPath(new URL('.', import.meta.url))}`);
    apiKey = await readApiKey();
    if (!apiKey) throw new Error('未输入 DeepSeek API Key');
    writeFileSync(scriptPath, updatedScript, 'utf8');
    writeFileSync(userscriptPath, userscript, 'utf8');
    ready = true;
    console.log(`本地服务已启动：http://127.0.0.1:${PORT}`);
    console.log(`服务版本：${SERVICE_VERSION}，接口版本：${PROTOCOL_VERSION}（支持多空填空题）`);
    console.log('推荐：把同目录 xuexitong-deepseek.user.js 的全部内容保存到油猴中，再刷新课程页；无需打开 F12。');
    console.log('每次重启本地服务后，必须把新生成的油猴文件重新保存到油猴中。');
    console.log('也可复制 xuexitong-console.js 到 top 控制台执行，然后关闭开发者工具。两种入口选一种。');
    console.log('关闭本窗口即可停止服务；API Key 不会写入文件。');
} catch (error) {
    console.error(`本地服务未启动完成：${error.message}`);
    server.close(() => process.exit(1));
}
