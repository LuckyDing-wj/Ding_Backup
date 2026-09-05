// ==UserScript==
// @name              Mactype助手
// @namespace         https://github.com/LuckyDing-wj/Ding_Backup
// @version           0.0.1
// @description       增强网页文字清晰度
// @author            LuckyDing
// @match             *://*/*
// @run-at            document-start
// @grant             GM_getValue
// @grant             GM_setValue
// @grant             GM_registerMenuCommand
// @grant             GM_getResourceText
// @require           https://unpkg.com/sweetalert2@10.16.6/dist/sweetalert2.min.js
// @resource          swalStyle https://unpkg.com/sweetalert2@10.16.6/dist/sweetalert2.min.css
// @homepageURL       https://github.com/LuckyDing-wj/Ding_Backup/blob/main/Youhou/MacType.js
// @downloadURL       https://raw.githubusercontent.com/LuckyDing-wj/Ding_Backup/main/Youhou/MacType.js
// @updateURL         https://raw.githubusercontent.com/LuckyDing-wj/Ding_Backup/main/Youhou/MacType.js
// ==/UserScript==

/*
 * ============ 修改声明 ============
 * 原作者:   syhyz1990
 * 原出处:   https://github.com/syhyz1990/mactype
 * 原版本:   2.3.1
 *
 * 本副本为个人修改自用, 不对外传播, 禁止任何形式的收费使用。
 * 保留原作者与原出处信息。
 *
 * 修改记录:
 *   [LuckyDing] 0.0.1  脚本源与更新地址指向个人 GitHub 仓库 (https://github.com/LuckyDing-wj/Ding_Backup)。
 * ============ 修改声明 ============
 */

