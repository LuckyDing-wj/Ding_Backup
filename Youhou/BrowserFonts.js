// ==UserScript==
// @name         质感字体
// @namespace    empty
// @version      0.18
// @description  让每个页面的字体变得有质感，字体换为系统优选字体并添加字体阴影
// @author       cherishding
// @match        *://*/*
// @run-at       document-start
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==

// v0.18 (2026-06) 调整:
//   [优化] 阴影调节力度降低(0-5,步长0.1),弹框宽度增加至400px
// v0.17 (2026-06) 调整:
//   [移除] 移除平滑滚动功能，仅保留字体渲染

(function () {
  "use strict";

  const MIN_SHADOW = 0;
  const MAX_SHADOW = 5;

  function normalizeShadow(value) {
    const shadow = Number.parseFloat(value);
    if (!Number.isFinite(shadow)) return 3;
    if (shadow < MIN_SHADOW) return MIN_SHADOW;
    if (shadow > MAX_SHADOW) return MAX_SHADOW;
    return shadow;
  }

  const shadow_r = normalizeShadow(GM_getValue("shadow_r", 3));

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
        width: 400px;
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
        min-width: 80px;
        text-align: center;
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

    const currentShadow = normalizeShadow(GM_getValue("shadow_r", 3));

    dialog.innerHTML = `
      <div class="zg-dialog-body">
        <div class="zg-row">
          <span class="zg-label">阴影</span>
          <input type="range" class="zg-range" id="zg-shadow" min="0" max="5" step="0.1" value="${currentShadow}">
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
