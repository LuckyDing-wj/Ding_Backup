// ==UserScript==
// @name         LinuxDo 增强阅读
// @namespace    https://github.com/LuckyDing-wj/Ding_Backup
// @version      0.0.1
// @license      MIT
// @description  LINUX DO 列表页标题弹窗预览与论坛菜单修复：平铺楼层、点赞/表情、回复、Boost、收藏与图片灯箱
// @author       LuckyDing
// @match        https://linux.do/*
// @icon         https://cdn3.ldstatic.com/optimized/4X/6/a/6/6a6affc7b1ce8140279e959d32671304db06d5ab_2_180x180.png
// @grant        none
// @run-at       document-start
// @homepageURL  https://github.com/LuckyDing-wj/Ding_Backup/blob/main/Youhou/LinuxDoEnhanceRead.js
// @supportURL   https://github.com/LuckyDing-wj/Ding_Backup/issues
// @downloadURL  https://raw.githubusercontent.com/LuckyDing-wj/Ding_Backup/main/Youhou/LinuxDoEnhanceRead.js
// @updateURL    https://raw.githubusercontent.com/LuckyDing-wj/Ding_Backup/main/Youhou/LinuxDoEnhanceRead.js
// ==/UserScript==

/*
 * ============ 修改声明 ============
 * 原作者:   Fashion / You
 * 原出处:   https://greasyfork.org/scripts/584412
 *           https://greasyfork.org/scripts/567973
 * 原脚本:   https://update.greasyfork.org/scripts/584412/LinuxDo%20%E5%A2%9E%E5%BC%BA%E9%98%85%E8%AF%BB.user.js
 *           https://update.greasyfork.org/scripts/567973/linuxdo-dark.user.js
 *
 * 本副本为个人修改自用，保留原作者与原出处版权。
 * 本分支进行个人维护与定制。
 * ============ 修改声明 ============
 */

/* ============ 菜单修复模块（原 linuxdo-dark.js） ============ */
(function() {
    'use strict';

    // ========== 修复：通知/用户菜单在点击页面任意位置时反复弹出 ==========
    // Discourse 的 closeOnClickOutside 在 document 的 pointerdown 上调用菜单的“切换”函数（不是“关闭”）。
    // 某次关闭菜单时若 Ember 的销毁流程被中断，组件 DOM 已移除，这个监听器却没被清理：
    // 之后菜单关着时点任意处会把它切开，菜单开着时点面板内部又会把它切关。
    const pageWindow = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
    const MENU_FIX_TRIGGERS = ['pointerdown', 'keydown'];
    const HEADER_MENU_GUARDS = [
        { prop: 'userVisible', toggle: '#current-user', panel: '.user-menu-dropdown-wrapper' },
        { prop: 'hamburgerVisible', toggle: '.hamburger-dropdown, .header-sidebar-toggle', panel: '.hamburger-dropdown-wrapper' },
    ];
    let menuFixInstalled = false;

    function matchesClosest(target, selector) {
        return typeof target?.closest === 'function' && target.closest(selector) !== null;
    }

    // 治本：元素已脱离文档的旧 closeOnClickOutside 实例（已随组件销毁、只是监听器残留）不再响应点击
    function patchCloseOnClickOutside() {
        const moduleName = 'discourse/modifiers/close-on-click-outside';
        const requireModule = pageWindow.require;
        if (typeof requireModule !== 'function' || requireModule.has?.(moduleName) === false) return;
        const proto = requireModule(moduleName)?.default?.prototype;
        const descriptor = proto && Object.getOwnPropertyDescriptor(proto, 'check');
        if (typeof descriptor?.get !== 'function') return; // 实现已变化，交给下面的状态兜底
        Object.defineProperty(proto, 'check', {
            configurable: true,
            enumerable: descriptor.enumerable,
            get() {
                const check = descriptor.get.call(this); // 原 @bind getter：返回绑定后的监听器
                if (typeof check !== 'function') return check;
                const modifier = this;
                const guardedCheck = function (event) {
                    if (modifier.element && !modifier.element.isConnected) return;
                    return check.call(this, event);
                };
                try {
                    // modify 与 cleanup 都通过 this.check 取监听器，缓存同一个引用才能被正常移除
                    Object.defineProperty(this, 'check', { configurable: true, writable: true, value: guardedCheck });
                    return guardedCheck;
                } catch {
                    return check;
                }
            },
        });
    }

    // 兜底：pointerdown 期间合法的变化只有“点外部关闭”，拦截此时的打开，以及点在面板内部时的关闭
    function guardHeaderMenus(header) {
        for (const { prop, toggle, panel } of HEADER_MENU_GUARDS) {
            if (!header || Object.prototype.hasOwnProperty.call(header, prop)) continue;
            let proto = Object.getPrototypeOf(header);
            let descriptor;
            while (proto && !(descriptor = Object.getOwnPropertyDescriptor(proto, prop))) {
                proto = Object.getPrototypeOf(proto);
            }
            if (typeof descriptor?.get !== 'function' || typeof descriptor.set !== 'function') continue;
            Object.defineProperty(header, prop, {
                configurable: true,
                enumerable: descriptor.enumerable,
                get() {
                    return descriptor.get.call(this);
                },
                set(value) {
                    const event = pageWindow.event;
                    if (event?.type === 'pointerdown') {
                        const visible = Boolean(descriptor.get.call(this));
                        if ((value && !visible && !matchesClosest(event.target, toggle)) ||
                            (!value && visible && matchesClosest(event.target, panel))) {
                            return;
                        }
                    }
                    descriptor.set.call(this, value);
                },
            });
        }
    }

    // Discourse 启动后安装；最晚在首次按键或按下鼠标的捕获阶段完成，早于 document 上的监听器执行
    function installMenuFix() {
        if (menuFixInstalled) return;
        let container;
        try {
            container = pageWindow.Discourse?.__container__;
        } catch {
            container = undefined;
        }
        if (typeof container?.lookup !== 'function') return;
        menuFixInstalled = true;
        for (const type of MENU_FIX_TRIGGERS) pageWindow.removeEventListener(type, installMenuFix, true);
        try {
            patchCloseOnClickOutside();
        } catch (error) {
            console.warn('[linuxdo-dark] 菜单修复（模块补丁）未生效：', error?.message);
        }
        try {
            guardHeaderMenus(container.lookup('service:header'));
        } catch (error) {
            console.warn('[linuxdo-dark] 菜单修复（状态兜底）未生效：', error?.message);
        }
    }
    for (const type of MENU_FIX_TRIGGERS) {
        pageWindow.addEventListener(type, installMenuFix, { capture: true, passive: true });
    }
    pageWindow.addEventListener('load', installMenuFix, { once: true });

})();

