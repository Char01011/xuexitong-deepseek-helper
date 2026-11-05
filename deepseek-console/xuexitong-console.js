(function xuexitongMain() {
const PAGE = window;
const $ = (...args) => PAGE.jQuery(...args);
const APP_KEY = '__xuexitongConsoleDeepSeek';
const BOOT_TIMER_KEY = '__xuexitongConsoleDeepSeekBootTimer';
const RUN_MODE = 'console';
const SCRIPT_VERSION = '4.7.5';
const LOCAL_URL = 'http://127.0.0.1:37841';
const LOCAL_TOKEN = '__LOCAL_TOKEN__';
const startedByKeeper = PAGE.__xuexitongAutoInjected === true;
delete PAGE.__xuexitongAutoInjected;
if (RUN_MODE === 'userscript' && PAGE !== PAGE.top) return;
if (!/^https:\/\/([a-z0-9-]+\.)*chaoxing\.com$/i.test(location.origin) ||
!location.pathname.includes('/mycourse/studentstudy')) {
console.error('请在学习通课程播放页的控制台执行本脚本');
return;
}
if (LOCAL_TOKEN === '__LOCAL_TOKEN__') {
console.error('请先启动 DeepSeek 本地服务，再更新油猴脚本或复制新的 xuexitong-console.js');
showUserscriptStatus('请先启动本地服务，再将生成的油猴脚本重新保存到油猴中。', true);
return;
}

const previousApp = PAGE[APP_KEY];
if (previousApp && typeof previousApp.destroy === 'function') {
previousApp.destroy();
}
if (PAGE.__xuexitongPlayerV3 && typeof PAGE.__xuexitongPlayerV3.destroy === 'function') {
PAGE.__xuexitongPlayerV3.destroy();
}
if (PAGE.__xuexitongPlayerV4DeepSeek && typeof PAGE.__xuexitongPlayerV4DeepSeek.destroy === 'function') {
PAGE.__xuexitongPlayerV4DeepSeek.destroy();
}
if (PAGE[BOOT_TIMER_KEY]) {
clearInterval(PAGE[BOOT_TIMER_KEY]);
PAGE[BOOT_TIMER_KEY] = null;
}
delete PAGE.__xuexitongServiceInfo;
PAGE.__xuexitongUserscriptActive = RUN_MODE === 'userscript';
showUserscriptStatus('正在连接本地服务…');
if (RUN_MODE === 'console' && !startedByKeeper) installNavigationKeeper();
fetch(`${LOCAL_URL}/health`, {
headers: { 'X-Xuexitong-Token': LOCAL_TOKEN },
signal: AbortSignal.timeout(5000),
}).then(async (response) => {
if (!response.ok) throw new Error(response.status === 403
? '本地连接令牌已更新，请从本次启动的服务目录重新导入油猴脚本或复制控制台脚本'
: `HTTP ${response.status}`);
const service = await response.json();
if (service.protocolVersion !== 2) throw new Error(`本地服务接口版本不匹配：当前服务版本 ${service.version || '未标注（旧版）'}，接口版本 ${service.protocolVersion ?? '未标注'}，需要接口版本 2。请关闭占用 37841 的旧服务窗口，从新版目录重启，看到“服务版本：${SCRIPT_VERSION}”后再更新油猴脚本或复制 JS`);
PAGE.__xuexitongServiceInfo = { version: service.version, protocolVersion: service.protocolVersion,
supportedTypes: service.supportedTypes || [] };
console.log(`DeepSeek 本地服务已连接，服务版本：${service.version}`);
showUserscriptStatus('本地服务已连接，正在等待课程目录…');
if (typeof PAGE.jQuery === 'undefined') {
const script = document.createElement('script');
script.src = 'https://code.jquery.com/jquery-3.6.0.min.js';
script.type = 'text/javascript';
script.onload = function () {
console.log('jQuery loaded.');
waitForCoursePage();
};
script.onerror = () => {
console.error('jQuery 加载失败，脚本无法启动');
showUserscriptStatus('jQuery 加载失败，请检查网络后刷新课程页。', true);
};
document.head.appendChild(script);
} else {
waitForCoursePage();
}
}).catch((error) => {
console.error('DeepSeek 启动未完成:', error);
showUserscriptStatus(`启动未完成：${error.message || error}`, true);
});

function showUserscriptStatus(message, isError = false) {
if (RUN_MODE !== 'userscript') return;
let panel = document.getElementById('xuexitong-deepseek-status');
if (panel && (!panel._message || !panel._diagnosticButton)) {
panel.remove();
panel = null;
}
if (!panel) {
panel = document.createElement('div');
panel.id = 'xuexitong-deepseek-status';
panel.setAttribute('role', 'status');
panel.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:2147483647;max-width:350px;padding:10px 14px;border:1px solid #ccc;border-radius:8px;background:rgba(255,255,255,.94);font:13px/1.6 sans-serif;white-space:pre-wrap;pointer-events:none;box-shadow:0 2px 8px #0002';
panel._message = document.createElement('div');
panel._message.style.cssText = 'max-height:150px;overflow:auto;pointer-events:auto';
panel.appendChild(panel._message);
panel._diagnosticButton = document.createElement('button');
panel._diagnosticButton.textContent = '查看识题诊断';
panel._diagnosticButton.type = 'button';
panel._diagnosticButton.style.cssText = 'pointer-events:auto;cursor:pointer;margin-top:8px;padding:4px 8px;font:13px sans-serif';
panel._diagnosticButton.onclick = showUserscriptQuizDiagnostics;
panel.appendChild(panel._diagnosticButton);
document.body.appendChild(panel);
}
panel.style.color = isError ? '#a21919' : '#234';
panel._message.textContent = `学习通 DeepSeek V${SCRIPT_VERSION}\n${message}`;
panel._diagnosticButton.disabled = typeof PAGE[APP_KEY]?.inspectQuizDiagnostics !== 'function';
}

function showUserscriptQuizDiagnostics() {
try {
const report = PAGE[APP_KEY].inspectQuizDiagnostics();
let viewer = document.getElementById('xuexitong-deepseek-diagnostics');
if (!viewer) {
viewer = document.createElement('div');
viewer.id = 'xuexitong-deepseek-diagnostics';
viewer.style.cssText = 'position:fixed;top:20px;right:20px;z-index:2147483647;width:480px;max-width:90vw;padding:16px;border:1px solid #aaa;border-radius:8px;background:white;color:#234;font:14px/1.6 sans-serif;box-shadow:0 3px 15px #0003';
const label = document.createElement('div');
label.textContent = '识题诊断：点击下方文本，Ctrl+A、Ctrl+C 复制后发回聊天。内容仅含题号、题型和失败原因。';
viewer.appendChild(label);
viewer._text = document.createElement('textarea');
viewer._text.readOnly = true;
viewer._text.style.cssText = 'display:block;width:100%;height:320px;margin:10px 0;box-sizing:border-box;font:12px/1.5 monospace;color:#234;background:white';
viewer.appendChild(viewer._text);
const close = document.createElement('button');
close.type = 'button';
close.textContent = '关闭诊断';
close.onclick = () => viewer.remove();
viewer.appendChild(close);
document.body.appendChild(viewer);
}
viewer._text.value = JSON.stringify(report, null, 2);
viewer._text.focus();
viewer._text.select();
} catch (error) {
showUserscriptStatus(`读取识题诊断失败：${error.message || error}`, true);
}
}

function watchUserscriptStatus(app) {
if (RUN_MODE !== 'userscript') return;
const update = () => {
try {
const flow = app.inspectFlow();
const quiz = flow.quiz;
const failure = quiz?.lastError || (flow.playbackStopped && flow.lastPlaybackError);
let message;
if (failure) message = `已停止：${failure.message || failure}`;
else if (flow.switching) message = '正在切换学习步骤…';
else if (flow.step === '章节测验') message = [quiz.phase,
`已识别 ${quiz.recognizedQuestions}/${quiz.expectedQuestions ?? '?'} 题`,
quiz.pendingBlanks ? `仍有 ${quiz.pendingBlanks} 空等待编辑器就绪` : '',
quiz.totalBatches ? `答案请求：第 ${quiz.currentBatch}/${quiz.totalBatches} 批` : ''].filter(Boolean).join('\n');
else if (flow.player) message = `视频 ${flow.activeVideo}/${flow.visibleVideos} · ${flow.player.rate} 倍速\n${flow.player.paused ? '等待播放' : '正在播放'}`;
else message = `${flow.step || '课程'}：等待内容加载…`;
showUserscriptStatus(message, Boolean(failure));
} catch (error) {
showUserscriptStatus(`状态读取失败：${error.message || error}`, true);
}
};
const timer = setInterval(update, 2000);
const destroy = app.destroy.bind(app);
app.destroy = () => {
clearInterval(timer);
destroy();
showUserscriptStatus('脚本已停止');
};
update();
}

function installNavigationKeeper() {
let keeper;
try {
keeper = PAGE.open('', 'xuexitongConsoleKeeper', 'width=360,height=150');
if (!keeper) throw new Error('浏览器阻止了辅助窗口');
keeper.document.title = '学习通自动任务辅助窗口';
keeper.document.body.innerHTML = '<p style="font:16px sans-serif;padding:12px">学习通自动任务正在运行。请保持此窗口打开；课程页整页跳转后，它会重新启动脚本。</p>';
keeper.__xuexitongSource = `(${xuexitongMain.toString()})();`;
keeper.__xuexitongLastUrl = location.href;
keeper.__xuexitongLastInjectionAt = Date.now();
if (!keeper.__xuexitongKeeperTimer) {
keeper.eval(`window.__xuexitongKeeperTimer = setInterval(${navigationKeeperTick.toString()}, 1000);`);
}
keeper.blur();
PAGE.focus();
console.log('整页跳转辅助窗口已启动；请保持它打开');
} catch (error) {
console.warn('整页跳转后无法自动重新启动脚本；请允许此站点打开弹出窗口，或在新页面重新粘贴脚本。', error);
}
}
function navigationKeeperTick() {
try {
const page = window.opener;
if (!page || page.closed) {
clearInterval(window.__xuexitongKeeperTimer);
window.close();
return;
}
let href;
let courseDocument;
try {
href = page.location.href;
courseDocument = page.document;
} catch (error) {
if (error.name !== 'SecurityError' && !/cross-origin|Blocked a frame/i.test(error.message || '')) throw error;
if (window.__xuexitongKeeperStatus !== 'waiting-origin') {
window.__xuexitongKeeperStatus = 'waiting-origin';
window.document.body.textContent = '课程页暂时无法被辅助窗口访问。返回可访问的原课程页后会自动恢复；如果页面持续受跨域限制，请关闭本窗口，改用 DeepSeek 油猴入口。';
}
return;
}
if (page.__xuexitongUserscriptActive) {
clearInterval(window.__xuexitongKeeperTimer);
window.close();
return;
}
if (window.__xuexitongKeeperStatus !== 'running' && window.__xuexitongKeeperStatus !== 'error') {
window.__xuexitongKeeperStatus = 'running';
window.document.body.textContent = '学习通自动任务正在运行。请保持本窗口打开；同源课程页整页跳转后会重新启动脚本。';
}
if (!/^https:\/\/([a-z0-9-]+\.)*chaoxing\.com\/(?:mooc2-ans\/)?mycourse\/studentstudy(?:[?#]|$)/i.test(href)) return;
if (href !== window.__xuexitongLastUrl) {
window.__xuexitongLastUrl = href;
window.__xuexitongLastInjectionAt = Date.now() - 30000;
}
if (courseDocument.readyState !== 'complete' || !courseDocument.querySelector('#coursetree')) return;
if (page.__xuexitongConsoleDeepSeek || page.__xuexitongConsoleDeepSeekBootTimer) return;
if (Date.now() - window.__xuexitongLastInjectionAt < 30000) return;
window.__xuexitongLastInjectionAt = Date.now();
page.__xuexitongAutoInjected = true;
page.eval(window.__xuexitongSource);
window.__xuexitongKeeperStatus = 'running';
window.document.body.textContent = '学习通自动任务正在运行。请保持本窗口打开；同源课程页整页跳转后会重新启动脚本。';
} catch (error) {
if (Date.now() - (window.__xuexitongLastErrorAt || 0) > 30000) {
window.__xuexitongLastErrorAt = Date.now();
window.__xuexitongKeeperStatus = 'error';
window.document.body.textContent = '整页跳转后的自动恢复遇到错误：' + error.message;
console.warn('学习通整页跳转后的自动恢复暂不可用:', error);
}
}
}
function waitForCoursePage() {
let attempts = 0;
const maxAttempts = 20;
PAGE[BOOT_TIMER_KEY] = setInterval(() => {
if ($('#coursetree').length > 0) {
clearInterval(PAGE[BOOT_TIMER_KEY]);
PAGE[BOOT_TIMER_KEY] = null;
initializePlayer();
return;
}
attempts++;
if (attempts >= maxAttempts) {
clearInterval(PAGE[BOOT_TIMER_KEY]);
PAGE[BOOT_TIMER_KEY] = null;
console.error('%c脚本启动超时：未检测到课程目录（#coursetree）。请确认当前处于课程播放页。', 'color:#F44336;font-weight:bold');
showUserscriptStatus('未检测到课程目录，请回到包含左侧章节目录的课程页。', true);
}
}, 1000);
}
function isCourseElementVisible(el) {
return Boolean(el && el.isConnected && el.getClientRects().length &&
el.ownerDocument.defaultView.getComputedStyle(el).visibility !== 'hidden');
}

function scanCourseContent() {
const documents = [];
const frames = [];
const videos = [];
const visit = (doc, depth) => {
if (!doc || depth > 8 || documents.includes(doc)) return;
documents.push(doc);
for (const item of doc.querySelectorAll('video, iframe, frame')) {
if (!isCourseElementVisible(item)) continue;
if (item.tagName === 'VIDEO') {
videos.push(item);
continue;
}
const frame = item;
const state = { element: frame, source: frame.getAttribute('src') || '', document: null };
frames.push(state);
try {
state.document = frame.contentDocument || frame.contentWindow?.document || null;
visit(state.document, depth + 1);
} catch (_) { /* Inaccessible frames do not prevent searching their siblings. */ }
}
};
visit(document, 0);
return { documents, frames, videos };
}

function isCourseQuizUrl(value) {
if (!value) return false;
try {
return /(?:^|\/)doHomeWork(?:New)?\/?$/i.test(new URL(value, location.href).pathname);
} catch (_) { return false; }
}

function attachQuizAutomation(app) {
const attemptedQuizzes = new Set();
let quizBusy = false;
let quizRunId = 0;
let stopped = false;
let navigationBusy = false;
let stepWatcher = null;
const originalDestroy = app.destroy.bind(app);
app._quizState = { phase: '未开始', recognizedQuestions: 0, expectedQuestions: null,
recognizedByType: {}, recognitionIssues: [], totalBlanks: 0, pendingBlanks: 0, filledBlanks: 0, currentBatch: 0, totalBatches: 0, lastRequest: null, lastError: null };
const quizState = (phase, fields = {}) => Object.assign(app._quizState, { phase }, fields);
app.destroy = function () {
stopped = true;
if (stepWatcher) clearInterval(stepWatcher);
stepWatcher = null;
originalDestroy();
};

const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const visible = isCourseElementVisible;
const kindPattern = /[\[【]\s*(单选题|多选题|判断题|填空题)\s*[\]】]/;
const typeMarkerPattern = /[\[【]\s*(单选题|多选题|判断题|填空题|简答题|论述题|计算题|名词解释|阅读理解题?|完形填空题?|材料分析题|分析题|综合题|连线题|排序题|文件作答题?|其他题|其它题)\s*[\]】]/;
const toolbarSelector = '.edui-toolbar,.tox-toolbar,.tox-toolbar__primary,.mce-toolbar,.cke_top,.cke_bottom,.w-e-toolbar';
const blankControlSelector = 'input,textarea,[contenteditable],iframe';
const answerText = (value) => String(value ?? '').replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ').trim();

function courseDocuments() {
return scanCourseContent().documents;
}

function quizCompleted() {
const scoreShown = courseDocuments().some((doc) => {
const text = clean(doc.body?.innerText);
const hasGrade = /本次成绩\s*\d+(?:\.\d+)?\s*分/.test(text);
return hasGrade && (/章节测验\s*已完成/.test(text) || /我的答案\s*[:：]/.test(text));
});
if (scoreShown) return true;
const cardsFrame = Array.from(document.querySelectorAll('iframe[src*="/knowledge/cards"]'))
.find((frame) => frame.getClientRects().length > 0);
const isQuizStep = cardsFrame && new URL(cardsFrame.getAttribute('src'), location.href).searchParams.get('num') === '1';
return Boolean(isQuizStep && document.querySelector('.posCatalog_active .icon_Completed'));
}

function judgmentMeaning(value) {
const text = clean(value).replace(/^[A-H](?:[.、．:：]|\s+)\s*/, '')
.replace(/[\s()（）\[\]【】]/g, '');
if (/^(?:正确|对|√|✓|✔|true|T)$/i.test(text)) return 'A';
if (/^(?:错误|错|×|✕|✗|✘|false|F)$/i.test(text)) return 'B';
return null;
}

function judgmentOptions(card) {
const candidates = { A: new Set(), B: new Set() };
for (const element of card.querySelectorAll('span,div,label,li,p,b,i,strong,a,button,input')) {
if (!visible(element)) continue;
const letter = judgmentMeaning(element.innerText || element.textContent || element.value ||
element.getAttribute('aria-label') || element.getAttribute('title'));
if (!letter) continue;
let target = element;
for (let depth = 0; depth < 5; depth++) {
const parent = target.parentElement;
if (!parent || parent === card || judgmentMeaning(parent.innerText || parent.textContent) !== letter) break;
target = parent;
}
candidates[letter].add(target);
}
const distance = (left, right) => {
const ancestors = new Map();
for (let node = left, depth = 0; node && depth < 15; node = node.parentElement, depth++) {
ancestors.set(node, depth);
if (node === card) break;
}
for (let node = right, depth = 0; node && depth < 15; node = node.parentElement, depth++) {
if (ancestors.has(node)) return ancestors.get(node) + depth;
if (node === card) break;
}
return Infinity;
};
const interactive = (element) => Number(element.matches('input,label,button,a,li,[role="radio"],[role="checkbox"]') ||
Boolean(element.querySelector('input')));
let best = null;
let bestScore = -Infinity;
for (const yes of candidates.A) {
for (const no of candidates.B) {
if (yes.contains(no) || no.contains(yes)) continue;
const score = 100 * (interactive(yes) + interactive(no)) - distance(yes, no);
if (score > bestScore) { bestScore = score; best = { A: yes, B: no }; }
}
}
return best ? [
{ letter: 'A', text: '正确', element: best.A },
{ letter: 'B', text: '错误', element: best.B },
] : [];
}

function optionElements(card, kind) {
if (kind === '判断题') {
const judgments = judgmentOptions(card);
if (judgments.length === 2) return judgments;
}
const labels = Array.from(card.querySelectorAll('span,div,label,li,p,b,i,strong,a'))
.filter((el) => /^[A-H]$/.test(clean(el.textContent)) &&
!Array.from(el.children).some((child) => /^[A-H]$/.test(clean(child.textContent))));
const found = new Map();
for (const label of labels) {
const letter = clean(label.textContent);
if (found.has(letter)) continue;
let target = label;
for (let n = 0; n < 5; n++) {
const parent = target.parentElement;
if (!parent || parent === card) break;
const otherLetters = Array.from(parent.querySelectorAll('span,div,label,li,p,b,i,strong,a'))
.filter((el) => /^[A-H]$/.test(clean(el.textContent)) && el !== label);
if (otherLetters.some((el) => !el.contains(label) && !label.contains(el))) break;
target = parent;
if (clean(target.innerText).length > 1) break;
}
const text = clean(target.innerText).replace(new RegExp(`^${letter}[.、．]?\\s*`), '');
if (text) found.set(letter, { letter, text, element: target });
}
return Array.from(found.values()).sort((a, b) => a.letter.localeCompare(b.letter));
}

function findBlankEditor(target, anchor) {
const views = Array.from(new Set([anchor.ownerDocument.defaultView, PAGE]));
const matches = new Map();
for (const view of views) {
for (const editor of Object.values(view.UE?.instants || {})) {
if (editor?.body === target && typeof editor.setContent === 'function' && typeof editor.sync === 'function') {
matches.set(editor, { editor, engine: 'UEditor' });
}
}
try {
const editors = typeof view.tinymce?.get === 'function' ? view.tinymce.get() : [];
for (const editor of Array.isArray(editors) ? editors : []) {
if (editor?.getBody?.() === target && typeof editor.setContent === 'function' && typeof editor.save === 'function') {
matches.set(editor, { editor, engine: 'TinyMCE' });
}
}
} catch (_) {}
}
return matches.size === 1 ? matches.values().next().value : null;
}

function editableEditorBody(target) {
return Boolean(target && (target.isContentEditable ||
(target.tagName === 'BODY' && String(target.ownerDocument?.designMode).toLowerCase() === 'on')));
}

function editorState(found, target, anchor) {
if (!found || !editableEditorBody(target)) return '编辑器尚未就绪或当前不可编辑';
const editor = found.editor;
if (editor.destroyed === true || editor._destroyed === true || editor.isReady === false || editor.isReady === 0) return '编辑器尚未就绪或已销毁';
if (editor.options?.readonly === true) return '编辑器处于只读状态';
if (found.engine === 'UEditor') {
if (editor.iframe && editor.iframe !== anchor) return '编辑器与当前空位的框架不一致';
try {
if (typeof editor.queryCommandState === 'function' && editor.queryCommandState('source') === 1) return '编辑器处于源码模式';
} catch (_) { return '无法确认编辑器状态'; }
// Hidden UEditor frames can be normal inactive views. Only a live, explicitly
// ready instance may be used independently of that frame's geometry. Official
// UEditor sets isReady = 1; some variants use the boolean true.
if (!visible(anchor) && editor.isReady !== true && editor.isReady !== 1) return '隐藏编辑器尚未确认初始化完成';
} else if (!visible(anchor)) return '隐藏编辑器尚未适配';
return null;
}

function isUEditorFrame(anchor) {
return anchor.tagName === 'IFRAME' && (/^ueditor_\d+$/i.test(anchor.id || '') ||
Boolean(anchor.closest?.('.edui-editor,.edui-editor-iframeholder')));
}

function blankElements(card) {
const fields = [];
for (const anchor of card.querySelectorAll(blankControlSelector)) {
if (anchor.disabled || anchor.readOnly || anchor.closest?.(toolbarSelector)) continue;
if (fields.some((field) => field.anchor.contains(anchor))) continue;
if (anchor.tagName === 'IFRAME') {
const shown = visible(anchor);
try {
const target = anchor.contentDocument?.body;
const found = target ? findBlankEditor(target, anchor) : null;
if (!shown && !found && !isUEditorFrame(anchor)) continue;
if (!target || !editableEditorBody(target)) {
fields.push({ anchor, target: anchor, kind: 'pending-editor', pendingReason: '编辑区尚未就绪或当前不可编辑' });
continue;
}
if (found) {
const problem = editorState(found, target, anchor);
fields.push(problem
? { anchor, target: anchor, kind: 'pending-editor', pendingReason: problem }
: { anchor, target, kind: 'editor', ...found,
submissionTarget: found.engine === 'UEditor' && typeof found.editor.textarea === 'object' ? found.editor.textarea : null });
} else fields.push(shown ? { anchor, target, kind: 'unsupported-editor' }
: { anchor, target: anchor, kind: 'pending-editor', pendingReason: '尚未找到此空对应的已注册 UEditor 实例' });
} catch (_) {
if (shown || isUEditorFrame(anchor)) fields.push({ anchor, target: anchor,
kind: shown ? 'unsupported-editor' : 'pending-editor', pendingReason: '无法访问此编辑区' });
}
continue;
}
if (!visible(anchor)) continue;
if (anchor.tagName === 'INPUT') {
if (!['text', 'search', 'number', 'tel', 'url', 'email'].includes((anchor.type || 'text').toLowerCase())) continue;
fields.push({ anchor, target: anchor, kind: 'control' });
} else if (anchor.tagName === 'TEXTAREA') {
fields.push({ anchor, target: anchor, kind: 'control' });
} else if (anchor.isContentEditable) {
const found = findBlankEditor(anchor, anchor);
fields.push({ anchor, target: anchor, kind: found ? 'editor' : 'editable', ...found,
submissionTarget: found?.engine === 'UEditor' && typeof found.editor.textarea === 'object' ? found.editor.textarea : null });
}
}
const backing = new Set();
for (const field of fields) {
if (!field.editor) continue;
if (typeof field.editor.textarea === 'object') backing.add(field.editor.textarea);
if (field.editor.targetElm) backing.add(field.editor.targetElm);
}
return fields.filter((field) => !backing.has(field.target));
}

function blankControlSummary(card) {
if (!card) return [];
return Array.from(card.querySelectorAll(blankControlSelector)).slice(0, 20).map((anchor) => {
let registeredEditor = null;
let editorProblem = null;
let readyState = null;
if (anchor.tagName === 'IFRAME') {
try {
const target = anchor.contentDocument?.body;
const found = target ? findBlankEditor(target, anchor) : null;
registeredEditor = found?.engine || null;
editorProblem = found ? editorState(found, target, anchor) : '未找到已注册编辑器';
if (found) {
const flag = found.editor.isReady;
readyState = { type: typeof flag, value: typeof flag === 'boolean' ||
(typeof flag === 'number' && Number.isFinite(flag)) ? flag : null };
}
} catch (_) { editorProblem = '无法访问编辑器'; }
}
return {
tag: anchor.tagName, type: anchor.tagName === 'INPUT' ? String(anchor.type || 'text') : null,
visible: visible(anchor), disabled: Boolean(anchor.disabled), readOnly: Boolean(anchor.readOnly),
contentEditable: anchor.getAttribute('contenteditable'), isContentEditable: Boolean(anchor.isContentEditable),
toolbar: Boolean(anchor.closest?.(toolbarSelector)),
...(anchor.tagName === 'IFRAME' ? { ueditorFrame: isUEditorFrame(anchor), registeredEditor, readyState, editorProblem } : {}),
};
});
}

function findFillCard(markerElement) {
// Walk through deeply nested headings, but never cross a second question or
// the document boundary. Discover controls once, then use the smallest common
// ancestor of the type marker and those controls as the actual question card.
const ancestors = [];
let current = markerElement;
let scope = null;
let stopReason = 'depth-limit';
for (let depth = 0; current && depth < 64; depth++, current = current.parentElement) {
if (/^(BODY|HTML)$/.test(current.tagName)) { stopReason = 'document-body'; break; }
const kinds = clean(current.innerText).match(new RegExp(typeMarkerPattern.source, 'g')) || [];
if (kinds.length > 1) { stopReason = 'multiple-questions'; break; }
ancestors.push(current);
scope = current;
}
if (!current) stopReason = 'end-of-tree';
const blanks = scope ? blankElements(scope) : [];
const card = blanks.length ? ancestors.find((candidate) =>
blanks.every((field) => candidate.contains(field.anchor))) || null : null;
return { card, blanks, scope, ancestorsSearched: ancestors.length, stopReason };
}

function fillPrompt(card, blanks) {
const markers = new Map(blanks.map((field, index) => [field.anchor, ` [第${index + 1}空] `]));
const read = (node) => {
if (markers.has(node)) return markers.get(node);
if (node.nodeType === 3) return node.textContent || '';
if (node.nodeType !== 1 || /^(SCRIPT|STYLE|BUTTON|INPUT|TEXTAREA)$/.test(node.tagName) || node.matches(toolbarSelector)) return '';
return Array.from(node.childNodes).map(read).join(' ');
};
return read(card);
}

function questionMarker(node) {
if (!/[\[【]/.test(node.textContent || '')) return null;
let element = node.parentElement;
const direct = clean(node.textContent).match(typeMarkerPattern);
if (direct) return { element, type: direct[1] };
// A type label may be split into separate spans, e.g. 【 / 判断题 / 】.
for (let depth = 0; element && depth < 3; depth++, element = element.parentElement) {
if (/^(BODY|HTML)$/.test(element.tagName)) break;
const matches = Array.from(clean(element.textContent).matchAll(new RegExp(typeMarkerPattern.source, 'g')));
if (matches.length > 1) break;
if (matches.length === 1) return { element, type: matches[0][1] };
}
return null;
}

function questionNumber(element) {
for (let depth = 0; element && depth < 64; depth++, element = element.parentElement) {
if (/^(BODY|HTML)$/.test(element.tagName)) break;
const text = clean(element.innerText || element.textContent);
if ((text.match(new RegExp(typeMarkerPattern.source, 'g')) || []).length > 1) break;
const found = text.match(/^(\d{1,4})\s*(?:[.、．)）:：]|(?=[\[【]))/);
if (found) return Number(found[1]);
}
return null;
}

function extractQuestions(report = null) {
const questions = [];
for (const [documentIndex, doc] of courseDocuments().entries()) {
// A visible iframe can already have a Document while its body is still null.
const body = doc.body;
if (!body || body.nodeType !== 1) continue;
let walker;
try {
walker = doc.createTreeWalker(body, doc.defaultView.NodeFilter?.SHOW_TEXT || 4);
} catch (_) { continue; }
const seenCards = new Set();
const seenMarkers = new Set();
let node;
while ((node = walker.nextNode())) {
const marker = questionMarker(node);
if (!marker || !visible(marker.element) || seenMarkers.has(marker.element)) continue;
seenMarkers.add(marker.element);
const kind = marker.type;
const detail = { document: documentIndex + 1, position: report ? report.length + 1 : null,
number: questionNumber(marker.element), type: kind,
recognized: false, reason: '', optionCount: 0, blankCount: 0 };
const reject = (reason) => { detail.reason = reason; if (report) report.push(detail); };
if (!['单选题', '多选题', '判断题', '填空题'].includes(kind)) {
reject('当前不支持此题型');
continue;
}
let card = marker.element;
let options = [];
let blanks = [];
let multipleQuestions = false;
if (kind === '填空题') {
const found = findFillCard(marker.element);
card = found.card;
blanks = found.blanks;
if (report) detail.blankDiscovery = { ancestorsSearched: found.ancestorsSearched,
stopReason: found.stopReason, containerTag: found.scope?.tagName || null,
controls: blanks.length && blanks.every((field) => field.kind !== 'pending-editor') ? [] : blankControlSummary(found.scope) };
} else {
for (let depth = 0; card && depth < 9; depth++, card = card.parentElement) {
const cardText = clean(card.innerText);
const kinds = cardText.match(new RegExp(typeMarkerPattern.source, 'g')) || [];
if (kinds.length > 1) { multipleQuestions = true; break; }
options = optionElements(card, kind);
if (options.length >= 2 && options.length <= 8) break;
}
}
if (card && seenCards.has(card)) continue;
detail.optionCount = options.length;
detail.blankCount = blanks.length;
if (!card || (kind === '填空题' ? !blanks.length : options.length < 2 || options.length > 8)) {
reject(kind === '填空题' ? '未找到可编辑的填空输入框' :
options.length > 8 ? '选项超过 8 个，无法确认题目边界' :
`未识别到至少两个有效选项${multipleQuestions ? '，继续向上查找会包含多道题' : ''}`);
continue;
}
seenCards.add(card);
const full = card.innerText || '';
const firstOption = full.search(/(?:^|\n)\s*A\s*(?:[.、．]|\S)/);
let prompt = firstOption >= 0 ? full.slice(0, firstOption) : full;
if (kind === '填空题') prompt = fillPrompt(card, blanks);
else {
try {
const first = options.map((option) => option.element).reduce((before, current) =>
before.compareDocumentPosition(current) & 2 ? current : before);
const range = doc.createRange();
range.setStart(card, 0);
range.setEndBefore(first);
prompt = range.toString();
range.detach();
} catch (_) { /* Keep the full card text if a DOM Range is unavailable. */ }
}
let promptText = clean(prompt);
const typeOffset = promptText.search(kindPattern);
if (typeOffset >= 0 && /^\d+\s*[.、．)）:：]?\s*$/.test(promptText.slice(0, typeOffset))) {
promptText = promptText.slice(typeOffset);
}
const title = promptText.replace(kindPattern, '').replace(/^\s*\d+\s*[.、．]\s*/, '').trim();
detail.titleLength = title.length;
if (!title) { reject('题干为空，可能是图片题或题干尚未加载'); continue; }
if (title.length > 500) { reject(`题干长度 ${title.length}，超过当前 500 字符限制`); continue; }
const invalidOptions = options.filter((option) => !option.text || option.text.length > 500);
if (invalidOptions.length) {
detail.optionTextLengths = options.map((option) => option.text.length);
reject('选项文字为空或超过当前 500 字符限制');
continue;
}
detail.recognized = true;
detail.pendingBlanks = blanks.filter((field) => field.kind === 'pending-editor').length;
if (detail.pendingBlanks) detail.pendingReasons = blanks.filter((field) => field.kind === 'pending-editor')
.map((field, index) => ({ blank: blanks.indexOf(field) + 1, reason: field.pendingReason || '编辑器仍在加载' }));
detail.reason = detail.pendingBlanks ? '填空编辑器仍在加载' : '已识别';
if (report) report.push(detail);
questions.push({ kind, title, options, blanks, card, doc });
}
}
return questions;
}

function expectedQuizCount(doc) {
const found = clean(doc?.body?.innerText).match(/题量\s*[:：]\s*(\d+)/);
return found ? Number(found[1]) : null;
}

function findButton(doc, label) {
const candidates = Array.from(doc.querySelectorAll('button,a,input[type="button"],input[type="submit"],[role="button"],div,span'))
.filter((el) => visible(el) && clean(el.value || el.innerText) === label);
return candidates.find((el) => /^(BUTTON|A|INPUT)$/.test(el.tagName)) ||
candidates.find((el) => !Array.from(el.children).some((child) => clean(child.innerText) === label)) || null;
}

function findNextButton() {
const labels = ['下一节', '下一章', '下一小节', '下一章节', '下一步'];
const usable = (el) => visible(el) && !el.disabled && el.getAttribute('aria-disabled') !== 'true' &&
!el.classList.contains('disabled') && !el.classList.contains('disable');
for (const doc of courseDocuments()) {
for (const known of doc.querySelectorAll('#prevNextFocusNext, #right1, .nextChapter')) {
const text = clean(known.innerText || known.value || known.title || known.getAttribute('aria-label'));
if (usable(known) && labels.some((label) => text.includes(label))) return known;
}
for (const label of labels) {
const generic = findButton(doc, label);
if (usable(generic)) return generic;
}
}
return null;
}

async function revealQuizQuestions() {
const docs = courseDocuments();
const submit = docs.map((doc) => findButton(doc, '提交')).find(Boolean);
if (!submit) return;
let scroller = submit.parentElement;
while (scroller && scroller !== submit.ownerDocument.body) {
const style = scroller.ownerDocument.defaultView.getComputedStyle(scroller);
if (/(auto|scroll)/.test(style.overflowY) && scroller.scrollHeight > scroller.clientHeight + 100) break;
scroller = scroller.parentElement;
}
if (!scroller || scroller === submit.ownerDocument.body) {
scroller = submit.ownerDocument.scrollingElement;
}
if (!scroller || scroller.scrollHeight <= scroller.clientHeight + 100) return;
scroller.scrollTop = 0;
await sleep(150);
for (let step = 0; step < 50; step++) {
const bottom = scroller.scrollHeight - scroller.clientHeight;
if (scroller.scrollTop >= bottom - 2) break;
scroller.scrollTop = Math.min(bottom, scroller.scrollTop + Math.max(300, scroller.clientHeight * 0.75));
await sleep(120);
}
}

async function waitForQuizQuestions() {
quizState('等待题目框架和提交按钮');
let submitDoc = null;
for (let attempt = 0; attempt < 240; attempt++) {
if (stopped) throw new Error('脚本已停止');
if (quizCompleted()) return null;
submitDoc = courseDocuments().find((doc) => findButton(doc, '提交'));
if (submitDoc) break;
if (attempt > 0 && attempt % 30 === 0) console.log(`测验提交按钮仍在加载，已等待 ${attempt / 2} 秒`);
await sleep(500);
}
if (!submitDoc) throw new Error('进入章节测验后等待 120 秒，仍未找到“提交”按钮。请检查题目框架是否正常加载');

await revealQuizQuestions();
quizState('等待完整题目');
let previousSignature = '';
let stableCount = 0;
for (let attempt = 0; attempt < 240; attempt++) {
if (stopped) throw new Error('脚本已停止');
if (quizCompleted()) return null;
const details = [];
const questions = extractQuestions(details);
const expected = expectedQuizCount(submitDoc);
quizState('等待完整题目', { recognizedQuestions: questions.length, expectedQuestions: expected });
app._quizState.recognitionIssues = details.filter((detail) => !detail.recognized);
app._quizState.recognizedByType = questions.reduce((counts, question) => {
counts[question.kind] = (counts[question.kind] || 0) + 1;
return counts;
}, {});
app._quizState.totalBlanks = questions.reduce((count, question) => count + question.blanks.length, 0);
app._quizState.pendingBlanks = questions.reduce((count, question) => count +
question.blanks.filter((field) => field.kind === 'pending-editor').length, 0);
if (app._quizState.pendingBlanks) quizState('等待填空输入框加载');
if (questions.length && !app._quizState.pendingBlanks && (!expected || questions.length === expected)) {
const signature = questions.map((q) => JSON.stringify([q.kind, q.title, q.options.map((option) => option.text), q.blanks.length])).join('|');
stableCount = signature === previousSignature ? stableCount + 1 : 0;
previousSignature = signature;
if (stableCount >= 3) return questions;
} else {
stableCount = 0;
previousSignature = '';
}
if (attempt > 0 && attempt % 30 === 0) console.log(`等待完整题目，已等待 ${attempt / 2} 秒；已识别 ${questions.length}/${expected || '未知'} 道`, app._quizState.recognizedByType);
await sleep(500);
}
throw new Error(`等待 120 秒仍未识别完整题目：${app._quizState.recognizedQuestions}/${app._quizState.expectedQuestions ?? '?'} 题。请点击“查看识题诊断”查看遗漏题型和原因`);
}

async function requestAnswerBatch(questions) {
const payload = questions.map((q, i) => ({
id: i + 1,
type: q.kind,
question: q.title,
options: q.options.map((o) => ({ letter: o.letter, text: o.text })),
...(q.kind === '填空题' ? { blank_count: q.blanks.length } : {}),
}));
app._quizState.lastRequest = payload.map((question) => ({
id: (app._quizState.currentBatch - 1) * 10 + question.id,
batchId: question.id,
type: question.type,
textLength: question.question.length,
optionLetters: question.options.map((option) => option.letter),
optionTextLengths: question.options.map((option) => option.text.length),
...(question.type === '填空题' ? { blankCount: question.blank_count } : {}),
}));
console.log('以下是本次发送给 DeepSeek 的题干和选项：', payload);
let response;
try {
response = await fetch(`${LOCAL_URL}/answer`, {
method: 'POST',
headers: { 'Content-Type': 'application/json', 'X-Xuexitong-Token': LOCAL_TOKEN },
body: JSON.stringify({ questions: payload }),
signal: AbortSignal.timeout(900000),
});
} catch (error) {
throw new Error(`无法连接本地 DeepSeek 服务。请确认启动窗口仍在运行，且 Edge 允许本地网络访问。详情：${error.message}`);
}
const data = await response.json().catch(() => null);
if (!response.ok) throw new Error((data?.error || `本地 DeepSeek 服务返回 HTTP ${response.status}`) +
(data?.stage ? `（阶段：${data.stage}，服务版本：${data.version || '未知'}）` : ''));
return data.answers;
}

async function askDeepSeek(questions) {
const batchSize = 10;
const totalBatches = Math.ceil(questions.length / batchSize);
const answers = [];
for (let offset = 0; offset < questions.length; offset += batchSize) {
if (stopped) throw new Error('脚本已停止');
const batch = questions.slice(offset, offset + batchSize);
const currentBatch = Math.floor(offset / batchSize) + 1;
quizState('正在请求 DeepSeek 答案', { currentBatch, totalBatches });
console.log(`正在请求第 ${currentBatch}/${totalBatches} 批答案（第 ${offset + 1}～${offset + batch.length} 题）`);
// Batch IDs start at 1 for the local service; validate before mapping them back.
const checked = validateAnswers(batch, await requestAnswerBatch(batch));
if (stopped) throw new Error('脚本已停止');
for (const [id, values] of checked) answers.push(batch[id - 1].kind === '填空题'
? { id: offset + id, blanks: values } : { id: offset + id, letters: values });
}
return answers;
}

function validateAnswers(questions, answers) {
if (!Array.isArray(answers) || answers.length !== questions.length) throw new Error('AI 返回的题目数量不匹配');
const result = new Map();
for (const item of answers) {
if (!item || !Number.isInteger(item.id) || result.has(item.id))
throw new Error('AI 答案格式错误');
const q = questions[item.id - 1];
if (!q) throw new Error('AI 返回未知题号');
if (q.kind === '填空题') {
if (!Array.isArray(item.blanks) || item.blanks.length !== q.blanks.length)
throw new Error(`第 ${item.id} 题需要 ${q.blanks.length} 个填空答案，AI 返回数量不匹配，已停止提交`);
const values = item.blanks.map((value, index) => {
if (typeof value !== 'string' || !answerText(value) || value.length > 2000)
throw new Error(`第 ${item.id} 题第 ${index + 1} 空答案为空或格式无效，已停止提交`);
const target = q.blanks[index].target;
if (q.blanks[index].kind === 'control' && target.maxLength >= 0 && value.length > target.maxLength)
throw new Error(`第 ${item.id} 题第 ${index + 1} 空答案超过输入框长度限制`);
return answerText(value);
});
result.set(item.id, values);
continue;
}
if (!Array.isArray(item.letters)) throw new Error('AI 选择题答案格式错误');
const letters = item.letters.map((letter) => clean(letter).toUpperCase());
if (!letters.length) throw new Error(`第 ${item.id} 题 AI 未给出选项，已停止提交`);
if (new Set(letters).size !== letters.length) throw new Error(`第 ${item.id} 题答案包含重复选项，已停止提交`);
if (q.kind !== '多选题' && letters.length !== 1)
throw new Error(`第 ${item.id} 题是${q.kind}，但 AI 返回了 ${letters.length} 个选项，已停止提交`);
const invalidLetters = letters.filter((letter) => !q.options.some((option) => option.letter === letter));
if (invalidLetters.length)
throw new Error(`第 ${item.id} 题 AI 返回了页面中不存在的选项：${invalidLetters.join('、')}，已停止提交`);
result.set(item.id, letters);
}
return result;
}

function verifyBlankTargets(question, number) {
const current = blankElements(question.card);
if (current.length !== question.blanks.length || current.some((field, index) =>
field.target !== question.blanks[index].target || field.anchor !== question.blanks[index].anchor ||
field.kind !== question.blanks[index].kind || field.editor !== question.blanks[index].editor ||
(question.blanks[index].submissionTarget && field.submissionTarget !== question.blanks[index].submissionTarget) ||
!field.anchor.isConnected || !question.card.contains(field.anchor) ||
!field.target.isConnected || field.target.disabled || field.target.readOnly ||
(field.kind === 'editor' && (findBlankEditor(field.target, field.anchor)?.editor !== field.editor ||
editorState(field, field.target, field.anchor))))) {
throw new Error(`第 ${number} 题输入框数量、顺序或状态已变化，已停止提交`);
}
}

function readBlank(field) {
if (field.kind === 'editor' && field.target.childNodes?.length) {
const text = (node) => {
if (node.nodeType === 3) return node.textContent || '';
if (node.nodeType !== 1) return '';
if (node.tagName === 'BR') return '\n';
return Array.from(node.childNodes).map(text).join('') + (/^(P|DIV)$/.test(node.tagName) ? '\n' : '');
};
return answerText(text(field.target));
}
return answerText(field.kind === 'control' ? field.target.value : field.target.innerText || field.target.textContent);
}

function verifyEditorSync(field) {
if (field.kind !== 'editor' || field.engine !== 'UEditor') return;
const editor = field.editor;
const backing = editor.textarea;
if (!backing || typeof backing !== 'object' || typeof editor.getContent !== 'function') return;
if (field.submissionTarget && field.submissionTarget !== backing) throw new Error('编辑器的提交字段已被替换，已停止提交');
field.submissionTarget = backing;
if (!backing.isConnected || backing.ownerDocument !== field.anchor.ownerDocument || backing.disabled || backing.readOnly)
throw new Error('编辑器的提交字段已变化，已停止提交');
const content = editor.options?.allHtmlEnabled && typeof editor.getAllHtml === 'function'
? editor.getAllHtml() : editor.getContent(null, null, true);
if (answerText(backing.value) !== answerText(content)) throw new Error('编辑器内容未同步到对应提交字段，已停止提交');
}

function writeBlank(field, value) {
field.anchor.scrollIntoView({ block: 'center' });
field.target.focus?.({ preventScroll: true });
if (field.kind === 'control') {
const view = field.target.ownerDocument.defaultView;
const prototype = field.target.tagName === 'TEXTAREA' ? view.HTMLTextAreaElement?.prototype : view.HTMLInputElement?.prototype;
const setter = prototype && Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
if (setter) setter.call(field.target, value);
else field.target.value = value;
} else if (field.kind === 'editor') {
const html = '<p>' + value.replace(/[&<>"']/g, (char) =>
({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]).replace(/\n/g, '<br>') + '</p>';
field.editor.setContent(html);
if (field.engine === 'UEditor') {
field.editor.fireEvent?.('contentchange');
field.editor.sync();
} else field.editor.save();
} else if (field.kind === 'editable') field.target.textContent = value;
else throw new Error('尚未适配此填空编辑器，已停止提交');
const EventType = field.target.ownerDocument.defaultView.Event;
field.target.dispatchEvent(new EventType('input', { bubbles: true, composed: true }));
field.target.dispatchEvent(new EventType('change', { bubbles: true }));
field.target.blur?.();
}

function verifyFilledBlanks(questions, answers) {
questions.forEach((question, index) => {
if (question.kind !== '填空题') return;
verifyBlankTargets(question, index + 1);
question.blanks.forEach((field, blank) => {
verifyEditorSync(field);
if (readBlank(field) !== answers.get(index + 1)[blank])
throw new Error(`第 ${index + 1} 题第 ${blank + 1} 空填写结果未保留，已停止提交`);
});
});
}

async function selectAnswers(questions, answers) {
quizState('正在选择选项和填写答案', { filledBlanks: 0 });
questions.forEach((question, index) => { if (question.kind === '填空题') verifyBlankTargets(question, index + 1); });
for (let i = 0; i < questions.length; i++) {
const q = questions[i];
if (q.kind === '填空题') {
verifyBlankTargets(q, i + 1);
for (let blank = 0; blank < q.blanks.length; blank++) {
if (stopped) throw new Error('脚本已停止');
writeBlank(q.blanks[blank], answers.get(i + 1)[blank]);
await sleep(150);
if (readBlank(q.blanks[blank]) !== answers.get(i + 1)[blank])
throw new Error(`第 ${i + 1} 题第 ${blank + 1} 空未确认填写成功，已停止提交`);
verifyEditorSync(q.blanks[blank]);
app._quizState.filledBlanks++;
}
continue;
}
for (const letter of answers.get(i + 1)) {
if (stopped) throw new Error('脚本已停止');
const option = q.options.find((item) => item.letter === letter);
if (!option?.element?.isConnected) throw new Error(`第 ${i + 1} 题选项已变化`);
option.element.scrollIntoView({ block: 'center' });
const before = q.card.outerHTML;
option.element.click();
await sleep(150);
const after = q.card.outerHTML;
const input = option.element.matches('input') ? option.element : option.element.querySelector('input');
const checked = input?.checked || option.element.getAttribute('aria-checked') === 'true';
if (before === after && !checked) throw new Error(`第 ${i + 1} 题 ${letter} 选项未确认选中，已停止提交`);
}
}
if (questions.some((question) => question.kind === '填空题')) {
await sleep(300);
if (stopped) throw new Error('脚本已停止');
verifyFilledBlanks(questions, answers);
}
}

async function confirmSubmitDialog() {
for (let i = 0; i < 20; i++) {
if (stopped) throw new Error('脚本已停止');
const dialogs = courseDocuments().flatMap((doc) =>
Array.from(doc.querySelectorAll('#popok,[role="dialog"],[role="alertdialog"],.layui-layer-dialog,.el-message-box,.modal')));
const platformButton = dialogs.find((el) => el.id === 'popok' && visible(el));
if (platformButton) {
const message = clean(platformButton.ownerDocument.querySelector('#popcontent')?.innerText);
if (/未作答|请选择|请作答|答完/.test(message) && !/确定提交|确认提交/.test(message))
throw new Error(`平台拒绝提交：${message}`);
console.log(`确认平台提交窗口：${message || '提交'}`);
platformButton.click();
return;
}
const dialog = dialogs.find((el) => el.id !== 'popok' && visible(el) && /提交|交卷/.test(clean(el.innerText)));
if (dialog) {
const confirm = findButton(dialog, '确定') || findButton(dialog, '确认') || findButton(dialog, '提交');
if (!confirm) throw new Error('提交确认窗口未找到确认按钮');
confirm.click();
return;
}
await sleep(250);
}
}

async function submitQuiz(doc) {
quizState('正在提交测验');
if (stopped) throw new Error('脚本已停止');
const submit = findButton(doc, '提交');
if (!submit) throw new Error('未找到测验提交按钮');
submit.scrollIntoView({ block: 'center' });
console.log('选项已选择，点击章节测验的提交按钮');
submit.click();
await confirmSubmitDialog();
console.log('提交已确认，等待学习通生成成绩或任务完成标记；确认后再点击“下一节”');
quizState('等待成绩或完成标记');
let elapsedHalfSeconds = 0;
while (!stopped) {
await sleep(500);
elapsedHalfSeconds++;
if (quizCompleted()) return;
if (elapsedHalfSeconds % 30 === 0) console.log(`成绩页仍在加载，已等待 ${elapsedHalfSeconds / 2} 秒`);
}
throw new Error('脚本已停止');
}

async function goToNextStep() {
if (stopped) throw new Error('脚本已停止');
if (navigationBusy) return;
const next = findNextButton();
if (!next) throw new Error('未找到可用的下一节/下一章按钮。可运行 app.inspectFlow() 查看当前状态');
navigationBusy = true;
app._nextUnitPending = true;
try {
const previous = app._captureStepState();
const previousStep = previous.step;
app._cancelPlaybackTimers();
app._clearCheckInterval();
app._detachVideoEvents();
app._videoEl = null;
app._isPlaying = false;
next.scrollIntoView({ block: 'center' });
console.log(`${previousStep || '当前学习步骤'}完成，点击页面“下一节”，等待新内容加载`);
next.click();
let currentStep = '';
let stepReady = false;
for (let attempt = 0; attempt < 240; attempt++) {
if (stopped) throw new Error('脚本已停止');
await sleep(500);
if (stopped) throw new Error('脚本已停止');
const current = app._captureStepState();
currentStep = current.step;
const changed = app._hasStepChanged(previous, current);
if (changed && currentStep === '章节测验') {
stepReady = true;
break;
}
if (changed && currentStep === '视频') {
app._videoEl = null;
if (app._getVideoEl()) {
stepReady = true;
break;
}
}
if (attempt > 0 && attempt % 30 === 0) console.log(`下一学习步骤仍在加载，已等待 ${attempt / 2} 秒；当前页签：${currentStep || '未显示'}`);
}
if (!stepReady) {
throw new Error(`点击“下一节”后等待 120 秒，新学习步骤仍未加载完成；当前页签：${currentStep || '未显示'}`);
}
} finally {
navigationBusy = false;
app._nextUnitPending = false;
}
if (stopped) return;
app._videoEl = null;
app._tryTimes = 0;
app._initCellData();
await app.play();
}

app.nextUnit = function () {
if (stopped || this._nextUnitPending) return;
this._nextUnitPending = true;
return goToNextStep().catch((error) => {
this._nextUnitPending = false;
console.error('切换下一学习步骤失败:', error);
});
};

app.inspectQuiz = function () {
return extractQuestions().map((q, i) => ({
id: i + 1, type: q.kind, question: q.title,
options: q.options.map((o) => `${o.letter}. ${o.text}`),
...(q.kind === '填空题' ? { blankCount: q.blanks.length, inputKinds: q.blanks.map((field) => field.kind) } : {}),
}));
};

app.inspectQuizDiagnostics = function () {
const details = [];
const questions = extractQuestions(details);
const scan = scanCourseContent();
const submitDoc = scan.documents.find((doc) => findButton(doc, '提交'));
const expected = expectedQuizCount(submitDoc);
const byType = questions.reduce((counts, question) => {
counts[question.kind] = (counts[question.kind] || 0) + 1;
return counts;
}, {});
return { scriptVersion: SCRIPT_VERSION, expectedQuestions: expected, recognizedQuestions: questions.length,
recognizedByType: byType, detectedTypeMarkers: details.length,
unaccountedQuestions: expected === null ? null : Math.max(0, expected - details.length),
accessibleDocuments: scan.documents.length, inaccessibleFrames: scan.frames.filter((frame) => !frame.document).length,
rejected: details.filter((detail) => !detail.recognized),
pendingEditors: details.filter((detail) => detail.pendingBlanks),
recognized: details.filter((detail) => detail.recognized).map((detail) => ({ document: detail.document,
position: detail.position, number: detail.number, type: detail.type,
...(detail.type === '填空题' ? { blankCount: detail.blankCount, pendingBlanks: detail.pendingBlanks } : {}) })) };
};

app.inspectFlow = function () {
const scan = scanCourseContent();
const videos = this._getVideoEls(scan);
return {
scriptVersion: SCRIPT_VERSION,
runMode: RUN_MODE,
service: PAGE.__xuexitongServiceInfo || null,
step: this._currentStepTitle(scan),
visibleVideos: videos.length,
completedVideos: videos.filter((video) => this._isVideoCompleted(video)).length,
activeVideo: this._videoEl ? videos.indexOf(this._videoEl) + 1 : 0,
switching: this._nextUnitPending,
accessibleDocuments: scan.documents.length,
inaccessibleFrames: scan.frames.filter((frame) => !frame.document).length,
nextButtonFound: Boolean(findNextButton()),
playbackMethod: this._lastPlayMethod || '尚未请求',
playbackAttempts: this._playbackAttempts,
playbackConfirmed: this._progressConfirmed,
playbackStopped: this._playbackStopped,
lastPlaybackError: this._lastPlaybackError,
quiz: { ...this._quizState, busy: quizBusy, watcherActive: stepWatcher !== null },
player: this._videoEl ? {
paused: this._videoEl.paused,
ended: this._videoEl.ended,
time: this._videoEl.currentTime,
duration: this._videoEl.duration,
rate: this._videoEl.playbackRate,
readyState: this._videoEl.readyState,
networkState: this._videoEl.networkState,
mediaError: this._videoEl.error?.code || null,
visibility: document.visibilityState,
} : null,
};
};

app._advanceChapterTest = function () {
if (stopped || quizBusy) return;
quizBusy = true;
const runId = ++quizRunId;
quizState('准备识别测验', { recognizedQuestions: 0, expectedQuestions: null,
recognizedByType: {}, recognitionIssues: [], totalBlanks: 0, pendingBlanks: 0, filledBlanks: 0, currentBatch: 0, totalBatches: 0, lastRequest: null, lastError: null });
(async () => {
if (quizCompleted()) {
console.log('检测到当前章节测验已完成，点击“下一节”进入新视频');
quizState('测验已完成，进入下一步');
quizBusy = false;
await goToNextStep();
return;
}
console.log('已进入章节测验，等待题目和提交按钮加载');
const questions = await waitForQuizQuestions();
if (questions === null) {
console.log('检测到当前章节测验已完成，点击“下一节”进入新视频');
quizState('测验已完成，进入下一步');
quizBusy = false;
await goToNextStep();
return;
}
const docs = new Set(questions.map((q) => q.doc));
if (docs.size !== 1) throw new Error('题目跨多个框架，已停止自动提交');
questions.forEach((question, index) => {
if (question.kind !== '填空题') return;
if (question.blanks.length > 100) throw new Error(`第 ${index + 1} 题填空数超过支持范围`);
if (question.blanks.some((field) => !['control', 'editable', 'editor'].includes(field.kind)))
throw new Error(`第 ${index + 1} 题有尚未适配或尚未加载的填空编辑器，已停止自动提交`);
verifyBlankTargets(question, index + 1);
});
const countText = clean(questions[0].doc.body.innerText).match(/题量\s*[:：]\s*(\d+)/);
if (countText && Number(countText[1]) !== questions.length)
throw new Error(`页面显示 ${countText[1]} 道题，脚本只识别 ${questions.length} 道，已停止提交`);
const signature = questions.map((q) => `${q.kind}:${q.title}:${q.blanks.length}`).join('|');
if (attemptedQuizzes.has(signature)) throw new Error('本次测验已尝试过，已停止重复提交');
console.log(`识别到 ${questions.length} 道题，正在调用 DeepSeek`);
quizState('已识别完整题目', { recognizedQuestions: questions.length });
const answers = validateAnswers(questions, await askDeepSeek(questions));
console.table(questions.map((q, i) => ({ 题号: i + 1, 题型: q.kind,
答案: q.kind === '填空题' ? answers.get(i + 1).map((value, blank) => `第${blank + 1}空：${value}`).join('；') : answers.get(i + 1).join('') })));
await selectAnswers(questions, answers);
attemptedQuizzes.add(signature);
await submitQuiz(questions[0].doc);
console.log('章节测验提交已确认，点击“下一节”进入新视频');
quizState('测验已完成，进入下一步');
quizBusy = false;
await goToNextStep();
})().catch((error) => {
app._nextUnitPending = false;
quizState('已停止', { lastError: String(error.message || error) });
console.error('章节测验自动作答停止:', error);
})
.finally(() => { if (runId === quizRunId) quizBusy = false; });
};

app._startStepWatcher = function () {
if (stopped || this._destroyed) return;
if (stepWatcher) clearInterval(stepWatcher);
stepWatcher = setInterval(() => {
if (stopped || this._destroyed || navigationBusy || this._nextUnitPending || this._videoTransitionTimer) return;
try {
const step = this._currentStepTitle();
if (step !== '章节测验') {
if (step === '视频' && !quizBusy && this._getVideoEls().length && this._quizState.phase !== '未开始') {
quizState('未开始', { recognizedQuestions: 0, expectedQuestions: null,
recognizedByType: {}, totalBlanks: 0, pendingBlanks: 0, filledBlanks: 0, currentBatch: 0, totalBatches: 0, lastRequest: null, lastError: null });
}
return;
}
// Take over page-driven iframe navigation even when no click/ended event ran.
// A failed or completed attempt is never automatically restarted on the same page.
if (quizBusy || this._quizState.phase !== '未开始') return;
console.log('检测到练习页已加载，自动接管测验流程');
this.play();
} catch (error) {
quizState('已停止', { lastError: `页面状态检查失败：${error.message || error}` });
console.error('页面状态检查失败，已停止自动接管:', error);
}
}, this.configs.stepCheckInterval);
};

}
function initializePlayer() {
const app = {
configs: {
playbackRate: 1, // 默认视频倍率；1 为原速，请使用课程允许的倍率
autoplay: true,
retryInterval: 2000,
maxRetries: 10,
videoCheckInterval: 1000,
stepCheckInterval: 1000,
guardNoProgressMs: 7000,
guardResumeCooldownMs: 1500,
maxPlaybackAttempts: 3,
playRequestTimeoutMs: 5000,
autoAdvanceNoVideo: false,
},
_videoEl: null,
_treeContainerEl: null,
_isPlaying: false,
_currentRetryCount: 0,
_checkInterval: null,
_eventVideoEl: null,
_boundVideoHandlers: null,
_nextUnitPending: false,
_chapterAdvanceTimes: 0,
_completedVideos: new WeakMap(),
_videoTransitionTimer: null,
_playRetryTimer: null,
_destroyed: false,
_playRequestId: 0,
_mediaRequest: null,
_playbackAttempts: 0,
_playbackStopped: false,
_progressConfirmed: false,
_lastPlaybackError: null,
_lastPlayMethod: '',
_waitingForForeground: false,
_cellData: {
cells: 0,
nCells: 0,
currentCellIndex: 0,
currentNCellIndex: 0,
currentVideoTitle: "",
},
get cellData() {
return this._cellData;
},
run() {
console.log(`%c=== 学习通视频与章节测验助手 V${SCRIPT_VERSION} 启动 ===`, "color:#4CAF50;font-size:16px;font-weight:bold");
if (this._destroyed) return;
this._cancelPlaybackTimers();
this._tryTimes = 0;
this._playbackAttempts = 0;
this._playbackStopped = false;
this._progressConfirmed = false;
this._lastPlaybackError = null;
this._nextUnitPending = false;
this._chapterAdvanceTimes = 0;
this._getTreeContainer();
this._initCellData();
console.log(`当前学习步骤：${this._currentStepTitle() || '等待页面加载'}`);
this._videoEl = null;
this._getVideoEl();
this._clearCheckInterval();
this._bindStepNavigation();
this._startStepWatcher();
this.play();
},
nextUnit() {
if (this._nextUnitPending) {
console.warn('%c已有小节切换正在进行，忽略重复请求', 'color:#FF9800');
return;
}
this._nextUnitPending = true;
this._clearCheckInterval();
console.log("%c=== 准备切换到下一小节 ===", "color:#2196F3;font-size:14px");
try {
const el = this._getTreeContainer();
const cells = el.children("ul").children("li");
const nCells = $(cells.get(this._cellData.currentCellIndex)).find('.posCatalog_select:not(.firstLayer)');
if (nCells.length > this._cellData.currentNCellIndex + 1) {
const nextNIndex = this._cellData.currentNCellIndex + 1;
console.log(`%c切换到同章节下一个视频: ${nextNIndex + 1}/${nCells.length}`, "color:#FF9800");
this.playCurrentIndex(nCells.get(nextNIndex));
} else {
const nextIndex = this._cellData.currentCellIndex + 1;
if (nextIndex >= cells.length) {
console.log("%c=====================================", "color:#4CAF50;font-size:16px");
console.log("%c==============本课程学习完成了==============", "color:#4CAF50;font-size:16px;font-weight:bold");
console.log("%c=====================================", "color:#4CAF50;font-size:16px");
return;
}
console.log(`%c切换到下一个章节: ${nextIndex + 1}/${cells.length}`, "color:#FF9800");
this._cellData.currentCellIndex = nextIndex;
this._cellData.currentNCellIndex = 0;
this.playCurrentIndex();
}
} catch (error) {
this._nextUnitPending = false;
console.error('切换下一小节失败:', error);
}
},
_clearCheckInterval() {
if (this._checkInterval) {
clearInterval(this._checkInterval);
this._checkInterval = null;
}
},
_cancelPlaybackTimers() {
if (this._mediaRequest) this._mediaRequest.cancel();
for (const key of ['_videoTransitionTimer', '_playRetryTimer', '_delayedNextUnitTimer']) {
if (this[key]) clearTimeout(this[key]);
this[key] = null;
}
this._playRequestId++;
},
_schedulePlay(delay) {
if (this._destroyed || this._nextUnitPending) return;
if (this._playRetryTimer) clearTimeout(this._playRetryTimer);
this._playRetryTimer = setTimeout(() => {
this._playRetryTimer = null;
if (!this._destroyed) this.play();
}, delay);
},
_startVideoMonitoring() {
this._clearCheckInterval();
this._guardLastTime = Number(this._videoEl?.currentTime || 0);
this._guardLastWallTs = Date.now();
this._guardLastResumeTs = 0;
this._checkInterval = setInterval(() => {
this._checkVideoStatus();
}, this.configs.videoCheckInterval);
},
_applyPlaybackRate(video) {
if (!video) return;
const rate = this.configs.playbackRate;
if (!Number.isFinite(rate) || rate <= 0) {
console.warn('视频倍率配置无效，继续使用播放器当前倍率');
return;
}
try {
if (video.playbackRate !== rate) video.playbackRate = rate;
} catch (error) {
console.warn('播放器未接受指定倍率，继续使用当前倍率:', error.message);
}
},
_findVideoPlayer(video) {
const api = video.ownerDocument.defaultView.videojs;
if (!api) return null;
try {
const container = video.closest?.('.video-js');
const direct = container && typeof api.getPlayer === 'function' ? api.getPlayer(container) : null;
if (direct && typeof direct.play === 'function' && !direct.isDisposed?.()) return direct;
const players = typeof api.getPlayers === 'function' ? Object.values(api.getPlayers()) : [];
for (const player of players) {
if (player && typeof player.play === 'function' && !player.isDisposed?.() && player.el?.()?.contains(video)) return player;
}
} catch (_) { /* Use the native API if no existing player is available. */ }
return null;
},
_revealVideo(video) {
const targets = [video];
let doc = video.ownerDocument;
for (let depth = 0; depth < 8; depth++) {
let frame;
try { frame = doc.defaultView.frameElement; } catch (_) { break; }
if (!frame) break;
targets.push(frame);
doc = frame.ownerDocument;
}
for (const target of targets.reverse()) {
try { target.scrollIntoView({ block: 'center', inline: 'nearest' }); } catch (_) {}
}
},
_requestPlayback(video) {
if (this._mediaRequest) return this._mediaRequest.promise;
if (this._playbackAttempts >= this.configs.maxPlaybackAttempts) {
const error = new Error('播放请求已达到重试上限，仍未确认实际进度');
error.name = 'PlaybackRetryLimit';
return Promise.reject(error);
}
this._playbackAttempts++;
this._progressConfirmed = false;
this._revealVideo(video);
this._applyPlaybackRate(video);
video.muted = true;
video.defaultMuted = true;
video.volume = 0;
const player = this._findVideoPlayer(video);
this._lastPlayMethod = player ? 'Video.js' : 'HTMLVideoElement';
const request = { promise: null, cancel: null };
let resolveRequest;
let rejectRequest;
request.promise = new Promise((resolve, reject) => { resolveRequest = resolve; rejectRequest = reject; });
let settled = false;
let timer = null;
const finish = (error) => {
if (settled) return;
settled = true;
if (timer) clearTimeout(timer);
if (this._mediaRequest === request) this._mediaRequest = null;
if (error) rejectRequest(error);
else resolveRequest();
};
request.cancel = () => {
const error = new Error('播放请求已取消');
error.name = 'AbortError';
finish(error);
};
this._mediaRequest = request;
timer = setTimeout(() => {
const error = new Error('播放接口等待超时');
error.name = 'TimeoutError';
finish(error);
}, this.configs.playRequestTimeoutMs);
try {
if (player && typeof player.muted === 'function') player.muted(true);
Promise.resolve(player ? player.play() : video.play()).then(() => finish(), finish);
} catch (error) { finish(error); }
return request.promise;
},
_stopPlayback(error) {
this._playbackStopped = true;
this._isPlaying = false;
this._cancelPlaybackTimers();
this._clearCheckInterval();
this._lastPlaybackError = { name: error.name || 'Error', message: String(error.message || error) };
const hint = error.name === 'NotAllowedError'
? '浏览器拒绝自动播放。请在播放器上点击一次播放；脚本不会继续反复请求。'
: '未能自动恢复播放，已停止重复重试。请保持课程页在前台，并检查播放器、网络和课程允许的倍率。';
console.error(hint, this._lastPlaybackError);
},
async _tryResumePlayback(reason) {
if (this._destroyed || this._nextUnitPending || this._videoTransitionTimer ||
this._mediaRequest || this._playRetryTimer || this._playbackStopped) return;
if (document.visibilityState === 'hidden') {
if (!this._waitingForForeground) console.warn('课程页当前在后台，等待回到前台后再恢复播放');
this._waitingForForeground = true;
return;
}
this._waitingForForeground = false;
const now = Date.now();
if (now - this._guardLastResumeTs < this.configs.guardResumeCooldownMs) {
return;
}
const video = this._getVideoEl();
if (!video || !this._isPlaying) return;
if (reason === 'page-event' && !video.paused) return;
this._guardLastResumeTs = now;
const requestId = ++this._playRequestId;
console.log(`正在请求恢复播放 (${reason})，实际进度恢复后才会确认成功`);
try {
await this._requestPlayback(video);
} catch (error) {
if (!this._destroyed && !this._nextUnitPending && requestId === this._playRequestId) this._handlePlayError(error);
}
},
_checkVideoStatus() {
try {
if (this._destroyed || this._nextUnitPending || this._videoTransitionTimer || this._playbackStopped) return;
const video = this._getVideoEl();
if (!video) return;
if (video.ended) {
this._handleVideoEnded({ currentTarget: video });
return;
}
if (this._eventVideoEl !== video) {
this.play();
return;
}
video.muted = true;
video.defaultMuted = true;
video.volume = 0;
const now = Date.now();
const current = Number(video.currentTime || 0);
const progressed = !video.paused && current > this._guardLastTime + 0.1;
if (progressed) {
this._playbackAttempts = 0;
this._lastPlaybackError = null;
if (!this._progressConfirmed) console.log(`已确认视频进度前进，实际倍率：${video.playbackRate}x`);
this._progressConfirmed = true;
this._guardLastWallTs = now;
this._guardLastTime = current;
}
if (video.paused && this._isPlaying) {
this._tryResumePlayback("paused");
} else if (this._isPlaying && !video.ended) {
if (this._guardLastWallTs === 0) {
this._guardLastWallTs = now;
this._guardLastTime = current;
} else {
const stalled = Math.abs(current - this._guardLastTime) < 0.01;
const stalledMs = now - this._guardLastWallTs;
if (stalled && stalledMs >= this.configs.guardNoProgressMs) {
this._tryResumePlayback("no-progress");
this._guardLastWallTs = now;
this._guardLastTime = Number(video.currentTime || 0);
} else if (!stalled) {
this._guardLastWallTs = now;
this._guardLastTime = current;
}
}
}
} catch (e) {
console.error("视频状态检查失败:", e);
}
},
_tryTimes: 0,
_stepAdvanceTimes: 0,
_stepSwitchAt: 0,
_stepSwitchPending: false,
_delayedNextUnitTimer: null,
_guardLastTime: 0,
_guardLastWallTs: 0,
_guardLastResumeTs: 0,
async play() {
if (this._destroyed || this._nextUnitPending || this._videoTransitionTimer) return;
try {
if (this._isChapterTest()) {
this._cancelPlaybackTimers();
this._detachVideoEvents();
this._videoEl = null;
this._isPlaying = false;
this._clearCheckInterval();
this._advanceChapterTest();
return;
}
if (this._mediaRequest || this._playbackStopped) return;
const el = this._getVideoEl();
if (el == null) {
const videos = this._getVideoEls();
if (videos.length && videos.every((video) => this._isVideoCompleted(video))) {
this.nextUnit();
return;
}
if (this._currentStepTitle() === '视频') {
throw new Error('视频组件尚未加载完成');
}
if (this._advanceLearningStep()) {
console.log("%c当前不在视频页，已尝试切到下一学习步骤，2秒后重试", "color:#607D8B");
this._schedulePlay(2000);
return;
}
if (this._isChapterTest()) {
this._advanceChapterTest();
return;
}
this._isPlaying = false;
this._clearCheckInterval();
if (this.configs.autoAdvanceNoVideo) {
console.warn('%c当前小节未发现视频，按配置切换到下一小节', 'color:#FF9800');
this.nextUnit();
} else {
console.warn('%c当前小节未发现视频或可识别的学习步骤，已安全停止。确认无需完成课件后，可执行 app.nextUnit()。', 'color:#FF9800');
}
return;
}
this._isPlaying = true;
this._videoEventHandle();
const requestId = ++this._playRequestId;
try {
await this._requestPlayback(el);
if (this._destroyed || this._nextUnitPending || requestId !== this._playRequestId) return;
this._tryTimes = 0;
console.log(`%c播放请求已接受 (${this._lastPlayMethod})，等待实际进度确认`, 'color:#4CAF50');
this._startVideoMonitoring();
} catch (playError) {
if (this._destroyed || this._nextUnitPending || requestId !== this._playRequestId) return;
console.error("视频播放失败:", playError);
this._handlePlayError(playError);
}
} catch (e) {
if (this._tryTimes >= this.configs.maxRetries) {
console.error("%c视频播放失败，已达到最大重试次数", "color:#F44336;font-weight:bold", e);
this._clearCheckInterval();
return;
}
this._tryTimes++;
console.log(`%c播放失败，${this.configs.retryInterval/1000}秒后重试 (${this._tryTimes}/${this.configs.maxRetries})`, "color:#FF9800");
this._schedulePlay(this.configs.retryInterval);
}
},
_advanceLearningStep() {
if (this._stepSwitchPending && Date.now() - this._stepSwitchAt < 4000) {
return true;
}
const currentStepTitle = this._currentStepTitle();

if (currentStepTitle === "章节测验" || currentStepTitle === "视频") {
return false;
}
const clickElement = (el, label) => {
if (!el) return false;
this._stepSwitchPending = true;
this._stepSwitchAt = Date.now();
console.log(`%c尝试点击${label}`, "color:#2196F3");
el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
return true;
};
const videoTab = $(".prev_white:visible").filter((_, el) => {
const text = ($(el).text() || "").replace(/\s+/g, "");
return text === "2视频" || text === "视频";
}).get(0);
if (clickElement(videoTab, "“视频”页签")) {
return true;
}
return false;
},
_currentStepTitle(scan = scanCourseContent()) {
// The outer page's video tab can lag behind an inner homework navigation.
if (scan.frames.some((frame) => isCourseQuizUrl(frame.source) || isCourseQuizUrl(frame.document?.URL)) ||
scan.documents.some((doc) => isCourseQuizUrl(doc.URL))) return '章节测验';
if (scan.documents.some((doc) => /[\[【](单选题|多选题|判断题|填空题)[\]】]/.test(doc.body?.innerText || ''))) {
return '章节测验';
}
const prevTitle = document.getElementsByClassName('prev_title')[0];
const text = prevTitle ? (prevTitle.title || prevTitle.textContent || '').replace(/\s+/g, '') : '';
if (/章节测验|章节练习|课后练习|随堂测验|^(?:\d+)?(?:练习|测验)$/.test(text)) return '章节测验';
if (/^(?:\d+)?视频$/.test(text) || this._getVideoEls(scan).length) return '视频';
const cardsFrame = scan.frames.find((frame) => frame.source.includes('/knowledge/cards'));
if (cardsFrame) {
const num = new URL(cardsFrame.source, location.href).searchParams.get('num');
if (num === '0') return '视频';
if (num === '1') return '章节测验';
}
return '';
},
_captureStepState() {
const scan = scanCourseContent();
const active = document.querySelector('.posCatalog_active');
return {
step: this._currentStepTitle(scan),
href: location.href,
active,
activeKey: active ? `${active.id || ''}:${active.textContent || ''}` : '',
frames: scan.frames,
videos: this._getVideoEls(scan).map((video) => ({ element: video, source: this._videoSourceKey(video) })),
};
},
_hasStepChanged(previous, current) {
if (previous.step !== current.step || previous.href !== current.href ||
previous.active !== current.active || previous.activeKey !== current.activeKey) return true;
if (previous.frames.length !== current.frames.length || previous.videos.length !== current.videos.length) return true;
return current.frames.some((frame, index) => {
const before = previous.frames[index];
return before.element !== frame.element || before.source !== frame.source || before.document !== frame.document;
}) || current.videos.some((video, index) => {
const before = previous.videos[index];
return before.element !== video.element || before.source !== video.source;
});
},
_isChapterTest() {
return this._currentStepTitle() === '章节测验';
},
_advanceChapterTest() {
if (this._chapterAdvanceTimes >= 3) {
console.error('%c章节测验页面连续跳转失败，已停止以避免页面循环。请手动处理后执行 app.run()。', 'color:#F44336;font-weight:bold');
return;
}
const nextButton = $('#prevNextFocusNext:visible, #right1:visible, .nextChapter:visible').first().get(0);
if (!nextButton) {
console.warn('%c未找到章节测验的下一步按钮，已停止。', 'color:#FF9800');
return;
}
this._chapterAdvanceTimes++;
console.log('%c检测到章节测验，尝试进入下一学习步骤', 'color:#607D8B');
nextButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
setTimeout(() => this.play(), 2000);
},
_bindStepNavigation() {
if (this._stepNavigationBound) {
return;
}
this._stepNavigationBound = true;
const reenterVideoMode = () => {
this._cancelPlaybackTimers();
this._detachVideoEvents();
this._tryTimes = 0;
this._playbackStopped = false;
this._playbackAttempts = 0;
this._progressConfirmed = false;
this._lastPlaybackError = null;
this._videoEl = null;
this._isPlaying = false;
this._stepSwitchPending = true;
this._stepSwitchAt = Date.now();
try { this._initCellData(); } catch (_) {}
this._schedulePlay(1800);
};
$(document).off('click.xuexitongPlayerV4', '.prev_white').on('click.xuexitongPlayerV4', '.prev_white', (e) => {
const text = ($(e.currentTarget).text() || "").replace(/\s+/g, "");
if (/视频|测验|练习/.test(text)) {
console.log(`%c检测到步骤切换点击：${text}，准备重新识别页面`, "color:#607D8B");
reenterVideoMode();
}
});
},
_handlePlayError(error) {
this._lastPlaybackError = { name: error.name || 'Error', message: String(error.message || error) };
if (['NotAllowedError', 'NotSupportedError', 'PlaybackRetryLimit'].includes(error.name) ||
this._playbackAttempts >= this.configs.maxPlaybackAttempts) {
this._stopPlayback(error);
return;
}
console.warn(`播放请求未成功 (${this._playbackAttempts}/${this.configs.maxPlaybackAttempts})，稍后重试:`, this._lastPlaybackError);
this._isPlaying = true;
this._startVideoMonitoring();
this._schedulePlay(this.configs.retryInterval);
},
playCurrentIndex(nCell) {
this._cancelPlaybackTimers();
this._nextUnitPending = false;
if (!nCell) {
const el = this._getTreeContainer();
const cells = el.children("ul").children("li");
const nCells = $(cells.get(this._cellData.currentCellIndex)).find('.posCatalog_select:not(.firstLayer)');
nCell = nCells.get(this._cellData.currentNCellIndex);
}
const $nCell = $(nCell);
const clickableSpan = $nCell.find(".posCatalog_name")[0];
if (!clickableSpan) {
console.error("%c===========找不到可点击的课程节点，播放下一个视频失败==============", "color:#F44336");
return;
}
console.log(`%c点击切换到: ${$(clickableSpan).attr('title') || '未知标题'}`, "color:#2196F3");
$(clickableSpan).click();
this._videoEl = null;
this._isPlaying = false;
console.log("%c等待视频加载...", "color:#FF9800");
setTimeout(() => {
this._initCellData();
if (this.configs.autoplay) {
this.play();
}
}, 3000);
},
_initCellData() {
const el = this._getTreeContainer();
const cells = el.children("ul").children("li");
this._cellData.cells = cells.length;
let nCellCounts = 0;
let foundCurrent = false;
cells.each((i, v) => {
const nCells = $(v).find('.posCatalog_select:not(.firstLayer)');
nCellCounts += nCells.length;
nCells.each((j, e) => {
const _el = $(e);
if (_el.hasClass("posCatalog_active")) {
this._cellData.currentCellIndex = i;
this._cellData.currentNCellIndex = j;
foundCurrent = true;
const titleSpan = _el.find('.posCatalog_name')[0];
if (titleSpan) {
this._cellData.currentVideoTitle = $(titleSpan).attr('title');
}
}
});
});
this._cellData.nCells = nCellCounts;

if (!foundCurrent && nCellCounts > 0) {
console.warn("%c未找到当前激活的视频节点，可能需要手动选择", "color:#FF9800");
}
console.log(`%c课程信息: ${this._cellData.cells}章, ${this._cellData.nCells}节, 当前: 第${this._cellData.currentCellIndex + 1}章第${this._cellData.currentNCellIndex + 1}节`, "color:#607D8B");
},
_getTreeContainer() {
if (!this._treeContainerEl) {
const el = $('#coursetree');
if (el.length <= 0) {
throw new Error("找不到视频列表");
}
this._treeContainerEl = el;
}
return this._treeContainerEl;
},
_getVideoEls(scan = scanCourseContent()) {
return Array.from(new Set(scan.videos.filter((video) => typeof video.play === 'function')));
},
_videoSourceKey(video) {
return video.currentSrc || video.getAttribute('src') ||
Array.from(video.querySelectorAll('source')).map((source) => source.getAttribute('src') || '').join('|');
},
_isVideoCompleted(video) {
return video.ended || this._completedVideos.get(video) === this._videoSourceKey(video);
},
_getVideoEl() {
const videos = this._getVideoEls();
// Keep an ended active video until its event/monitor has recorded completion.
if (this._videoEl && videos.includes(this._videoEl) &&
this._completedVideos.get(this._videoEl) !== this._videoSourceKey(this._videoEl)) return this._videoEl;
this._videoEl = videos.find((video) => !this._isVideoCompleted(video)) || null;
return this._videoEl;
},
_videoEventHandle() {
const el = this._videoEl;
if (!el) {
console.log("videoEl未加载");
return;
}
if (this._eventVideoEl === el) return;
this._detachVideoEvents();
this._eventVideoEl = el;
this._playbackAttempts = 0;
this._progressConfirmed = false;
this._lastPlaybackError = null;
this._boundVideoHandlers = {
ended: this._handleVideoEnded.bind(this),
loadedmetadata: this._handleVideoLoaded.bind(this),
play: this._handleVideoPlay.bind(this),
pause: this._handleVideoPause.bind(this),
};
el.addEventListener('ended', this._boundVideoHandlers.ended);
el.addEventListener('loadedmetadata', this._boundVideoHandlers.loadedmetadata);
el.addEventListener('play', this._boundVideoHandlers.play);
el.addEventListener('pause', this._boundVideoHandlers.pause);
},
_detachVideoEvents() {
if (!this._eventVideoEl || !this._boundVideoHandlers) return;
this._eventVideoEl.removeEventListener('ended', this._boundVideoHandlers.ended);
this._eventVideoEl.removeEventListener('loadedmetadata', this._boundVideoHandlers.loadedmetadata);
this._eventVideoEl.removeEventListener('play', this._boundVideoHandlers.play);
this._eventVideoEl.removeEventListener('pause', this._boundVideoHandlers.pause);
this._eventVideoEl = null;
this._boundVideoHandlers = null;
},
_handleVideoEnded(e) {
const video = e?.currentTarget || this._videoEl;
if (this._destroyed || this._nextUnitPending || this._videoTransitionTimer ||
!video || video !== this._videoEl || this._completedVideos.get(video) === this._videoSourceKey(video)) return;
this._completedVideos.set(video, this._videoSourceKey(video));
const title = this._cellData.currentVideoTitle;
console.warn(`%c============'${title}' 当前视频播放完成=============`, "color:#4CAF50;font-weight:bold");
this._isPlaying = false;
this._clearCheckInterval();
this._detachVideoEvents();
this._videoEl = null;
if (this._playRetryTimer) clearTimeout(this._playRetryTimer);
this._playRetryTimer = null;
if (this._mediaRequest) this._mediaRequest.cancel();
this._playRequestId++;
this._videoTransitionTimer = setTimeout(() => {
this._videoTransitionTimer = null;
if (this._destroyed || this._nextUnitPending) return;
if (this._isChapterTest()) {
this.play();
return;
}
if (this._getVideoEl()) {
console.log('当前页面还有未播放完的视频，继续播放同页下一个视频');
this._tryTimes = 0;
this.play();
} else {
console.log('当前页面的视频已全部播放完成，准备进入下一学习步骤');
this.nextUnit();
}
}, 1000);
},
_handleVideoLoaded(e) {
console.log(`%c============视频加载完成=============`, "color:#2196F3");
this._applyPlaybackRate(this._getVideoEl());
if (this.configs.autoplay && !this._isPlaying) {
this.play();
}
},
_handleVideoPlay(e) {
if (this._destroyed || this._nextUnitPending) return;
const video = e?.currentTarget || this._videoEl;
if (!video || video !== this._videoEl) return;
const title = this._cellData.currentVideoTitle;
console.info(`%c============'${title}' 收到播放事件，等待进度确认=============`, "color:#4CAF50");
if (this._playbackStopped && !this._mediaRequest) {
this._playbackStopped = false;
this._playbackAttempts = 0;
this._lastPlaybackError = null;
this._progressConfirmed = false;
this._startVideoMonitoring();
}
this._isPlaying = true;
this._stepSwitchPending = false;
this._guardLastTime = Number(video?.currentTime || 0);
this._guardLastWallTs = Date.now();
if (this._delayedNextUnitTimer) {
clearTimeout(this._delayedNextUnitTimer);
this._delayedNextUnitTimer = null;
}
},
_handleVideoPause(e) {
console.log(`%c============视频暂停=============`, "color:#FF9800");
},
_bindPageGuards() {
const preventPause = (e) => {
e.stopPropagation();
e.preventDefault();
};
const resumePlaybackNow = () => this._tryResumePlayback('page-event');
this._pageGuards = { preventPause, resumePlaybackNow };
document.addEventListener('mouseleave', preventPause);
window.addEventListener('mouseleave', preventPause);
document.addEventListener('mouseout', preventPause);
window.addEventListener('mouseout', preventPause);
window.addEventListener('blur', resumePlaybackNow);
document.addEventListener('visibilitychange', resumePlaybackNow);
},
destroy() {
this._destroyed = true;
this._cancelPlaybackTimers();
this._isPlaying = false;
this._clearCheckInterval();
this._detachVideoEvents();
if (this._delayedNextUnitTimer) clearTimeout(this._delayedNextUnitTimer);
$(document).off('.xuexitongPlayerV4');
if (this._pageGuards) {
const { preventPause, resumePlaybackNow } = this._pageGuards;
document.removeEventListener('mouseleave', preventPause);
window.removeEventListener('mouseleave', preventPause);
document.removeEventListener('mouseout', preventPause);
window.removeEventListener('mouseout', preventPause);
window.removeEventListener('blur', resumePlaybackNow);
document.removeEventListener('visibilitychange', resumePlaybackNow);
this._pageGuards = null;
}
},
};
attachQuizAutomation(app);
PAGE.app = app;
PAGE[APP_KEY] = app;
watchUserscriptStatus(app);

try {
app.run();
app._bindPageGuards();
} catch (error) {
app.destroy();
showUserscriptStatus(`脚本启动失败：${error.message || error}`, true);
console.error("%c脚本运行失败: ", "color:#F44336;font-weight:bold", error.message);
console.log("请检查是否在正确的课程播放页面，或者页面结构是否再次发生改变。");
}
}
})();
