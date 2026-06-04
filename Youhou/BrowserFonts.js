// ==UserScript==
// @name         质感字体
// @namespace    empty
// @version      0.16
// @description  让每个页面的字体变得有质感，页面滚动更平滑，字体换为系统优选字体并添加字体阴影
// @author       cherishding
// @match        *://*/*
// @run-at       document-start
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==

// v0.15 (2026-06) 调整:
//   [体验] 平滑滚动改为目标位置缓动，降低滚动幅度，接近 macOS 网页滚动手感
//
// v0.14 (2026-06) 修复:
//   [修复] 兼容 Firefox deltaMode（行单位 vs 像素单位）
//   [修复] 速度上限防止页面飞出
//   [修复] 缓存滚动目标避免每帧强制回流
//   [修复] 对话框 CSS 不再重复注入
//   [修复] 优化 wheel handler 中的可滚动容器查找
//   [修复] MutationObserver 仅监听 document.head
//   [修复] 细节：分号、class 选择器

(function () {
  "use strict";

  const MIN_SHADOW = 0;
  const MAX_SHADOW = 15;

  function normalizeShadow(value) {
    const shadow = Number.parseFloat(value);
    if (!Number.isFinite(shadow)) return 3;
    if (shadow < MIN_SHADOW) return MIN_SHADOW;
    if (shadow > MAX_SHADOW) return MAX_SHADOW;
    return shadow;
  }

  const shadow_r = normalizeShadow(GM_getValue("shadow_r", 3));
  const smoothscroll = GM_getValue("smoothscroll", true);

  // ======================== 内联平滑滚动 ========================

  if (smoothscroll) {
    GM_addStyle("html { scroll-behavior: auto; }");

    (function initSmoothScroll() {
      const SCROLL_SCALE = 0.45;     // 降低单次滚轮位移，接近 macOS 网页滚动幅度
      const EASING = 0.18;           // 越小越柔和，越大越跟手
      const MIN_DISTANCE = 0.5;
      const MAX_WHEEL_DELTA = 120;   // 单次 wheel 限幅，避免高 delta 设备滚动过猛
      const WHEEL_TIMEOUT = 180;     // 两次滚轮间隔超过此值重置目标位置（ms）

      let targetScrollTop = 0;
      let animating = false;
      let lastWheelTime = 0;

      // 缓存滚动目标，避免每帧读 scrollHeight 强制回流
      let cachedTarget = null;
      let cacheExpiry = 0;
      const CACHE_TTL = 500; // 缓存有效期（ms）
      let cachedWheelTarget = null;
      let cachedScrollableAncestor = null;
      let wheelCacheExpiry = 0;
      const WHEEL_TARGET_CACHE_TTL = 150; // wheel 事件短时间内通常来自同一目标

      function getScrollTarget() {
        const now = performance.now();
        if (cachedTarget && now < cacheExpiry) return cachedTarget;

        cachedTarget = document.scrollingElement || document.documentElement;
        cacheExpiry = now + CACHE_TTL;
        return cachedTarget;
      }

      function invalidateCache() {
        cachedTarget = null;
        cachedWheelTarget = null;
        cachedScrollableAncestor = null;
      }

      function invalidateScrollTarget() {
        cachedTarget = null;
      }

      // 内容变化可能导致可滚动容器改变
      let resizeObserver = null;
      let resizeListening = false;

      function startResizeTracking() {
        if ("ResizeObserver" in window) {
          if (!resizeObserver) {
            resizeObserver = new ResizeObserver(invalidateCache);
          }
          resizeObserver.observe(document.documentElement);
        } else if (!resizeListening) {
          window.addEventListener("resize", invalidateCache);
          resizeListening = true;
        }
      }

      function stopResizeTracking() {
        if (resizeObserver) resizeObserver.disconnect();
        if (resizeListening) {
          window.removeEventListener("resize", invalidateCache);
          resizeListening = false;
        }
        invalidateCache();
      }

      startResizeTracking();

      function clampScrollTop(value, target) {
        const maxScroll = target.scrollHeight - target.clientHeight;
        if (value < 0) return 0;
        if (value > maxScroll) return maxScroll;
        return value;
      }

      function animate() {
        const target = getScrollTarget();
        targetScrollTop = clampScrollTop(targetScrollTop, target);

        const distance = targetScrollTop - target.scrollTop;
        if (Math.abs(distance) < MIN_DISTANCE) {
          target.scrollTop = targetScrollTop;
          animating = false;
          return;
        }

        target.scrollTop += distance * EASING;

        requestAnimationFrame(animate);
      }

      /**
       * 将 deltaY 标准化为像素单位
       * Chrome: deltaMode=0, 单位是像素
       * Firefox: deltaMode=1, 单位是行（约 40px/行）
       * 极少数: deltaMode=2, 单位是页
       */
      function normalizeDelta(e) {
        let delta = e.deltaY;
        if (e.deltaMode === 1) delta *= 40;      // 行 → 像素
        else if (e.deltaMode === 2) delta *= 800; // 页 → 像素
        if (delta > MAX_WHEEL_DELTA) return MAX_WHEEL_DELTA;
        if (delta < -MAX_WHEEL_DELTA) return -MAX_WHEEL_DELTA;
        return delta;
      }

      /**
       * 检查元素是否是可独立滚动的容器
       * 快速路径：先读 overflowY，再判断滚动能力
       */
      function findScrollableAncestor(el) {
        if (el && el.nodeType !== Node.ELEMENT_NODE) {
          el = el.parentElement;
        }

        const now = performance.now();
        if (el === cachedWheelTarget && now < wheelCacheExpiry) {
          return cachedScrollableAncestor;
        }

        const originalEl = el;
        let scrollable = null;
        while (el && el !== document.documentElement && el !== document.body) {
          // overflowY 只在元素可滚动时才值得读
          const ovY = el.style.overflowY || "";
          // 快速排除明显不可滚动的情况
          if (
            ovY !== "hidden" &&
            ovY !== "visible" &&
            el.scrollHeight > el.clientHeight
          ) {
            // 需要精确值时再读 computedStyle
            const computed = getComputedStyle(el).overflowY;
            if (computed === "auto" || computed === "scroll") {
              scrollable = el;
              break;
            }
          }
          el = el.parentElement;
        }

        cachedWheelTarget = originalEl;
        cachedScrollableAncestor = scrollable;
        wheelCacheExpiry = now + WHEEL_TARGET_CACHE_TTL;
        return scrollable;
      }

      function onWheel(e) {
        if (e.defaultPrevented) return;

        // 保留浏览器缩放和触控板 pinch 手势
        if (e.ctrlKey || e.metaKey) return;
        if (e.deltaY === 0) return;

        // 查找可滚动的子容器
        const scrollable = findScrollableAncestor(e.target);
        if (scrollable) {
          const atTop = scrollable.scrollTop <= 0 && e.deltaY < 0;
          const atBottom =
            scrollable.scrollTop + scrollable.clientHeight >=
              scrollable.scrollHeight - 1 && e.deltaY > 0;
          // 子容器还能滚动，不接管
          if (!atTop && !atBottom) return;
        }

        const target = getScrollTarget();
        if (target.scrollHeight <= target.clientHeight) return;

        e.preventDefault();

        const now = performance.now();
        if (now - lastWheelTime > WHEEL_TIMEOUT) {
          targetScrollTop = target.scrollTop;
        }
        lastWheelTime = now;

        targetScrollTop = clampScrollTop(
          targetScrollTop + normalizeDelta(e) * SCROLL_SCALE,
          target
        );

        if (!animating) {
          animating = true;
          // 开始动画前刷新缓存目标
          invalidateScrollTarget();
          requestAnimationFrame(animate);
        }
      }

      let wheelListening = false;

      function startWheelTracking() {
        if (wheelListening) return;
        window.addEventListener("wheel", onWheel, { passive: false });
        wheelListening = true;
      }

      function stopWheelTracking() {
        if (!wheelListening) return;
        window.removeEventListener("wheel", onWheel);
        wheelListening = false;
      }

      window.addEventListener("pagehide", () => {
        stopWheelTracking();
        stopResizeTracking();
        targetScrollTop = 0;
        animating = false;
      });

      window.addEventListener("pageshow", () => {
        startResizeTracking();
        startWheelTracking();
      });

      startWheelTracking();
    })();
  }

  // ======================== 质感字体样式 ========================

  const FONT_CSS = `
    :root {
      --zg-font: 'PingFang SC', 'HarmonyOS Sans SC', 'LXGW WenKai',
                 'Microsoft YaHei', 'Source Han Sans SC', 'Noto Sans CJK SC',
                 system-ui, -apple-system, sans-serif;
      --zg-shadow: 1px 1px ${shadow_r}px #c3c3c3;
    }

    html, body {
      font-family: var(--zg-font) !important;
    }

    body {
      font-weight: bold !important;
      ${shadow_r > 0 ? "text-shadow: var(--zg-shadow) !important;" : ""}
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
      ${shadow_r > 0 ? "text-shadow: var(--zg-shadow) !important;" : ""}
    }

    html body pre, html body code, html body kbd, html body samp,
    html body pre *, html body code *, html body kbd *, html body samp * {
      font-family: ui-monospace, SFMono-Regular, Consolas, 'Liberation Mono', monospace !important;
      font-weight: normal !important;
      text-shadow: none !important;
    }

    html body input, html body textarea, html body select, html body button,
    html body [contenteditable='true'], html body [contenteditable='true'] *,
    html body .monaco-editor, html body .monaco-editor *,
    html body .CodeMirror, html body .CodeMirror * {
      font-weight: normal !important;
      text-shadow: none !important;
    }

    html body [class*='icon'], html body [class*='icon'] *,
    html body [class*='Icon'], html body [class*='Icon'] *,
    html body .fa, html body .fa *,
    html body .fas, html body .fas *,
    html body .far, html body .far *,
    html body .fab, html body .fab *,
    html body .material-icons, html body .material-icons *,
    html body .material-symbols-outlined, html body .material-symbols-outlined * {
      text-shadow: none !important;
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

  // ======================== 设置窗口 ========================

  // 对话框样式只注入一次
  const DIALOG_STYLE_ID = "zg-dialog-style";
  let dialogStyleEl = null;

  function ensureDialogStyle() {
    if (document.getElementById(DIALOG_STYLE_ID)) return;
    dialogStyleEl = GM_addStyle(`
      #zg-font-dialog {
        border: none;
        border-radius: 0 0 12px 12px;
        padding: 0;
        margin: 0;
        box-shadow: 0 4px 24px rgba(0, 0, 0, 0.25);
        overflow: hidden;
        animation: zg-slide-in 0.25s ease-out;
      }
      #zg-font-dialog::backdrop {
        background: rgba(0, 0, 0, 0.15);
        backdrop-filter: blur(2px);
      }
      #zg-font-dialog.zg-dialog-fallback {
        position: fixed;
        inset: 0;
        z-index: 2147483647;
        display: flex;
        align-items: flex-start;
        justify-content: flex-start;
        background: rgba(0, 0, 0, 0.15);
        backdrop-filter: blur(2px);
        border-radius: 0;
      }
      @keyframes zg-slide-in {
        from { transform: translateY(-30px); opacity: 0; }
        to   { transform: translateY(0);     opacity: 1; }
      }
      .zg-dialog-body {
        width: 300px;
        padding: 20px;
        font-family: var(--zg-font);
        color: #333;
      }
      .zg-row {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 16px;
      }
      .zg-row:last-child {
        margin-bottom: 0;
      }
      .zg-label {
        font-size: 14px;
        min-width: 70px;
      }
      .zg-hint {
        font-size: 11px;
        color: #999;
      }
      .zg-switch {
        appearance: none;
        -webkit-appearance: none;
        width: 44px;
        height: 24px;
        border-radius: 12px;
        background: #ccc;
        position: relative;
        cursor: pointer;
        transition: background 0.25s;
        flex-shrink: 0;
      }
      .zg-switch::before {
        content: '';
        position: absolute;
        width: 20px;
        height: 20px;
        border-radius: 50%;
        background: #fff;
        top: 2px;
        left: 2px;
        box-shadow: 0 1px 3px rgba(0,0,0,0.3);
        transition: transform 0.25s;
      }
      .zg-switch:checked {
        background: #4caf50;
      }
      .zg-switch:checked::before {
        transform: translateX(20px);
      }
      .zg-range {
        appearance: none;
        -webkit-appearance: none;
        flex: 1;
        height: 6px;
        border-radius: 3px;
        background: #e0e0e0;
        outline: none;
      }
      .zg-range::-webkit-slider-thumb {
        appearance: none;
        -webkit-appearance: none;
        width: 18px;
        height: 18px;
        border-radius: 50%;
        background: #1976d2;
        box-shadow: 0 1px 4px rgba(0,0,0,0.3);
        cursor: pointer;
        transition: box-shadow 0.2s;
      }
      .zg-range::-webkit-slider-thumb:hover {
        box-shadow: 0 2px 8px rgba(0,0,0,0.4);
      }
      .zg-range::-moz-range-thumb {
        width: 18px;
        height: 18px;
        border-radius: 50%;
        background: #1976d2;
        box-shadow: 0 1px 4px rgba(0,0,0,0.3);
        border: none;
        cursor: pointer;
      }
      .zg-preview {
        font-size: 16px;
        padding: 4px 12px;
        border-radius: 4px;
        background: #f5f5f5;
        white-space: nowrap;
      }
      .zg-btn-row {
        display: flex;
        justify-content: space-between;
        margin-top: 20px;
      }
      .zg-btn {
        border: none;
        border-radius: 8px;
        padding: 8px 24px;
        font-size: 14px;
        cursor: pointer;
        transition: all 0.15s;
        font-family: var(--zg-font);
      }
      .zg-btn:active {
        transform: scale(0.95);
      }
      .zg-btn-cancel {
        background: #ef5350;
        color: #fff;
      }
      .zg-btn-cancel:hover {
        background: #e53935;
      }
      .zg-btn-submit {
        background: #66bb6a;
        color: #fff;
      }
      .zg-btn-submit:hover {
        background: #4caf50;
      }
    `);
    dialogStyleEl.id = DIALOG_STYLE_ID;
  }

  GM_registerMenuCommand("质感字体 设置", showDialog);

  async function getDialogHost() {
    if (document.body) return document.body;

    if (document.readyState === "loading") {
      await new Promise((resolve) => {
        document.addEventListener("DOMContentLoaded", resolve, { once: true });
      });
    }

    return document.body || document.documentElement;
  }

  async function showDialog() {
    if (document.querySelector("#zg-font-dialog")) return;

    ensureDialogStyle();

    const host = await getDialogHost();
    if (document.querySelector("#zg-font-dialog")) return;

    const dialog = document.createElement("dialog");
    let supportsDialog = typeof dialog.showModal === "function";
    let dialogClosed = false;
    let dialogRemoved = false;
    dialog.id = "zg-font-dialog";
    if (!supportsDialog) {
      dialog.className = "zg-dialog-fallback";
      dialog.setAttribute("role", "dialog");
      dialog.setAttribute("aria-modal", "true");
    }

    function closeDialog() {
      if (dialogClosed) return;
      dialogClosed = true;

      if (typeof dialog.close === "function" && dialog.open) {
        try {
          dialog.close();
          return;
        } catch (_) {
        }
      }

      dialog.dispatchEvent(new Event("close"));
    }

    function onKeyDown(e) {
      if (!supportsDialog && e.key === "Escape") {
        closeDialog();
      }
    }

    const currentSmooth = GM_getValue("smoothscroll", true);
    const currentShadow = normalizeShadow(GM_getValue("shadow_r", 3));

    dialog.innerHTML = `
      <div class="zg-dialog-body">
        <div class="zg-row">
          <span class="zg-label">平滑滚动</span>
          <input type="checkbox" class="zg-switch" id="zg-smooth" ${currentSmooth ? "checked" : ""}>
          <span class="zg-hint">刷新后生效</span>
        </div>
        <div class="zg-row">
          <span class="zg-label">阴影</span>
          <input type="range" class="zg-range" id="zg-shadow" min="0" max="15" step="0.5" value="${currentShadow}">
          <span class="zg-preview" id="zg-preview" style="text-shadow: 1px 1px ${currentShadow}px #c3c3c3">效果预览</span>
        </div>
        <div class="zg-btn-row">
          <button class="zg-btn zg-btn-cancel" id="zg-cancel">取消</button>
          <button class="zg-btn zg-btn-submit" id="zg-save">保存</button>
        </div>
      </div>
    `;

    host.appendChild(dialog);
    if (supportsDialog) {
      try {
        dialog.showModal();
      } catch (_) {
        supportsDialog = false;
        dialog.className = "zg-dialog-fallback";
        dialog.setAttribute("role", "dialog");
        dialog.setAttribute("aria-modal", "true");
      }
    }

    if (!supportsDialog) {
      window.addEventListener("keydown", onKeyDown);
    }

    const rangeInput = dialog.querySelector("#zg-shadow");
    const previewSpan = dialog.querySelector("#zg-preview");
    const smoothInput = dialog.querySelector("#zg-smooth");

    rangeInput.addEventListener("input", () => {
      const val = parseFloat(rangeInput.value);
      previewSpan.style.textShadow = `1px 1px ${val}px #c3c3c3`;
    });

    dialog.querySelector("#zg-cancel").addEventListener("click", () => {
      closeDialog();
    });

    dialog.addEventListener("click", (e) => {
      if (e.target === dialog) closeDialog();
    });

    dialog.querySelector("#zg-save").addEventListener("click", () => {
      GM_setValue("smoothscroll", smoothInput.checked);
      GM_setValue("shadow_r", normalizeShadow(rangeInput.value));
      closeDialog();
    });

    dialog.addEventListener("close", () => {
      if (dialogRemoved) return;
      dialogClosed = true;
      dialogRemoved = true;
      window.removeEventListener("keydown", onKeyDown);
      dialog.remove();
    });
  }
})();
