import { readFileSync, writeFileSync, readdirSync, mkdirSync, copyFileSync, existsSync, rmSync, lstatSync, realpathSync } from 'node:fs';
import { resolve, join, relative, dirname, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { deflateRawSync } from 'node:zlib';
import { SERVICE_VERSION } from '../deepseek-console/deepseek-request.mjs';
import { buildUserscript } from '../deepseek-console/build-userscript.mjs';

const root = resolve(import.meta.dirname, '..');
const output = resolve(root, 'publication');
const repo = resolve(output, 'repository');
const site = existsSync(resolve(root, 'guide-site/dist/index.html')) ? resolve(root, 'guide-site/dist') : resolve(root, 'docs');
const content = existsSync(resolve(root, 'publication-content')) ? resolve(root, 'publication-content') : root;
mkdirSync(output, { recursive: true });
if (existsSync(repo)) {
    const actual = realpathSync(repo);
    if (lstatSync(repo).isSymbolicLink() || !actual.startsWith(realpathSync(output) + sep)) throw new Error('Refusing to replace a staging directory outside publication');
    rmSync(repo, { recursive: true, force: true });
}
mkdirSync(repo);
function put(path, text) { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, text, 'utf8'); }
function copyTree(from, to, filter = () => true) {
    mkdirSync(to, { recursive: true });
    for (const entry of readdirSync(from, { withFileTypes: true })) {
        if (!filter(entry.name) || entry.isSymbolicLink()) continue;
        const source = join(from, entry.name), target = join(to, entry.name);
        if (entry.isDirectory()) copyTree(source, target, filter);
        else copyFileSync(source, target);
    }
}
for (const folder of ['deepseek-console', 'tests', 'scripts', 'img']) copyTree(join(root, folder), join(repo, folder), (name) =>
    !['node_modules', 'runtime', 'downloads'].includes(name) && !/\.(?:log|zip|tmp)$/.test(name) && !name.startsWith('.env'));
for (const file of ['xuexitong.js', 'v2.js', 'v3_optimized.js', 'v3_optimized.user.js', 'README_v2.md', 'ISSUES_REVIEW.md']) {
    if (existsSync(join(root, file))) copyFileSync(join(root, file), join(repo, file));
}
copyFileSync(join(root, existsSync(join(root, 'LEGACY_V3.md')) ? 'LEGACY_V3.md' : 'README.md'), join(repo, 'LEGACY_V3.md'));
for (const file of ['README.md', 'TECHNICAL_GUIDE.md', 'BUG_HISTORY.md', 'GITHUB_PUBLISH.md', 'THIRD_PARTY_NOTICES.md', 'LICENSE-ADDITIONS.md', 'RELEASE_NOTES.md']) copyFileSync(join(content, file), join(repo, file));
const clientPath = join(repo, 'deepseek-console/xuexitong-console.js');
const client = readFileSync(clientPath, 'utf8').replace(/const LOCAL_TOKEN = '[^']*';/, "const LOCAL_TOKEN = '__LOCAL_TOKEN__';");
put(clientPath, client);
put(join(repo, 'deepseek-console/xuexitong-deepseek.user.js'), buildUserscript(client));
put(join(repo, '.gitignore'), 'node_modules/\n.env\n.env.*\n*.log\npublication/\n.openai/\n.DS_Store\n');
put(join(repo, 'START.cmd'), '@echo off\r\nchcp 65001 >nul\r\ncall "%~dp0deepseek-console\\start-local-service.cmd"\r\n');
put(join(repo, '开始使用.html'), '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=docs/index.html"><title>打开使用指南</title><a href="docs/index.html">打开离线使用指南</a></html>');
put(join(repo, 'PUBLICATION_STATUS.json'), JSON.stringify({ version: SERVICE_VERSION, github_owner: 'Char01011', repository: 'xuexitong-deepseek-helper', remote_verified: false, note: '本文件记录打包时的状态；发布结果以远程仓库和交付说明为准。' }, null, 2));
put(join(repo, '.github/workflows/verify.yml'), `name: Verify\non: [push, pull_request]\npermissions:\n  contents: read\njobs:\n  check:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n        with:\n          node-version: '22'\n      - run: node scripts/check-publication.mjs\n      - run: node tests/deepseek-flow.mjs\n      - run: node tests/navigation-keeper.mjs\n      - run: node tests/local-service-startup.mjs\n`);

