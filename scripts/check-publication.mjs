import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, extname } from 'node:path';
const root = resolve(import.meta.dirname, '..');
let count = 0;
const failures = [];
function walk(dir) {
    if (!existsSync(dir)) return;
    for (const item of readdirSync(dir, { withFileTypes: true })) {
        if (['.git', '.openai', 'node_modules', 'publication', 'downloads'].includes(item.name)) continue;
        const path = resolve(dir, item.name);
        if (item.isDirectory()) walk(path);
        else if (['.js', '.mjs', '.md', '.html', '.json', '.yml', '.cmd', '.css'].includes(extname(path))) {
            count++;
            const text = readFileSync(path, 'utf8');
            if (/sk-[A-Za-z0-9_-]{24,}/.test(text)) failures.push(`${path}: possible provider key`);
            if (/[?&](?:enc|openc)=[a-f0-9]{24,}/i.test(text)) failures.push(`${path}: possible course session URL`);
        }
    }
}
walk(root);
for (const name of ['xuexitong-console.js', 'xuexitong-deepseek.user.js']) {
    const path = resolve(root, 'deepseek-console', name);
    const value = readFileSync(path, 'utf8').match(/const LOCAL_TOKEN = '([^']*)';/)?.[1];
    if (value !== '__LOCAL_TOKEN__') failures.push(`${name}: runtime token must be removed before publication`);
}
if (failures.length) { console.error(failures.join('\n')); process.exit(1); }
console.log(`Publication check: ${count} text files scanned; token placeholders verified. This is a targeted check, not a complete secret audit.`);