/* ============ 弹窗预览模块（原 LinuxDo 增强阅读） ============ */
(function () {
  'use strict';

  const BASE = location.origin;
  const PAGE_SIZE = 20;          // 每次请求帖子数（与 Discourse 默认一致），也是 loadUp/loadDown 每次追加的数量
  let ME_USERNAME = null;

  const MENU_PANEL_SEL = '.menu-panel, .user-menu, .quick-access-panel, .notifications';
  const SEARCH_SEL = '.search-results, .fps-result, .search-menu, .search-menu-container, .search-result-topic';

  /* ============ 1. 样式 ============ */
  const LDP_STYLE_ID = 'ldp-enhance-style';
  const style = document.getElementById(LDP_STYLE_ID) || document.createElement('style');
  style.id = LDP_STYLE_ID;
  style.textContent = `
    .ldp-overlay{position:fixed;inset:0;z-index:2147483000;display:flex;
      align-items:center;justify-content:center;background:rgba(0,0,0,.55);}
    .ldp-modal{position:relative;display:flex;flex-direction:column;
      width:90%;max-width:1000px;height:calc(100vh - 24px);
      border-radius:12px;overflow:hidden;font-size:16px;
      line-height:1.65;background:var(--secondary,#fff);color:var(--primary,#222);
      box-shadow:0 16px 50px rgba(0,0,0,.4);}
    .ldp-header{display:flex;align-items:flex-start;gap:10px;padding:16px 20px;
      border-bottom:1px solid var(--primary-low,#e5e5e5);}
    .ldp-title{margin:0;font-size:18px;font-weight:700;}
    .ldp-topic-tags{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-top:6px;}
    .ldp-topic-tags[hidden]{display:none;}
    .ldp-topic-category,.ldp-topic-tag{max-width:100%;padding:1px 7px;border-radius:4px;
      font-size:11px;line-height:18px;background:var(--primary-low,#eee);
      color:var(--primary-medium,#666);overflow:hidden;text-overflow:ellipsis;
      white-space:nowrap;}
    .ldp-topic-category{background:rgba(8,132,255,.1);color:var(--tertiary,#08c);
      font-weight:600;}
    .ldp-head-btns{display:flex;gap:8px;align-items:center;}
    .ldp-close{cursor:pointer;border:none;background:transparent;font-size:22px;
      line-height:1;color:inherit;padding:0 4px;}
    .ldp-body{flex:1;min-height:0;position:relative;
      padding:8px 20px 20px;overflow-y:auto;overscroll-behavior:contain;}


    /* 底部悬浮操作栏 */
    .ldp-footer{flex:none;display:flex;align-items:center;justify-content:space-around;
      padding:12px 24px;border-top:1px solid var(--primary-low,#eee);
      background:var(--secondary,#fff);}
    .ldp-fbtn{background:transparent;border:none;cursor:pointer;display:flex;
      align-items:center;gap:8px;font-size:.95rem;color:var(--primary-medium,#666);
      padding:8px 16px;border-radius:6px;transition:all .2s ease;font-weight:600;
      white-space:nowrap;text-decoration:none;}
    .ldp-fbtn:hover{background:var(--primary-low,#f0f0f0);color:var(--tertiary,#3b82f6);}
    .ldp-fbtn svg{width:18px;height:18px;fill:currentColor;flex:none;}
    .ldp-fbtn:disabled{cursor:default;opacity:.5;pointer-events:none;}
    .ldp-fbtn.liked{color:#e74c3c;}
    .ldp-fbtn.liked svg{fill:#e74c3c;}
    .ldp-fbtn.bookmarked{color:var(--tertiary,#3b82f6);}
    .ldp-fbtn.bookmarked svg{fill:var(--tertiary,#3b82f6);}

    /* 楼主帖自身的点赞/回复按钮已挪到底部操作栏，这里隐藏原位置 */
    .ldp-topic > .ldp-post > .ldp-actions{display:none;}

    /* 骨架屏 */
    .ldp-loadmask{position:absolute;inset:0;z-index:5;
      padding:8px 20px 20px;overflow:hidden;
      background:var(--secondary,#fff);color:inherit;}
    .ldp-loadmask.hide{opacity:0;pointer-events:none;transition:opacity .25s ease;}
    .ldp-sk{position:relative;overflow:hidden;border-radius:6px;
      background:var(--primary-low,#e9e9e9);}
    .ldp-sk::after{content:"";position:absolute;inset:0;
      transform:translateX(-100%);
      background:linear-gradient(90deg,transparent,rgba(255,255,255,.55),transparent);
      animation:ldp-shimmer 1.2s infinite;}
    @keyframes ldp-shimmer{100%{transform:translateX(100%);}}
    .ldp-sk-title{height:18px;width:55%;border-radius:6px;
      display:inline-block;vertical-align:middle;}
    .ldp-sk-head{display:flex;align-items:center;gap:10px;margin:12px 0 10px;}
    .ldp-sk-avatar{width:32px;height:32px;border-radius:50%;flex:none;}
    .ldp-sk-line{height:12px;}
    .ldp-sk-w30{width:30%;}.ldp-sk-w40{width:40%;}.ldp-sk-w60{width:60%;}
    .ldp-sk-w80{width:80%;}.ldp-sk-w90{width:90%;}.ldp-sk-w100{width:100%;}
    .ldp-sk-para .ldp-sk-line{margin-bottom:8px;}
    .ldp-sk-divider{height:1px;background:var(--primary-low,#e0e0e0);margin:16px 0 12px;}
    .ldp-sk-comment{display:flex;gap:10px;margin-bottom:18px;}
    .ldp-sk-comment .ldp-sk-avatar{width:28px;height:28px;}
    .ldp-sk-cbody{flex:1;}

    /* 楼主帖区块 */
    .ldp-topic{padding:4px 0 14px;}
    .ldp-topic .ldp-post{border-bottom:none;}

    /* 评论区分隔 + 左上角"评论"标题 */
    .ldp-comments-header{display:flex;align-items:center;gap:8px;
      margin:6px 0 2px;padding-top:14px;border-top:2px solid var(--primary-low,#e0e0e0);
      font-size:16px;font-weight:700;letter-spacing:.5px;}
    .ldp-comments-header::before{content:"💬";font-size:14px;}
    .ldp-comments-count{font-size:12px;font-weight:500;opacity:.6;}
    .ldp-comments{padding-top:4px;}
    .ldp-comments-empty{padding:18px 0;text-align:center;opacity:.5;font-size:13px;}

    .ldp-post{padding:12px 0 12px 12px;border-bottom:1px solid var(--primary-low,#eee);}
    .ldp-post.ldp-flash{animation:ldp-flash-bg 1.6s ease;}
    @keyframes ldp-flash-bg{
      0%{background:rgba(8,132,255,.16);}
      100%{background:transparent;}
    }
    .ldp-post-head{display:flex;align-items:center;gap:8px;margin-bottom:6px;}
    .ldp-avatar{width:28px;height:28px;border-radius:50%;}
    .ldp-user-link{display:inline-flex;align-items:center;gap:8px;color:inherit;
      text-decoration:none;min-width:0;}
    .ldp-user-link:hover{color:var(--tertiary,#08c);}
    .ldp-overlay a.ldp-user-link:visited{color:inherit;}
    .ldp-overlay a.ldp-user-link:visited:hover{color:var(--tertiary,#08c);}
    .ldp-user-link .ldp-avatar{transition:opacity .15s,transform .15s;}
    .ldp-user-link:hover .ldp-avatar{opacity:.82;transform:scale(1.05);}


    .ldp-boost-avatar-link{display:inline-flex;align-items:center;flex:none;
      border-radius:50%;line-height:0;}
    .ldp-boost-avatar-link:hover .ldp-b-avatar{opacity:.82;transform:scale(1.08);}
    .ldp-b-avatar{transition:opacity .15s,transform .15s;}
    .ldp-author{font-weight:600;}
    .ldp-op{font-size:11px;font-weight:700;color:#fff;background:var(--tertiary,#08c);
      border-radius:4px;padding:1px 6px;letter-spacing:.5px;}
    .ldp-me{font-size:11px;font-weight:700;color:#fff;background:#3ea66b;
      border-radius:4px;padding:1px 6px;letter-spacing:.5px;}
    .ldp-user{font-size:12px;opacity:.6;}
    .ldp-level{font-size:11px;opacity:.5;}
    .ldp-time{font-size:12px;opacity:.55;}
    .ldp-floor{font-size:12px;opacity:.5;margin-left:auto;
      padding-left:8px;white-space:nowrap;}
    .ldp-content img{max-width:100%;height:auto;cursor:zoom-in;border-radius:4px;}
    .ld-b64{border-bottom:1px dashed rgba(46,204,148,.85);cursor:pointer;word-break:break-all;}
    .ldp-content .ldp-deleted{color:var(--primary-medium,#888);}
    .ldp-content .ldp-spoiler{cursor:pointer;}
    .ldp-content .ldp-spoiler.ldp-spoiler-blurred{
      filter:blur(8px)!important;-webkit-filter:blur(8px)!important;
      user-select:none;}
    .ldp-content .ldp-spoiler.ldp-spoiler-expanded{cursor:default;}
    .ldp-content pre{overflow:auto;background:var(--primary-very-low,#f6f6f6);
      padding:10px;border-radius:6px;}
    .ldp-actions{display:flex;gap:14px;margin-top:8px;font-size:12px;align-items:center;}
    .ldp-btn{cursor:pointer;border:none;background:transparent;color:inherit;
      opacity:.7;display:inline-flex;align-items:center;gap:4px;padding:2px 4px;}
    .ldp-btn:hover{opacity:1;}
    .ldp-btn:disabled{cursor:default;opacity:.4;}
    .ldp-like.liked{color:var(--love,#e25822);opacity:1;font-weight:600;}
    .ldp-like-icon{display:inline-flex;align-items:center;vertical-align:middle;flex:none;}
    .ldp-like-icon .ldp-reaction-img{width:16px;height:16px;}

    .ldp-replybox{margin-top:8px;display:none;position:relative;}
    .ldp-replybox.open{display:block;}
    .ldp-replybox textarea{width:100%;min-height:90px;box-sizing:border-box;margin-bottom:0px;
      border:1px solid var(--primary-low,#ccc);border-radius:6px;padding:8px;
      font:inherit;background:var(--secondary,#fff);color:inherit;resize:vertical;}
    .ldp-reply-tools{display:flex;align-items:center;gap:6px;margin-top:6px;}
    .ldp-send{margin-top:6px;background:var(--tertiary,#08c);color:#fff;border:none;
      border-radius:6px;padding:6px 14px;cursor:pointer;}
    .ldp-reply-tools .ldp-send{margin-top:0;}
    .ldp-reply-tip{margin-left:10px;font-size:12px;color:#3ea66b;opacity:0;
      transition:opacity .25s ease;}
    .ldp-reply-tip.show{opacity:1;}

    .ldp-loading-tip{padding:14px 0;text-align:center;font-size:13px;
      color:var(--primary-medium,#888);display:none;user-select:none;}
    .ldp-loading-tip.show{display:block;}
    .ldp-loading-tip .ldp-tip-icon{display:inline-block;margin-right:6px;
      animation:ldp-spin .9s linear infinite;}
    @keyframes ldp-spin{from{transform:rotate(0deg);}to{transform:rotate(360deg);}}

    /* 上方/下方懒加载触发提示 */
    .ldp-load-up-tip,.ldp-load-down-tip{
      padding:10px 0;text-align:center;font-size:12px;
      color:var(--primary-medium,#999);user-select:none;display:none;}
    .ldp-load-up-tip.show,.ldp-load-down-tip.show{display:block;}
    .ldp-load-up-tip .ldp-tip-icon,.ldp-load-down-tip .ldp-tip-icon{
      display:inline-block;margin-right:4px;animation:ldp-spin .9s linear infinite;}

    .ldp-bottom-tip{padding:16px 0;text-align:center;font-size:13px;
      color:var(--primary-medium,#888);user-select:none;}
    .ldp-error{padding:24px 16px;text-align:center;font-size:13px;
      color:var(--danger,#cc4b4b);user-select:none;}

    /* 灯箱 */
    .ldp-lightbox{position:fixed;inset:0;z-index:2147483600;display:flex;
      flex-direction:column;background:rgba(0,0,0,.9);}
    .ldp-lb-stage{flex:1;overflow:auto;display:flex;align-items:center;
      justify-content:center;padding:20px;}
    .ldp-lb-stage img{display:block;max-width:94vw;max-height:88vh;
      width:auto;height:auto;border-radius:4px;cursor:zoom-out;
      box-shadow:0 10px 40px rgba(0,0,0,.6);}
    .ldp-lb-x{position:fixed;top:14px;right:18px;z-index:1;cursor:pointer;border:none;
      background:transparent;color:#fff;font-size:30px;line-height:1;}


    /* ============ Boost 样式 ============ */
    .ldp-boosts-list{display:flex;flex-wrap:wrap;gap:4px;align-items:center;margin-top:6px;min-height:0;}
    .ldp-boost-bubble{display:inline-flex;align-items:center;gap:4px;
      padding:3px 8px 3px 4px;border:none;
      background:rgba(128,128,128,.1);border-radius:50px;
      font-size:14px;line-height:1.4;cursor:default;position:relative;
      transition:background .15s;}
    .ldp-boost-bubble:hover{background:rgba(128,128,128,.18);}
    .ldp-b-avatar{width:18px;height:18px;border-radius:50%;flex:none;display:block;}
    .ldp-boost-bubble p{margin:0;display:inline-flex;gap:2px;align-items:center;flex-wrap:wrap;}
    .ldp-boost-bubble p img.emoji{width:14px;height:14px;margin:0;vertical-align:middle;}
    .ldp-boost-del{cursor:pointer;margin-left:2px;opacity:0;font-size:13px;
      color:var(--danger,#cc4b4b);line-height:1;border:none;background:transparent;
      padding:0 2px;transition:opacity .15s;flex:none;}
    .ldp-boost-bubble:hover .ldp-boost-del{opacity:.65;}
    .ldp-boost-del:hover{opacity:1!important;}
    .ldp-boost-input-wrap{display:none;align-items:center;gap:5px;margin-top:6px;
      padding:4px 6px;border-radius:8px;
      border:1px solid var(--primary-low,#ddd);
      background:var(--secondary,#fff);}
    .ldp-boost-input-wrap.open{display:flex;}
    .ldp-boost-input{flex:1;border:none;background:transparent;outline:none;
      font-size:13px;padding:2px 4px;color:inherit;min-width:0;}
    .ldp-boost-input::placeholder{color:var(--primary-medium,#999);font-size:12px;}
    .ldp-boost-submit{width:22px;height:22px;padding:0;display:flex;flex:none;
      align-items:center;justify-content:center;border-radius:50%;
      border:1px solid #3ea66b;background:transparent;color:#3ea66b;
      cursor:pointer;font-size:14px;line-height:1;transition:all .15s;}
    .ldp-boost-submit:hover{background:#3ea66b;color:#fff;}
    .ldp-boost-submit:disabled{opacity:.5;cursor:default;pointer-events:none;}
    .ldp-boost-cancel{width:22px;height:22px;padding:0;display:flex;flex:none;
      align-items:center;justify-content:center;border-radius:50%;
      border:1px solid var(--danger,#cc4b4b);background:transparent;
      color:var(--danger,#cc4b4b);cursor:pointer;font-size:16px;line-height:1;
      transition:all .15s;}
    .ldp-boost-cancel:hover{background:var(--danger,#cc4b4b);color:#fff;}
    .ldp-btn.ldp-boost-btn{font-size:12px;}
    .ldp-btn.ldp-boost-btn:disabled{opacity:.35;cursor:default;pointer-events:none;}

    /* ============ Reactions 聚合条 ============ */
    .ldp-reactions{display:flex;flex-wrap:wrap;gap:4px;align-items:center;margin-top:6px;}
    .ldp-reaction{display:inline-flex;align-items:center;gap:3px;
      padding:2px 7px 2px 4px;border-radius:50px;border:none;font:inherit;
      background:rgba(128,128,128,.1);font-size:12px;line-height:1.4;
      color:var(--primary-medium,#666);cursor:pointer;transition:background .15s;}
    .ldp-reaction:hover{background:rgba(128,128,128,.18);}
    .ldp-reaction:disabled,.ldp-reaction-disabled{cursor:not-allowed;opacity:.55;}
    .ldp-reaction:disabled:hover,.ldp-reaction-disabled:hover{background:rgba(128,128,128,.1);}
    .ldp-reaction-img{width:16px;height:16px;display:block;flex:none;}
    .ldp-reaction-count{font-size:12px;font-variant-numeric:tabular-nums;}
    .ldp-reaction-mine{background:var(--tertiary-low,rgba(128,128,128,.18));
      box-shadow:inset 0 0 0 1px var(--tertiary,#08c);color:var(--primary,#333);}

    /* 表情反应选择面板 */
    .ldp-reaction-panel{z-index:2147483500;display:flex;flex-wrap:wrap;gap:4px;
      padding:8px;max-width:280px;border-radius:10px;
      background:var(--secondary,#fff);border:1px solid var(--primary-low,#ddd);
      box-shadow:0 6px 20px rgba(0,0,0,.18);}
    .ldp-reaction-opt{display:inline-flex;align-items:center;gap:2px;
      padding:3px 6px 3px 3px;border-radius:50px;border:none;background:transparent;
      cursor:pointer;transition:background .15s;}
    .ldp-reaction-opt:hover{background:rgba(128,128,128,.15);}
    .ldp-reaction-opt:disabled{cursor:not-allowed;opacity:.5;}
    .ldp-reaction-opt .ldp-reaction-img{width:20px;height:20px;}
    .ldp-reaction-opt-count{font-size:11px;color:var(--primary-medium,#666);
      font-variant-numeric:tabular-nums;min-width:10px;text-align:right;}
    .ldp-reaction-opt-mine{background:var(--tertiary-low,rgba(128,128,128,.18));
      box-shadow:inset 0 0 0 1px var(--tertiary,#08c);}

    /* ============ Emoji Picker 样式 ============ */
    .ldp-emoji-btn{width:22px;height:22px;padding:0;display:flex;flex:none;
      align-items:center;justify-content:center;border-radius:50%;
      border:1px solid var(--primary-low,#ccc);background:transparent;
      color:var(--primary-medium,#666);cursor:pointer;font-size:14px;line-height:1;
      transition:all .15s;position:relative;}
    .ldp-emoji-btn:hover{background:var(--primary-low,#f0f0f0);color:var(--tertiary,#3b82f6);}
    .ldp-emoji-btn svg{width:14px;height:14px;fill:currentColor;display:block;}

    .ldp-emoji-panel{position:fixed;z-index:2147483500;width:320px;max-height:280px;
      background:var(--secondary,#fff);border:1px solid var(--primary-low,#ddd);
      border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,.18);
      overflow-y:auto;padding:6px;font-size:13px;}
    .ldp-emoji-opt{width:34px;height:34px;display:inline-flex;align-items:center;
      justify-content:center;border:none;background:transparent;cursor:pointer;
      border-radius:6px;padding:2px;vertical-align:top;}
    .ldp-emoji-opt:hover{background:var(--primary-low,#f0f0f0);}
    .ldp-emoji-opt img{width:24px;height:24px;display:block;}
  `;
  const mountStyle = () => { (document.head || document.documentElement).appendChild(style); };
  if (document.head) mountStyle();
  else if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountStyle, { once: true });
  else mountStyle();

  /* 图标 */
  const ICONS = {
    like: '<path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>',
    reply: '<path d="M1024 640q0 94.857143-72.571429 257.714286-1.714286 4-6 13.714286t-7.714286 17.142857-7.428571 12.571429q-6.857143 9.714286-16 9.714286-8.571429 0-13.428571-5.714286t-4.857143-14.285714q0-5.142857 1.428571-15.142857t1.428571-13.428571q2.857143-38.857143 2.857143-70.285714 0-57.714286-10-103.428571t-27.714286-79.142857-45.714286-57.714286-60.285714-39.714286-76-24.285714-88-12.285714-100.285714-3.428571l-128 0 0 146.285714q0 14.857143-10.857143 25.714286t-25.714286 10.857143-25.714286-10.857143l-292.571429-292.571429q-10.857143-10.857143-10.857143-25.714286t10.857143-25.714286l292.571429-292.571429q10.857143-10.857143 25.714286-10.857143t25.714286 10.857143 10.857143 25.714286l0 146.285714 128 0q407.428571 0 500 230.285714 30.285714 76.571429 30.285714 190.285714z"/>',
    boost: '<path d="M1010.092957 38.19946a31.779551 31.779551 0 0 0-24.399655-24.399655C921.294212 0 870.914925 0 820.715635 0c-206.397081 0-330.195331 110.398439-422.574025 255.99638H189.744557A95.998643 95.998643 0 0 0 104.005769 308.975631l-98.838602 197.597206A47.999321 47.999321 0 0 0 48.146559 575.991855h207.537065l-44.939364 44.939365a63.999095 63.999095 0 0 0 0 90.49872l101.79856 101.81856a63.999095 63.999095 0 0 0 90.51872 0L448.000905 768.309136V975.986199a47.999321 47.999321 0 0 0 69.399019 42.979392l197.397208-98.778603a95.818645 95.818645 0 0 0 52.999251-85.798787V625.571154c145.177947-92.598691 255.99638-216.796934 255.99638-422.17403 0.199997-50.399287 0.199997-100.798575-13.699806-165.197664zM767.99638 335.995249a79.998869 79.998869 0 1 1 79.998869-79.998869 79.998869 79.998869 0 0 1-79.998869 79.998869z"/>',
    bookmark: '<path d="M17 3H7c-1.1 0-1.99.9-1.99 2L5 21l7-3 7 3V5c0-1.1-.9-2-2-2z"/>',
    newTab: '<path d="M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/>'
  };

  /* 表情按钮图标（复用 Discourse 内置 sprite） */
  const EMOJI_BTN_ICON = '<svg class="fa d-icon d-icon-far-face-smile svg-icon fa-width-auto svg-string" width="1em" height="1em" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><use href="#far-face-smile"></use></svg>';

  /* ============ 2. 工具函数 ============ */
  const esc = (s) => (s || '').replace(/[<>&]/g, (c) =>
      ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
  const escAttr = (s) => esc(s).replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  function reportError(scope, err) {
    if (err && err.name === 'AbortError') return;
    const message = (err && err.message) || String(err || '未知错误');
    console.warn(`[LinuxDo 增强阅读] ${scope}:`, message);
  }

  function setSpoilerState(spoiler, blurred) {
    spoiler.classList.add('spoiled');
    spoiler.classList.toggle('spoiler-blurred', blurred);
    spoiler.classList.toggle('spoiler-revealed', !blurred);
    spoiler.classList.toggle('ldp-spoiler-blurred', blurred);
    spoiler.classList.toggle('ldp-spoiler-expanded', !blurred);
    spoiler.dataset.spoilerState = blurred ? 'blurred' : 'expanded';
    spoiler.setAttribute('aria-expanded', String(!blurred));
  }

  function prepareSpoilers(root) {
    const spoilers = [];
    const selector = '.spoiler, .spoiled, .spoiler-blurred, [data-spoiler-state]';
    if (root.matches && root.matches(selector)) {
      spoilers.push(root);
    }
    spoilers.push(...root.querySelectorAll(selector));
    spoilers.forEach((spoiler) => {
      spoiler.classList.add('ldp-spoiler');
      spoiler.setAttribute('role', 'button');
      spoiler.setAttribute('tabindex', '0');
      setSpoilerState(spoiler, true);
    });
  }

  function userProfileUrl(username) {
    const name = typeof username === 'string' ? username.trim() : '';
    return name ? `${BASE}/u/${encodeURIComponent(name)}/summary` : '';
  }

  function userProfileLabel(username, displayName) {
    const label = typeof displayName === 'string' ? displayName.trim() : '';
    const account = typeof username === 'string' ? username.trim() : '';
    return label || (account ? `@${account}` : '查看用户');
  }

  function fmtTime(iso) {
    if (!iso) return '';
    const t = new Date(iso).getTime();
    if (isNaN(t)) return '';
    const diff = Date.now() - t;
    const min = 60000, hour = 60 * min, day = 24 * hour;
    if (diff < min) return '刚刚';
    if (diff < hour) return Math.floor(diff / min) + ' 分钟前';
    if (diff < day) return Math.floor(diff / hour) + ' 小时前';
    if (diff < 30 * day) return Math.floor(diff / day) + ' 天前';
    const d = new Date(t);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  const csrfToken = () =>
      (document.querySelector('meta[name="csrf-token"]') || {}).content || '';

  async function fetchJSON(url, signal) {
    const res = await fetch(url, {
      credentials: 'include', headers: { 'Accept': 'application/json' }, signal,
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }

  async function apiSend(url, method, params, extraHeaders, signal) {
    const opt = {
      method,
      credentials: 'include',
      signal,
      headers: Object.assign({
        'Accept': 'application/json',
        'X-CSRF-Token': csrfToken(),
        'X-Requested-With': 'XMLHttpRequest',
      }, extraHeaders || {}),
    };
    if (params instanceof FormData) {
      opt.body = params;
    } else if (params instanceof URLSearchParams) {
      opt.headers['Content-Type'] = 'application/x-www-form-urlencoded; charset=UTF-8';
      opt.body = params.toString();
    } else if (params) {
      opt.headers['Content-Type'] = 'application/x-www-form-urlencoded; charset=UTF-8';
      const body = new URLSearchParams();
      Object.keys(params).forEach((key) => {
        const value = params[key];
        if (Array.isArray(value)) {
          value.forEach((item) => body.append(`${key}[]`, item));
        } else {
          body.append(key, value);
        }
      });
      opt.body = body.toString();
    }
    const res = await fetch(url, opt);
    if (!res.ok) {
      let message = 'HTTP ' + res.status;
      try {
        const data = await res.json();
        const errors = Array.isArray(data.errors)
            ? data.errors.map((item) =>
                typeof item === 'string' ? item : item && item.message)
                .filter((item) => typeof item === 'string' && item.trim())
            : [];
        const candidate = errors.join(' ') || data.error || data.message;
        if (typeof candidate === 'string' && candidate.trim()) message = candidate.trim();
      } catch (e) { /* keep the HTTP fallback when the response is not JSON */ }
      throw new Error(message);
    }
    return res.json().catch(() => ({}));
  }

  async function ensureMe() {
    if (ME_USERNAME !== null) return ME_USERNAME;
    try {
      const s = await fetchJSON(`${BASE}/session/current.json`);
      ME_USERNAME = (s.current_user && s.current_user.username) || '';
    } catch (e) { if (!e || e.name !== 'AbortError') ME_USERNAME = ''; }
    return ME_USERNAME;
  }

  function likeInfo(p) {
    const like = (p.actions_summary || []).find((a) => a.id === 2) || {};
    return { count: like.count || 0, acted: !!like.acted, canAct: !!like.can_act };
  }

  function findPostForNode(postNode, ctx) {
    const n = +(postNode && postNode.dataset ? postNode.dataset.postNumber : 0);
    return (ctx && ctx.postMap && ctx.postMap.get(n)) || null;
  }

  /** 我的反应对应的图标：有反应 → 该表情；无 → 默认 ♥ */
  function likeIconHtml(p) {
    const mine = p && p.current_user_reaction;
    if (mine && mine.id) return reactionImgHtml(mine.id);
    return `<svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;vertical-align:middle;">${ICONS.like}</svg>`;
  }

  /** 按钮是否处于“已反应”状态（core 点赞或任意表情反应） */
  function likeActed(p, info) {
    if (!p) return false;
    return !!p.current_user_reaction || !!(info || likeInfo(p)).acted;
  }

  /** 图标对应的数量：有反应 → 该表情数量；无 → core 点赞数 */
  function likeDisplayCount(p, info) {
    const mine = p && p.current_user_reaction;
    if (mine && mine.id) {
      const r = (p.reactions || []).find((x) => x && x.id === mine.id);
      if (r) return Number(r.count) || 0;
    }
    return (info || likeInfo(p)).count;
  }

  /* ============ 2.1 话题链接解析 ============ */
  /**
   * 解析话题链接中的 topicId，楼层号一律忽略。
   * 支持 /t/123、/t/123/456、/t/slug/123、/t/slug/123/456
   */
  function parseTopicHref(href) {
    if (!href) return null;
    let m = href.match(/\/t\/(\d+)(?:\/\d+)?/);
    if (m) return { topicId: m[1] };
    m = href.match(/\/t\/[^/\d][^/]*\/(\d+)(?:\/\d+)?/);
    if (m) return { topicId: m[1] };
    return null;
  }

  /* ============ 2.2 emoji 基础（Boost 与 reactions 共用） ============ */
  let emojiDataCache = null;
  let emojiDataLoading = null;
  let _emojiSet = 'twemoji';
  let emojiSetProbed = false;
  let activeEmojiPanel = null;
  let activeEmojiCloser = null;
  let activeEmojiTrigger = null;

  function closeEmojiPanel() {
    if (activeEmojiCloser) {
      document.removeEventListener('mousedown', activeEmojiCloser, true);
      activeEmojiCloser = null;
    }
    if (activeEmojiPanel) { activeEmojiPanel.remove(); activeEmojiPanel = null; }
    if (activeEmojiTrigger) { activeEmojiTrigger._ldpEmojiPanel = null; activeEmojiTrigger = null; }
  }

  const emojiUrlMap = new Map();
  function emojiUrl(name) {
    if (emojiUrlMap.has(name)) return emojiUrlMap.get(name);
    if (!emojiSetProbed) {
      emojiSetProbed = true;
      try {
        const img = document.querySelector('img.emoji');
        if (img) { const m = img.src.match(/\/images\/emoji\/([^/]+)\//); if (m) _emojiSet = m[1]; }
      } catch {}
    }
    return `https://cdn.ldstatic.com/images/emoji/${_emojiSet}/${name}.png`;
  }
  async function fetchEmojiData(signal) {
    if (emojiDataCache) return emojiDataCache;
    if (emojiDataLoading) return emojiDataLoading;
    emojiDataLoading = (async () => {
      const res = await fetch(`${BASE}/emojis.json`, { credentials: 'include', signal });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const raw = await res.json();
      const groups = {};
      for (const [gKey, arr] of Object.entries(raw)) {
        if (!Array.isArray(arr)) continue;
        groups[gKey] = arr.map(e => {
          const name = (e && e.name) ? e.name : String(e);
          if (e && e.url) {
            let url = e.url;
            if (url.startsWith('//')) url = 'https:' + url;
            else if (!url.startsWith('http')) url = BASE + url;
            emojiUrlMap.set(name, url.startsWith(BASE)
                ? 'https://cdn.ldstatic.com' + url.slice(BASE.length) : url);
          }
          return name;
        });
      }
      emojiDataCache = groups;
      emojiDataLoading = null;
      return groups;
    })().catch(err => { emojiDataLoading = null; throw err; });
    return emojiDataLoading;
  }

  function buildEmojiPanel(onPick, signal) {
    const panel = document.createElement('div');
    panel.className = 'ldp-emoji-panel';
    fetchEmojiData(signal).then((groups) => {
      if (!panel.isConnected) return;
      Object.values(groups).forEach((names) => names.forEach((name) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'ldp-emoji-opt';
        btn.title = ':' + name + ':';
        const img = document.createElement('img');
        img.className = 'emoji';
        img.alt = ':' + name + ':';
        img.src = emojiUrl(name);
        btn.appendChild(img);
        btn.addEventListener('click', () => onPick(':' + name + ':'));
        panel.appendChild(btn);
      }));
      if (panel.isConnected && panel._ldpTrigger) placePanel(panel, panel._ldpTrigger);
    }).catch(() => {});
    return panel;
  }
  function toggleEmojiPanel(triggerBtn, inputEl, signal) {
    if (activeEmojiPanel) { closeEmojiPanel(); return; }
    const panel = buildEmojiPanel((code) => {
      if (inputEl.tagName === 'TEXTAREA' || inputEl.tagName === 'INPUT') {
        const start = inputEl.selectionStart || 0;
        const end = inputEl.selectionEnd || 0;
        const val = inputEl.value;
        const before = val.substring(0, start);
        const prev = before.slice(-1);
        const insertion = prev && !/[\s\u200b\p{P}]/u.test(prev)
          ? ' ' + code
          : code;
        inputEl.value = before + insertion + val.substring(end);
        inputEl.selectionStart = inputEl.selectionEnd = start + insertion.length;
        inputEl.focus();
      }
      closeEmojiPanel();
    }, signal);
    activeEmojiPanel = panel;
    activeEmojiTrigger = triggerBtn;
    triggerBtn._ldpEmojiPanel = panel;
    panel._ldpTrigger = triggerBtn;
    placePanel(panel, triggerBtn);
    setTimeout(() => {
      if (!panel.isConnected || activeEmojiPanel !== panel) return;
      const closer = (e) => {
        if (panel.contains(e.target) || e.target === triggerBtn) return;
        closeEmojiPanel();
      };
      activeEmojiCloser = closer;
      document.addEventListener('mousedown', closer, true);
    }, 0);
  }

  /* ============ 2.3 Boost 气泡渲染 ============ */
  function boostBubbleHtml(b) {
    const avatar = b && b.user && b.user.avatar_template
        ? BASE + b.user.avatar_template.replace('{size}', '32') : '';
    const profileUrl = userProfileUrl(b && b.user && b.user.username);
    const profileLabel = userProfileLabel(b && b.user && b.user.username,
        b && b.user && (b.user.name || b.user.display_name));
    return (avatar ? (profileUrl
        ? `<a class="ldp-boost-avatar-link" href="${profileUrl}" target="_blank" rel="noopener noreferrer" title="${escAttr(profileLabel)}"><img class="ldp-b-avatar" src="${avatar}" alt="" loading="lazy" decoding="async"></a>`
        : `<img class="ldp-b-avatar" src="${avatar}" alt="" loading="lazy" decoding="async">`) : '') +
        `<p>${(b && b.cooked) || ''}</p>` +
        (b && b.can_delete ? `<button class="ldp-boost-del" title="删除此Boost">×</button>` : '');
  }

  function renderBoosts(boosts) {
    if (!boosts || !boosts.length) return '';
    return boosts.map((b) =>
        `<div class="ldp-boost-bubble" data-boost-id="${b.id}">${boostBubbleHtml(b)}</div>`
    ).join('');
  }

  /* ============ 2.4 Reactions 聚合条 ============ */
  function reactionImgHtml(name) {
    const n = String(name || '');
    return `<img class="ldp-reaction-img" data-ldp-emoji="${escAttr(n)}" src="${escAttr(emojiUrl(n))}" alt="${escAttr(n)}" loading="lazy" decoding="async">`;
  }

  function renderReactions(p) {
    const list = Array.isArray(p && p.reactions) ? p.reactions : [];
    const mine = p && p.current_user_reaction;
    const mineId = mine && mine.id;
    const items = list
      .filter(r => r && r.id && Number(r.count) > 0)
      .sort((a, b) => (Number(b.count) - Number(a.count)) || String(a.id).localeCompare(String(b.id)));
    if (!items.length) return '';
    const html = items.map((r) => {
      const isMine = !!mineId && r.id === mineId;
      const noUndo = isMine && mine && mine.can_undo === false;
      const cls = 'ldp-reaction' + (isMine ? ' ldp-reaction-mine' : '') + (noUndo ? ' ldp-reaction-disabled' : '');
      const title = noUndo ? '已超过可撤销时间' : `${':' + r.id + ':'} ${r.count}`;
      return `<button type="button" class="${cls}" data-reaction="${escAttr(r.id)}"` +
        `${noUndo ? ' disabled' : ''} title="${escAttr(title)}">` +
        reactionImgHtml(r.id) +
        `<span class="ldp-reaction-count">${Number(r.count)}</span>` +
        `</button>`;
    }).join('');
    return `<div class="ldp-reactions">${html}</div>`;
  }

  /** emoji 数据异步到位后，回填聚合条里自定义 emoji 的真实 URL */
  function refreshEmojiUrls(root) {
    if (!root || !root.querySelectorAll) return;
    root.querySelectorAll('img[data-ldp-emoji]').forEach((img) => {
      const url = emojiUrl(img.getAttribute('data-ldp-emoji'));
      if (url && img.getAttribute('src') !== url) img.setAttribute('src', url);
    });
  }

  /** 切换反应后，只刷新该楼层的聚合条与点赞按钮，不重建整个节点 */
  function updatePostReactions(postNode, p) {
    const html = renderReactions(p);
    let bar = postNode.querySelector('.ldp-reactions');
    if (html) {
      if (bar) bar.innerHTML = html;
      else {
        bar = document.createElement('div');
        bar.className = 'ldp-reactions';
        bar.innerHTML = html;
        const content = postNode.querySelector('.ldp-content');
        if (content) content.after(bar);
      }
    } else if (bar) {
      bar.remove();
    }
    refreshEmojiUrls(postNode);
    const likeBtn = postNode.querySelector('.ldp-like');
    if (likeBtn) {
      const info = likeInfo(p);
      const acted = likeActed(p, info);
      likeBtn.classList.toggle('liked', acted);
      likeBtn.dataset.acted = acted ? '1' : '0';
      likeBtn.disabled = !(info.canAct || acted);
      const iconEl = likeBtn.querySelector('.ldp-like-icon');
      if (iconEl) iconEl.innerHTML = likeIconHtml(p);
      const countEl = likeBtn.querySelector('.ldp-like-count');
      if (countEl) countEl.textContent = likeDisplayCount(p, info);
    }
  }

  /* ============ 2.5 表情反应切换 / 选择面板 ============ */
  let openReactionTrigger = null;   // 当前打开面板的 ♥ 按钮（全局单面板）
  let reactionCloseTimer = null;

  function cancelReactionClose() {
    if (reactionCloseTimer) { clearTimeout(reactionCloseTimer); reactionCloseTimer = null; }
  }

  function scheduleReactionClose() {
    cancelReactionClose();
    reactionCloseTimer = setTimeout(closeReactionPanel, 150);
  }

  function closeReactionPanel() {
    cancelReactionClose();
    if (openReactionTrigger) {
      const panel = openReactionTrigger._ldpReactionPanel;
      if (panel && panel.parentNode) panel.remove();
      // 关键：面板可能被定时器/点 ♥/关弹窗关掉，此时必须解绑当初注册的 mousedown closer，
      // 否则残留的 closer 会在下次点击新面板时把它误关（mousedown/up 不同元素 → click 不触发）。
      if (openReactionTrigger._ldpReactionCloser) {
        document.removeEventListener('mousedown', openReactionTrigger._ldpReactionCloser, true);
        openReactionTrigger._ldpReactionCloser = null;
      }
      openReactionTrigger._ldpReactionPanel = null;
    }
    openReactionTrigger = null;
  }

  /** hover ♥ 时打开表情选择面板（立即，无延迟） */
  function openReactionPanel(triggerBtn, postNode, ctx) {
    if (openReactionTrigger === triggerBtn) return;
    if (!Array.isArray(ctx.validReactions) || !ctx.validReactions.length) return;
    closeReactionPanel();
    const post = findPostForNode(postNode, ctx);
    if (!post) return;
    const panel = document.createElement('div');
    panel.className = 'ldp-reaction-panel';
    panel.innerHTML = reactionPanelHtml(post, ctx.validReactions);
    placePanel(panel, triggerBtn);
    refreshEmojiUrls(panel);
    triggerBtn._ldpReactionPanel = panel;
    openReactionTrigger = triggerBtn;

    // 鼠标从 ♥ 移进面板（中间有间隙）时取消待关闭
    panel.addEventListener('mouseenter', cancelReactionClose);
    panel.addEventListener('mouseleave', scheduleReactionClose);

    panel.addEventListener('click', async (e) => {
      const opt = e.target.closest('.ldp-reaction-opt');
      if (!opt || opt.disabled) return;
      const target = await toggleReaction(postNode, ctx, opt.getAttribute('data-reaction'), opt);
      if (target) {
        panel.innerHTML = reactionPanelHtml(target, ctx.validReactions);
        refreshEmojiUrls(panel);
      }
    });

    setTimeout(() => {
      if (openReactionTrigger !== triggerBtn) return;
      const closer = (e) => {
        if (openReactionTrigger !== triggerBtn) {
          document.removeEventListener('mousedown', closer, true);
          return;
        }
        if (panel.contains(e.target)) return;
        closeReactionPanel();
      };
      triggerBtn._ldpReactionCloser = closer;
      document.addEventListener('mousedown', closer, true);
    }, 0);
  }

  async function toggleReaction(postNode, ctx, name, clickedEl) {
    const postId = postNode.dataset.postId;
    const postNumber = +postNode.dataset.postNumber;
    const post = findPostForNode(postNode, ctx);
    if (clickedEl) clickedEl.disabled = true;
    let succeeded = false;
    try {
      const updated = await apiSend(
          `${BASE}/discourse-reactions/posts/${postId}/custom-reactions/${encodeURIComponent(name)}/toggle`,
          'PUT', null, null, ctx && ctx.signal);
      if (ctx.scrollRoot && !ctx.scrollRoot.isConnected) return null;
      const target = post || updated;
      if (post) Object.assign(post, updated);
      if (ctx.postMap) ctx.postMap.set(postNumber, target);
      updatePostReactions(postNode, target);
      succeeded = true;
      return target;
    } catch (err) {
      reportError('反应操作失败', err);
      return null;
    } finally {
      if (!succeeded && clickedEl) clickedEl.disabled = false;
    }
  }

  function reactionPanelHtml(p, validReactions) {
    const counts = new Map();
    (p && Array.isArray(p.reactions) ? p.reactions : []).forEach((r) => {
      if (r && r.id) counts.set(r.id, Number(r.count) || 0);
    });
    const mine = p && p.current_user_reaction;
    return (validReactions || []).map((name) => {
      const count = counts.get(name) || 0;
      const isMine = !!(mine && mine.id === name);
      const noUndo = isMine && mine && mine.can_undo === false;
      const title = ':' + name + ':' + (count ? ' ' + count : '');
      return `<button type="button" class="ldp-reaction-opt${isMine ? ' ldp-reaction-opt-mine' : ''}"` +
        ` data-reaction="${escAttr(name)}"${noUndo ? ' disabled' : ''} title="${escAttr(title)}">` +
        reactionImgHtml(name) +
        (count ? `<span class="ldp-reaction-opt-count">${count}</span>` : '') +
        `</button>`;
    }).join('');
  }

  /** 面板用 fixed 定位，约束在弹窗内，优先显示在触发按钮上方 */
  function placePanel(panel, triggerBtn) {
    panel.style.position = 'fixed';
    document.body.appendChild(panel);
    const gap = 6;
    const panelW = panel.offsetWidth, panelH = panel.offsetHeight;
    const btnRect = triggerBtn.getBoundingClientRect();
    const modal = triggerBtn.closest('.ldp-modal');
    const bounds = modal ? modal.getBoundingClientRect()
                         : { top: 0, left: 0, bottom: window.innerHeight, right: window.innerWidth };
    let top = (btnRect.top - panelH - gap >= bounds.top) ? btnRect.top - panelH - gap : btnRect.bottom + gap;
    if (top + panelH > bounds.bottom) top = bounds.bottom - panelH;
    if (top < bounds.top) top = bounds.top;
    let left = btnRect.right - panelW;
    if (left < bounds.left) left = bounds.left;
    if (left + panelW > bounds.right) left = bounds.right - panelW;
    panel.style.top = top + 'px';
    panel.style.left = left + 'px';
  }


  /* ============ 3. 单图灯箱 ============ */
  let activeLightboxClose = null;
  function openLightbox(src) {
    if (!src) return;
    if (activeLightboxClose) activeLightboxClose();
    const lb = document.createElement('div');
    lb.className = 'ldp-lightbox';
    lb.innerHTML = `
      <button class="ldp-lb-x" title="关闭（Esc）">×</button>
      <div class="ldp-lb-stage"><img alt=""></div>`;
    const stage = lb.querySelector('.ldp-lb-stage');
    const img = lb.querySelector('.ldp-lb-stage img');
    img.src = src;
    const close = () => {
      if (activeLightboxClose === close) activeLightboxClose = null;
      lb.remove();
      document.removeEventListener('keydown', onKey);
    };
    activeLightboxClose = close;
    function onKey(e) { if (e.key === 'Escape') close(); }
    lb.querySelector('.ldp-lb-x').addEventListener('click', close);
    img.addEventListener('click', (e) => { e.stopPropagation(); close(); });
    stage.addEventListener('click', (e) => { if (e.target === stage) close(); });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(lb);
  }

  function resolveOriginalSrc(imgEl) {
    const a = imgEl.closest('a.lightbox, a[href]');
    if (a && a.getAttribute('href')) {
      const href = a.getAttribute('href');
      if (/\.(png|jpe?g|gif|webp|bmp|avif)(\?|#|$)/i.test(href) || a.classList.contains('lightbox')) {
        return href;
      }
    }
    return imgEl.getAttribute('data-large-src') || imgEl.currentSrc || imgEl.src;
  }

  /* ============ 4. 渲染单条 ============ */
  /**
   * renderPost：渲染单个帖子节点。
   * @param {object} p - 帖子数据
   * @param {object} ctx - 弹窗上下文
   */
  function fallbackDecodeToken(token) {
    const s = String(token || '').replace(/\s+/g, '');
    if (s.length < 16 || !/^[A-Za-z0-9+/_-]+={0,2}$/.test(s)) return null;
    try {
      let normalized = s.replace(/-/g, '+').replace(/_/g, '/');
      while (normalized.length % 4) normalized += '=';
      const bin = atob(normalized);
      if (bin.length < 4) return null;
      const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      if (text.length < 4 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) return null;
      const readable = (text.match(/[\u4e00-\u9fa5A-Za-z0-9\s，。！？,.!?:/\\#&@_\-]/g) || '').length;
      if (readable / text.length < 0.85) return null;
      return text;
    } catch (e) { return null; }
  }

  function fallbackDecodeContent(root) {
    if (!root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    const targets = [];
    let n;
    while ((n = walker.nextNode())) {
      const parent = n.parentElement;
      if (!parent || parent.closest('a, textarea, input, script, style, .ld-b64')) continue;
      if (/[A-Za-z0-9+/_-]{16,}={0,2}/.test(n.nodeValue || '')) targets.push(n);
    }
    const tokenRe = /[A-Za-z0-9+/_-]{16,}={0,2}/g;
    targets.forEach((node) => {
      const text = node.nodeValue || '';
      tokenRe.lastIndex = 0;
      const frag = document.createDocumentFragment();
      let last = 0, m, hit = 0;
      while ((m = tokenRe.exec(text)) !== null) {
        const decoded = fallbackDecodeToken(m[0]);
        if (decoded == null) continue;
        frag.appendChild(document.createTextNode(text.slice(last, m.index)));
        const span = document.createElement('span');
        span.className = 'ld-b64';
        span.title = '已自动解码';
        span.textContent = decoded;
        frag.appendChild(span);
        last = m.index + m[0].length;
        hit++;
      }
      if (hit) {
        frag.appendChild(document.createTextNode(text.slice(last)));
        node.parentNode.replaceChild(frag, node);
      }
    });
  }

  function renderPost(p, ctx) {
    const isDeleted = !p.username || !p.cooked || p.deleted_at || p.user_deleted === true;
    const username = p.username || '';
    const displayName = p.name || p.display_name || p.display_username || username;
    const avatar = p.avatar_template ? BASE + p.avatar_template.replace('{size}', '32') : '';
    const like = likeInfo(p);
    const { canAct } = like;
    const acted = likeActed(p, like);
    const likeCount = likeDisplayCount(p, like);
    const isOP = ctx.op && username === ctx.op;
    const isME = ME_USERNAME && username === ME_USERNAME;
    const time = fmtTime(p.created_at);
    const profileUrl = userProfileUrl(p.username);
    const profileLabel = userProfileLabel(username, displayName);
    let cooked = isDeleted ? '<p class="ldp-deleted">（帖子已被作者删除）</p>' : (p.cooked || '');
    cooked = (() => {
      const tmp = document.createElement('div');
      tmp.innerHTML = cooked;
      tmp.querySelectorAll('a[href]').forEach((a) => {
        const href = a.getAttribute('href') || '';
        const isImageLink = /\.(png|jpe?g|gif|webp|bmp|avif)(\?|#|$)/i.test(href);
        const isLightbox = a.classList.contains('lightbox');
        if (!isImageLink && !isLightbox && !a.getAttribute('target')) {
          a.setAttribute('target', '_blank');
          a.setAttribute('rel', 'noopener noreferrer');
        }
      });
      return tmp.innerHTML;
    })();
    const boostsHtml = isDeleted ? '' : renderBoosts(p.boosts || []);
    const reactionsHtml = isDeleted ? '' : renderReactions(p);
    const canBoost = !isDeleted && p.can_boost === true;
    const actionsHtml = isDeleted ? '' : `
      <div class="ldp-actions">
        <button class="ldp-btn ldp-like ${acted ? 'liked' : ''}"
          data-acted="${acted ? '1' : '0'}" ${canAct || acted ? '' : 'disabled'} title="点赞">
            <span class="ldp-like-icon">${likeIconHtml(p)}</span>
            <span class="ldp-like-count">${likeCount}</span>
        </button>
        <button class="ldp-btn ldp-replybtn" title="回复">
            <svg viewBox="0 0 1024 1024" style="width:12px;height:12px;fill:currentColor;vertical-align:middle;">${ICONS.reply}</svg>
        </button>
        <button class="ldp-btn ldp-boost-btn" ${canBoost ? '' : 'disabled'} title="Boost">
            <svg viewBox="0 0 1024 1024" style="width:12px;height:12px;fill:currentColor;vertical-align:middle;">${ICONS.boost}</svg>
        </button>
      </div>`;
    const node = document.createElement('div');
    node.className = 'ldp-post';
    node.dataset.postId = p.id;
    node.dataset.postNumber = p.post_number;
    node.innerHTML = `
      <div class="ldp-post-head">
        ${profileUrl ? `<a class="ldp-user-link" href="${profileUrl}" target="_blank" rel="noopener noreferrer" title="${escAttr(profileLabel)}">` : ''}
        ${avatar ? `<img class="ldp-avatar" src="${avatar}" alt="" loading="lazy" decoding="async">` : ''}
        ${displayName ? `<span class="ldp-author">${esc(displayName)}</span>` : ''}
        ${username ? `<span class="ldp-user">@${esc(username)}</span>` : ''}
        ${profileUrl ? '</a>' : ''}
        ${p.trust_level != null ? `<span class="ldp-level">Lv.${p.trust_level}</span>` : ''}
        ${isOP ? '<span class="ldp-op">OP</span>' : ''}
        ${isME ? '<span class="ldp-me">ME</span>' : ''}
        ${time ? `<span class="ldp-time">· ${esc(time)}</span>` : ''}
        <span class="ldp-floor">#${p.post_number}</span>
      </div>
      <div class="ldp-content">${cooked}</div>
      ${reactionsHtml}
      <div class="ldp-boosts-list">${boostsHtml}</div>
      <div class="ldp-boost-input-wrap">
        <input type="text" class="ldp-boost-input" maxlength="16" placeholder="Boost ${esc(p.username)}… (最多16字符)">
        <button class="ldp-emoji-btn ldp-boost-emoji" type="button" title="表情">${EMOJI_BTN_ICON}</button>
        <button class="ldp-boost-submit" title="发送">✓</button>
        <button class="ldp-boost-cancel" title="取消">×</button>
      </div>
      ${actionsHtml}`;
    try {
      const contentEl = node.querySelector('.ldp-content');
      const b64 = window.__LDB64__;
      if (b64 && b64.flags && b64.flags.b64 && typeof b64.processCooked === 'function') {
        b64.processCooked(contentEl);
        if (typeof b64.renderDecoded === 'function') {
          contentEl.querySelectorAll('.ld-b64.ld-b64-raw').forEach((span) => b64.renderDecoded(span));
        }
      } else if (!b64) {
        fallbackDecodeContent(contentEl);
      }
    } catch (e) { console.warn('[LinuxDo 增强阅读] 密文自解失败:', e); }
    prepareSpoilers(node.querySelector('.ldp-content'));
    if (reactionsHtml) {
      fetchEmojiData(ctx && ctx.signal)
        .then(() => { if (node.isConnected) refreshEmojiUrls(node); })
        .catch(() => {});
    }
    return node;
  }

  /* ============ 5. 回复框 ============ */
  function ensureReplyBox(post) {
    let box = post.querySelector(':scope > .ldp-replybox');
    if (box) return box;
    const username = (post.querySelector(':scope > .ldp-post-head .ldp-user')?.textContent || '').replace(/^@/, '');
    box = document.createElement('div');
    box.className = 'ldp-replybox';
    box.innerHTML = `<textarea placeholder="回复 @${esc(username)} …"></textarea><div class="ldp-reply-tools"><button class="ldp-send">发送</button><span class="ldp-reply-tip">✓ 已发送</span></div>`;
    const actions = post.querySelector(':scope > .ldp-actions');
    if (actions) actions.after(box);
    else post.appendChild(box);
    return box;
  }

  /* ============ 6. 楼层点赞 ============ */
  async function handleLikeClick(postNode, ctx, likeBtn, postId) {
    closeReactionPanel();
    const post = findPostForNode(postNode, ctx);
    const cur = post && post.current_user_reaction;
    if (cur && cur.id) { await toggleReaction(postNode, ctx, cur.id, likeBtn); return; }
    const info = likeInfo(post || {});
    const acted = likeActed(post, info);
    likeBtn.disabled = true;
    let succeeded = false;
    try {
      if (!acted) {
        await apiSend(`${BASE}/post_actions`, 'POST', { id: postId, post_action_type_id: 2, flag_topic: false }, null, ctx.signal);
        if (post) patchCoreLike(post, true);
      } else {
        await apiSend(`${BASE}/post_actions/${postId}?post_action_type_id=2`, 'DELETE', null, null, ctx.signal);
        if (post) patchCoreLike(post, false);
      }
      if (ctx.scrollRoot && !ctx.scrollRoot.isConnected) return;
      if (post) {
        updatePostReactions(postNode, post);
        const opNode = ctx.nodeMap.get(1), op = ctx.postMap.get(1);
        if (opNode && op && opNode !== postNode) updatePostReactions(opNode, op);
        syncFooterLike(ctx.fLikeBtn, ctx.fLikeCountEl, op);
      }
      succeeded = true;
    } catch (err) { reportError('点赞失败', err); }
    finally { if (!succeeded) likeBtn.disabled = false; }
  }

  /* ============ 7. Boost 操作 ============ */
  async function handleBoostAction(e, postNode, ctx, postId, postNumber) {
    const boostEmojiBtn = e.target.closest('.ldp-boost-emoji');
    if (boostEmojiBtn) {
      e.preventDefault();
      e.stopPropagation();
      const wrap = boostEmojiBtn.closest('.ldp-boost-input-wrap');
      const input = wrap && wrap.querySelector('.ldp-boost-input');
      if (input) toggleEmojiPanel(boostEmojiBtn, input, ctx.signal);
      return true;
    }

    const boostBtn = e.target.closest('.ldp-boost-btn');
    if (boostBtn && !boostBtn.disabled) {
      const wrap = postNode.querySelector(':scope > .ldp-boost-input-wrap');
      if (!wrap) return true;
      const opening = !wrap.classList.contains('open');
      wrap.classList.toggle('open', opening);
      if (opening) wrap.querySelector('.ldp-boost-input').focus();
      return true;
    }

    const boostCancel = e.target.closest('.ldp-boost-cancel');
    if (boostCancel) {
      const wrap = boostCancel.closest('.ldp-boost-input-wrap');
      if (wrap) { wrap.classList.remove('open'); wrap.querySelector('.ldp-boost-input').value = ''; }
      return true;
    }

    const boostSubmit = e.target.closest('.ldp-boost-submit');
    if (boostSubmit && !boostSubmit.disabled) {
      const wrap = boostSubmit.closest('.ldp-boost-input-wrap');
      const input = wrap && wrap.querySelector('.ldp-boost-input');
      const raw = input ? input.value.trim() : '';
      if (!raw) { input && input.focus(); return true; }
      if (raw.length > 16) { alert('Boost内容不能超过16个字符'); return true; }
      boostSubmit.disabled = true;
      try {
        const res = await apiSend(`${BASE}/discourse-boosts/posts/${postId}/boosts`, 'POST', { raw }, null, ctx.signal);
        if (!postNode.isConnected) return true;
        if (res && res.id) {
          const listEl = postNode.querySelector(':scope > .ldp-boosts-list');
          if (listEl) {
            const newBubble = document.createElement('div');
            newBubble.className = 'ldp-boost-bubble ldp-flash';
            newBubble.dataset.boostId = res.id;
            newBubble.innerHTML = boostBubbleHtml(res);
            listEl.appendChild(newBubble);
          }
          input.value = '';
          wrap.classList.remove('open');
          const btn = postNode.querySelector(':scope > .ldp-actions > .ldp-boost-btn');
          if (btn) btn.disabled = true;
          if (postNumber === 1 && ctx.fBoostBtn) ctx.fBoostBtn.disabled = true;
        }
      } catch (err) { reportError('发射 Boost 失败', err); }
      finally { boostSubmit.disabled = false; }
      return true;
    }

    const boostDel = e.target.closest('.ldp-boost-del');
    if (boostDel) {
      const bubble = boostDel.closest('.ldp-boost-bubble');
      const boostId = bubble && bubble.dataset.boostId;
      if (!boostId) return true;
      try {
        await apiSend(`${BASE}/discourse-boosts/boosts/${boostId}`, 'DELETE', null, null, ctx.signal);
        if (!postNode.isConnected) return true;
        bubble.remove();
        const btn = postNode.querySelector(':scope > .ldp-actions > .ldp-boost-btn');
        if (btn) btn.disabled = false;
        if (postNumber === 1 && ctx.fBoostBtn) ctx.fBoostBtn.disabled = false;
      } catch (err) { reportError('删除 Boost 失败', err); }
      return true;
    }
    return false;
  }

  /* ============ 8. 回复发送 ============ */
  async function handleReplySend(sendBtn, ctx, postNumber) {
    const box = sendBtn.closest('.ldp-replybox');
    const textarea = box && box.querySelector('textarea');
    const raw = textarea ? textarea.value.trim() : '';
    if (!raw) return;
    sendBtn.disabled = true;
    sendBtn.textContent = '发送中…';
    try {
      const data = await apiSend(`${BASE}/posts`, 'POST', {
        raw,
        topic_id: ctx.topicId,
        reply_to_post_number: postNumber,
        nested_post: true,
      }, null, ctx.signal);
      if (ctx.scrollRoot && !ctx.scrollRoot.isConnected) return;
      const postData = data && data.post ? data.post : data;
      if (postData && postData.cooked) {
        const newPost = {
          id: postData.id,
          post_number: postData.post_number,
          username: postData.username || ME_USERNAME,
          name: postData.name,
          avatar_template: postData.avatar_template,
          cooked: postData.cooked,
          created_at: postData.created_at || new Date().toISOString(),
          reply_to_post_number: postNumber,
          actions_summary: [],
          boosts: [],
          can_boost: true,
        };
        const newNode = renderPost(newPost, ctx);
        newNode.classList.add('ldp-flash');
        ctx.commentsEl.appendChild(newNode);
        newNode.scrollIntoView({ behavior: 'smooth', block: 'center' });
        ctx.nodeMap.set(postData.post_number, newNode);
        ctx.postMap.set(newPost.post_number, newPost);
        ctx.totalComments = (ctx.totalComments || 0) + 1;
        updateCommentsHeader(ctx);
        const tip = box.querySelector('.ldp-reply-tip');
        if (tip) { tip.classList.add('show'); setTimeout(() => tip.classList.remove('show'), 1500); }
        box.classList.remove('open');
        textarea.value = '';
      }
    } catch (err) { reportError('回复失败', err); }
    finally { sendBtn.disabled = false; sendBtn.textContent = '发送'; }
  }

  /* ============ 9. 事件委托 ============ */
  function bindActions(modal, ctx) {
    modal.addEventListener('click', async (e) => {
      const spoiler = e.target.closest('.ldp-spoiler');
      if (spoiler && spoiler.classList.contains('ldp-spoiler-blurred')) {
        e.preventDefault();
        e.stopPropagation();
        setSpoilerState(spoiler, false);
        return;
      }
      if (spoiler && spoiler.classList.contains('ldp-spoiler-expanded')
          && !e.target.closest('a, button, input, video, img')) {
        e.preventDefault();
        e.stopPropagation();
        setSpoilerState(spoiler, true);
        return;
      }
      const img = e.target.closest('.ldp-content img');
      if (img) {
        e.preventDefault();
        e.stopPropagation();
        openLightbox(resolveOriginalSrc(img));
        return;
      }
      const anchor = e.target.closest('a');
      if (anchor && anchor.target === '_blank') return;

      const postNode = e.target.closest('.ldp-post');
      if (!postNode) return;
      const postId = postNode.dataset.postId, postNumber = +postNode.dataset.postNumber;

      const likeBtn = e.target.closest('.ldp-like');
      if (likeBtn && !likeBtn.disabled) { await handleLikeClick(postNode, ctx, likeBtn, postId); return; }

      const reactionBtn = e.target.closest('.ldp-reaction');
      if (reactionBtn && !reactionBtn.disabled) {
        const name = reactionBtn.getAttribute('data-reaction');
        if (name) await toggleReaction(postNode, ctx, name, reactionBtn);
        return;
      }

      const replyBtn = e.target.closest('.ldp-replybtn');
      if (replyBtn) {
        const box = ensureReplyBox(postNode);
        box.classList.toggle('open');
        if (box.classList.contains('open')) box.querySelector('textarea').focus();
        return;
      }

      if (await handleBoostAction(e, postNode, ctx, postId, postNumber)) return;

      const sendBtn = e.target.closest('.ldp-send');
      if (sendBtn) { await handleReplySend(sendBtn, ctx, postNumber); return; }
    });

    modal.addEventListener('keydown', (e) => {
      const spoiler = e.target.closest('.ldp-spoiler');
      if (!spoiler || (e.key !== 'Enter' && e.key !== ' ')) return;
      e.preventDefault();
      spoiler.click();
    });

    modal.addEventListener('mouseover', (e) => {
      const likeBtn = e.target.closest('.ldp-like');
      if (!likeBtn || openReactionTrigger === likeBtn) return;
      const postNode = likeBtn.closest('.ldp-post');
      if (!postNode) return;
      cancelReactionClose();
      openReactionPanel(likeBtn, postNode, ctx);
    });
    modal.addEventListener('mouseout', (e) => {
      const likeBtn = e.target.closest('.ldp-like');
      if (!likeBtn || likeBtn.contains(e.relatedTarget)) return;
      if (openReactionTrigger === likeBtn) scheduleReactionClose();
    });
  }

  /* ============ 10. 收藏 ============ */
  function bindBookmark(btn, topic, signal) {
    let bookmarked = !!topic.bookmarked, bookmarkId = topic.bookmark_id || null;
    const sync = () => { btn.classList.toggle('bookmarked', bookmarked); };
    sync();
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        if (!bookmarked) {
          const data = await apiSend(`${BASE}/bookmarks`, 'POST', { bookmarkable_id: topic.id, bookmarkable_type: 'Topic' }, null, signal);
          bookmarkId = data && data.id ? data.id : bookmarkId; bookmarked = true;
        } else if (bookmarkId) {
          await apiSend(`${BASE}/bookmarks/${bookmarkId}`, 'DELETE', null, null, signal); bookmarked = false; bookmarkId = null;
        } else {
          await apiSend(`${BASE}/t/${topic.id}/remove_bookmarks`, 'PUT', null, null, signal); bookmarked = false;
        }
        if (!btn.isConnected) return;
        sync();
      } catch (err) { reportError('收藏失败', err); } finally { btn.disabled = false; }
    });
  }

  /** 乐观更新 core 点赞的 actions_summary 条目（footer 点赞后立即反映到图标/数字） */
  function patchCoreLike(p, acted) {
    if (!p) return;
    const list = Array.isArray(p.actions_summary) ? p.actions_summary : (p.actions_summary = []);
    let like = list.find((a) => a && a.id === 2);
    if (!like) { like = { id: 2, count: 0, acted: false }; list.push(like); }
    like.acted = acted;
    like.count = Math.max(0, (Number(like.count) || 0) + (acted ? 1 : -1));
  }

  function syncFooterLike(btn, countEl, opPost) {
    if (!opPost) { btn.disabled = true; return; }
    const { canAct } = likeInfo(opPost);
    const liked = likeActed(opPost);
    countEl.textContent = likeDisplayCount(opPost);
    btn.classList.toggle('liked', liked);
    btn.disabled = !(canAct || liked);
    const iconEl = btn.querySelector('.ldp-like-icon');
    if (iconEl) iconEl.innerHTML = likeIconHtml(opPost);
  }

  function bindFooterLike(btn, countEl, opPost, ctx) {
    if (!opPost) { btn.disabled = true; return; }
    let liked = likeActed(opPost);
    syncFooterLike(btn, countEl, opPost);
    btn.addEventListener('click', async () => {
      if (btn.disabled) return;
      btn.disabled = true;
      try {
        const cur = opPost && opPost.current_user_reaction;
        if (cur && cur.id) {
          // 已有反应 → 点 ♥ = 取消当前反应（与每层 ♥ 语义一致）
          const postNode = ctx && ctx.nodeMap.get(1);
          if (postNode) await toggleReaction(postNode, ctx, cur.id, btn);
          else {
            const updated = await apiSend(`${BASE}/discourse-reactions/posts/${opPost.id}/custom-reactions/${encodeURIComponent(cur.id)}/toggle`, 'PUT', null, null, ctx && ctx.signal);
            Object.assign(opPost, updated);
          }
        } else if (!liked) {
          await apiSend(`${BASE}/post_actions`, 'POST', { id: opPost.id, post_action_type_id: 2, flag_topic: false }, null, ctx && ctx.signal);
          liked = true; patchCoreLike(opPost, true);
        } else {
          await apiSend(`${BASE}/post_actions/${opPost.id}?post_action_type_id=2`, 'DELETE', null, null, ctx && ctx.signal);
          liked = false; patchCoreLike(opPost, false);
        }
        if (!btn.isConnected) return;
        if (ctx && ctx.nodeMap) {
          const opNode = ctx.nodeMap.get(1);
          if (opNode) updatePostReactions(opNode, opPost);
        }
        syncFooterLike(btn, countEl, opPost);
      } catch (err) { reportError('点赞失败', err); } finally { syncFooterLike(btn, countEl, opPost); }
    });
  }

  function updateCommentsHeader(ctx) {
    if (ctx.countEl) ctx.countEl.textContent = ctx.totalComments ? `（${ctx.totalComments}）` : '';
    if (ctx.emptyEl) ctx.emptyEl.style.display = ctx.totalComments ? 'none' : '';
    if (ctx.footerReplyCountEl) ctx.footerReplyCountEl.textContent = ctx.totalComments || 0;
  }


  const SKELETON_HTML = `
    <div class="ldp-sk-head">
      <div class="ldp-sk ldp-sk-avatar"></div>
      <div class="ldp-sk ldp-sk-line ldp-sk-w40"></div>
    </div>
    <div class="ldp-sk-para">
      <div class="ldp-sk ldp-sk-line ldp-sk-w100"></div>
      <div class="ldp-sk ldp-sk-line ldp-sk-w90"></div>
      <div class="ldp-sk ldp-sk-line ldp-sk-w80"></div>
      <div class="ldp-sk ldp-sk-line ldp-sk-w60"></div>
    </div>
    <div class="ldp-sk-divider"></div>
    <div class="ldp-sk-comment">
      <div class="ldp-sk ldp-sk-avatar"></div>
      <div class="ldp-sk-cbody ldp-sk-para">
        <div class="ldp-sk ldp-sk-line ldp-sk-w30"></div>
        <div class="ldp-sk ldp-sk-line ldp-sk-w90"></div>
        <div class="ldp-sk ldp-sk-line ldp-sk-w60"></div>
      </div>
    </div>`;

  /* ============ 12. 弹窗主体 ============ */
  let CURRENT_OVERLAY = null;

  function getTopicCategoryName(categoryId) {
    if (!categoryId) return '';
    const badge = document.querySelector(
        `.badge-category[data-category-id="${categoryId}"] .badge-category__name`
    );
    return badge ? badge.textContent.trim() : '';
  }

  function renderTopicTaxonomy(overlay, topic) {
    const wrap = overlay.querySelector('.ldp-topic-tags');
    if (!wrap) return;
    const categoryName = getTopicCategoryName(topic?.category_id);
    const tags = Array.isArray(topic?.tags) ? topic.tags : [];
    const parts = [];
    if (categoryName) {
      parts.push(`<span class="ldp-topic-category">${esc(categoryName)}</span>`);
    }
    tags.forEach((tag) => {
      if (tag?.name) parts.push(`<span class="ldp-topic-tag">${esc(tag.name)}</span>`);
    });
    wrap.innerHTML = parts.join('');
    wrap.hidden = !parts.length;
  }

  function renderTopicTitle(overlay, topic) {
    const titleEl = overlay.querySelector('.ldp-title');
    if (titleEl) titleEl.textContent = topic?.title || '';
  }

  /**
   * 打开弹窗预览，固定从 1 楼开始。
   * 首屏并行请求 session 与 topic.json，数据到齐后一次性渲染。
   */
  async function openModal(topicId) {
    if (CURRENT_OVERLAY) {
      if (typeof CURRENT_OVERLAY.ldpClose === 'function') CURRENT_OVERLAY.ldpClose();
      else CURRENT_OVERLAY.remove();
      CURRENT_OVERLAY = null;
    }

    const abortController = new AbortController();
    const overlay = document.createElement('div');
    overlay.className = 'ldp-overlay';
    overlay.innerHTML = `
      <div class="ldp-modal">
        <div class="ldp-header">
          <div style="flex:1">
            <h2 class="ldp-title"><span class="ldp-sk ldp-sk-title"></span></h2>
            <div class="ldp-topic-tags" hidden></div>
          </div>
          <div class="ldp-head-btns"><button class="ldp-close" title="关闭">×</button></div>
        </div>
        <div class="ldp-body">
          <div class="ldp-topic"></div>
          <div class="ldp-comments-header">评论<span class="ldp-comments-count"></span></div>
          <div class="ldp-load-up-tip"><span class="ldp-tip-icon">⌛</span>正在向上加载…</div>
          <div class="ldp-up-sentinel"></div>
          <div class="ldp-comments"><div class="ldp-comments-empty">暂无评论</div></div>
          <div class="ldp-loading-tip"><span class="ldp-tip-icon">⌛</span>正在加载评论…</div>
          <div class="ldp-down-sentinel"></div>
          <div class="ldp-load-down-tip"><span class="ldp-tip-icon">⌛</span>正在向下加载…</div>
          <div class="ldp-loadmask">${SKELETON_HTML}</div>
        </div>
        <div class="ldp-footer" hidden>
          <button class="ldp-fbtn ldp-f-like" disabled title="点赞">
            <span class="ldp-like-icon"><svg viewBox="0 0 24 24" fill="currentColor">${ICONS.like}</svg></span>
            <span class="ldp-f-like-count">0</span>
          </button>
          <button class="ldp-fbtn ldp-f-reply" title="回复帖子">
            <svg viewBox="0 0 1024 1024" fill="currentColor">${ICONS.reply}</svg>
            <span class="ldp-f-reply-count">0</span>
          </button>
          <button class="ldp-fbtn ldp-f-boost" title="给楼主发送Boost">
            <svg viewBox="0 0 1024 1024" style="width:16px;height:16px;">${ICONS.boost}</svg>
          </button>
          <button class="ldp-fbtn ldp-f-bookmark" title="加入书签">
            <svg viewBox="0 0 24 24" fill="currentColor">${ICONS.bookmark}</svg>
          </button>
          <a class="ldp-fbtn ldp-f-open" href="#" target="_blank" rel="noopener" title="打开原贴">
            <svg viewBox="0 0 24 24" fill="currentColor">${ICONS.newTab}</svg>
          </a>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    CURRENT_OVERLAY = overlay;

    const modal = overlay.querySelector('.ldp-modal');
    const body = overlay.querySelector('.ldp-body');
    const topicEl = overlay.querySelector('.ldp-topic');
    const commentsEl = overlay.querySelector('.ldp-comments');
    const countEl = overlay.querySelector('.ldp-comments-count');
    const emptyEl = overlay.querySelector('.ldp-comments-empty');
    const upSentinel = overlay.querySelector('.ldp-up-sentinel');
    const downSentinel = overlay.querySelector('.ldp-down-sentinel');
    const maskEl = overlay.querySelector('.ldp-loadmask');
    const loadUpTip = overlay.querySelector('.ldp-load-up-tip');
    const loadDownTip = overlay.querySelector('.ldp-load-down-tip');
    const footerEl = overlay.querySelector('.ldp-footer');
    const fLikeBtn = overlay.querySelector('.ldp-f-like');
    const fLikeCountEl = overlay.querySelector('.ldp-f-like-count');
    const fReplyBtn = overlay.querySelector('.ldp-f-reply');
    const fReplyCountEl = overlay.querySelector('.ldp-f-reply-count');
    const fBoostBtn = overlay.querySelector('.ldp-f-boost');
    const fBookmarkBtn = overlay.querySelector('.ldp-f-bookmark');
    const fOpenLink = overlay.querySelector('.ldp-f-open');

    const ctx = {
      topicId, op: null, topicEl, commentsEl, countEl, emptyEl,
      scrollRoot: body, nodeMap: new Map(), postMap: new Map(),
      totalComments: 0, footerReplyCountEl: fReplyCountEl, validReactions: null,
      fBoostBtn, fLikeBtn, fLikeCountEl, signal: abortController.signal,
    };
    const setValidReactions = (topicLike) => {
      const list = topicLike && Array.isArray(topicLike.valid_reactions) ? topicLike.valid_reactions : null;
      ctx.validReactions = list && list.length ? list.slice() : null;
    };
    const close = () => {
      ctx.closed = true;
      abortController.abort();
      ctx.pagingIO?.disconnect();
      closeReactionPanel();
      closeEmojiPanel();
      if (activeLightboxClose) activeLightboxClose();
      overlay.remove();
      if (CURRENT_OVERLAY === overlay) CURRENT_OVERLAY = null;
      document.removeEventListener('keydown', onEsc);
    };
    function onEsc(e) { if (e.key === 'Escape') close(); }
    overlay.querySelector('.ldp-close').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', onEsc);
    overlay.ldpClose = close;
    bindActions(modal, ctx);

    const showBottomTip = () => {
      if (!body.querySelector('.ldp-bottom-tip')) {
        const tip = document.createElement('div');
        tip.className = 'ldp-bottom-tip';
        tip.textContent = '已加载全部评论';
        body.insertBefore(tip, downSentinel.nextSibling);
      }
    };
    const appendPosts = (posts) => {
      let op = null;
      for (const p of (Array.isArray(posts) ? posts : [])) {
        if (p.post_number === 1) {
          op = p;
          if (!ctx.topicEl.querySelector('.ldp-post')) {
            const node = renderPost(p, ctx);
            ctx.topicEl.appendChild(node);
            ctx.nodeMap.set(1, node);
            ctx.postMap.set(1, p);
          }
          continue;
        }
        if (ctx.postMap.has(p.post_number)) continue;
        const node = renderPost(p, ctx);
        ctx.commentsEl.appendChild(node);
        ctx.nodeMap.set(p.post_number, node);
        ctx.postMap.set(p.post_number, p);
      }
      const empty = ctx.commentsEl.querySelector('.ldp-comments-empty');
      if (empty && ctx.totalComments) empty.remove();
      updateCommentsHeader(ctx);
      return op;
    };
    const setupPaging = (stream) => {
      if (ctx.closed || !body.isConnected) return;
      if (!Array.isArray(stream) || stream.length < 2) { showBottomTip(); return; }
      let loading = false;
      let upDone = false;
      const indices = () => [...ctx.postMap.keys()]
          .map((n) => stream.indexOf(n))
          .filter((i) => i >= 0);
      const loadMore = async (dir) => {
        if (loading || (dir === 'up' && upDone)) return;
        const idxs = indices();
        if (!idxs.length) return;
        const minIdx = Math.min(...idxs), maxIdx = Math.max(...idxs);
        if (dir === 'up' && minIdx <= 0) { upDone = true; return; }
        if (dir === 'down' && maxIdx >= stream.length - 1) { showBottomTip(); return; }
        const nextIdx = dir === 'up' ? minIdx - 1 : maxIdx + 1;
        const page = Math.floor(nextIdx / PAGE_SIZE) + 1;
        loading = true;
        const tip = dir === 'up' ? loadUpTip : loadDownTip;
        tip.classList.add('show');
        const before = ctx.postMap.size;
        try {
          const data = await fetchJSON(`${BASE}/t/${topicId}.json?page=${page}`, abortController.signal);
          if (!body.isConnected) return;
          appendPosts(data.post_stream?.posts || []);
          if (ctx.postMap.size === before) {
            if (dir === 'up') upDone = true;
            else showBottomTip();
          }
        } catch (e) {
          if (e.name !== 'AbortError') console.warn('[LinuxDo 增强阅读] 加载评论失败:', e);
        } finally { loading = false; tip.classList.remove('show'); }
      };
      const io = new IntersectionObserver((entries) => {
        if (loading) return;
        const upHit = !upDone && entries.some((e) => e.isIntersecting && e.target === upSentinel);
        const downHit = entries.some((e) => e.isIntersecting && e.target === downSentinel);
        if (upHit) loadMore('up');
        else if (downHit) loadMore('down');
      }, { root: body, rootMargin: '240px' });
      io.observe(upSentinel);
      io.observe(downSentinel);
      ctx.pagingIO = io;
    };

    try {
      const signal = abortController.signal;
      const [_, topic] = await Promise.all([
        ensureMe(),
        fetchJSON(`${BASE}/t/${topicId}.json`, signal),
      ]);
      if (!body.isConnected) return;
      setValidReactions(topic);
      const posts = Array.isArray(topic.post_stream?.posts) ? topic.post_stream.posts : [];
      const opPost = posts.find((p) => p.post_number === 1) || null;
      ctx.op = opPost?.username || topic.details?.created_by?.username || null;
      ctx.totalComments = Math.max(0, (Number(topic.posts_count) || 1) - 1);
      renderTopicTitle(overlay, topic);
      renderTopicTaxonomy(overlay, topic);
      const returnedOp = appendPosts(posts);
      const finalOp = returnedOp || opPost;
      fOpenLink.href = `${BASE}/t/${topicId}`;
      bindBookmark(fBookmarkBtn, topic, ctx.signal);
      bindFooterLike(fLikeBtn, fLikeCountEl, finalOp, ctx);
      const canBoostOp = !!(finalOp && finalOp.can_boost);
      if (!canBoostOp) fBoostBtn.disabled = true;
      fBoostBtn.addEventListener('click', () => {
        if (fBoostBtn.disabled) return;
        const opNode = ctx.nodeMap.get(1);
        if (!opNode) return;
        const wrap = opNode.querySelector(':scope > .ldp-boost-input-wrap');
        if (!wrap) return;
        const opening = !wrap.classList.contains('open');
        wrap.classList.toggle('open', opening);
        if (opening) { wrap.querySelector('.ldp-boost-input').focus(); wrap.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
      });
      fReplyBtn.addEventListener('click', () => {
        const opNode = ctx.nodeMap.get(1);
        if (!opNode) return;
        const box = ensureReplyBox(opNode);
        box.classList.toggle('open');
        if (box.classList.contains('open')) { box.querySelector('textarea').focus(); box.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
      });
      footerEl.hidden = false;
      maskEl.classList.add('hide');
      setTimeout(() => maskEl.remove(), 300);
      setupPaging(topic.post_stream?.stream || []);
    } catch (err) {
      if (err.name === 'AbortError') return;
      if (maskEl) maskEl.remove();
      body.innerHTML = `<div class="ldp-error">加载失败：${esc(err.message)}</div>`;
    }
  }

  /* ============ 13. 拦截标题/通知点击 ============ */
  document.addEventListener('click', function (e) {
    const a = e.target.closest('a.title, a.raw-topic-link, a.search-link, a.search-result-topic, a[href*="/t/"]');
    if (!a || a.classList.contains('ldp-f-open')) return;

    const href = a.getAttribute('href') || '';
    const parsed = parseTopicHref(href);
    if (!parsed) return;

    const inMenu = !!a.closest(MENU_PANEL_SEL);
    const inSearch = !!a.closest(SEARCH_SEL);
    const isTitle = a.classList.contains('title') || a.classList.contains('raw-topic-link')
        || a.classList.contains('search-link') || a.classList.contains('search-result-topic');

    if (!isTitle && !inMenu && !inSearch) return;

    e.preventDefault();
    e.stopPropagation();

    const { topicId } = parsed;
    openModal(topicId);
  }, true);
})();