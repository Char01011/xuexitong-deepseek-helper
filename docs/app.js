(() => {
  const storageKey = 'xuexitong-guide-4.7.5-checklist';
  const checks = [...document.querySelectorAll('[data-step]')];
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(storageKey) || '{}'); } catch {}
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) saved = {};
  const update = () => {
    const done = checks.filter((input) => input.checked).length;
    document.getElementById('progress-text').textContent = `已完成 ${done} / ${checks.length} 项`;
    document.getElementById('progress-bar').style.width = `${done / checks.length * 100}%`;
    try { localStorage.setItem(storageKey, JSON.stringify(Object.fromEntries(checks.map((input) => [input.dataset.step, input.checked])))); } catch {}
  };
  checks.forEach((input) => { input.checked = saved[input.dataset.step] === true; input.addEventListener('change', update); });
  update();
  document.getElementById('reset-checklist').addEventListener('click', () => { checks.forEach((input) => { input.checked = false; }); update(); });
  const toast = (value) => { const node = document.getElementById('toast'); node.textContent = value; node.classList.add('show'); setTimeout(() => node.classList.remove('show'), 2500); };
  document.querySelectorAll('[data-copy]').forEach((button) => button.addEventListener('click', async () => {
    const node = document.getElementById(button.dataset.copy);
    try { await navigator.clipboard.writeText(node.textContent); toast('已复制'); }
    catch { const range = document.createRange(); range.selectNodeContents(node); const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range); toast('已选中文字，请按 Ctrl+C 复制'); }
  }));
  const issues = [...document.querySelectorAll('.issue')];
  const search = document.getElementById('issue-search');
  const filter = () => { const value = search.value.trim().toLowerCase(); let count = 0; issues.forEach((node) => { const match = `${node.textContent} ${node.dataset.key}`.toLowerCase().includes(value); node.hidden = !match; if (match) count++; }); document.getElementById('search-count').textContent = value ? `找到 ${count} 项相关问题` : `${issues.length} 个常见现象`; document.getElementById('no-results').hidden = count !== 0; };
  search.addEventListener('input', filter); filter();
  const flows = {
    browser: ['浏览器：找到当前步骤和真实答案控件', '递归检查可访问 iframe，识别四种题型与每题空数。视频队列、章节切换和测验状态分别管理，避免一个计时器误启动两份任务。'],
    local: ['本地服务：校验后再转发', '只监听本机回环地址，用临时令牌验证请求。API Key 留在服务进程内存；收到题目后先核对数据结构，再调用 DeepSeek。'],
    model: ['DeepSeek：分批返回结构化结果', '浏览器按每批 10 题顺序请求。选择题用 letters，填空题用按空位顺序排列的 blanks。所有批次都通过校验后才回填页面。'],
    verify: ['回填与核对：把“调用成功”和“结果成功”分开', '普通输入框通过表单事件更新，UEditor 通过现有实例写入并同步；再次读取各空结果，确认完整后提交，等待成绩或完成标记，再进入下一步。'],
  };
  const flowButtons = [...document.querySelectorAll('[data-flow]')];
  const selectFlow = (key) => { flowButtons.forEach((button) => { const active = button.dataset.flow === key; button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active)); }); const host = document.getElementById('flow-detail'); host.replaceChildren(); const title = document.createElement('b'); title.textContent = flows[key][0]; const paragraph = document.createElement('p'); paragraph.textContent = flows[key][1]; host.append(title, paragraph); };
  flowButtons.forEach((button) => button.addEventListener('click', () => selectFlow(button.dataset.flow))); selectFlow('browser');
  if ('IntersectionObserver' in window) { const observer = new IntersectionObserver((entries) => { entries.forEach((entry) => { if (!entry.isIntersecting) return; document.querySelectorAll('nav a').forEach((link) => link.classList.toggle('current', link.hash === `#${entry.target.id}`)); }); }, { rootMargin: '-10% 0px -65% 0px' }); document.querySelectorAll('section[id]').forEach((section) => observer.observe(section)); }
  if (location.protocol === 'file:') {
    document.getElementById('offline-note').hidden = false;
    document.querySelectorAll('[data-package]').forEach((link) => { link.href = '#install'; link.removeAttribute('download'); link.textContent = '继续安装步骤 →'; });
    document.querySelectorAll('a[href^="downloads/"]').forEach((link) => { const text = document.createElement('span'); text.textContent = '校验文件请在在线下载页获取'; link.replaceWith(text); });
  }
})();
