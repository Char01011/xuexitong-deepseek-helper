import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { Readable } from 'node:stream';
import { validQuestions, questionFormatError, readQuestionPayload, requestAnswers,
    SERVICE_VERSION, PROTOCOL_VERSION } from '../deepseek-console/deepseek-request.mjs';
import { buildUserscript } from '../deepseek-console/build-userscript.mjs';

// The full entrypoint runs in a fake page. Answer requests are rejected unless
// a test explicitly supplies a local mock; no fetch reaches the network.
const source = readFileSync(resolve(import.meta.dirname, '../deepseek-console/xuexitong-console.js'), 'utf8')
    .replace(/const LOCAL_TOKEN = '[^']*';/, "const LOCAL_TOKEN = 'local-test-token';");

function element(tagName = 'DIV', { text = '', visible = true, id = '' } = {}) {
    return {
        tagName, id, innerText: text, textContent: text, title: '',
        isConnected: true, children: [], disabled: false,
        classList: { contains: () => false },
        getClientRects: () => visible ? [{}] : [],
        getAttribute: () => null,
        querySelectorAll: () => [],
        querySelector: () => null,
        scrollIntoView() {},
    };
}

function video(name, options = {}) {
    const result = element('VIDEO', options);
    const events = new Map();
    Object.assign(result, {
        currentSrc: `https://media.example/${name}.mp4`,
        playbackRate: 1, paused: true, ended: Boolean(options.ended), currentTime: 0,
        duration: 600, readyState: 4, networkState: 1,
        playRates: [],
        addEventListener(type, handler) {
            if (!events.has(type)) events.set(type, new Set());
            events.get(type).add(handler);
        },
        removeEventListener(type, handler) { events.get(type)?.delete(handler); },
        emit(type) {
            for (const handler of Array.from(events.get(type) || [])) handler({ currentTarget: this });
        },
        play() {
            this.playRates.push(this.playbackRate);
            this.paused = false;
            this.ended = false;
            this.emit('play');
            return Promise.resolve();
        },
        finish(notify = true) {
            this.ended = true;
            this.paused = true;
            if (notify) this.emit('ended');
        },
    });
    return result;
}

function frame(child, { visible = true, blocked = false } = {}) {
    const result = Object.assign(element('IFRAME', { visible }), {
        child,
        source: '/knowledge/cards?knowledgeid=one&num=0',
        getAttribute(name) { return name === 'src' ? this.source : null; },
    });
    Object.defineProperty(result, 'contentDocument', {
        get() {
            if (blocked) throw new Error('SecurityError');
            return this.child;
        },
    });
    return result;
}

function page(videos = [], frames = []) {
    const doc = {
        videos, frames, buttons: [], step: '视频', active: null, visibilityState: 'visible',
        body: { nodeType: 1, innerText: '' },
        baseURI: 'https://mooc1.chaoxing.com/mycourse/studentstudy',
        defaultView: { getComputedStyle: () => ({ visibility: 'visible', overflowY: 'visible' }) },
        createTreeWalker(node) {
            assert.ok(node && node.nodeType === 1, 'TreeWalker must receive a real body node');
            return { nextNode: () => null };
        },
        addEventListener() {}, removeEventListener() {},
        getElementsByClassName(name) {
            return name === 'prev_title' ? [{ title: this.step, textContent: this.step }] : [];
        },
        querySelectorAll(selector) {
            if (selector === 'video, iframe, frame') return this.contentOrder || [...this.videos, ...this.frames];
            if (selector === 'video') return this.videos;
            if (selector === 'iframe, frame' || selector === 'iframe') return this.frames;
            if (selector.includes('iframe[src*="/knowledge/cards"]')) {
                return this.frames.filter((item) => item.source.includes('/knowledge/cards'));
            }
            if (selector === '#prevNextFocusNext, #right1, .nextChapter') return this.buttons;
            if (selector.startsWith('button,a,input')) return this.buttons;
            return [];
        },
        querySelector(selector) {
            if (selector === '.posCatalog_active') return this.active;
            return this.querySelectorAll(selector)[0] || null;
        },
    };
    for (const item of [...videos, ...frames]) item.ownerDocument = doc;
    for (const item of frames) {
        if (item.child) item.child.defaultView.frameElement = item;
    }
    return doc;
}

function nextButton(doc, click, text = '下一节') {
    const button = element('BUTTON', { id: 'prevNextFocusNext', text });
    button.ownerDocument = doc;
    button.clicks = 0;
    button.click = () => { button.clicks++; click(); };
    doc.buttons.push(button);
    return button;
}

