// ==UserScript==
// @name         质感字体&&页面平滑滚动
// @namespace    http://svnzk.github.io/
// @version      0.13
// @description  让每个页面的字体变得有质感，页面滚动更平滑，字体换为系统优选字体并添加字体阴影
// @author       svnzk
// @match        *://*/*
// @run-at       document-start
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==

// v0.13 (2026-06) 重构:
//   [移除] SmoothScroll CDN 依赖，改用内联轻量实现
//   [优化] 使用 CSS 变量管理主题
//   [优化] 字体栈更新，加入 system-ui 和现代中文字体
//   [优化] 设置窗口改用原生 <dialog> 元素
//   [优化] 样式防清除改用 MutationObserver
//   [优化] 去掉过时的浏览器前缀
//   [优化] 使用结构化的 CSS 而非拼接字符串

(function () {
  "use strict";

  const shadow_r = GM_getValue("shadow_r", 3);
  const smoothscroll = GM_getValue("smoothscroll", true);

  // ======================== 内联平滑滚动 ========================

  if (smoothscroll) {
    const SMOOTH_SCROLL_CSS = `
      html {
        scroll-behavior: auto; /* 禁用原生，由 JS 接管 */
      }
    `;
    GM_addStyle(SMOOTH_SCROLL_CSS);

    (function initSmoothScroll() {
      const SCROLL_SPEED = 1.2;    // 滚动速度系数
      const DAMPING = 0.92;        // 阻尼系数（越小停得越快）
      const MIN_VELOCITY = 0.5;    // 低于此值视为停止（px）

      let velocity = 0;            // 当前速度（像素/帧）
      let animating = false;
      let lastWheelTime = 0;

      function getScrollTarget() {
        // 优先滚动 documentElement，fallback 到 body
        const docEl = document.documentElement;
        const body = document.body;
        if (docEl.scrollHeight > docEl.clientHeight) return docEl;
        if (body.scrollHeight > body.clientHeight) return body;
        return docEl;
      }

      function getMaxScroll(target) {
        return target.scrollHeight - target.clientHeight;
      }

      function animate() {
        if (Math.abs(velocity) < MIN_VELOCITY) {
          animating = false;
          velocity = 0;
          return;
        }

        const target = getScrollTarget();
        const maxScroll = getMaxScroll(target);
        let next = target.scrollTop + velocity;

        // 边界钳位
        if (next < 0) next = 0;
        if (next > maxScroll) next = maxScroll;

        target.scrollTop = next;
        velocity *= DAMPING;

        requestAnimationFrame(animate);
      }

      function onWheel(e) {
        // 如果在可独立滚动的子元素内，且子元素未到边界，不接管
        let el = e.target;
        while (el && el !== document.documentElement && el !== document.body) {
          const style = getComputedStyle(el);
          const overflowY = style.overflowY;
          if (
            (overflowY === "auto" || overflowY === "scroll") &&
            el.scrollHeight > el.clientHeight
          ) {
            const atTop = el.scrollTop === 0 && e.deltaY < 0;
            const atBottom =
              el.scrollTop + el.clientHeight >= el.scrollHeight - 1 &&
              e.deltaY > 0;
            if (!atTop && !atBottom) return; // 子元素还能滚动，不管
            break;
          }
          el = el.parentElement;
        }

        e.preventDefault();

        const now = performance.now();
        // 如果距离上次滚轮超过 200ms，重置速度（开始新的滚动动作）
        if (now - lastWheelTime > 200) {
          velocity = 0;
        }
        lastWheelTime = now;

        velocity += e.deltaY * SCROLL_SPEED;

        if (!animating) {
          animating = true;
          requestAnimationFrame(animate);
        }
      }

      // passive: false 才能 preventDefault
      window.addEventListener("wheel", onWheel, { passive: false });
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

    *:not([class*='icon']):not(.fa):not(.fas):not(i):not(svg):not(path) {
      font-family: var(--zg-font) !important;
      font-weight: bold !important;
      ${shadow_r > 0 ? "text-shadow: var(--zg-shadow) !important;" : ""}
    }
  `;

  const zgStyle = GM_addStyle(FONT_CSS);

  // MutationObserver 防清除
  const styleObserver = new MutationObserver(() => {
    if (!document.head.contains(zgStyle)) {
      document.head.append(zgStyle);
    }
  });
  styleObserver.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  // ======================== 设置窗口 ========================

  GM_registerMenuCommand("质感字体 设置", showDialog);

  function showDialog() {
    // 避免重复创建
    if (document.querySelector("#zg-font-dialog")) return;

    const DIALOG_CSS = `
      #zg-font-dialog {
        border: none;
        border-radius: 0 0 12px 12px;
        padding: 0;
        box-shadow: 0 4px 24px rgba(0, 0, 0, 0.25);
        overflow: hidden;
        animation: zg-slide-in 0.25s ease-out;
      }
      #zg-font-dialog::backdrop {
        background: rgba(0, 0, 0, 0.15);
        backdrop-filter: blur(2px);
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

      /* 开关 */
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

      /* 滑块 */
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

      /* 预览 */
      .zg-preview {
        font-size: 16px;
        padding: 4px 12px;
        border-radius: 4px;
        background: #f5f5f5;
        white-space: nowrap;
      }

      /* 按钮区 */
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
    `;

    const style = GM_addStyle(DIALOG_CSS);

    const dialog = document.createElement("dialog");
    dialog.id = "zg-font-dialog";

    const currentSmooth = GM_getValue("smoothscroll", true);
    const currentShadow = GM_getValue("shadow_r", 3);

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

    document.body.appendChild(dialog);
    dialog.showModal();

    const rangeInput = dialog.querySelector("#zg-shadow");
    const previewSpan = dialog.querySelector("#zg-preview");
    const smoothInput = dialog.querySelector("#zg-smooth");

    // 实时预览阴影
    rangeInput.addEventListener("input", () => {
      const val = parseFloat(rangeInput.value);
      previewSpan.style.textShadow = `1px 1px ${val}px #c3c3c3`;
    });

    // 取消
    dialog.querySelector("#zg-cancel").addEventListener("click", () => {
      dialog.close();
    });

    // 点击 backdrop 关闭
    dialog.addEventListener("click", (e) => {
      if (e.target === dialog) dialog.close();
    });

    // Esc 关闭（dialog 原生支持）

    // 保存
    dialog.querySelector("#zg-save").addEventListener("click", () => {
      GM_setValue("smoothscroll", smoothInput.checked);
      GM_setValue("shadow_r", parseFloat(rangeInput.value));
      dialog.close();
    });

    // 清理
    dialog.addEventListener("close", () => {
      dialog.remove();
      style.remove();
    });
  }
})();
