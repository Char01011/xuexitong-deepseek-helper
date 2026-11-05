import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../deepseek-console/xuexitong-console.js', import.meta.url), 'utf8')
    .replace(/const LOCAL_TOKEN = '[^']*';/, "const LOCAL_TOKEN = 'local-test-token';");

function setup() {
    let now = 100000;
    let callback;
    const warnings = [];
    const injections = [];
    const state = { blocked: false, documentBlocked: false, loaded: true, failInjection: false,
        href: 'https://mooc1.chaoxing.com/mycourse/studentstudy?chapter=1', closed: false };
    const securityError = () => Object.assign(new Error('Blocked a frame from accessing a cross-origin frame.'), { name: 'SecurityError' });
    const courseDocument = { readyState: 'complete', querySelector: () => state.loaded ? {} : null };
    const page = { closed: false, focus() {},
        get location() { return { get href() { if (state.blocked) throw securityError(); return state.href; } }; },
        get document() { if (state.documentBlocked) throw securityError(); return courseDocument; },
        eval(value) {
            if (state.failInjection) throw new Error('模拟注入错误');
            injections.push(value);
            this.__xuexitongConsoleDeepSeek = {};
        },
    };
    const keeper = { opener: page, document: { body: {} }, blur() {}, close() { state.closed = true; } };
    const keeperContext = {
        window: keeper, Date: class extends Date { static now() { return now; } },
        setInterval(fn) { callback = fn; return 1; }, clearInterval() { callback = null; },
        console: { warn: (...args) => warnings.push(args) },
    };
    keeper.eval = (value) => runInNewContext(value, keeperContext);
    page.open = () => keeper;
    runInNewContext(source, {
        window: page, location: new URL(state.href), document: courseDocument,
        console: { error() {}, log() {}, warn() {} },
        fetch: () => new Promise(() => {}), AbortSignal,
    });
    assert.ok(callback, 'The real console entrypoint installs the keeper callback');
    return { state, page, keeper, warnings, injections,
        tick: () => callback?.(), advance: (ms) => { now += ms; }, active: () => Boolean(callback) };
}

let checks = 0;
function check(name, fn) { fn(); checks++; console.log(`PASS ${name}`); }

check('cross-origin URL reads wait without logging repeated errors and recover after return', () => {
    const s = setup();
    s.state.blocked = true;
    for (let index = 0; index < 4; index++) { s.tick(); s.advance(31000); }
    assert.equal(s.keeper.__xuexitongKeeperStatus, 'waiting-origin');
    assert.match(s.keeper.document.body.textContent, /油猴入口/);
    assert.equal(s.warnings.length, 0);
    assert.equal(s.injections.length, 0);
    s.state.blocked = false;
    s.state.href = 'https://mooc1.chaoxing.com/mycourse/studentstudy?chapter=2';
    s.state.loaded = false;
    s.tick();
    assert.equal(s.injections.length, 0);
    s.state.loaded = true;
    s.tick();
    s.tick();
    assert.equal(s.injections.length, 1);
    assert.equal(s.keeper.__xuexitongKeeperStatus, 'running');
    assert.ok(!s.keeper.document.body.textContent.includes('暂时无法'));
});

check('a blocked document read is handled even when the URL can be read', () => {
    const s = setup();
    s.state.documentBlocked = true;
    s.tick();
    assert.equal(s.keeper.__xuexitongKeeperStatus, 'waiting-origin');
    assert.equal(s.warnings.length, 0);
    assert.equal(s.injections.length, 0);
});

check('the alternate mooc2 course path restores the same full source', () => {
    const s = setup();
    s.state.href = 'https://mooc1.chaoxing.com/mooc2-ans/mycourse/studentstudy?chapter=2';
    s.tick();
    assert.equal(s.injections.length, 1);
    assert.match(s.injections[0], /function xuexitongMain/);
    assert.equal(s.page.__xuexitongAutoInjected, true);
});

check('a userscript takeover closes the redundant keeper and stops polling', () => {
    const s = setup();
    s.page.__xuexitongUserscriptActive = true;
    s.tick();
    assert.equal(s.active(), false);
    assert.equal(s.state.closed, true);
    assert.equal(s.injections.length, 0);
});

check('course text in unrelated URLs never triggers reinjection', () => {
    const s = setup();
    for (const href of ['https://example.com/mycourse/studentstudy',
        'https://mooc1.chaoxing.com/login?return=/mycourse/studentstudy',
        'https://mooc1.chaoxing.com/mycourse/studentstudy-other']) {
        s.state.href = href;
        s.tick();
    }
    assert.equal(s.injections.length, 0);
});

check('a closed course tab closes its helper', () => {
    const s = setup();
    s.page.closed = true;
    s.tick();
    assert.equal(s.active(), false);
    assert.equal(s.state.closed, true);
});

check('existing controllers and pending startup prevent duplicate injection', () => {
    const s = setup();
    s.state.href += '&next=1';
    s.page.__xuexitongConsoleDeepSeekBootTimer = 10;
    s.tick();
    assert.equal(s.injections.length, 0);
    s.page.__xuexitongConsoleDeepSeekBootTimer = null;
    s.tick();
    s.advance(31000);
    s.tick();
    assert.equal(s.injections.length, 1);
});

check('ordinary injection errors remain visible and retries stay bounded', () => {
    const s = setup();
    s.state.href += '&next=1';
    s.state.failInjection = true;
    s.tick();
    assert.match(s.keeper.document.body.textContent, /模拟注入错误/);
    assert.equal(s.warnings.length, 1);
    s.tick();
    assert.equal(s.warnings.length, 1);
    s.advance(31000);
    s.tick();
    assert.equal(s.warnings.length, 2);
});

console.log(`Navigation keeper: ${checks} behavior checks passed; no browser or API requests.`);
