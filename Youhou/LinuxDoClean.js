// ==UserScript==
// @name              Linux.do 论坛精简
// @namespace         https://linux.do/
// @version           1.4.1
// @description       优化 linux.do 论坛体验: 收窄侧边栏/列表紧凑/隐藏杂质/新标签页打开
// @match             https://linux.do/*
// @run-at            document-start
// @grant             GM_getValue
// @grant             GM_setValue
// @grant             GM_registerMenuCommand
// @grant             GM_unregisterMenuCommand
// ==/UserScript==

(function () {
    'use strict';

    var STYLE_ID = 'ldc-style';

    /*
     * 新标签逻辑跳过的协议:
     * 邮件/脚本/数据/电话链接保持浏览器默认行为。
     */
    var SKIP_PROTOCOLS = /^(mailto|javascript|data|tel):/i;

    /*
     * 与 LinuxDoEnhanceRead (弹窗预览脚本) 共存:
     * 标题类链接和面板内链接交给该脚本处理,
     * 不强制新标签。
     */
    var EREAD_KEEP_SEL =
        'a.title, a.raw-topic-link, ' +
        'a.search-link, a.search-result-topic';
    var EREAD_PANEL_SEL =
        '.menu-panel, .user-menu, .quick-access-panel, ' +
        '.notifications, .search-results, .fps-result, ' +
        '.search-menu, .search-menu-container';

    /*
     * 弹窗关键词: 模态框文本命中即自动关闭。
     * 按需增删。
     */
    var MODAL_PATTERNS = [
        /邀请.*注册/,
        /建议.*关注/,
        /欢迎来到.*社区/
    ];

    /*
     * 精简规则。
     * body:not(.ldc-disabled) 前缀: 菜单开关通过 body class 控制整体启停。
     */
    var CSS = [
        /*
         * 侧边栏收窄: 12rem, 贴左缘, 无悬停展开。
         */
        'body:not(.ldc-disabled) #main-outlet-wrapper {',
        '    grid-template-columns: 12rem minmax(0, 1fr) !important;',
        '    padding-left: 0 !important;',
        '}',
        'body:not(.ldc-disabled) #d-sidebar,',
        'body:not(.ldc-disabled) .sidebar-wrapper,',
        'body:not(.ldc-disabled) .sidebar-container {',
        '    width: 12rem !important;',
        '    min-width: 12rem !important;',
        '    max-width: 12rem !important;',
        '    margin-left: 0 !important;',
        '    padding-left: 0.25rem !important;',
        '    padding-right: 0.25rem !important;',
        '}',
        'body:not(.ldc-disabled) #d-sidebar .sidebar-section-wrapper {',
        '    padding: 0.25em 0.25em !important;',
        '}',
        'body:not(.ldc-disabled) #d-sidebar .sidebar-section-link-wrapper {',
        '    padding-left: 0 !important;',
        '    margin-left: 0 !important;',
        '}',
        'body:not(.ldc-disabled) #d-sidebar .sidebar-section-link {',
        '    padding: 0.15em 0.35em !important;',
        '    font-size: 0.95em !important;',
        '    gap: 0.4em !important;',
        '}',

        /*
         * 去掉链接前图标与分类色块, 保留折叠箭头。
         */
        'body:not(.ldc-disabled) #d-sidebar .sidebar-section-link .d-icon:not([class*="chevron"]):not([class*="caret"]):not([class*="wrench"]),',
        'body:not(.ldc-disabled) #d-sidebar .category-color-badge {',
        '    display: none !important;',
        '}',

        /*
         * 侧边栏底部聊天按钮。
         */
        'body:not(.ldc-disabled) .sidebar__panel-switch-button[data-key="chat"] {',
        '    display: none !important;',
        '}',

        /*
         * 首页横幅: 标题与搜索框压缩。
         */
        'body:not(.ldc-disabled) .custom-search-banner-wrap,',
        'body:not(.ldc-disabled) .search-banner,',
        'body:not(.ldc-disabled) .welcome-banner {',
        '    padding: 0.5em 1em !important;',
        '    margin: 0.25em auto !important;',
        '}',
        'body:not(.ldc-disabled) .custom-search-banner-wrap h1,',
        'body:not(.ldc-disabled) .search-banner h1,',
        'body:not(.ldc-disabled) .welcome-banner h1,',
        'body:not(.ldc-disabled) .welcome-banner__title {',
        '    display: none !important;',
        '}',
        'body:not(.ldc-disabled) .custom-search-banner-wrap .search-menu,',
        'body:not(.ldc-disabled) .search-banner .search-menu,',
        'body:not(.ldc-disabled) .welcome-banner .search-menu {',
        '    max-width: 34em !important;',
        '    margin: 0.4em auto !important;',
        '}',
        'body:not(.ldc-disabled) .custom-search-banner-wrap .search-input,',
        'body:not(.ldc-disabled) .search-banner .search-input,',
        'body:not(.ldc-disabled) .welcome-banner .search-input {',
        '    height: 2.2em !important;',
        '}',

        /*
         * 主题列表: td 保持 table-cell 以支持垂直居中。
         */
        'body:not(.ldc-disabled) .topic-list td.main-link {',
        '    vertical-align: middle !important;',
        '}',
        'body:not(.ldc-disabled) .topic-list .main-link .link-top-line {',
        '    display: inline-flex !important;',
        '    align-items: center !important;',
        '    flex-wrap: nowrap !important;',
        '    min-width: 0 !important;',
        '}',
        'body:not(.ldc-disabled) .topic-list .main-link .raw-topic-link {',
        '    overflow: hidden !important;',
        '    text-overflow: ellipsis !important;',
        '    white-space: nowrap !important;',
        '    min-width: 0 !important;',
        '    max-width: 42em !important;',
        '}',
        'body:not(.ldc-disabled) .topic-list .main-link .topic-post-badges {',
        '    flex-shrink: 0 !important;',
        '}',
        'body:not(.ldc-disabled) .topic-list .main-link .link-bottom-line {',
        '    display: inline-flex !important;',
        '    align-items: center !important;',
        '    flex: 0 0 9em !important;',
        '    margin: 0 0.5em 0 0 !important;',
        '    white-space: nowrap !important;',
        '    overflow: hidden !important;',
        '}',
        'body:not(.ldc-disabled) .topic-list .main-link .discourse-tags {',
        '    display: none !important;',
        '}',

        /*
         * 主题列表: 隐藏头像列与浏览量列(含表头)。
         */
        'body:not(.ldc-disabled) .topic-list .posters,',
        'body:not(.ldc-disabled) .topic-list .views {',
        '    display: none !important;',
        '}',

        /*
         * 主题列表: 只留标题, 隐藏摘要。
         */
        'body:not(.ldc-disabled) .topic-list .topic-excerpt,',
        'body:not(.ldc-disabled) .topic-excerpt {',
        '    display: none !important;',
        '}',

        /*
         * 主题页底部: 相关主题 / 推荐阅读 / 关联消息。
         */
        'body:not(.ldc-disabled) .suggested-topics,',
        'body:not(.ldc-disabled) #suggested-topics,',
        'body:not(.ldc-disabled) .more-topics__container,',
        'body:not(.ldc-disabled) .related-messages {',
        '    display: none !important;',
        '}',

        /*
         * 全局横幅 / 公告条 / 注册引导。
         */
        'body:not(.ldc-disabled) .global-notice,',
        'body:not(.ldc-disabled) .signup-cta,',
        'body:not(.ldc-disabled) .custom-banner,',
        'body:not(.ldc-disabled) .banner-wrapper,',
        'body:not(.ldc-disabled) .above-main-container {',
        '    display: none !important;',
        '}',

        /*
         * 主题页: 时间线贴右缘并收窄。
         * Discourse 滚动时会切换 docked 类, 故不限定状态。
         */
        '@media (min-width: 1000px) {',
        '    body:not(.ldc-disabled) .timeline-container {',
        '        position: fixed !important;',
        '        right: 0 !important;',
        '        top: 6em !important;',
        '        width: 6rem !important;',
        '    }',
        '    body:not(.ldc-disabled) .timeline-container .timeline-scrollarea-wrapper {',
        '        width: 100% !important;',
        '    }',
        '    body:not(.ldc-disabled) .timeline-container .timeline-scroller-content {',
        '        min-width: 0 !important;',
        '        padding: 0 0.25em !important;',
        '    }',
        '}',

        /*
         * 主题页: 整个统计块 (浏览量/点赞/总结/用户列表) 不再渲染。
         */
        'body:not(.ldc-disabled) .topic-map {',
        '    display: none !important;',
        '}',

        /*
         * 主题页: 帖子/评论正文加宽。
         * 时间线已 fixed 脱离文档流, grid 预留列与 max-width 全部解除;
         * 容器改 block 让 grid 失效, 帖子流占满全宽。
         */
        'body:not(.ldc-disabled) .topic-area,',
        'body:not(.ldc-disabled) .posts-wrapper,',
        'body:not(.ldc-disabled) .container.posts,',
        'body:not(.ldc-disabled) .post-stream .topic-post article.boxed .topic-body {',
        '    max-width: none !important;',
        '}',
        'body:not(.ldc-disabled) .container.posts {',
        '    display: block !important;',
        '    width: auto !important;',
        '    grid-template-columns: minmax(0, 1fr) !important;',
        '    grid-template-areas: "posts" !important;',
        '    padding-right: 8rem !important;',
        '    --d-timeline-width: 0px !important;',
        '}',
        'body:not(.ldc-disabled) .post-stream {',
        '    width: 100% !important;',
        '}',

        /*
         * 主题页: 隐藏楼层用户冗余信息
         * (新用户标记/头衔/副用户名/徽章图标/状态消息/信任等级角标)。
         */
        'body:not(.ldc-disabled) .names .new_user a,',
        'body:not(.ldc-disabled) .names .user-title,',
        'body:not(.ldc-disabled) .names .user-title a,',
        'body:not(.ldc-disabled) .names .second.username,',
        'body:not(.ldc-disabled) .topic-meta-data .names .poster-icon-container,',
        'body:not(.ldc-disabled) .topic-meta-data .user-status-message-wrap,',
        'body:not(.ldc-disabled) .avatar-flair.rounded {',
        '    display: none !important;',
        '}',

        /*
         * 隐藏元素瞬间闪烁的过渡抑制。
         */
        '.d-modal, .global-notice, .sidebar-wrapper {',
        '    transition: none !important;',
        '}'
    ].join('\n');

    var util = {
        getValue: function (name, defaultValue) {
            var value = GM_getValue(name);

            if (value === undefined) {
                return defaultValue;
            }

            return value;
        },

        addStyle: function (id, css) {
            var style = document.getElementById(id);
            if (!style) {
                style = document.createElement('style');
                style.id = id;
                style.textContent = css;
                document.head.appendChild(style);
            } else if (style.textContent !== css) {
                style.textContent = css;
            }
        },

        /*
         * 把我们的 <style> 重新挂到 head 末尾。
         * Discourse 运行时注入的样式表更靠后, 会盖掉同 !important 的规则;
         * 移动节点到末尾使其源顺序最后, 保证我们的规则获胜。
         */
        ensureStyleLast: function (id) {
            var style = document.getElementById(id);
            if (style && document.head &&
                document.head.lastChild !== style) {
                document.head.appendChild(style);
            }
        },

        waitForHead: function (callback) {
            if (document.head) {
                callback();
                return;
            }
            var observer = new MutationObserver(function () {
                if (document.head) {
                    observer.disconnect();
                    callback();
                }
            });
            observer.observe(document, { childList: true, subtree: true });
        }
    };

    var main = {
        headObserver: null,

        /*
         * LinuxDoEnhanceRead (弹窗预览脚本) 是否在场。
         * 页面加载后探测其注入的 .ldp- 样式标记。
         */
        ereadActive: false,

        /*
         * 增强阅读探测已尝试次数, 防止脚本不装在时无限扫描。
         */
        ereadTries: 0,

        isEnabled: function () {
            return !GM_getValue('ldc_disabled', false);
        },

        /*
         * 模态框文本是否命中关键词。
         */
        matchModal: function (modal) {
            if (!modal || !modal.textContent) {
                return false;
            }
            var text = modal.textContent;
            for (var i = 0; i < MODAL_PATTERNS.length; i++) {
                if (MODAL_PATTERNS[i].test(text)) {
                    return true;
                }
            }
            return false;
        },

        /*
         * 监听 SPA 全程, 命中关键词的弹窗自动关。
         */
        observeModals: function () {
            var self = this;
            var timer = null;

            /*
             * Discourse SPA DOM 变动高频, 防抖避免每批次全文档查询。
             */
            this.modalObserver = new MutationObserver(function () {
                if (timer) {
                    return;
                }
                timer = setTimeout(function () {
                    timer = null;
                    util.ensureStyleLast(STYLE_ID);
                    self.checkModals();
                    self.moveBadges();

                    if (!self.ereadActive && self.ereadTries < 10) {
                        self.ereadTries += 1;
                        self.detectEread();
                    }
                }, 150);
            });

            this.modalObserver.observe(document.body, {
                childList: true,
                subtree: true
            });

            document.addEventListener(
                'click',
                function (event) {
                    self.onDocumentClick(event);
                },
                true
            );
        },

        /*
         * 把分类/徽章行搬进标题行, 实现同行显示。
         * Ember 重渲染后需重复执行, 由防抖回调驱动。
         */
        moveBadges: function () {
            var cells = document.querySelectorAll(
                '.topic-list td.main-link'
            );

            for (var i = 0; i < cells.length; i++) {
                var cell = cells[i];
                var top = cell.querySelector('.link-top-line');
                var bottom = cell.querySelector('.link-bottom-line');

                if (top && bottom &&
                    bottom.parentNode !== top) {
                    top.insertBefore(bottom, top.firstChild);
                }
            }
        },

        /*
         * 探测增强阅读脚本: 它注入含 .ldp- 规则的内联样式。
         */
        detectEread: function () {
            var styles = document.querySelectorAll('style');

            for (var i = 0; i < styles.length; i++) {
                if (styles[i].textContent &&
                    styles[i].textContent.indexOf('.ldp-') !== -1) {
                    this.ereadActive = true;
                    return true;
                }
            }

            return false;
        },

        /*
         * 捕获阶段拦截链接点击, 强制新标签页打开。
         * capture 先于 Discourse 的冒泡路由处理器,
         * stopImmediatePropagation 阻止 SPA 路由接管,
         * 且同节点上后注册的监听器 (增强阅读) 也被拦下,
         * 避免新标签与弹窗双开。
         */
        onDocumentClick: function (event) {
            if (event.defaultPrevented ||
                event.button !== 0 ||
                event.ctrlKey ||
                event.altKey ||
                event.metaKey ||
                event.shiftKey) {
                return;
            }

            var target = event.target;
            var link = target && target.closest ?
                target.closest('a[href]') :
                null;

            if (!link) {
                return;
            }

            /*
             * 头像/用户名链接 (data-user-card) 放行,
             * 让 Discourse 弹出用户卡片而非打开新页。
             */
            if (link.hasAttribute('data-user-card') ||
                link.closest('[data-user-card]')) {
                return;
            }

            /*
             * 标题类链接和面板内链接:
             * 增强阅读在场 → 放行给它弹窗预览;
             * 不在场 → 照常强制新标签。
             */
            if (this.ereadActive &&
                (link.closest(EREAD_KEEP_SEL) ||
                 link.closest(EREAD_PANEL_SEL))) {
                return;
            }

            var href = link.getAttribute('href');

            if (!href || href.charAt(0) === '#' ||
                SKIP_PROTOCOLS.test(href)) {
                return;
            }

            event.preventDefault();
            event.stopImmediatePropagation();
            window.open(link.href, '_blank', 'noopener');
        },

        checkModals: function () {
            var modals = document.querySelectorAll(
                '.d-modal, #discourse-modal'
            );

            for (var i = 0; i < modals.length; i++) {
                var modal = modals[i];

                /*
                 * 可见性用 computed style 判断,
                 * 内联/class 两种隐藏方式均覆盖。
                 */
                var cs = document.defaultView.getComputedStyle(modal);

                if (cs.display === 'none' ||
                    cs.visibility === 'hidden') {
                    continue;
                }

                if (!this.matchModal(modal)) {
                    continue;
                }

                /*
                 * 标记打在内容节点上: 现代模态框 (.d-modal)
                 * 关闭即销毁, 标记随之消失; 遗留常驻容器
                 * (#discourse-modal) 则标记其当前内容子节点,
                 * 容器复用时装载的新内容不带旧标记。
                 */
                var target = modal.id === 'discourse-modal' ?
                    modal.firstElementChild :
                    modal;

                if (!target ||
                    target.hasAttribute('data-ldc-closed')) {
                    continue;
                }

                target.setAttribute('data-ldc-closed', '1');

                var closer = modal.querySelector(
                    '.modal-close, ' +
                    'button[data-dismiss="modal"], ' +
                    '.d-modal__dismiss'
                );

                if (closer) {
                    closer.click();
                } else {
                    document.dispatchEvent(new KeyboardEvent(
                        'keydown',
                        { key: 'Escape', keyCode: 27, bubbles: true }
                    ));
                }
            }
        },

        registerMenu: function () {
            var self = this;
            var label = self.isEnabled() ? '✅ 精简: 开' : '⭕ 精简: 关';

            GM_registerMenuCommand(label, function () {
                GM_setValue('ldc_disabled', self.isEnabled());
                location.reload();
            });
        },

        init: function () {
            var self = this;
            this.registerMenu();

            if (this.isEnabled()) {
                util.waitForHead(function () {
                    util.addStyle(STYLE_ID, CSS);
                });
            }

            var start = function () {
                if (document.body) {
                    if (self.isEnabled()) {
                        self.observeModals();
                    }

                    setTimeout(function () {
                        self.detectEread();
                    }, 800);
                } else {
                    setTimeout(start, 50);
                }
            };
            start();
        }
    };

    main.init();
})();
