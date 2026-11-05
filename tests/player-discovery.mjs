import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';

const source = readFileSync(resolve(import.meta.dirname, '../v3_optimized.js'), 'utf8');

function makeVideo({ visible = true, known = false } = {}) {
    return {
        isConnected: true,
        playCalls: 0,
        paused: true,
        currentTime: 0,
        getClientRects: () => visible ? [{}] : [],
        matches: () => known,
        addEventListener() {},
        removeEventListener() {},
        play() {
            this.playCalls++;
            this.paused = false;
            return Promise.resolve();
        },
    };
}

function makeDocument(videos = [], frames = []) {
    const doc = {
        videos,
        frames,
        baseURI: 'https://mooc1.chaoxing.com/mycourse/studentstudy',
        querySelectorAll(selector) {
            if (selector === 'video') return this.videos;
            if (selector === 'iframe, frame') return this.frames;
            throw new Error(`Unexpected DOM selector: ${selector}`);
        },
        getElementsByClassName: () => [],
        addEventListener() {},
        removeEventListener() {},
    };
    for (const frame of frames) frame.ownerDocument = doc;
    return doc;
}

function makeFrame(child, { blocked = false, visible = true } = {}) {
    return {
        isConnected: true,
        getClientRects: () => visible ? [{}] : [],
        getAttribute: () => 'https://player.example/course/player?token=private-value',
        get contentDocument() {
            if (blocked) throw new Error('SecurityError: cross-origin frame');
            return child;
        },
    };
}

function start(doc) {
    let nextTimer = 1;
    const timeouts = new Map();
    const intervals = new Map();
    const logs = [];
    const empty = {
        length: 0,
        children() { return this; },
        each() { return this; },
        filter() { return this; },
        get() { return undefined; },
        off() { return this; },
        on() { return this; },
    };
    const $ = (target) => target === '#coursetree'
        ? { ...empty, length: 1, children: () => empty }
        : empty;
    const window = { jQuery: $, addEventListener() {}, removeEventListener() {} };
    const context = {
        window,
        document: doc,
        $,
        URL,
        console: Object.fromEntries(['log', 'warn', 'error', 'info'].map((name) =>
            [name, (...args) => logs.push(args)])),
        setInterval(callback) {
            const id = nextTimer++;
            intervals.set(id, callback);
            return id;
        },
        clearInterval: (id) => intervals.delete(id),
        setTimeout(callback) {
            const id = nextTimer++;
            timeouts.set(id, callback);
            return id;
        },
        clearTimeout: (id) => timeouts.delete(id),
    };
    runInNewContext(source, context);
    intervals.values().next().value();
    return {
        app: window.__xuexitongPlayerV3,
        timeouts,
        logs,
        async flush() {
            await Promise.resolve();
            await Promise.resolve();
        },
        async tick() {
            const entry = timeouts.entries().next().value;
            assert.ok(entry, 'Expected a pending load retry');
            timeouts.delete(entry[0]);
            entry[1]();
            await this.flush();
        },
    };
}

// Player IDs and iframe URL naming are not part of the playback contract.
{
    const video = makeVideo();
    const state = start(makeDocument([video]));
    await state.flush();
    assert.equal(state.app._videoEl, video);
    assert.equal(video.playCalls, 1, 'A video in the top document starts');
}

{
    const video = makeVideo();
    let doc = makeDocument([video]);
    for (let depth = 0; depth < 5; depth++) doc = makeDocument([], [makeFrame(doc)]);
    const state = start(doc);
    await state.flush();
    assert.equal(video.playCalls, 1, 'An unnamed video nested five frames deep starts');
}

{
    const video = makeVideo();
    const state = start(makeDocument([], [
        makeFrame(null, { blocked: true }),
        makeFrame(makeDocument([video])),
    ]));
    await state.flush();
    assert.equal(video.playCalls, 1, 'An inaccessible sibling frame does not abort discovery');
    const details = state.app.inspectPlayer();
    assert.equal(details.inaccessibleFrames[0], 'https://player.example/course/player');
    assert.ok(!JSON.stringify(details).includes('private-value'), 'Diagnostics omit URL query secrets');
}

{
    const hidden = makeVideo({ known: true });
    const visible = makeVideo();
    const state = start(makeDocument([], [
        makeFrame(makeDocument([hidden]), { visible: false }),
        makeFrame(makeDocument([visible])),
    ]));
    await state.flush();
    assert.equal(hidden.playCalls, 0);
    assert.equal(visible.playCalls, 1, 'Hidden frame players are not selected');
}

{
    const unrelated = makeVideo();
    const courseVideo = makeVideo({ known: true });
    const state = start(makeDocument([unrelated], [makeFrame(makeDocument([courseVideo]))]));
    await state.flush();
    assert.equal(unrelated.playCalls, 0);
    assert.equal(courseVideo.playCalls, 1, 'A recognizable course player has priority');
}

{
    const doc = makeDocument();
    const state = start(doc);
    await state.tick();
    await state.tick();
    const video = makeVideo();
    doc.frames.push(makeFrame(makeDocument([video])));
    await state.tick();
    assert.equal(video.playCalls, 1, 'A player created after startup is discovered on retry');
    assert.equal(state.timeouts.size, 0, 'Successful discovery clears the load wait');
}

{
    const state = start(makeDocument());
    let nextCalls = 0;
    state.app.nextUnit = () => nextCalls++;
    for (let count = 0; count < state.app.configs.maxRetries; count++) await state.tick();
    assert.equal(state.timeouts.size, 0, 'Unknown courseware stops after bounded retries');
    assert.equal(nextCalls, 0, 'Unrecognized content is not skipped');
    assert.equal(state.app._isPlaying, false);
}

{
    const state = start(makeDocument());
    state.app.destroy();
    assert.equal(state.timeouts.size, 0, 'Destroy cancels pending discovery');
}

{
    const first = makeVideo();
    const doc = makeDocument([first]);
    const state = start(doc);
    await state.flush();
    first.isConnected = false;
    const replacement = makeVideo();
    doc.videos = [replacement];
    await state.app.play();
    assert.equal(replacement.playCalls, 1, 'A detached cached player is replaced');
}

console.log('Player discovery: 9 behavior checks passed.');
