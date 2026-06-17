// ==UserScript==
// @name         质感字体
// @namespace    empty
// @version      0.20
// @description  让每个页面的字体变得有质感，字体换为系统优选字体
// @author       cherishding
// @match        *://*/*
// @run-at       document-start
// @grant        GM_addStyle
// ==/UserScript==

// v0.20 (2026-06) 调整:
//   [新增] 添加网站排除列表，可跳过指定网站
// v0.19 (2026-06) 调整:
//   [移除] 移除字体阴影功能，仅保留质感字体
// v0.18 (2026-06) 调整:
//   [优化] 阴影调节力度降低(0-5,步长0.1),弹框宽度增加至400px
// v0.17 (2026-06) 调整:
//   [移除] 移除平滑滚动功能，仅保留字体渲染

(function () {
  "use strict";

  // ======================== 网站排除列表 ========================
  // 在以下网站中，脚本不会生效（支持子域名匹配）
  const EXCLUDE_SITES = [
    // 'example.com',        // 示例：排除整个 example.com 域名
    // 'dribbble.com',       // 设计类网站
    // 'behance.net',        // 设计类网站
    // 'figma.com',          // 设计工具
    // 'fonts.google.com',   // 字体预览网站
  ];

  // 检查当前网站是否在排除列表中
  const currentHostname = location.hostname.toLowerCase();
  const isExcluded = EXCLUDE_SITES.some(site =>
    currentHostname === site || currentHostname.endsWith('.' + site)
  );

  if (isExcluded) {
    console.log('[质感字体] 当前网站在排除列表中，脚本已跳过');
    return;
  }

  // ======================== 质感字体样式 ========================

  const FONT_CSS = `
    :root {
      --zg-font: 'PingFang SC', 'HarmonyOS Sans SC', 'LXGW WenKai',
                 'Microsoft YaHei', 'Source Han Sans SC', 'Noto Sans CJK SC',
                 system-ui, -apple-system, sans-serif;
    }

    html, body {
      font-family: var(--zg-font) !important;
    }

    body {
      font-weight: bold !important;
    }

    html body p, html body span, html body div, html body a,
    html body li, html body dt, html body dd,
    html body label, html body legend,
    html body h1, html body h2, html body h3,
    html body h4, html body h5, html body h6,
    html body th, html body td, html body caption,
    html body blockquote, html body cite, html body summary,
    html body details, html body small, html body strong,
    html body em, html body b, html body u {
      font-family: var(--zg-font) !important;
      font-weight: bold !important;
    }

    html body pre, html body code, html body kbd, html body samp,
    html body pre *, html body code *, html body kbd *, html body samp * {
      font-family: ui-monospace, SFMono-Regular, Consolas, 'Liberation Mono', monospace !important;
      font-weight: normal !important;
    }

    html body input, html body textarea, html body select, html body button,
    html body [contenteditable='true'], html body [contenteditable='true'] *,
    html body .monaco-editor, html body .monaco-editor *,
    html body .CodeMirror, html body .CodeMirror * {
      font-weight: normal !important;
    }
  `;

  const zgStyle = GM_addStyle(FONT_CSS);

  function ensureStyleInHead() {
    if (!document.head) return;
    if (!document.head.contains(zgStyle)) {
      document.head.append(zgStyle);
    }
  }

  function observeHeadStyle() {
    if (!document.head) {
      requestAnimationFrame(observeHeadStyle);
      return;
    }

    ensureStyleInHead();
    // MutationObserver 仅监听 document.head，防清除
    const styleObserver = new MutationObserver(ensureStyleInHead);
    styleObserver.observe(document.head, { childList: true });
  }

  observeHeadStyle();
})();