const escape = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function inline(text) { return escape(text).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>'); }
function markdown(text) {
    const blocks = []; let code = null, paragraph = [], list = false, table = false;
    const flush = () => { if (paragraph.length) blocks.push(`<p>${inline(paragraph.join(' '))}</p>`); paragraph = []; if (list) { blocks.push('</ul>'); list = false; } if (table) { blocks.push('</table>'); table = false; } };
    for (const line of text.split(/\r?\n/)) {
        if (line.startsWith('```')) { if (code !== null) { blocks.push(`<pre><code>${escape(code.join('\n'))}</code></pre>`); code = null; } else { flush(); code = []; } continue; }
        if (code !== null) { code.push(line); continue; }
        if (!line.trim()) { flush(); continue; }
        const heading = line.match(/^(#{1,4})\s+(.+)/); if (heading) { flush(); const level = heading[1].length; blocks.push(`<h${level}>${inline(heading[2])}</h${level}>`); continue; }
        if (/^\|/.test(line)) { if (/^\|[\s:|-]+\|$/.test(line)) continue; if (!table) { flush(); blocks.push('<table>'); table = true; } blocks.push('<tr>' + line.replace(/^\||\|$/g, '').split('|').map((cell) => `<td>${inline(cell.trim())}</td>`).join('') + '</tr>'); continue; }
        if (/^- /.test(line)) { if (!list) { flush(); blocks.push('<ul>'); list = true; } blocks.push(`<li>${inline(line.slice(2))}</li>`); continue; }
        paragraph.push(line);
    }
    flush(); return blocks.join('\n');
}
mkdirSync(join(site, 'articles'), { recursive: true });
for (const [name, file] of [['technical', 'TECHNICAL_GUIDE.md'], ['bugs', 'BUG_HISTORY.md'], ['publish', 'GITHUB_PUBLISH.md'], ['notices', 'THIRD_PARTY_NOTICES.md']]) {
    const md = readFileSync(join(content, file), 'utf8');
    const title = md.split(/\r?\n/)[0].replace(/^# /, '');
    put(join(site, 'articles', name + '.html'), `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)} · 学习通 DeepSeek 助手</title><link rel="stylesheet" href="../style.css"></head><body><article class="article-wrap"><header><a href="../index.html">← 返回新手指南</a><p>学习通 DeepSeek 助手 / V${SERVICE_VERSION}</p></header>${markdown(md)}<p class="article-source">本页由随包 Markdown 文档生成。运行结果以实际课程与当前版本为准。</p></article></body></html>`);
}
put(join(site, '.nojekyll'), '');
copyTree(site, join(repo, 'docs'), (name) => name !== 'downloads');

// Dependency-free ZIP writer: UTF-8 names, DEFLATE payloads, CRC32 and central directory.
const crcTable = Array.from({ length: 256 }, (_, value) => { for (let i = 0; i < 8; i++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1; return value >>> 0; });
const crc32 = (data) => { let value = 0xffffffff; for (const byte of data) value = crcTable[(value ^ byte) & 255] ^ (value >>> 8); return (value ^ 0xffffffff) >>> 0; };
function files(dir) { return readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap((item) => item.isDirectory() ? files(join(dir, item.name)) : [join(dir, item.name)]); }
const local = [], central = []; let offset = 0, entries = 0;
for (const path of files(repo)) {
    const data = readFileSync(path), zipped = deflateRawSync(data), crc = crc32(data);
    const name = Buffer.from(`xuexitong-deepseek-helper-v${SERVICE_VERSION}/` + relative(repo, path).split(sep).join('/'), 'utf8');
    const head = Buffer.alloc(30); head.writeUInt32LE(0x04034b50); head.writeUInt16LE(20, 4); head.writeUInt16LE(0x800, 6); head.writeUInt16LE(8, 8); head.writeUInt16LE(33, 12); head.writeUInt32LE(crc, 14); head.writeUInt32LE(zipped.length, 18); head.writeUInt32LE(data.length, 22); head.writeUInt16LE(name.length, 26);
    local.push(head, name, zipped);
    const row = Buffer.alloc(46); row.writeUInt32LE(0x02014b50); row.writeUInt16LE(20, 4); row.writeUInt16LE(20, 6); row.writeUInt16LE(0x800, 8); row.writeUInt16LE(8, 10); row.writeUInt16LE(33, 14); row.writeUInt32LE(crc, 16); row.writeUInt32LE(zipped.length, 20); row.writeUInt32LE(data.length, 24); row.writeUInt16LE(name.length, 28); row.writeUInt32LE(offset, 42); central.push(row, name); offset += head.length + name.length + zipped.length; entries++;
}
const directory = Buffer.concat(central), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(entries, 8); end.writeUInt16LE(entries, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
const archive = Buffer.concat([...local, directory, end]);
const archiveName = `xuexitong-deepseek-helper-v${SERVICE_VERSION}.zip`;
const checksum = createHash('sha256').update(archive).digest('hex');
writeFileSync(join(output, archiveName), archive);
put(join(output, 'SHA256SUMS.txt'), `${checksum}  ${archiveName}\n`);
for (const destination of [join(site, 'downloads'), join(repo, 'docs/downloads')]) {
    mkdirSync(destination, { recursive: true });
    writeFileSync(join(destination, archiveName), archive);
    put(join(destination, 'SHA256SUMS.txt'), `${checksum}  ${archiveName}\n`);
}
put(join(output, 'BUILD_INFO.json'), JSON.stringify({ version: SERVICE_VERSION, files: entries, archive: join(output, archiveName), bytes: archive.length, sha256: checksum, repository: repo, site }, null, 2));
console.log(JSON.stringify({ version: SERVICE_VERSION, files: entries, archive: join(output, archiveName), bytes: archive.length, sha256: checksum, repository: repo, site }));