// Minimal DOM fixture for actual question extraction, Range boundaries and clicks.
function quizPage(specs, expectedCount = specs.length) {
    const doc = page();
    doc.step = '章节测验';
    doc.chosen = [];
    doc.submitClicks = 0;
    const allNodes = (root) => [root, ...(root.childNodes || []).flatMap(allNodes)];
    function node(tag, text = '') {
        const result = Object.assign(element(tag.toUpperCase()), { nodeType: 1, childNodes: [] });
        result.ownerDocument = doc;
        result.attributes = {};
        result.getAttribute = (name) => result.attributes[name] ?? null;
        result.setAttribute = (name, value) => { result.attributes[name] = String(value); };
        result.closest = (selector) => {
            for (let current = result; current; current = current.parentElement) {
                if (current.matches(selector)) return current;
            }
            return null;
        };
        result.focus = () => {};
        result.blur = () => {};
        result.dispatchEvent = (event) => {
            doc.fieldEvents.push({ id: result.id, type: event.type, value: result.value ?? result.textContent });
            result[`on${event.type}`]?.(event);
            return true;
        };
        result.append = (child) => {
            child.parentElement = result;
            result.childNodes.push(child);
            return child;
        };
        const textContent = (item) => item.nodeType === 3 ? item.textContent :
            item.childNodes.map(textContent).join('\n');
        Object.defineProperties(result, {
            children: { get: () => result.childNodes.filter((child) => child.nodeType === 1) },
            textContent: {
                get: () => textContent(result),
                set: (value) => {
                    result.childNodes = [];
                    if (value) result.append({ nodeType: 3, textContent: String(value), ownerDocument: doc });
                },
            },
            innerText: { get: () => textContent(result) },
            outerHTML: { get: () => allNodes(result).map((item) =>
                `${item.tagName || '#text'}:${item.textContent}:${item.checked || false}`).join('|') },
        });
        result.matches = (selector) => selector.split(',').some((part) => {
            part = part.trim();
            if (part.startsWith('.')) return (result.attributes.class || '').split(/\s+/).includes(part.slice(1));
            const attribute = part.match(/^\[([^=]+)="([^"]*)"\]$/);
            if (attribute) return result.getAttribute(attribute[1]) === attribute[2];
            const presence = part.match(/^\[([^=]+)\]$/);
            if (presence) return result.getAttribute(presence[1]) !== null;
            if (part.startsWith('[')) return false;
            return part.toUpperCase() === result.tagName;
        });
        result.querySelectorAll = (selector) => allNodes(result).slice(1)
            .filter((item) => item.nodeType === 1 && item.matches(selector));
        result.querySelector = (selector) => result.querySelectorAll(selector)[0] || null;
        result.contains = (other) => {
            for (let current = other; current; current = current.parentElement) if (current === result) return true;
            return false;
        };
        result.compareDocumentPosition = (other) => {
            const nodes = allNodes(doc.body);
            return nodes.indexOf(other) < nodes.indexOf(result) ? 2 : 4;
        };
        if (text) result.append({ nodeType: 3, textContent: text, ownerDocument: doc });
        return result;
    }
    doc.body = node('body');
    doc.fieldEvents = [];
    doc.fillInputs = [];
    doc.editorFrames = [];
    doc.editorSyncs = 0;
    doc.defaultView.Event = class { constructor(type, options) { this.type = type; Object.assign(this, options); } };
    doc.body.append(node('p', `题量：${expectedCount}`));
    specs.forEach((spec, index) => {
        const card = doc.body.append(node('div'));
        const heading = card.append(node('div'));
        if (spec.numberSeparate) heading.append(node('span', String(index + 1)));
        let markerParent = heading;
        for (let depth = 0; depth < (spec.headingDepth || 0); depth++) markerParent = markerParent.append(node('div'));
        if (spec.splitMarker) {
            const type = markerParent.append(node('span', spec.numberSeparate ? '' : `${index + 1}.`));
            type.append(node('span', '【'));
            type.append(node('span', spec.kind));
            type.append(node('span', '】'));
        } else {
            markerParent.append(node('span', `${spec.numberSeparate ? '' : `${index + 1}.`}${spec.noTypeMarker ? '' : spec.marker || `【${spec.kind}】`}`));
        }
        heading.append(node('span', spec.title ?? `第 ${index + 1} 道模拟题的完整题干`));
        if (spec.kind === '填空题') {
            const container = card.append(node('div'));
            for (let blank = 0; blank < spec.count; blank++) {
                container.append(node('span', spec.fragments?.[blank] || `题干第 ${blank + 1} 段`));
                container.append(node('label', `第${blank + 1}空`));
                const control = spec.controls?.[blank] || 'input';
                if (['ueditor', 'tinymce', 'unknown-editor', 'pending-editor'].includes(control)) {
                    const editorDoc = page();
                    editorDoc.defaultView.Event = doc.defaultView.Event;
                    const target = Object.assign(element('BODY'), {
                        nodeType: 1, childNodes: [], ownerDocument: editorDoc,
                        isContentEditable: true, innerText: '', textContent: '',
                        dispatchEvent: (event) => { doc.fieldEvents.push({ type: event.type }); return true; },
                    });
                    editorDoc.body = control === 'pending-editor' ? null : target;
                    const editorFrame = container.append(node('iframe'));
                    if (control === 'ueditor' || spec.ueditorFrame) editorFrame.id = `ueditor_${index * 100 + blank}`;
                    editorFrame.hiddenByFixture = Boolean(spec.hiddenEditors?.[blank] ?? spec.hideEditors);
                    editorFrame.getClientRects = () => editorFrame.hiddenByFixture ? [] : [{}];
                    editorFrame.contentDocument = editorDoc;
                    editorDoc.defaultView.frameElement = editorFrame;
                    doc.editorFrames.push(editorFrame);
                    doc.fillInputs.push(target);
                    if (control === 'ueditor' || control === 'tinymce') {
                        const editor = {
                            body: target,
                            iframe: editorFrame,
                            // Real UEditor core assigns numeric 1 after initialization.
                            isReady: spec.editorReady ?? (control === 'ueditor' ? 1 : true),
                            options: { readonly: Boolean(spec.editorReadonly) },
                            queryCommandState: () => spec.sourceMode ? 1 : 0,
                            getContent() { return this.html || ''; },
                            setContent(html) {
                                this.html = html;
                                target.innerText = html.replace(/<br\s*\/?\s*>/g, '\n').replace(/<[^>]*>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
                                    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
                                target.textContent = target.innerText;
                                target.childNodes = [{ nodeType: 1, tagName: 'P', childNodes:
                                    target.innerText.split('\n').flatMap((part, partIndex) => [
                                        ...(partIndex ? [{ nodeType: 1, tagName: 'BR', childNodes: [] }] : []),
                                        { nodeType: 3, textContent: part },
                                    ]) }];
                            },
                            fireEvent() {}, sync() {
                                doc.editorSyncs++;
                                if (this.textarea && !spec.dropEditorSync) this.textarea.value = this.html || '';
                            },
                            getBody: () => target,
                            save() { doc.editorSyncs++; },
                        };
                        if (control === 'ueditor') {
                            const backing = container.append(node('textarea'));
                            backing.value = '';
                            backing.getClientRects = () => [];
                            editor.textarea = backing;
                            doc.defaultView.UE ||= { instants: {} };
                            doc.defaultView.UE.instants[`editor-${index}-${blank}`] = editor;
                        } else {
                            doc.tinyEditors ||= [];
                            doc.tinyEditors.push(editor);
                            doc.defaultView.tinymce = { get: () => doc.tinyEditors };
                        }
                        target.editor = editor;
                    }
                } else {
                    const editable = ['editable', 'plaintext-only', 'not-editable'].includes(control);
                    const controlTag = ['readonly', 'hidden', 'disabled'].includes(control) ? 'input' : control;
                    const input = container.append(node(editable ? 'div' : controlTag));
                    input.id = `blank-${index + 1}-${blank + 1}`;
                    input.type = 'text';
                    input.maxLength = spec.maxLength ?? -1;
                    input.value = spec.initialValues?.[blank] || '';
                    input.isContentEditable = editable && control !== 'not-editable';
                    if (editable) input.setAttribute('contenteditable', control === 'plaintext-only' ? 'plaintext-only' : control === 'not-editable' ? 'false' : 'true');
                    if (control === 'readonly') input.readOnly = true;
                    if (control === 'disabled') input.disabled = true;
                    if (control === 'hidden') input.getClientRects = () => [];
                    if (spec.revertOnChange) input.onchange = () => { input.value = ''; };
                    doc.fillInputs.push(input);
                }
            }
            container.append(node('span', spec.fragments?.[spec.count] || '题干末尾内容'));
            const hidden = container.append(node('input'));
            hidden.type = 'hidden';
            const radio = container.append(node('input'));
            radio.type = 'radio';
            return;
        }
        const list = card.append(node('ul'));
        const values = spec.optionLabels || (spec.kind === '判断题'
            ? (spec.symbols ? ['√', '×'] : ['正确', '错误']) : ['A', 'B']);
        const options = spec.reverse ? values.slice().reverse() : values;
        const inputs = [];
        for (const value of options) {
            const row = list.append(node('li'));
            const input = row.append(node('input'));
            input.type = spec.kind === '多选题' ? 'checkbox' : 'radio';
            input.value = 'on';
            input.checked = false;
            row.append(node('span', value));
            if (spec.kind !== '判断题') row.append(node('span', `模拟选项 ${value}`));
            input.click = () => {
                if (input.type === 'radio') for (const other of inputs) other.checked = false;
                input.checked = input.type === 'radio' ? true : !input.checked;
                doc.chosen.push({ id: index + 1, value });
            };
            row.click = () => input.click();
            inputs.push(input);
        }
    });
    const submit = doc.body.append(node('button', '提交'));
    submit.click = () => doc.submitClicks++;
    doc.buttons = [submit];
    const originalQuery = doc.querySelectorAll.bind(doc);
    doc.querySelectorAll = (selector) => selector === 'video, iframe, frame'
        ? [...originalQuery(selector), ...doc.editorFrames] : originalQuery(selector);
    doc.createTreeWalker = (root) => {
        assert.ok(root?.nodeType === 1);
        const texts = allNodes(root).filter((item) => item.nodeType === 3);
        let index = 0;
        return { nextNode: () => texts[index++] || null };
    };
    doc.createRange = () => {
        let startNode;
        let endNode;
        return {
            setStart(value) { startNode = value; },
            setEndBefore(value) { endNode = value; },
            toString() {
                const nodes = allNodes(startNode);
                return nodes.slice(0, nodes.indexOf(endNode)).filter((item) => item.nodeType === 3)
                    .map((item) => item.textContent).join('\n');
            },
            detach() {},
        };
    };
    return doc;
}

function fortyQuestions() {
    return Array.from({ length: 40 }, (_, index) => ({
        kind: index < 20 ? '单选题' : index < 30 ? '多选题' : '判断题',
        symbols: index >= 35,
        reverse: index % 2 === 1,
    }));
}

async function start(doc, { answerResponder = null, serviceInfo = null, expectStarted = true,
    userscript = false, topFrame = true, healthStatus = 200 } = {}) {
    let timerId = 0;
    let time = 100000;
    const timeouts = new Map();
    const intervals = new Map();
    const errors = [];
    const messages = [];
    let answerRequests = 0;
    let popupRequests = 0;
    const panels = new Map();
    if (userscript) {
        doc.getElementById = (id) => panels.get(id) || null;
        doc.createElement = (tag) => {
            const created = { ...element(tag.toUpperCase()), style: {}, children: [], setAttribute() {},
                appendChild(child) { this.children.push(child); child.parentElement = this; },
                focus() { this.focused = true; }, select() { this.selected = true; },
                remove() { panels.delete(this.id); },
            };
            let ownText = '';
            Object.defineProperty(created, 'textContent', {
                get: () => ownText + created.children.map((child) => child.textContent || '').join(''),
                set: (value) => { ownText = String(value); created.children = []; },
            });
            return created;
        };
        doc.body.appendChild = (panel) => panels.set(panel.id, panel);
    }
    const empty = {
        length: 0,
        children() { return this; }, each() { return this; },
        filter() { return this; }, get() { return undefined; },
        on() { return this; }, off() { return this; },
    };
    const $ = (target) => target === '#coursetree'
        ? { ...empty, length: 1, children: () => empty } : empty;
    const location = new URL(doc.baseURI);
    const window = {
        __xuexitongAutoInjected: !userscript,
        jQuery: $, location, addEventListener() {}, removeEventListener() {},
        open() { popupRequests++; throw new Error('Popup was not expected'); },
    };
    window.top = topFrame ? window : {};
    const context = {
        window, document: doc, location, URL, AbortSignal,
        Date: class extends Date { static now() { return time; } },
        console: {
            log: (...args) => messages.push(args), warn: (...args) => messages.push(args),
            info() {}, table() {}, error: (...args) => errors.push(args),
        },
        async fetch(url, options) {
            if (url !== 'http://127.0.0.1:37841/health') {
                answerRequests++;
                if (answerResponder && url === 'http://127.0.0.1:37841/answer') {
                    return answerResponder(JSON.parse(options.body).questions, answerRequests);
                }
                throw new Error('Unexpected answer API request');
            }
            return { ok: healthStatus >= 200 && healthStatus < 300, status: healthStatus, json: async () => serviceInfo || {
                ok: true, version: SERVICE_VERSION, protocolVersion: PROTOCOL_VERSION,
                supportedTypes: ['单选题', '多选题', '判断题', '填空题'],
            } };
        },
        setTimeout(callback, delay) {
            const id = ++timerId;
            timeouts.set(id, { callback, at: time + delay });
            return id;
        },
        clearTimeout: (id) => timeouts.delete(id),
        setInterval(callback) { const id = ++timerId; intervals.set(id, callback); return id; },
        clearInterval: (id) => intervals.delete(id),
    };
    const flush = async () => { for (let count = 0; count < 64; count++) await Promise.resolve(); };
    runInNewContext(userscript ? buildUserscript(source) : source, context);
    await flush();
    if (expectStarted) {
        assert.equal(intervals.size, 1, 'Startup waits for the course directory');
        intervals.values().next().value();
        await flush();
    }
    const app = window.__xuexitongConsoleDeepSeek;
    if (expectStarted) assert.ok(app, 'The full DeepSeek entrypoint initializes');
    return {
        app, errors, messages, timeouts, flush,
        mockAnswerRequests: () => answerRequests,
        popupRequests: () => popupRequests,
        visibleStatus: () => panels.get('xuexitong-deepseek-status')?.textContent || '',
        openDiagnostics: () => panels.get('xuexitong-deepseek-status')._diagnosticButton.onclick(),
        visibleDiagnostics: () => panels.get('xuexitong-deepseek-diagnostics')?._text.value || '',
        intervalCount: () => intervals.size,
        async pollIntervals() {
            for (const [id, callback] of Array.from(intervals.entries())) {
                if (intervals.has(id)) callback();
                await flush();
            }
        },
        async elapse(ms) { time += ms; await flush(); },
        async tick() {
            const entry = Array.from(timeouts.entries()).sort((a, b) => a[1].at - b[1].at)[0];
            assert.ok(entry, 'Expected a pending playback/navigation timer');
            timeouts.delete(entry[0]);
            time = entry[1].at;
            entry[1].callback();
            await flush();
        },
        assertNoAnswers() { assert.equal(answerRequests, 0, 'No DeepSeek answer requests are made'); },
    };
}

let checks = 0;
async function check(name, task) {
    await task();
    checks++;
    console.log(`PASS ${name}`);
}

await check('two stacked videos finish before one navigation', async () => {
    const first = video('first');
    const second = video('second');
    const third = video('third');
    const cards = frame(page([first, second]));
    const root = page([], [cards]);
    const next = nextButton(root, () => { cards.child = page([third]); });
    const state = await start(root);
    assert.deepEqual(first.playRates, [1]);
    assert.equal(second.playRates.length, 0);
    first.finish();
    state.app._handleVideoEnded({ currentTarget: first });
    await state.tick();
    assert.equal(next.clicks, 0);
    assert.deepEqual(second.playRates, [1]);
    second.finish();
    await state.tick();
    assert.equal(next.clicks, 1);
    await state.tick();
    assert.deepEqual(third.playRates, [1]);
    assert.equal(first.playRates.length, 1);
    assert.equal(state.app._nextUnitPending, false);
    state.assertNoAnswers();
});

await check('video to video detects a changed source on the same element', async () => {
    const item = video('first');
    const root = page([item]);
    nextButton(root, () => {
        item.currentSrc = 'https://media.example/second.mp4';
        item.ended = false;
    });
    const state = await start(root);
    item.finish();
    await state.tick();
    await state.tick();
    assert.equal(item.playRates.length, 2);
    assert.equal(state.app._nextUnitPending, false);
    state.assertNoAnswers();
});

await check('mixed embedded and direct videos preserve page order', async () => {
    const first = video('embedded-first');
    const second = video('direct-second');
    const embedded = frame(page([first]));
    const root = page([second], [embedded]);
    root.contentOrder = [embedded, second];
    const state = await start(root);
    assert.equal(first.playRates.length, 1);
    assert.equal(second.playRates.length, 0);
    first.finish();
    await state.tick();
    assert.equal(second.playRates.length, 1);
    state.assertNoAnswers();
});

await check('video to quiz starts quiz handling once', async () => {
    const item = video('first');
    const root = page([item]);
    nextButton(root, () => {
        root.videos = [];
        root.step = '章节测验';
        root.body.innerText = '1.【单选题】题目';
    });
    const state = await start(root);
    let quizzes = 0;
    state.app._advanceChapterTest = () => quizzes++;
    item.finish();
    await state.tick();
    await state.tick();
    assert.equal(quizzes, 1);
    assert.equal(state.app._nextUnitPending, false);
    state.assertNoAnswers();
});

await check('late next video is awaited without replaying old content', async () => {
    const first = video('first');
    const second = video('second');
    const cards = frame(page([first]));
    const root = page([], [cards]);
    nextButton(root, () => {});
    const state = await start(root);
    first.finish();
    await state.tick();
    await state.tick();
    assert.equal(state.app._nextUnitPending, true);
    assert.equal(first.playRates.length, 1);
    cards.child = page([second]);
    await state.tick();
    assert.equal(second.playRates.length, 1);
    state.assertNoAnswers();
});

await check('unchanged page times out instead of claiming a transition', async () => {
    const item = video('first');
    const root = page([item]);
    const next = nextButton(root, () => {});
    const state = await start(root);
    item.finish();
    await state.tick();
    for (let count = 0; count < 240; count++) await state.tick();
    assert.equal(next.clicks, 1);
    assert.equal(item.playRates.length, 1);
    assert.equal(state.app._nextUnitPending, false);
    assert.ok(state.errors.some((args) => String(args[0]).includes('切换下一学习步骤失败')));
    state.assertNoAnswers();
});

await check('next chapter label and disabled button are handled', async () => {
    const first = video('first');
    const second = video('second');
    const root = page([first]);
    const disabled = nextButton(root, () => { throw new Error('Disabled button clicked'); });
    disabled.disabled = true;
    const next = nextButton(root, () => {
        second.ownerDocument = root;
        root.videos = [second];
    }, '下一章');
    const state = await start(root);
    first.finish();
    await state.tick();
    await state.tick();
    assert.equal(disabled.clicks, 0);
    assert.equal(next.clicks, 1);
    assert.equal(second.playRates.length, 1);
    state.assertNoAnswers();
});

await check('monitor detects completion when ended event is missing', async () => {
    const first = video('first');
    const second = video('second');
    const state = await start(page([first, second]));
    first.finish(false);
    state.app._checkVideoStatus();
    await state.tick();
    assert.equal(first.playRates.length, 1);
    assert.equal(second.playRates.length, 1);
    state.assertNoAnswers();
});

await check('destroy cancels queued continuation', async () => {
    const first = video('first');
    const second = video('second');
    const state = await start(page([first, second]));
    first.finish();
    state.app.destroy();
    assert.equal(state.timeouts.size, 0);
    assert.equal(second.playRates.length, 0);
    state.assertNoAnswers();
});

await check('generic nested players survive an inaccessible sibling', async () => {
    const item = video('nested');
    let content = page([item]);
    for (let depth = 0; depth < 5; depth++) content = page([], [frame(content)]);
    const state = await start(page([], [frame(null, { blocked: true }), frame(content)]));
    assert.equal(item.playRates.length, 1);
    assert.equal(state.app.inspectFlow().inaccessibleFrames, 1);
    state.assertNoAnswers();
});

await check('hidden frames and already ended videos are not replayed', async () => {
    const hidden = video('hidden');
    const completed = video('completed', { ended: true });
    const remaining = video('remaining');
    const root = page([completed, remaining], [frame(page([hidden]), { visible: false })]);
    const state = await start(root);
    assert.equal(hidden.playRates.length, 0);
    assert.equal(completed.playRates.length, 0);
    assert.equal(remaining.playRates.length, 1);
    assert.equal(state.app.inspectFlow().visibleVideos, 2);
    state.assertNoAnswers();
});

await check('missing next button stops with a diagnostic', async () => {
    const item = video('first');
    const state = await start(page([item]));
    item.finish();
    await state.tick();
    assert.equal(state.app._nextUnitPending, false);
    assert.equal(state.app.inspectFlow().nextButtonFound, false);
    assert.ok(state.errors.length > 0);
    state.assertNoAnswers();
});

await check('existing Video.js instance is used instead of bypassing the player', async () => {
    const item = video('wrapped');
    const originalPlay = item.play.bind(item);
    item.play = () => { throw new Error('Native entrypoint should not be called directly'); };
    const root = page([item]);
    let playerCalls = 0;
    let muted = false;
    root.defaultView.videojs = {
        getPlayers: () => ({ course: {
            el: () => ({ contains: (target) => target === item }),
            muted: (value) => { muted = value; },
            play: () => { playerCalls++; return originalPlay(); },
        } }),
    };
    const state = await start(root);
    assert.equal(playerCalls, 1);
    assert.equal(muted, true);
    assert.equal(state.app.inspectFlow().playbackMethod, 'Video.js');
    state.assertNoAnswers();
});

await check('outer frames are revealed before the active video', async () => {
    const item = video('visible');
    const inner = frame(page([item]));
    const outer = frame(page([], [inner]));
    const root = page([], [outer]);
    const order = [];
    outer.scrollIntoView = () => order.push('outer');
    inner.scrollIntoView = () => order.push('inner');
    item.scrollIntoView = () => order.push('video');
    const state = await start(root);
    assert.deepEqual(order, ['outer', 'inner', 'video']);
    state.assertNoAnswers();
});

await check('a fulfilled play promise is not treated as confirmed progress', async () => {
    const item = video('progress');
    const state = await start(page([item]));
    assert.equal(state.app.inspectFlow().playbackConfirmed, false);
    state.app._checkVideoStatus();
    assert.equal(state.app.inspectFlow().playbackConfirmed, false);
    item.currentTime = 1;
    state.app._checkVideoStatus();
    assert.equal(state.app.inspectFlow().playbackConfirmed, true);
    assert.equal(state.app.inspectFlow().playbackAttempts, 0);
    state.assertNoAnswers();
});

await check('immediate re-pause is bounded to three actual play requests', async () => {
    const item = video('repaused');
    const originalPlay = item.play.bind(item);
    item.play = () => {
        const result = originalPlay();
        item.currentTime += 0.02;
        item.paused = true;
        return result;
    };
    const state = await start(page([item]));
    for (let count = 0; count < 3; count++) {
        await state.elapse(2000);
        state.app._checkVideoStatus();
        await state.flush();
    }
    assert.equal(item.playRates.length, 3);
    assert.equal(state.app.inspectFlow().playbackStopped, true);
    assert.equal(state.app.inspectFlow().playbackConfirmed, false);
    assert.equal(state.app.inspectFlow().lastPlaybackError.name, 'PlaybackRetryLimit');
    state.app._checkVideoStatus();
    assert.equal(item.playRates.length, 3);
    state.assertNoAnswers();
});

await check('unpaused but frozen media is not mistaken for successful playback', async () => {
    const item = video('frozen');
    const state = await start(page([item]));
    for (let count = 0; count < 3; count++) {
        await state.elapse(8000);
        state.app._checkVideoStatus();
        await state.flush();
    }
    assert.equal(item.playRates.length, 3);
    assert.equal(state.app.inspectFlow().playbackStopped, true);
    assert.equal(state.app.inspectFlow().playbackConfirmed, false);
    state.assertNoAnswers();
});

await check('browser autoplay rejection stops retries and permits manual recovery', async () => {
    const item = video('blocked');
    const originalPlay = item.play.bind(item);
    let rejectedCalls = 0;
    item.play = () => {
        rejectedCalls++;
        const error = new Error('User gesture required');
        error.name = 'NotAllowedError';
        return Promise.reject(error);
    };
    const state = await start(page([item]));
    assert.equal(rejectedCalls, 1);
    assert.equal(state.timeouts.size, 0);
    assert.equal(state.app.inspectFlow().playbackStopped, true);
    assert.equal(state.app.inspectFlow().lastPlaybackError.name, 'NotAllowedError');
    item.play = originalPlay;
    await item.play();
    item.currentTime = 1;
    state.app._checkVideoStatus();
    assert.equal(state.app.inspectFlow().playbackStopped, false);
    assert.equal(state.app.inspectFlow().playbackConfirmed, true);
    state.assertNoAnswers();
});

await check('a pending media request is not duplicated and is cancelled on destroy', async () => {
    const item = video('pending');
    let calls = 0;
    item.play = () => { calls++; return new Promise(() => {}); };
    const state = await start(page([item]));
    await state.app.play();
    await state.app._tryResumePlayback('test');
    assert.equal(calls, 1);
    state.app.destroy();
    await state.flush();
    assert.equal(state.timeouts.size, 0);
    assert.equal(state.app._mediaRequest, null);
    state.assertNoAnswers();
});

await check('unsettled play promises time out and stop after bounded retries', async () => {
    const item = video('timeout');
    let calls = 0;
    item.play = () => { calls++; return new Promise(() => {}); };
    const state = await start(page([item]));
    for (let count = 0; count < 5; count++) await state.tick();
    assert.equal(calls, 3);
    assert.equal(state.timeouts.size, 0);
    assert.equal(state.app.inspectFlow().playbackStopped, true);
    assert.equal(state.app.inspectFlow().lastPlaybackError.name, 'TimeoutError');
    state.assertNoAnswers();
});

await check('background recovery waits until the page is visible again', async () => {
    const item = video('background');
    const root = page([item]);
    const state = await start(root);
    item.paused = true;
    root.visibilityState = 'hidden';
    await state.app._tryResumePlayback('test');
    assert.equal(item.playRates.length, 1);
    root.visibilityState = 'visible';
    await state.app._tryResumePlayback('test');
    assert.equal(item.playRates.length, 2);
    state.assertNoAnswers();
});

await check('focus events do not issue redundant requests during playback', async () => {
    const item = video('focus');
    const state = await start(page([item]));
    await state.app._tryResumePlayback('page-event');
    assert.equal(item.playRates.length, 1);
    state.assertNoAnswers();
});

await check('quiz extraction skips frames whose body has not loaded', async () => {
    const loading = page();
    loading.body = null;
    loading.createTreeWalker = () => { throw new Error('An empty body must not be passed to TreeWalker'); };
    const ready = page();
    let walked = 0;
    ready.createTreeWalker = (node) => {
        assert.equal(node, ready.body);
        walked++;
        return { nextNode: () => null };
    };
    const state = await start(page([video('first')], [frame(loading), frame(ready)]));
    assert.equal(state.app.inspectQuiz().length, 0);
    assert.equal(walked, 1);
    state.assertNoAnswers();
});

await check('one invalid question frame does not abort remaining frames', async () => {
    const invalid = page();
    invalid.createTreeWalker = () => { throw new TypeError('The body is no longer a Node'); };
    const ready = page();
    let walked = 0;
    ready.createTreeWalker = () => { walked++; return { nextNode: () => null }; };
    const state = await start(page([video('first')], [frame(invalid), frame(ready)]));
    assert.equal(state.app.inspectQuiz().length, 0);
    assert.equal(walked, 1);
    state.assertNoAnswers();
});

await check('homework frame is recognized before its body loads despite a stale video tab', async () => {
    const first = video('first');
    const homework = page();
    homework.body = null;
    const workFrame = frame(homework);
    workFrame.source = '/mooc-ans/work/doHomeWorkNew?api=1';
    const cards = frame(page([first]));
    const root = page([], [cards]);
    nextButton(root, () => { cards.child = page([], [workFrame]); });
    const state = await start(root);
    first.finish();
    await state.tick();
    await state.tick();
    const flow = state.app.inspectFlow();
    assert.equal(flow.step, '章节测验');
    assert.equal(flow.switching, false);
    assert.equal(flow.quiz.phase, '等待题目框架和提交按钮');
    assert.equal(flow.quiz.busy, true);
    assert.equal(state.app.inspectQuiz().length, 0);
    state.app.destroy();
    state.assertNoAnswers();
});

await check('homework navigation inside an unchanged iframe is detected from the document URL', async () => {
    const homework = page();
    homework.URL = 'https://mooc1.chaoxing.com/mooc-ans/work/doHomeWorkNew?api=1';
    const root = page([], [frame(homework)]);
    const state = await start(root);
    assert.equal(state.app.inspectFlow().step, '章节测验');
    assert.equal(state.app.inspectFlow().quiz.phase, '等待题目框架和提交按钮');
    state.app.destroy();
    state.assertNoAnswers();
});

await check('a stopped video does not prevent entry into a quiz', async () => {
    const item = video('blocked');
    item.play = () => {
        const error = new Error('User gesture required');
        error.name = 'NotAllowedError';
        return Promise.reject(error);
    };
    const root = page([item]);
    const state = await start(root);
    assert.equal(state.app.inspectFlow().playbackStopped, true);
    const workFrame = frame(page());
    workFrame.source = '/mooc-ans/work/doHomeWorkNew?api=1';
    workFrame.ownerDocument = root;
    root.videos = [];
    root.frames = [workFrame];
    await state.app.play();
    assert.equal(state.app.inspectFlow().quiz.phase, '等待题目框架和提交按钮');
    state.app.destroy();
    state.assertNoAnswers();
});

await check('a platform transition during the end delay enters the quiz without skipping it', async () => {
    const item = video('first');
    const root = page([item]);
    const next = nextButton(root, () => {});
    const state = await start(root);
    let entered = 0;
    state.app._advanceChapterTest = () => entered++;
    item.finish();
    const workFrame = frame(page());
    workFrame.source = '/mooc-ans/work/doHomeWorkNew?api=1';
    workFrame.ownerDocument = root;
    root.videos = [];
    root.frames = [workFrame];
    await state.tick();
    assert.equal(entered, 1);
    assert.equal(next.clicks, 0);
    state.assertNoAnswers();
});

await check('a quiz URL mentioned only in a query parameter is not mistaken for a quiz', async () => {
    const unrelated = frame(page());
    unrelated.source = '/video?next=/doHomeWorkNew';
    const state = await start(page([video('first')], [unrelated]));
    assert.equal(state.app.inspectFlow().step, '视频');
    state.assertNoAnswers();
});

await check('plain practice tab text enters quiz handling', async () => {
    const root = page();
    root.step = '练习';
    const state = await start(root);
    assert.equal(state.app.inspectFlow().step, '章节测验');
    assert.equal(state.app.inspectFlow().quiz.phase, '等待题目框架和提交按钮');
    state.app.destroy();
    state.assertNoAnswers();
});

await check('page-driven quiz navigation starts without click or ended events', async () => {
    const first = video('first');
    const root = page([first]);
    const state = await start(root);
    state.app._clearCheckInterval();
    const workFrame = frame(page());
    workFrame.source = '/mooc-ans/work/doHomeWorkNew?api=1';
    workFrame.ownerDocument = root;
    root.videos = [];
    root.frames = [workFrame];
    assert.equal(state.app.inspectFlow().quiz.phase, '未开始');
    await state.pollIntervals();
    assert.equal(state.app.inspectFlow().quiz.phase, '等待题目框架和提交按钮');
    assert.equal(state.app.inspectFlow().quiz.busy, true);
    assert.equal(state.app.inspectFlow().quiz.watcherActive, true);
    await state.pollIntervals();
    await state.pollIntervals();
    assert.equal(state.messages.filter((args) => String(args[0]).includes('已进入章节测验')).length, 1);
    assert.equal(state.timeouts.size, 1);
    state.app.destroy();
    state.assertNoAnswers();
});

await check('automatic takeover waits for an ongoing navigation to finish', async () => {
    const root = page([video('first')]);
    const state = await start(root);
    const workFrame = frame(page());
    workFrame.source = '/mooc-ans/work/doHomeWorkNew?api=1';
    workFrame.ownerDocument = root;
    root.videos = [];
    root.frames = [workFrame];
    state.app._nextUnitPending = true;
    await state.pollIntervals();
    assert.equal(state.app.inspectFlow().quiz.phase, '未开始');
    state.app._nextUnitPending = false;
    await state.pollIntervals();
    assert.equal(state.app.inspectFlow().quiz.busy, true);
    state.app.destroy();
    state.assertNoAnswers();
});

await check('a failed quiz is not retried by every watcher tick', async () => {
    const root = page([video('first')]);
    const state = await start(root);
    const workFrame = frame(page());
    workFrame.source = '/mooc-ans/work/doHomeWorkNew?api=1';
    workFrame.ownerDocument = root;
    root.videos = [];
    root.frames = [workFrame];
    await state.pollIntervals();
    for (let count = 0; count < 240; count++) await state.tick();
    assert.equal(state.app.inspectFlow().quiz.phase, '已停止');
    assert.equal(state.app.inspectFlow().quiz.busy, false);
    await state.pollIntervals();
    await state.pollIntervals();
    assert.equal(state.messages.filter((args) => String(args[0]).includes('已进入章节测验')).length, 1);
    state.app.destroy();
    state.assertNoAnswers();
});

await check('returning to a video prepares takeover for the next quiz', async () => {
    const root = page([video('first')]);
    const state = await start(root);
    state.app._quizState.phase = '测验已完成，进入下一步';
    await state.pollIntervals();
    assert.equal(state.app.inspectFlow().quiz.phase, '未开始');
    const workFrame = frame(page());
    workFrame.source = '/mooc-ans/work/doHomeWorkNew?api=1';
    workFrame.ownerDocument = root;
    root.videos = [];
    root.frames = [workFrame];
    await state.pollIntervals();
    assert.equal(state.app.inspectFlow().quiz.busy, true);
    state.app.destroy();
    state.assertNoAnswers();
});

await check('destroy removes the step watcher and prevents later takeover', async () => {
    const root = page([video('first')]);
    const state = await start(root);
    assert.equal(state.app.inspectFlow().quiz.watcherActive, true);
    state.app.destroy();
    assert.equal(state.intervalCount(), 0);
    assert.equal(state.app.inspectFlow().quiz.watcherActive, false);
    const workFrame = frame(page());
    workFrame.source = '/mooc-ans/work/doHomeWorkNew?api=1';
    workFrame.ownerDocument = root;
    root.videos = [];
    root.frames = [workFrame];
    await state.pollIntervals();
    assert.equal(state.app.inspectFlow().quiz.phase, '未开始');
    state.assertNoAnswers();
});

await check('rerunning the controller does not duplicate the step watcher', async () => {
    const state = await start(page([video('first')]));
    assert.equal(state.intervalCount(), 2);
    state.app.run();
    await state.flush();
    assert.equal(state.intervalCount(), 2);
    state.app.destroy();
    assert.equal(state.intervalCount(), 0);
    state.assertNoAnswers();
});

await check('all forty questions include unlettered text and symbol judgments', async () => {
    const doc = quizPage(fortyQuestions());
    const state = await start(doc);
    const questions = state.app.inspectQuiz();
    assert.equal(questions.length, 40);
    assert.deepEqual(Array.from(questions.slice(30), (item) => item.type), Array(10).fill('判断题'));
    assert.equal(questions[30].question, '第 31 道模拟题的完整题干');
    assert.deepEqual(Array.from(questions[35].options), ['A. 正确', 'B. 错误']);
    assert.equal(state.app.inspectFlow().quiz.expectedQuestions, 40);
    assert.equal(state.app.inspectFlow().quiz.recognizedByType['判断题'], 10);
    state.app.destroy();
    state.assertNoAnswers();
});

await check('forty answers are validated in four batches before selection or submission', async () => {
    const doc = quizPage(fortyQuestions());
    const requests = [];
    const state = await start(doc, {
        answerResponder: (questions) => {
            assert.equal(doc.chosen.length, 0, 'No options are selected while a batch is still pending');
            assert.equal(doc.submitClicks, 0);
            assert.deepEqual(questions.map((item) => item.id), [1,2,3,4,5,6,7,8,9,10]);
            requests.push(questions);
            return { ok: true, json: async () => ({
                answers: questions.map((item) => ({ id: item.id, letters: ['a'] })).reverse(),
            }) };
        },
    });
    for (let count = 0; count < 3; count++) await state.tick();
    await state.flush();
    assert.equal(requests.length, 4);
    assert.equal(state.mockAnswerRequests(), 4);
    assert.equal(doc.chosen.length, 1);
    assert.equal(doc.submitClicks, 0);
    for (let count = 0; count < 39; count++) await state.tick();
    assert.equal(doc.chosen.length, 40);
    assert.equal(doc.submitClicks, 0, 'The final selected option is verified before submitting');
    await state.tick();
    assert.equal(doc.submitClicks, 1);
    assert.deepEqual(doc.chosen.map((item) => item.id), Array.from({ length: 40 }, (_, index) => index + 1));
    assert.ok(doc.chosen.slice(30).every((item) => ['正确', '√'].includes(item.value)),
        'Canonical A clicks the true option even when the page puts false first');
    state.app.destroy();
});

await check('a failed second batch leaves all options and submission untouched', async () => {
    const doc = quizPage(fortyQuestions());
    const state = await start(doc, {
        answerResponder: (questions, call) => call === 2
            ? { ok: false, status: 502, json: async () => ({ error: '模拟批次失败' }) }
            : { ok: true, json: async () => ({ answers: questions.map((item) => ({ id: item.id, letters: ['A'] })) }) },
    });
    for (let count = 0; count < 3; count++) await state.tick();
    await state.flush();
    assert.equal(state.mockAnswerRequests(), 2);
    assert.equal(doc.chosen.length, 0);
    assert.equal(doc.submitClicks, 0);
    assert.equal(state.app.inspectFlow().quiz.phase, '已停止');
    assert.match(state.app.inspectFlow().quiz.lastError, /模拟批次失败/);
    state.app.destroy();
});

await check('invalid options in any batch prevent selection of earlier valid answers', async () => {
    const doc = quizPage(fortyQuestions());
    const state = await start(doc, {
        answerResponder: (questions, call) => ({ ok: true, json: async () => ({
            answers: questions.map((item) => ({ id: item.id, letters: [call === 2 ? 'Z' : 'A'] })),
        }) }) },
    );
    for (let count = 0; count < 3; count++) await state.tick();
    await state.flush();
    assert.equal(state.mockAnswerRequests(), 2);
    assert.equal(doc.chosen.length, 0);
    assert.equal(doc.submitClicks, 0);
    assert.match(state.app.inspectFlow().quiz.lastError, /不存在的选项/);
    state.app.destroy();
});

await check('recognizing thirty of forty questions still prevents all answer requests', async () => {
    const doc = quizPage(fortyQuestions().slice(0, 30), 40);
    const state = await start(doc);
    assert.equal(state.app.inspectFlow().quiz.recognizedQuestions, 30);
    assert.equal(state.app.inspectFlow().quiz.expectedQuestions, 40);
    for (let count = 0; count < 240; count++) await state.tick();
    assert.equal(state.app.inspectFlow().quiz.phase, '已停止');
    assert.equal(doc.chosen.length, 0);
    assert.equal(doc.submitClicks, 0);
    state.app.destroy();
    state.assertNoAnswers();
});

function mixedMockAnswers(questions, call = 1) {
    assert.equal(validQuestions(questions), true, 'Frontend payload must satisfy the real local service schema');
    return { ok: true, json: async () => ({ answers: questions.map((question) => question.type === '填空题'
        ? { id: question.id, blanks: Array.from({ length: question.blank_count }, (_, index) =>
            `答案${(call - 1) * 10 + question.id}-${index + 1}`) }
        : { id: question.id, letters: ['A'] }).reverse() }) };
}

async function finishMockQuiz(state, doc) {
    for (let count = 0; count < 300 && !doc.submitClicks && state.app.inspectFlow().quiz.phase !== '已停止'; count++) {
        await state.tick();
    }
}

await check('multiple blanks preserve inline prompt text and exclude old field values', async () => {
    const doc = quizPage([{ kind: '填空题', count: 3, controls: ['input', 'textarea', 'editable'],
        initialValues: ['用户旧答案', '', ''], fragments: ['前半题干', '中间题干', '后半题干', '末尾限定条件'] }]);
    const state = await start(doc);
    const questions = state.app.inspectQuiz();
    assert.equal(questions.length, 1);
    assert.equal(questions[0].blankCount, 3);
    assert.ok(questions[0].question.includes('[第1空]'));
    assert.ok(questions[0].question.includes('[第2空]'));
    assert.ok(questions[0].question.includes('[第3空]'));
    assert.ok(questions[0].question.includes('末尾限定条件'));
    assert.ok(!questions[0].question.includes('用户旧答案'));
    assert.equal(state.app.inspectFlow().quiz.totalBlanks, 3);
    state.app.destroy();
    state.assertNoAnswers();
});

await check('mixed question types fill every blank in order and dispatch form events', async () => {
    const doc = quizPage([{ kind: '单选题' }, { kind: '填空题', count: 3,
        controls: ['input', 'textarea', 'editable'] }, { kind: '判断题', symbols: true }]);
    const state = await start(doc, { answerResponder: mixedMockAnswers });
    await finishMockQuiz(state, doc);
    assert.equal(doc.submitClicks, 1);
    assert.equal(doc.fillInputs[0].value, '答案2-1');
    assert.equal(doc.fillInputs[1].value, '答案2-2');
    assert.equal(doc.fillInputs[2].textContent, '答案2-3');
    assert.equal(state.app.inspectFlow().quiz.filledBlanks, 3);
    assert.equal(doc.fieldEvents.filter((event) => event.type === 'input').length, 3);
    assert.equal(doc.fieldEvents.filter((event) => event.type === 'change').length, 3);
    state.app.destroy();
});

await check('missing blank answers stop before selecting or filling anything', async () => {
    const doc = quizPage([{ kind: '单选题' }, { kind: '填空题', count: 2 }]);
    const state = await start(doc, { answerResponder: (questions) => ({ ok: true, json: async () => ({
        answers: questions.map((q) => q.type === '填空题' ? { id: q.id, blanks: ['只有一空'] } : { id: q.id, letters: ['A'] }),
    }) }) });
    await finishMockQuiz(state, doc);
    assert.equal(doc.submitClicks, 0);
    assert.equal(doc.chosen.length, 0);
    assert.ok(doc.fillInputs.every((input) => input.value === ''));
    assert.match(state.app.inspectFlow().quiz.lastError, /数量不匹配/);
    state.app.destroy();
});

await check('an empty blank answer stops the entire quiz', async () => {
    const doc = quizPage([{ kind: '填空题', count: 2 }]);
    const state = await start(doc, { answerResponder: () => ({ ok: true, json: async () => ({
        answers: [{ id: 1, blanks: ['第一空', '  '] }],
    }) }) });
    await finishMockQuiz(state, doc);
    assert.equal(doc.submitClicks, 0);
    assert.ok(doc.fillInputs.every((input) => input.value === ''));
    assert.match(state.app.inspectFlow().quiz.lastError, /第 2 空答案为空/);
    state.app.destroy();
});

await check('field length limits are checked before any answer is applied', async () => {
    const doc = quizPage([{ kind: '单选题' }, { kind: '填空题', count: 1, maxLength: 2 }]);
    const state = await start(doc, { answerResponder: mixedMockAnswers });
    await finishMockQuiz(state, doc);
    assert.equal(doc.submitClicks, 0);
    assert.equal(doc.chosen.length, 0);
    assert.equal(doc.fillInputs[0].value, '');
    assert.match(state.app.inspectFlow().quiz.lastError, /长度限制/);
    state.app.destroy();
});

await check('a page that clears a written answer prevents submission', async () => {
    const doc = quizPage([{ kind: '填空题', count: 2, revertOnChange: true }]);
    const state = await start(doc, { answerResponder: mixedMockAnswers });
    await finishMockQuiz(state, doc);
    assert.equal(doc.submitClicks, 0);
    assert.match(state.app.inspectFlow().quiz.lastError, /未确认填写成功/);
    state.app.destroy();
});

await check('final verification catches a blank changed after its first check', async () => {
    const doc = quizPage([{ kind: '填空题', count: 2 }]);
    const state = await start(doc, { answerResponder: mixedMockAnswers });
    for (let count = 0; count < 3; count++) await state.tick();
    await state.tick();
    assert.equal(state.app.inspectFlow().quiz.filledBlanks, 1);
    doc.fillInputs[0].value = '被页面重置';
    await finishMockQuiz(state, doc);
    assert.equal(doc.submitClicks, 0);
    assert.match(state.app.inspectFlow().quiz.lastError, /填写结果未保留/);
    state.app.destroy();
});

await check('replaced input elements stop before selecting earlier choice answers', async () => {
    const doc = quizPage([{ kind: '单选题' }, { kind: '填空题', count: 2 }]);
    const state = await start(doc, { answerResponder: (questions, call) => {
        doc.fillInputs[0].isConnected = false;
        return mixedMockAnswers(questions, call);
    } });
    await finishMockQuiz(state, doc);
    assert.equal(doc.submitClicks, 0);
    assert.equal(doc.chosen.length, 0);
    assert.match(state.app.inspectFlow().quiz.lastError, /输入框数量、顺序或状态已变化/);
    state.app.destroy();
});

await check('known rich editors escape text and sync through their existing instances', async () => {
    for (const engine of ['ueditor', 'tinymce']) {
        const doc = quizPage([{ kind: '填空题', count: 1, controls: [engine] }]);
        const state = await start(doc, { answerResponder: () => ({ ok: true, json: async () => ({
            answers: [{ id: 1, blanks: ['<b>&纯文字答案'] }],
        }) }) });
        await finishMockQuiz(state, doc);
        assert.equal(doc.submitClicks, 1);
        assert.equal(doc.fillInputs[0].textContent, '<b>&纯文字答案');
        assert.ok(doc.fillInputs[0].editor.html.includes('&lt;b&gt;&amp;'));
        assert.equal(doc.editorSyncs, 1);
        state.app.destroy();
    }
});

await check('unknown rich editors are rejected before any AI request', async () => {
    const doc = quizPage([{ kind: '填空题', count: 1, controls: ['unknown-editor'] }]);
    const state = await start(doc);
    await finishMockQuiz(state, doc);
    assert.equal(doc.submitClicks, 0);
    assert.match(state.app.inspectFlow().quiz.lastError, /尚未适配或尚未加载/);
    state.app.destroy();
    state.assertNoAnswers();
});

await check('pending editor frames wait instead of reducing the blank count', async () => {
    const doc = quizPage([{ kind: '填空题', count: 2, controls: ['input', 'pending-editor'] }]);
    const state = await start(doc);
    await state.tick();
    assert.equal(state.app.inspectQuiz()[0].blankCount, 2);
    assert.equal(state.app.inspectFlow().quiz.phase, '等待填空输入框加载');
    assert.equal(state.app.inspectFlow().quiz.pendingBlanks, 1);
    assert.equal(doc.submitClicks, 0);
    state.app.destroy();
    state.assertNoAnswers();
});

await check('mixed fill answers keep their global IDs across batch boundaries', async () => {
    const specs = Array.from({ length: 12 }, (_, index) => index === 8 || index === 11
        ? { kind: '填空题', count: index === 8 ? 2 : 3 } : { kind: '单选题' });
    const doc = quizPage(specs);
    const state = await start(doc, { answerResponder: mixedMockAnswers });
    await finishMockQuiz(state, doc);
    assert.equal(state.mockAnswerRequests(), 2);
    assert.equal(doc.submitClicks, 1);
    assert.deepEqual(doc.fillInputs.map((input) => input.value), ['答案9-1', '答案9-2', '答案12-1', '答案12-2', '答案12-3']);
    state.app.destroy();
});

await check('local service schema accepts mixed blank and choice questions', async () => {
    const choice = { id: 1, type: '单选题', question: '模拟选择题', options: [{ letter: 'A', text: '甲' }, { letter: 'B', text: '乙' }] };
    const fill = { id: 2, type: '填空题', question: '[第1空]与[第2空]', blank_count: 2, options: [] };
    assert.equal(validQuestions([choice, fill]), true);
    assert.equal(validQuestions([choice, { ...fill, blank_count: 0 }]), false);
    assert.equal(validQuestions([choice, { ...fill, blank_count: 1.5 }]), false);
    assert.equal(validQuestions([choice, { ...fill, options: choice.options }]), false);
    assert.equal(validQuestions([choice, null]), false);
});

await check('real API request builder carries ordered blank counts and the dual response format', async () => {
    const questions = [{ id: 1, type: '填空题', question: '前[第1空]后[第2空]', blank_count: 2, options: [] }];
    let requests = 0;
    const answers = await requestAnswers(questions, 'local-test-key', async (_url, options) => {
        requests++;
        const body = JSON.parse(options.body);
        assert.match(body.messages[0].content, /blanks/);
        assert.match(body.messages[0].content, /不能合并、缺少或增加/);
        assert.deepEqual(JSON.parse(body.messages[1].content), questions);
        return { ok: true, json: async () => ({ choices: [{ finish_reason: 'stop', message: {
            content: JSON.stringify({ answers: [{ id: 1, blanks: ['甲', '乙'] }] }),
        } }] }) };
    });
    assert.equal(requests, 1);
    assert.deepEqual(answers, [{ id: 1, blanks: ['甲', '乙'] }]);
});

await check('UTF-8 JSON is preserved when every Chinese character crosses stream chunks', async () => {
    const questions = [{ id: 1, type: '填空题', question: '中文题干：[第1空]，补充符号😀', blank_count: 1, options: [] }];
    const bytes = Buffer.from(JSON.stringify({ questions }), 'utf8');
    const chunks = Array.from(bytes, (byte) => Buffer.from([byte]));
    const decoded = await readQuestionPayload(Readable.from(chunks));
    assert.deepEqual(decoded, questions);
    assert.equal(validQuestions(decoded), true);
});

await check('request decoding retains size checks and distinguishes invalid JSON', async () => {
    await assert.rejects(readQuestionPayload(Readable.from([Buffer.from('{broken,')])), /有效 JSON/);
    await assert.rejects(readQuestionPayload(Readable.from([Buffer.from('{"questions":[]}')]), 5), /请求内容过大/);
});

await check('format errors identify the failing question and field without including its text', async () => {
    const fill = { id: 1, type: '填空题', question: '不应回显的题干', options: [] };
    const missingBlank = questionFormatError([fill]);
    assert.match(missingBlank, /本批第 1 题.*blank_count/);
    assert.ok(!missingBlank.includes(fill.question));
    assert.match(questionFormatError([{ ...fill, blank_count: 1, question: '字'.repeat(501) }]), /长度 501/);
    assert.match(questionFormatError([{ ...fill, type: '填��题', blank_count: 1 }]), /不支持的 type/);
    assert.match(questionFormatError([{ id: 1, type: '单选题', question: '题干', options: [
        { letter: 'A', text: '一' }, { letter: 'A', text: '二' },
    ] }]), /字母 A 重复/);
});

await check('invalid question payloads never reach the API request builder', async () => {
    let requests = 0;
    await assert.rejects(requestAnswers([{ id: 1, type: '填空题', question: '题干', options: [] }],
        'local-test-key', async () => { requests++; }), /blank_count/);
    assert.equal(requests, 0);
});

await check('health metadata confirms the service version and supported protocol', async () => {
    const state = await start(page([video('first')]));
    assert.equal(state.app.inspectFlow().scriptVersion, SERVICE_VERSION);
    assert.equal(state.app.inspectFlow().service.version, SERVICE_VERSION);
    assert.equal(state.app.inspectFlow().service.protocolVersion, PROTOCOL_VERSION);
    state.app.destroy();
    state.assertNoAnswers();
});

await check('an unversioned old service stops startup before any answer request', async () => {
    const state = await start(page([video('first')]), { serviceInfo: { ok: true }, expectStarted: false });
    assert.equal(state.app, undefined);
    assert.equal(state.intervalCount(), 0);
    assert.ok(state.errors.some((args) => args.some((value) => String(value).includes('接口版本不匹配'))));
    state.assertNoAnswers();
});

await check('validation failures retain stage and private request-shape diagnostics', async () => {
    const doc = quizPage([{ kind: '填空题', count: 2 }]);
    const state = await start(doc, { answerResponder: () => ({ ok: false, status: 422, json: async () => ({
        error: '题目格式不正确：本批第 1 题：模拟字段错误', stage: 'validation', version: SERVICE_VERSION,
    }) }) });
    await finishMockQuiz(state, doc);
    const flow = state.app.inspectFlow();
    assert.match(flow.quiz.lastError, /validation/);
    assert.ok(flow.quiz.lastError.includes(`服务版本：${SERVICE_VERSION}`));
    assert.equal(flow.quiz.lastRequest[0].type, '填空题');
    assert.equal(flow.quiz.lastRequest[0].blankCount, 2);
    assert.equal(flow.quiz.lastRequest[0].question, undefined);
    assert.equal(doc.submitClicks, 0);
    assert.equal(doc.fillInputs[0].value, '');
    state.app.destroy();
});

await check('generated userscript uses the same workflow and only the top-level course entrypoints', async () => {
    const original = readFileSync(resolve(import.meta.dirname, '../deepseek-console/xuexitong-console.js'), 'utf8');
    const generated = readFileSync(resolve(import.meta.dirname, '../deepseek-console/xuexitong-deepseek.user.js'), 'utf8');
    assert.equal(generated, buildUserscript(original));
    assert.match(generated, /\/\/ @noframes\r?\n/);
    assert.match(generated, /\/\/ @grant\s+none/);
    assert.equal((generated.match(/\/\/ @match/g) || []).length, 2);
    assert.ok(!generated.includes('// @match        *://*/*'));
    assert.equal(generated.split('// ==/UserScript==\n\n')[1],
        original.replace("const RUN_MODE = 'console';", "const RUN_MODE = 'userscript';"));
    assert.throws(() => buildUserscript(original, '0.0.0'), /版本/);
});

await check('userscript starts without DevTools or the console keeper and cleans up its status timer', async () => {
    const state = await start(page([video('first')]), { userscript: true });
    assert.equal(state.app.inspectFlow().runMode, 'userscript');
    assert.equal(state.popupRequests(), 0);
    await state.pollIntervals();
    assert.match(state.visibleStatus(), /视频 1\/1 · 1 倍速/);
    assert.equal(state.mockAnswerRequests(), 0);
    state.app.destroy();
    assert.equal(state.intervalCount(), 0);
    assert.match(state.visibleStatus(), /脚本已停止/);
});

await check('a nested course frame cannot start a duplicate userscript controller', async () => {
    const state = await start(page([video('nested')]), { userscript: true, topFrame: false, expectStarted: false });
    assert.equal(state.app, undefined);
    assert.equal(state.intervalCount(), 0);
    assert.equal(state.popupRequests(), 0);
    assert.equal(state.visibleStatus(), '');
    state.assertNoAnswers();
});

await check('userscript shows a stale local token error on the page instead of silently waiting', async () => {
    const state = await start(page([video('first')]), { userscript: true, healthStatus: 403, expectStarted: false });
    assert.equal(state.app, undefined);
    assert.equal(state.intervalCount(), 0);
    assert.match(state.visibleStatus(), /本地连接令牌已更新/);
    assert.equal(state.popupRequests(), 0);
    state.assertNoAnswers();
});

await check('userscript displays quiz batches and failures without opening the console', async () => {
    const doc = quizPage([{ kind: '填空题', count: 2 }]);
    const state = await start(doc, { userscript: true, answerResponder: () => ({
        ok: false, status: 502, json: async () => ({ error: '模拟服务故障', stage: 'provider', version: SERVICE_VERSION }),
    }) });
    state.app._quizState.currentBatch = 2;
    state.app._quizState.totalBatches = 4;
    await state.pollIntervals();
    assert.match(state.visibleStatus(), /第 2\/4 批/);
    await finishMockQuiz(state, doc);
    await state.pollIntervals();
    assert.match(state.visibleStatus(), /已停止：.*模拟服务故障/);
    assert.equal(doc.submitClicks, 0);
    assert.equal(state.popupRequests(), 0);
    state.app.destroy();
    assert.equal(state.intervalCount(), 0);
});

await check('spaced and split type markers retain all questions without duplicate extraction', async () => {
    const doc = quizPage([{ kind: '单选题', marker: '【 单选题 】' },
        { kind: '判断题', splitMarker: true }, { kind: '填空题', count: 2, splitMarker: true }]);
    const state = await start(doc);
    const questions = state.app.inspectQuiz();
    assert.equal(questions.length, 3);
    assert.equal(questions[1].question, '第 2 道模拟题的完整题干');
    assert.equal(questions[2].blankCount, 2);
    assert.equal(state.app.inspectQuizDiagnostics().detectedTypeMarkers, 3);
    state.app.destroy();
    state.assertNoAnswers();
});

await check('five unsupported questions explain a thirty-five of forty mismatch without any answer request', async () => {
    const doc = quizPage([...Array.from({ length: 35 }, () => ({ kind: '单选题' })),
        ...Array.from({ length: 5 }, () => ({ kind: '简答题' }))]);
    const state = await start(doc);
    const report = state.app.inspectQuizDiagnostics();
    assert.equal(report.expectedQuestions, 40);
    assert.equal(report.recognizedQuestions, 35);
    assert.equal(report.detectedTypeMarkers, 40);
    assert.equal(report.unaccountedQuestions, 0);
    assert.deepEqual(Array.from(report.rejected, (item) => item.number), [36, 37, 38, 39, 40]);
    assert.ok(report.rejected.every((item) => item.type === '简答题' && /不支持/.test(item.reason)));
    for (let count = 0; count < 240; count++) await state.tick();
    assert.match(state.app.inspectFlow().quiz.lastError, /35\/40/);
    assert.equal(doc.chosen.length, 0);
    assert.equal(doc.submitClicks, 0);
    state.app.destroy();
    state.assertNoAnswers();
});

await check('diagnostics distinguish missing options, blank controls, and overlong prompts without including text', async () => {
    const secretStem = '不应出现在诊断中的题干内容';
    const doc = quizPage([{ kind: '单选题', title: secretStem, optionLabels: ['A. 甲', 'B. 乙'] },
        { kind: '填空题', count: 0, title: secretStem },
        { kind: '单选题', title: secretStem + '字'.repeat(510) }]);
    const state = await start(doc);
    const report = state.app.inspectQuizDiagnostics();
    assert.equal(report.recognizedQuestions, 0);
    assert.equal(report.rejected.length, 3);
    assert.match(report.rejected[0].reason, /有效选项/);
    assert.match(report.rejected[1].reason, /输入框/);
    assert.match(report.rejected[2].reason, /500/);
    const text = JSON.stringify(report);
    assert.ok(!text.includes(secretStem));
    assert.ok(!text.includes('LOCAL_TOKEN') && !text.includes('local-test-token'));
    state.app.destroy();
    state.assertNoAnswers();
});

await check('diagnostics identify questions with no discoverable type marker and preserve pending editor counts', async () => {
    const doc = quizPage([{ kind: '单选题', noTypeMarker: true },
        { kind: '填空题', count: 1, controls: ['pending-editor'] }]);
    const state = await start(doc);
    const report = state.app.inspectQuizDiagnostics();
    assert.equal(report.expectedQuestions, 2);
    assert.equal(report.recognizedQuestions, 1);
    assert.equal(report.unaccountedQuestions, 1);
    assert.equal(report.pendingEditors.length, 1);
    assert.equal(report.pendingEditors[0].pendingBlanks, 1);
    state.app.destroy();
    state.assertNoAnswers();
});

await check('the userscript diagnostic button opens selectable metadata without starting answer requests', async () => {
    const doc = quizPage([{ kind: '简答题', title: '不能导出的原始题目' }]);
    const state = await start(doc, { userscript: true });
    assert.match(state.visibleStatus(), /查看识题诊断/);
    state.openDiagnostics();
    const report = JSON.parse(state.visibleDiagnostics());
    assert.equal(report.rejected[0].type, '简答题');
    assert.equal(report.rejected[0].number, 1);
    assert.ok(!state.visibleDiagnostics().includes('不能导出的原始题目'));
    state.openDiagnostics();
    assert.equal(JSON.parse(state.visibleDiagnostics()).rejected.length, 1);
    state.app.destroy();
    state.assertNoAnswers();
});

await check('client-only recognition updates remain compatible with the running protocol two service', async () => {
    const state = await start(page([video('first')]), { serviceInfo: { ok: true, version: '4.7.1', protocolVersion: 2 } });
    assert.equal(state.app.inspectFlow().service.version, '4.7.1');
    assert.equal(state.app.inspectFlow().scriptVersion, SERVICE_VERSION);
    state.app.destroy();
    state.assertNoAnswers();
});

await check('all forty questions survive twelve deeply nested fill headings', async () => {
    const specs = [...Array.from({ length: 10 }, () => ({ kind: '单选题' })),
        ...Array.from({ length: 15 }, (_, index) => ({ kind: '填空题', count: 1,
            headingDepth: index < 3 ? 0 : 15, numberSeparate: true })),
        ...Array.from({ length: 5 }, () => ({ kind: '多选题' })),
        ...Array.from({ length: 10 }, () => ({ kind: '判断题' }))];
    const doc = quizPage(specs);
    const state = await start(doc);
    const report = state.app.inspectQuizDiagnostics();
    assert.equal(report.expectedQuestions, 40);
    assert.equal(report.recognizedQuestions, 40);
    assert.equal(report.recognizedByType['填空题'], 15);
    assert.equal(report.rejected.length, 0);
    assert.deepEqual(Array.from(report.recognized.slice(10, 25), (item) => item.number),
        Array.from({ length: 15 }, (_, index) => index + 11));
    state.app.destroy();
    state.assertNoAnswers();
});

await check('deeply nested adjacent fill cards keep their blanks and prompts separate', async () => {
    const doc = quizPage([{ kind: '填空题', count: 2, headingDepth: 14, numberSeparate: true, title: '甲题独立题干' },
        { kind: '填空题', count: 3, headingDepth: 16, numberSeparate: true, title: '乙题独立题干' }]);
    const state = await start(doc, { answerResponder: mixedMockAnswers });
    const questions = state.app.inspectQuiz();
    assert.deepEqual(Array.from(questions, (item) => item.blankCount), [2, 3]);
    assert.ok(questions[0].question.startsWith('甲题独立题干'));
    assert.ok(!questions[0].question.includes('乙题独立题干'));
    assert.ok(!questions[1].question.includes('甲题独立题干'));
    await finishMockQuiz(state, doc);
    assert.equal(doc.submitClicks, 1);
    assert.deepEqual(doc.fillInputs.map((input) => input.value), ['答案1-1', '答案1-2', '答案2-1', '答案2-2', '答案2-3']);
    state.app.destroy();
});

await check('plaintext-only editable fields are filled and verified alongside native controls', async () => {
    const doc = quizPage([{ kind: '填空题', count: 2, controls: ['plaintext-only', 'input'], headingDepth: 12 }]);
    const state = await start(doc, { answerResponder: mixedMockAnswers });
    assert.deepEqual(Array.from(state.app.inspectQuiz()[0].inputKinds), ['editable', 'control']);
    await finishMockQuiz(state, doc);
    assert.equal(doc.submitClicks, 1);
    assert.equal(doc.fillInputs[0].textContent, '答案1-1');
    assert.equal(doc.fillInputs[1].value, '答案1-2');
    state.app.destroy();
});

await check('filtered fill controls explain their state without exposing old answers or crossing question boundaries', async () => {
    const doc = quizPage(['readonly', 'disabled', 'hidden', 'not-editable'].map((control) => ({
        kind: '填空题', count: 1, controls: [control], headingDepth: 13,
        initialValues: ['私密旧答案'], title: '不应导出的真实题干',
    })));
    const state = await start(doc);
    const report = state.app.inspectQuizDiagnostics();
    assert.equal(report.recognizedQuestions, 0);
    assert.deepEqual(Array.from(report.rejected, (item) => item.position), [1, 2, 3, 4]);
    const controls = report.rejected.map((item) => item.blankDiscovery.controls);
    assert.ok(controls[0].some((item) => item.readOnly));
    assert.ok(controls[1].some((item) => item.disabled));
    assert.ok(controls[2].some((item) => item.visible === false));
    assert.ok(controls[3].some((item) => item.contentEditable === 'false' && !item.isContentEditable));
    assert.ok(report.rejected.every((item) => item.blankDiscovery.ancestorsSearched > 9));
    const text = JSON.stringify(report);
    assert.ok(!text.includes('私密旧答案') && !text.includes('不应导出的真实题干') && !text.includes('local-test-token'));
    state.app.destroy();
    state.assertNoAnswers();
});

await check('excessive heading depth stops at the bounded discovery limit', async () => {
    const doc = quizPage([{ kind: '填空题', count: 1, headingDepth: 75 }]);
    const state = await start(doc);
    const report = state.app.inspectQuizDiagnostics();
    assert.equal(report.recognizedQuestions, 0);
    assert.equal(report.rejected[0].blankDiscovery.ancestorsSearched, 64);
    assert.equal(report.rejected[0].blankDiscovery.stopReason, 'depth-limit');
    state.app.destroy();
    state.assertNoAnswers();
});

await check('registered hidden UEditor frames recover the five missing multi-blank questions', async () => {
    const missing = new Set([16, 18, 20, 21, 25]);
    const specs = [...Array.from({ length: 15 }, () => ({ kind: '单选题' })),
        ...Array.from({ length: 10 }, (_, index) => ({ kind: '填空题',
            count: missing.has(index + 16) ? index + 16 === 20 ? 3 : 2 : 1,
            controls: Array(3).fill('ueditor'), hideEditors: missing.has(index + 16) })),
        ...Array.from({ length: 7 }, () => ({ kind: '多选题' })),
        ...Array.from({ length: 8 }, () => ({ kind: '判断题' }))];
    const doc = quizPage(specs);
    const state = await start(doc);
    const report = state.app.inspectQuizDiagnostics();
    assert.equal(report.recognizedQuestions, 40);
    assert.equal(report.recognizedByType['填空题'], 10);
    assert.equal(report.pendingEditors.length, 0);
    assert.deepEqual(Array.from(report.recognized.filter((item) => missing.has(item.number)), (item) => item.blankCount), [2, 2, 3, 2, 2]);
    assert.equal(state.app.inspectFlow().quiz.totalBlanks, 16);
    state.app.destroy();
    state.assertNoAnswers();
});

await check('hidden UEditor blanks use distinct registered instances and sync each form field', async () => {
    const doc = quizPage([{ kind: '填空题', count: 2, controls: ['ueditor', 'ueditor'], hideEditors: true },
        { kind: '填空题', count: 3, controls: ['ueditor', 'ueditor', 'ueditor'], hideEditors: true }]);
    const state = await start(doc, { answerResponder: mixedMockAnswers });
    assert.deepEqual(Array.from(state.app.inspectQuiz(), (item) => item.blankCount), [2, 3]);
    await finishMockQuiz(state, doc);
    assert.equal(doc.submitClicks, 1);
    assert.equal(doc.editorSyncs, 5);
    assert.deepEqual(doc.fillInputs.map((input) => input.innerText), ['答案1-1', '答案1-2', '答案2-1', '答案2-2', '答案2-3']);
    assert.ok(doc.fillInputs.every((input) => input.editor.textarea.value === input.editor.getContent()));
    state.app.destroy();
});

await check('one visible blank cannot hide an unregistered UEditor blank from completeness checks', async () => {
    const doc = quizPage([{ kind: '填空题', count: 2, controls: ['ueditor', 'ueditor'], hiddenEditors: [false, true] }]);
    const editor = doc.fillInputs[1].editor;
    for (const [key, value] of Object.entries(doc.defaultView.UE.instants)) if (value === editor) delete doc.defaultView.UE.instants[key];
    const state = await start(doc);
    const report = state.app.inspectQuizDiagnostics();
    assert.equal(report.recognizedQuestions, 1);
    assert.equal(report.recognized[0].blankCount, 2);
    assert.equal(report.pendingEditors[0].pendingBlanks, 1);
    assert.match(report.pendingEditors[0].pendingReasons[0].reason, /注册/);
    for (let count = 0; count < 240; count++) await state.tick();
    assert.equal(doc.submitClicks, 0);
    state.app.destroy();
    state.assertNoAnswers();
});

await check('hidden editor readiness and source mode are enforced before any request', async () => {
    for (const options of [{ editorReady: false }, { editorReady: 0 }, { sourceMode: true }, { editorReadonly: true }]) {
        const doc = quizPage([{ kind: '填空题', count: 2, controls: ['ueditor', 'ueditor'], hideEditors: true, ...options }]);
        const state = await start(doc);
        assert.equal(state.app.inspectQuizDiagnostics().pendingEditors[0].pendingBlanks, 2);
        assert.equal(doc.submitClicks, 0);
        state.app.destroy();
        state.assertNoAnswers();
    }
});

await check('replacing a registered editor while answers are pending prevents all selection and writing', async () => {
    const doc = quizPage([{ kind: '单选题' }, { kind: '填空题', count: 1, controls: ['ueditor'], hideEditors: true }]);
    const state = await start(doc, { answerResponder: (questions) => {
        const key = Object.keys(doc.defaultView.UE.instants)[0];
        doc.defaultView.UE.instants[key] = { ...doc.defaultView.UE.instants[key] };
        return mixedMockAnswers(questions);
    } });
    await finishMockQuiz(state, doc);
    assert.equal(doc.submitClicks, 0);
    assert.equal(doc.chosen.length, 0);
    assert.equal(doc.editorSyncs, 0);
    assert.match(state.app.inspectFlow().quiz.lastError, /状态已变化/);
    state.app.destroy();
});

await check('failed UEditor sync prevents submission even when editor text was filled', async () => {
    const doc = quizPage([{ kind: '填空题', count: 1, controls: ['ueditor'], hideEditors: true, dropEditorSync: true }]);
    const state = await start(doc, { answerResponder: mixedMockAnswers });
    await finishMockQuiz(state, doc);
    assert.equal(doc.submitClicks, 0);
    assert.match(state.app.inspectFlow().quiz.lastError, /未同步/);
    state.app.destroy();
});

await check('hidden rich text preserves line breaks and escaped plain text during readback', async () => {
    const doc = quizPage([{ kind: '填空题', count: 1, controls: ['ueditor'], hideEditors: true }]);
    const answer = '<第一行>&\n第二行';
    const state = await start(doc, { answerResponder: () => ({ ok: true,
        json: async () => ({ answers: [{ id: 1, blanks: [answer] }] }) }) });
    await finishMockQuiz(state, doc);
    assert.equal(doc.submitClicks, 1);
    assert.equal(doc.fillInputs[0].innerText, answer);
    state.app.destroy();
});

await check('duplicate aliases are deduplicated but ambiguous editor instances remain pending', async () => {
    for (const ambiguous of [false, true]) {
        const doc = quizPage([{ kind: '填空题', count: 1, controls: ['ueditor'], hideEditors: true }]);
        const editor = doc.fillInputs[0].editor;
        doc.defaultView.UE.instants.alias = ambiguous ? { ...editor } : editor;
        const state = await start(doc);
        const report = state.app.inspectQuizDiagnostics();
        assert.equal(report.pendingEditors.length, ambiguous ? 1 : 0);
        assert.equal(report.recognized[0].blankCount, 1);
        state.app.destroy();
        state.assertNoAnswers();
    }
});

await check('replacing an editor submission field while waiting prevents all UI writes', async () => {
    const doc = quizPage([{ kind: '单选题' }, { kind: '填空题', count: 1, controls: ['ueditor'], hideEditors: true }]);
    const state = await start(doc, { answerResponder: (questions) => {
        const editor = doc.fillInputs[0].editor;
        editor.textarea = { ...editor.textarea, value: '' };
        return mixedMockAnswers(questions);
    } });
    await finishMockQuiz(state, doc);
    assert.equal(doc.chosen.length, 0);
    assert.equal(doc.editorSyncs, 0);
    assert.equal(doc.submitClicks, 0);
    assert.match(state.app.inspectFlow().quiz.lastError, /状态已变化/);
    state.app.destroy();
});

await check('both official numeric and boolean UEditor ready flags permit complete multi-blank submission', async () => {
    for (const flag of [1, true]) {
        const doc = quizPage([{ kind: '填空题', count: 2, controls: ['ueditor', 'ueditor'], hideEditors: true, editorReady: flag }]);
        const state = await start(doc, { answerResponder: mixedMockAnswers });
        assert.equal(state.app.inspectQuizDiagnostics().pendingEditors.length, 0);
        await finishMockQuiz(state, doc);
        assert.equal(doc.submitClicks, 1);
        assert.equal(doc.editorSyncs, 2);
        state.app.destroy();
    }
});

await check('undefined and string readiness flags remain pending and report their type without string contents', async () => {
    for (const flag of [undefined, 'not-a-ready-flag']) {
        const doc = quizPage([{ kind: '填空题', count: 1, controls: ['ueditor'], hideEditors: true }]);
        doc.fillInputs[0].editor.isReady = flag;
        const state = await start(doc);
        const report = state.app.inspectQuizDiagnostics();
        assert.equal(report.pendingEditors[0].pendingBlanks, 1);
        const info = report.pendingEditors[0].blankDiscovery.controls.find((control) => control.tag === 'IFRAME');
        assert.equal(info.readyState.type, typeof flag);
        assert.equal(info.readyState.value, null);
        assert.ok(!JSON.stringify(report).includes('not-a-ready-flag'));
        state.app.destroy();
        state.assertNoAnswers();
    }
});

await check('zero readiness on a visible UEditor also blocks premature answer requests', async () => {
    const doc = quizPage([{ kind: '填空题', count: 1, controls: ['ueditor'], editorReady: 0 }]);
    const state = await start(doc);
    assert.equal(state.app.inspectQuizDiagnostics().pendingEditors[0].pendingBlanks, 1);
    state.app.destroy();
    state.assertNoAnswers();
});

console.log(`DeepSeek flow: ${checks} behavior checks passed; no external API calls.`);