(function () {
    'use strict';

    var STYLE_ID = 'mactype-style';
    var SWAL_STYLE_ID = 'swal-pub-style';

    var util = {
        sheets: {},

        getValue: function (name, defaultValue) {
            var value = GM_getValue(name);

            if (value === undefined) {
                return defaultValue;
            }

            return value;
        },

        setValue: function (name, value) {
            GM_setValue(name, value);
        },

        /*
         * 添加或更新 CSS。
         *
         * 优先使用 constructed stylesheet
         * （document.adoptedStyleSheets），
         * 不受页面 CSP style-src 限制，
         * 也不使用 innerHTML，避免 Trusted Types 拦截。
         *
         * 旧浏览器退回 <style> 元素。
         */
        addStyle: function (id, css) {
            if (!document.head) {
                return false;
            }

            var sheet = this.sheets[id];

            if (!sheet) {
                if (
                    typeof CSSStyleSheet === 'undefined' ||
                    !('replaceSync' in CSSStyleSheet.prototype) ||
                    !('adoptedStyleSheets' in Document.prototype)
                ) {
                    return this.addElementStyle(id, css);
                }

                sheet = new CSSStyleSheet();
                this.sheets[id] = sheet;

                document.adoptedStyleSheets =
                    document.adoptedStyleSheets.concat(sheet);
            }

            sheet.replaceSync(css);

            return true;
        },

        /*
         * 退回方案：注入 <style> 元素。
         *
         * 不使用 innerHTML，避免 Trusted Types 拦截。
         */
        addElementStyle: function (id, css) {
            var style = document.getElementById(id);

            if (!style) {
                style = document.createElement('style');
                style.id = id;
                style.type = 'text/css';

                document.head.appendChild(style);
            }

            if (style.textContent !== css) {
                style.textContent = css;
            }

            return true;
        },

        /*
         * 等待 document.head 创建。
         *
         * 因为脚本使用 document-start，
         * 此时 document.head 可能还不存在。
         *
         * 若 documentElement 也尚未创建（无法挂 MutationObserver），
         * 退回轮询，保证回调最终一定执行。
         */
        waitForHead: function (callback) {
            if (document.head) {
                callback();
                return;
            }

            var done = false;

            var run = function () {
                if (done) {
                    return;
                }

                done = true;
                callback();
            };

            if (document.documentElement) {
                var observer = new MutationObserver(function () {
                    if (document.head) {
                        observer.disconnect();
                        run();
                    }
                });

                observer.observe(document.documentElement, {
                    childList: true,
                    subtree: true
                });
            }

            var timer = setInterval(function () {
                if (document.head) {
                    clearInterval(timer);
                    run();
                }
            }, 50);
        }
    };

    var main = {
        headObserver: null,

        /*
         * 初始化默认值。
         */
        initValue: function () {
            if (GM_getValue('current_val') === undefined) {
                GM_setValue('current_val', 0);
            }

            if (GM_getValue('has_init') === undefined) {
                GM_setValue('has_init', false);
            }

            if (GM_getValue('white_list') === undefined) {
                GM_setValue('white_list', []);
            }

            /*
             * 修复旧数据异常。
             */
            var value = Number(GM_getValue('current_val'));

            if (!isFinite(value)) {
                GM_setValue('current_val', 0);
            }

            var list = GM_getValue('white_list');

            if (!Array.isArray(list)) {
                GM_setValue('white_list', []);
            }
        },

        /*
         * 当前清晰度。
         */
        getCurrentValue: function () {
            var value = Number(
                util.getValue('current_val', 0)
            );

            if (!isFinite(value)) {
                value = 0;
            }

            if (value < 0) {
                value = 0;
            }

            if (value > 1) {
                value = 1;
            }

            return value;
        },

        /*
         * 是否在白名单。
         */
        isWhiteListed: function () {
            var list = util.getValue('white_list', []);

            if (!Array.isArray(list)) {
                return false;
            }

            return list.indexOf(location.host) !== -1;
        },

        /*
         * 生成 CSS。
         */
        generateStyle: function () {
            var value = this.getCurrentValue();

            return [
                '.mactype-popup {',
                '    font-size: 14px !important;',
                '}',

                '.swal2-range input {',
                '    -webkit-appearance: auto !important;',
                '    appearance: auto !important;',
                '}',

                '*:not(pre) {',
                '    -webkit-text-stroke: ' + value + 'px !important;',
                '}',

                '::selection {',
                '    color: #fff !important;',
                '    background: #338fff !important;',
                '}'
            ].join('\n');
        },

        /*
         * 更新 Mactype CSS。
         */
        changeStyle: function () {
            util.addStyle(
                STYLE_ID,
                this.generateStyle()
            );
        },

        /*
         * 安装 CSS。
         */
        installStyles: function () {
            if (!document.head) {
                return;
            }

            var swalCSS = GM_getResourceText('swalStyle');

            if (swalCSS) {
                util.addStyle(
                    SWAL_STYLE_ID,
                    swalCSS
                );
            }

            util.addStyle(
                STYLE_ID,
                this.generateStyle()
            );
        },

        /*
         * 监听 head。
         *
         * 如果页面框架删除了我们的 style 或
         * 重置了 adoptedStyleSheets，
         * 自动重新添加。
         */
        observeHead: function () {
            if (!document.head) {
                return;
            }

            if (this.headObserver) {
                this.headObserver.disconnect();
            }

            var self = this;

            var adoptSheet = function (id, css) {
                var sheet = util.sheets[id];

                if (sheet) {
                    /*
                     * constructed stylesheet 路径。
                     */
                    if (
                        document.adoptedStyleSheets &&
                        document.adoptedStyleSheets.indexOf(sheet) === -1
                    ) {
                        document.adoptedStyleSheets =
                            document.adoptedStyleSheets.concat(sheet);
                    }

                    return;
                }

                /*
                 * <style> 元素退回路径。
                 */
                if (!document.getElementById(id)) {
                    util.addElementStyle(id, css);
                }
            };

            this.headObserver = new MutationObserver(function () {
                adoptSheet(STYLE_ID, self.generateStyle());

                if (!util.sheets[SWAL_STYLE_ID]) {
                    var swalCSS =
                        GM_getResourceText('swalStyle');

                    if (swalCSS) {
                        adoptSheet(SWAL_STYLE_ID, swalCSS);
                    }
                } else {
                    adoptSheet(SWAL_STYLE_ID);
                }
            });

            this.headObserver.observe(document.head, {
                childList: true
            });
        },

        /*
         * 注入 CSS。
         */
        addPluginStyle: function () {
            var self = this;

            util.waitForHead(function () {
                self.installStyles();
                self.observeHead();
            });
        },

        /*
         * 是否顶层窗口。
         */
        isTopWindow: function () {
            try {
                return window.self === window.top;
            } catch (e) {
                return false;
            }
        },

        /*
         * 设置窗口。
         */
        showSetting: function () {
            var self = this;

            if (typeof Swal === 'undefined') {
                console.error(
                    '[Mactype助手] SweetAlert2 加载失败'
                );
                return;
            }

            Swal.fire({
                title: '请选择清晰度',
                icon: 'info',
                input: 'range',
                showCancelButton: true,
                confirmButtonText: '保存',
                cancelButtonText: '还原',
                showCloseButton: true,
                inputLabel: '拖动滑块观察变化，数字越大字越清晰',
                customClass: {
                    popup: 'mactype-popup'
                },
                inputAttributes: {
                    min: '0',
                    max: '1',
                    step: '0.05'
                },
                inputValue: self.getCurrentValue(),
                didOpen: function () {
                    /*
                     * SweetAlert2 创建 input 后，
                     * 再监听实时变化。
                     */
                    var input =
                        document.getElementById('swal2-input');

                    if (!input) {
                        return;
                    }

                    input.addEventListener(
                        'input',
                        function (event) {
                            var value =
                                Number(event.target.value);

                            if (!isFinite(value)) {
                                return;
                            }

                            GM_setValue(
                                'current_val',
                                value
                            );

                            self.changeStyle();
                        }
                    );
                }
            }).then(function (result) {
                GM_setValue('has_init', true);

                if (result.isConfirmed) {
                    var value = Number(result.value);

                    if (!isFinite(value)) {
                        value = 0;
                    }

                    if (value < 0) {
                        value = 0;
                    }

                    if (value > 1) {
                        value = 1;
                    }

                    GM_setValue(
                        'current_val',
                        value
                    );

                    self.changeStyle();
                }

                if (
                    result.isDismissed &&
                    result.dismiss ===
                        Swal.DismissReason.cancel
                ) {
                    GM_setValue(
                        'current_val',
                        0
                    );

                    self.changeStyle();
                }
            });
        },

        /*
         * 注册 ScriptCat 菜单。
         */
        registerMenuCommand: function () {
            var self = this;
            var host = location.host;

            var list =
                util.getValue('white_list', []);

            if (!Array.isArray(list)) {
                list = [];
            }

            if (list.indexOf(host) !== -1) {
                GM_registerMenuCommand(
                    '💡 当前网站：❌',
                    function () {
                        var current =
                            util.getValue(
                                'white_list',
                                []
                            );

                        if (!Array.isArray(current)) {
                            current = [];
                        }

                        var index =
                            current.indexOf(host);

                        if (index !== -1) {
                            current.splice(
                                index,
                                1
                            );
                        }

                        GM_setValue(
                            'white_list',
                            current
                        );

                        location.reload();
                    }
                );
            } else {
                GM_registerMenuCommand(
                    '💡 当前网站：✔️',
                    function () {
                        var current =
                            util.getValue(
                                'white_list',
                                []
                            );

                        if (!Array.isArray(current)) {
                            current = [];
                        }

                        if (
                            current.indexOf(host) === -1
                        ) {
                            current.push(host);
                        }

                        GM_setValue(
                            'white_list',
                            current
                        );

                        location.reload();
                    }
                );
            }

            GM_registerMenuCommand(
                '⚙️ 设置',
                function () {
                    self.showSetting();
                }
            );
        },

        /*
         * 初始化。
         */
        init: function () {
            this.initValue();

            /*
             * 白名单网站不处理。
             */
            if (this.isWhiteListed()) {
                return;
            }

            /*
             * 菜单不需要等待 DOM。
             * document-start 阶段直接注册。
             */
            if (this.isTopWindow()) {
                this.registerMenuCommand();
            }

            /*
             * 注入 CSS。
             */
            this.addPluginStyle();

            /*
             * 第一次运行自动打开设置。
             */
            if (
                this.isTopWindow() &&
                !util.getValue('has_init', false)
            ) {
                var self = this;

                var openSetting = function () {
                    if (typeof Swal !== 'undefined') {
                        self.showSetting();
                    } else {
                        setTimeout(
                            openSetting,
                            50
                        );
                    }
                };

                openSetting();
            }
        }
    };

    main.init();

})();
