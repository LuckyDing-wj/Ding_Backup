// ==UserScript==
// @name              Linux.do 论坛精简
// @namespace         https://linux.do/
// @version           1.3.8
// @description       优化 linux.do 论坛体验: 隐藏侧边栏/列表摘要/相关主题推荐/弹窗横幅
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
    var BG_ID = 'ldc-bg';
    var BG_CSS_ID = 'ldc-bg-css';

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
                    self.truncateTitles();
                    self.setLinksTarget();

                    /*
                     * 增强阅读样式可能晚于首次扫描注入,
                     * 借防抖批次持续重试直至命中, 有上限防空转。
                     */
                    if (!self.ereadActive && self.ereadTries < 50) {
                        self.ereadTries += 1;
                        self.detectEread();
                    }
                }, 100);
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
         * 标题超过 30 字截断, 防止超长标题拉宽页面。
         * 全文放进 title 属性, 悬停可看。
         */
        truncateTitles: function () {
            var links = document.querySelectorAll(
                '.topic-list .raw-topic-link'
            );

            for (var i = 0; i < links.length; i++) {
                var link = links[i];
                var span = link.querySelector('span[dir="auto"]');

                if (!span) {
                    continue;
                }

                var full = link.getAttribute('data-ldc-full') ||
                    span.textContent;

                if (full.length <= 50) {
                    if (span.textContent !== full) {
                        span.textContent = full;
                    }

                    continue;
                }

                link.setAttribute('data-ldc-full', full);
                link.setAttribute('title', full);

                var cut = full.slice(0, 50) + '…';

                if (span.textContent !== cut) {
                    span.textContent = cut;
                }
            }
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
         * 所有链接新标签页打开。
         * Ember 重渲染后需重复执行, 由防抖回调驱动。
         */
        setLinksTarget: function () {
            var links = document.querySelectorAll(
                'a[href]:not([target]):not([data-user-card])'
            );

            for (var i = 0; i < links.length; i++) {
                var el = links[i];
                var href = el.getAttribute('href');

                /*
                 * target=_blank 不影响增强阅读拦截
                 * (它 preventDefault 在前), 无需排除标题。
                 */
                if (href && href.charAt(0) !== '#' &&
                    !SKIP_PROTOCOLS.test(href)) {
                    el.target = '_blank';

                    /*
                     * relList.add 保留原有 nofollow/ugc 等值。
                     */
                    if (el.relList) {
                        el.relList.add('noopener');
                    } else {
                        el.rel = 'noopener';
                    }
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

        /*
         * ---- 网页背景图 ----
         * fixed 定位背景层 z-index:-1, 模糊打在背景层上
         * (GPU 缓存, 不随内容滚动重算, 性能损耗可忽略)。
         */
        isBgEnabled: function () {
            return util.getValue('bg_enabled', false) === true;
        },

        applyBackground: function () {
            var enabled = this.isBgEnabled();
            var url = util.getValue('bg_url', '');
            var blur = Number(util.getValue('bg_blur', 0)) || 0;
            var el = document.getElementById(BG_ID);
            var css = document.getElementById(BG_CSS_ID);

            if (!enabled || !url) {
                if (el) {
                    el.remove();
                }
                if (css) {
                    css.remove();
                }
                return;
            }

            /*
             * 让 html/body 及主要内容容器背景透明,
             * 列表/帖子区域透出背景图。
             * 模态框、下拉菜单保持不透明, 保证可读。
             */
            util.addStyle(
                BG_CSS_ID,
                [
                    'html, body { background: transparent !important; }',
                    '',
                    '#main-outlet, #main-outlet-wrapper, .wrap,',
                    '.topic-area, .post-stream, .topic-list,',
                    '.topic-list .topic-list-item, .topic-list td,',
                    '.topic-body, .topic-post, .contents,',
                    '.d-header, .d-header-wrap,',
                    '#d-sidebar, .sidebar-wrapper, .sidebar-container {',
                    '    background: transparent !important;',
                    '}',
                    '',
                    '.d-modal, .d-modal__container,',
                    '.fk-d-menu, .d-header-dropdown,',
                    '.select-kit-body, .menu-panel {',
                    '    background-color: var(--secondary) !important;',
                    '}'
                ].join('\n')
            );

            if (!el) {
                el = document.createElement('div');
                el.id = BG_ID;
                el.style.cssText =
                    'position:fixed;inset:0;z-index:-1;' +
                    'pointer-events:none;background-size:cover;' +
                    'background-position:center;background-repeat:no-repeat;';
                (document.body || document.documentElement)
                    .appendChild(el);
            }

            /*
             * 多重背景: 前层 30% 暗色遮罩保证文字可读。
             */
            el.style.backgroundImage =
                'linear-gradient(rgba(0,0,0,0.3), rgba(0,0,0,0.3)), ' +
                'url("' + url + '")';

            /*
             * 模糊边缘泛白用轻微放大抵消。
             */
            el.style.filter =
                blur > 0 ? 'blur(' + blur + 'px)' : 'none';
            el.style.transform =
                blur > 0 ? 'scale(1.06)' : 'none';
        },

        toggleBg: function () {
            GM_setValue('bg_enabled', !this.isBgEnabled());
            this.applyBackground();
        },

        promptBgUrl: function () {
            var url = prompt(
                '输入图片 URL (https:// 开头)',
                util.getValue('bg_url', '')
            );

            if (url === null) {
                return;
            }

            url = url.trim();

            if (!/^https:\/\//i.test(url)) {
                if (url) {
                    alert('仅支持 https:// 开头的图片地址');
                }
                return;
            }

            GM_setValue('bg_url', url);
            GM_setValue('bg_enabled', true);
            this.applyBackground();
        },

        /*
         * 本地图片: 选择一次即转 base64 入库。
         * canvas 缩到最长 1920px + JPEG 压缩, 控制存储体积。
         */
        pickLocalImage: function () {
            var self = this;
            var input = document.createElement('input');

            input.type = 'file';
            input.accept = 'image/*';

            input.onchange = function () {
                var file = input.files && input.files[0];

                if (!file) {
                    return;
                }

                var reader = new FileReader();

                reader.onload = function () {
                    var img = new Image();

                    img.onload = function () {
                        var max = 1920;
                        var scale = Math.min(
                            1,
                            max / Math.max(img.width, img.height)
                        );
                        var canvas = document.createElement('canvas');

                        canvas.width = Math.round(img.width * scale);
                        canvas.height = Math.round(img.height * scale);
                        canvas.getContext('2d').drawImage(
                            img, 0, 0, canvas.width, canvas.height
                        );

                        GM_setValue(
                            'bg_url',
                            canvas.toDataURL('image/jpeg', 0.85)
                        );
                        GM_setValue('bg_enabled', true);
                        self.applyBackground();
                    };

                    img.src = reader.result;
                };

                reader.readAsDataURL(file);
            };

            input.click();
        },

        setBgBlur: function () {
            var raw = prompt(
                '模糊度 0-30 (像素)',
                util.getValue('bg_blur', 0)
            );

            if (raw === null) {
                return;
            }

            var blur = Number(raw);

            if (!isFinite(blur) || blur < 0) {
                blur = 0;
            }
            if (blur > 30) {
                blur = 30;
            }

            GM_setValue('bg_blur', blur);
            this.applyBackground();
        },

        clearBackground: function () {
            GM_setValue('bg_url', '');
            GM_setValue('bg_enabled', false);
            this.applyBackground();
        },

        registerMenu: function () {
            var self = this;

            var update = function () {
                return self.isEnabled() ? '✅ 精简: 开' : '⭕ 精简: 关';
            };

            GM_registerMenuCommand(update(), function () {
                GM_setValue('ldc_disabled', self.isEnabled());
                location.reload();
            });

            /*
             * 背景功能独立于精简开关, 始终可用。
             * 切换后重注册菜单, 标签实时反映状态。
             */
            var bgMenuId = null;

            var updateBgMenu = function () {
                if (bgMenuId !== null && GM_unregisterMenuCommand) {
                    GM_unregisterMenuCommand(bgMenuId);
                }

                bgMenuId = GM_registerMenuCommand(
                    self.isBgEnabled() ? '🖼️ 背景: 开' : '🖼️ 背景: 关',
                    function () {
                        self.toggleBg();
                        updateBgMenu();
                    }
                );
            };

            updateBgMenu();

            GM_registerMenuCommand('🔗 设置图片 URL', function () {
                self.promptBgUrl();
            });

            GM_registerMenuCommand('📁 选择本地图片', function () {
                self.pickLocalImage();
            });

            GM_registerMenuCommand('🌫️ 调节模糊度', function () {
                self.setBgBlur();
            });

            GM_registerMenuCommand('🗑️ 清除背景', function () {
                self.clearBackground();
            });
        },

        init: function () {
            var self = this;

            /*
             * 菜单必须无条件注册, 否则关闭后无法重新开启。
             */
            this.registerMenu();

            if (this.isEnabled()) {
                util.waitForHead(function () {
                    util.addStyle(STYLE_ID, CSS);
                });
            }

            /*
             * body 就绪后: 背景无条件应用;
             * 弹窗观察仅在精简开启时挂载。
             */
            var start = function () {
                if (document.body) {
                    self.applyBackground();

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
