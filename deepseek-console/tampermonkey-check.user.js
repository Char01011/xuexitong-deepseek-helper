// ==UserScript==
// @name         学习通油猴执行自检
// @namespace    local.codex.xuexitong.diagnostic
// @version      1.0.0
// @description  仅显示执行成功提示，不播放视频、不请求答案、不提交题目
// @match        https://*.chaoxing.com/mycourse/studentstudy*
// @match        https://*.chaoxing.com/mooc2-ans/mycourse/studentstudy*
// @run-at       document-idle
// @sandbox      raw
// @grant        none
// @noframes
// ==/UserScript==

(function () {
    const banner = document.createElement('div');
    banner.id = 'xuexitong-tampermonkey-check';
    banner.textContent = `油猴自检成功（${window === window.top ? '顶层页面' : '内嵌页面'}）`;
    banner.style.cssText = 'position:fixed;top:10px;left:10px;z-index:2147483647;background:#087b35;color:white;padding:14px 20px;font:18px sans-serif;pointer-events:none;border-radius:6px';
    document.documentElement.appendChild(banner);
})();
