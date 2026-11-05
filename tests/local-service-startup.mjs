import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve, sep } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { SERVICE_VERSION, PROTOCOL_VERSION } from '../deepseek-console/deepseek-request.mjs';
import { buildUserscript } from '../deepseek-console/build-userscript.mjs';

async function reservePort() {
    const server = createServer();
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    return server;
}
function fixture(port) {
    const dir = mkdtempSync(join(tmpdir(), 'xuexitong-service-test-'));
    for (const file of ['deepseek-local.mjs', 'deepseek-request.mjs', 'build-userscript.mjs', 'xuexitong-console.js']) {
        let text = readFileSync(new URL(`../deepseek-console/${file}`, import.meta.url), 'utf8');
        if (file === 'deepseek-local.mjs') text = text.replace('const PORT = 37841;', `const PORT = ${port};`);
        if (file === 'xuexitong-console.js') text = text.replace(/const LOCAL_TOKEN = '[^']*';/, `const LOCAL_TOKEN = '${'a'.repeat(48)}';`);
        writeFileSync(join(dir, file), text);
    }
    const initial = readFileSync(join(dir, 'xuexitong-console.js'), 'utf8');
    writeFileSync(join(dir, 'xuexitong-deepseek.user.js'), buildUserscript(initial));
    const child = spawn(process.execPath, [join(dir, 'deepseek-local.mjs')], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', (value) => { output += value; });
    child.stderr.on('data', (value) => { output += value; });
    const exited = once(child, 'exit');
    const waitFor = async (predicate) => {
        const deadline = Date.now() + 5000;
        while (!predicate()) {
            if (Date.now() > deadline) throw new Error('Local fixture did not reach the expected state');
            await new Promise((done) => setTimeout(done, 20));
        }
    };
    return { dir, child, initial, output: () => output, exited, waitFor,
        async cleanup() {
            if (child.exitCode === null && child.signalCode === null) child.kill();
            await exited;
            const target = resolve(dir);
            assert.ok(target.startsWith(resolve(tmpdir()) + sep) && basename(target).startsWith('xuexitong-service-test-'));
            rmSync(target, { recursive: true, force: true });
        } };
}

const occupied = await reservePort();
const blocked = fixture(occupied.address().port);
try {
    await blocked.waitFor(() => blocked.child.exitCode !== null);
    assert.equal(blocked.child.exitCode, 1);
    assert.match(blocked.output(), /本次新服务未启动/);
    assert.ok(!blocked.output().includes('API Key'));
    assert.equal(readFileSync(join(blocked.dir, 'xuexitong-console.js'), 'utf8'), blocked.initial);
    assert.equal(readFileSync(join(blocked.dir, 'xuexitong-deepseek.user.js'), 'utf8'), buildUserscript(blocked.initial));
    console.log('PASS an occupied port fails before requesting a key or changing client files');
} finally {
    await blocked.cleanup();
    await new Promise((done) => occupied.close(done));
}

const reservation = await reservePort();
const freePort = reservation.address().port;
await new Promise((done) => reservation.close(done));
const running = fixture(freePort);
try {
    await running.waitFor(() => running.output().includes('DeepSeek API Key:'));
    assert.equal(readFileSync(join(running.dir, 'xuexitong-console.js'), 'utf8'), running.initial);
    running.child.stdin.write('local-test-key\n');
    await running.waitFor(() => running.output().includes('本地服务已启动'));
    const updated = readFileSync(join(running.dir, 'xuexitong-console.js'), 'utf8');
    const generated = readFileSync(join(running.dir, 'xuexitong-deepseek.user.js'), 'utf8');
    const token = updated.match(/const LOCAL_TOKEN = '([^']*)';/)[1];
    assert.notEqual(updated, running.initial);
    assert.equal(generated, buildUserscript(updated));
    assert.ok(!updated.includes('local-test-key') && !generated.includes('local-test-key'));
    const response = await fetch(`http://127.0.0.1:${freePort}/health`, {
        headers: { Origin: 'https://mooc1.chaoxing.com', 'X-Xuexitong-Token': token },
    });
    assert.equal(response.status, 200);
    const health = await response.json();
    assert.equal(health.version, SERVICE_VERSION);
    assert.equal(health.protocolVersion, PROTOCOL_VERSION);
    console.log('PASS a fresh service generates both entries and returns matching version metadata');
} finally {
    await running.cleanup();
}

console.log('Local service startup: 2 checks passed on temporary ports; no DeepSeek calls.');
