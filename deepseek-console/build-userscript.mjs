import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SERVICE_VERSION } from './deepseek-request.mjs';

// Keep the console file as the only implementation of the course workflow.
export function buildUserscript(source, version = SERVICE_VERSION) {
    if ((source.match(/const RUN_MODE = 'console';/g) || []).length !== 1) {
        throw new Error('控制台源码缺少唯一的启动模式位置');
    }
    if (!/^\d+\.\d+\.\d+$/.test(version) || !source.includes(`const SCRIPT_VERSION = '${version}';`)) {
        throw new Error('脚本版本与本地服务版本不一致');
    }
    const metadata = `// ==UserScript==
// @name         学习通视频与章节测验助手 DeepSeek
// @namespace    local.codex.xuexitong.deepseek
// @version      ${version}
// @description  自动播放与章节测验；需先启动配套本地服务，页面右下角显示进度
// @match        https://*.chaoxing.com/mycourse/studentstudy*
// @match        https://*.chaoxing.com/mooc2-ans/mycourse/studentstudy*
// @run-at       document-idle
// @sandbox      raw
// @grant        none
// @noframes
// ==/UserScript==

`;
    return metadata + source.replace("const RUN_MODE = 'console';", "const RUN_MODE = 'userscript';");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const source = readFileSync(new URL('./xuexitong-console.js', import.meta.url), 'utf8');
    writeFileSync(new URL('./xuexitong-deepseek.user.js', import.meta.url), buildUserscript(source), 'utf8');
    console.log(`已生成 DeepSeek 油猴脚本 V${SERVICE_VERSION}；启动本地服务会再次更新连接令牌。`);
}
