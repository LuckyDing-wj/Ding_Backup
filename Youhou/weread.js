// ==UserScript==
// @name         微信读书-增强
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  微信读书增强功能：自定义主题、宽度调节、自动滚动、自动翻页
// @author       优化版
// @match        https://weread.qq.com/web/reader/*
// @icon         https://weread.qq.com/favicon.ico
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    // ==================== 常量定义 ====================
    const TIMING = {
        POLL_INTERVAL: 300,
        THEME_TRANSITION: 500,
        ANIMATION_SHORT: 200,
        SCROLL_TICK: 1000,
        PAGE_TURN_WAIT: 6000,
        ELEMENT_WAIT_DEFAULT: 3000,
        ELEMENT_WAIT_MAX: 30000,
        DEBOUNCE_DEFAULT: 300
    };

    const WIDTH_CONFIG = {
        DEFAULT: 50,
        STEP: 5,
        MIN: 30,
        MAX: 100
    };

    const DEBUG = false;
    const log = DEBUG ? console.log.bind(console) : () => {};

    // ==================== 工具函数 ====================

    // localStorage 安全包装器
    const Storage = {
        get(key, defaultValue = null) {
            try {
                return localStorage.getItem(key) || defaultValue;
            } catch (e) {
                console.warn('localStorage.getItem failed:', e);
                return defaultValue;
            }
        },
        set(key, value) {
            try {
                localStorage.setItem(key, value);
                return true;
            } catch (e) {
                console.warn('localStorage.setItem failed:', e);
                return false;
            }
        }
    };

    // 防抖函数
    function debounce(fn, delay = TIMING.DEBOUNCE_DEFAULT) {
        let timeoutId;
        return function(...args) {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => fn.apply(this, args), delay);
        };
    }

    // 节流函数
    function throttle(fn, delay = TIMING.DEBOUNCE_DEFAULT) {
        let lastCall = 0;
        return function(...args) {
            const now = Date.now();
            if (now - lastCall >= delay) {
                lastCall = now;
                fn.apply(this, args);
            }
        };
    }

    // DOM 缓存管理（带时间戳防止竞态）
    const DOMCache = {
        elements: {},
        get(selector, forceRefresh = false, maxAge = 5000) {
            const cached = this.elements[selector];

            // 检查缓存有效性
            if (!forceRefresh && cached && cached.element && document.contains(cached.element)) {
                if (Date.now() - cached.timestamp < maxAge) {
                    return cached.element;
                }
            }

            // 重新查询并缓存
            const element = $css(selector);
            this.elements[selector] = {
                element,
                timestamp: Date.now()
            };
            return element;
        },
        clear() {
            this.elements = {};
        }
    };

    // 资源清理管理
    const CleanupManager = {
        listeners: [],
        timers: [],
        observers: [],

        addListener(element, event, handler) {
            element.addEventListener(event, handler);
            this.listeners.push({ element, event, handler });
        },

        addTimer(timerId) {
            this.timers.push(timerId);
        },

        addObserver(observer) {
            this.observers.push(observer);
        },

        cleanup() {
            // 清理事件监听器
            this.listeners.forEach(({ element, event, handler }) => {
                try {
                    element.removeEventListener(event, handler);
                } catch (e) {
                    log('Failed to remove listener:', e);
                }
            });
            this.listeners = [];

            // 清理定时器
            this.timers.forEach(id => clearTimeout(id));
            this.timers = [];

            // 清理 MutationObserver
            this.observers.forEach(obs => {
                try {
                    obs.disconnect();
                } catch (e) {
                    log('Failed to disconnect observer:', e);
                }
            });
            this.observers = [];

            log('Cleanup completed');
        }
    };

    // ==================== 主题配色 ====================
    const colors = [
        {
            name: '极光紫',
            background: '#1a0033',
            text: '#e6d9ff',
            secondary: '#2d1a4d'
        },
        {
            name: '深海蓝',
            background: '#001a33',
            text: '#d9f0ff',
            secondary: '#1a334d'
        },
        {
            name: '暖夜棕',
            background: '#1a0f00',
            text: '#ffe6d9',
            secondary: '#331f0f'
        }
    ];

    // ==================== 样式生成 ====================
    function generateCustomThemeStyles() {
        const styles = [];

        // 基础样式
        styles.push(`
            .wr_whiteTheme .readerControls {
                z-index: 10;
            }
        `);

        // 为每个主题生成样式
        for (let i = 0; i < colors.length; i++) {
            const color = colors[i];
            styles.push(`
                body.wr-mode-${i} {
                    background-color: ${color.background} !important;
                }
                body.wr-mode-${i} .app_content {
                    background-color: ${color.background} !important;
                }
                body.wr-mode-${i} .readerContent {
                    background-color: ${color.background} !important;
                    color: ${color.text} !important;
                }
                body.wr-mode-${i} .readerContent_fontSize,
                body.wr-mode-${i} .readerContent .wr_readerImage_opacity {
                    color: ${color.text} !important;
                }
                body.wr-mode-${i} .app_content .readerChapterContent {
                    color: ${color.text} !important;
                }
                body.wr-mode-${i} .readerControls {
                    background-color: ${color.secondary} !important;
                }
            `);
        }

        return styles.join('\n');
    }

    // 应用自定义主题样式
    let styleElementForCustomTheme = null;

    function applyCustomThemeStyles() {
        log('应用自定义主题样式');

        if (!styleElementForCustomTheme) {
            styleElementForCustomTheme = document.createElement('style');
            styleElementForCustomTheme.textContent = generateCustomThemeStyles();
            document.head.appendChild(styleElementForCustomTheme);
            log('自定义主题样式已注入');
        }
    }

    // ==================== 主题切换 ====================
    let currentColorMode = 0;

    function changeCustomThemeMode() {
        const body = DOMCache.get('body', true);
        if (!body) return;

        // 移除当前模式的类
        if (body.classList.contains('wr-mode-' + currentColorMode)) {
            body.classList.remove('wr-mode-' + currentColorMode);
        }
        body.classList.remove('wr_darkTheme');

        // 切换到下一个模式
        currentColorMode = (currentColorMode + 1) % colors.length;

        // 使用 requestAnimationFrame 包装 DOM 操作
        requestAnimationFrame(() => {
            body.classList.add('wr-mode-' + currentColorMode);
            body.setAttribute('data-custom-color-mode', currentColorMode);
            log('主题已切换至模式:', currentColorMode, colors[currentColorMode].name);
        });

        // 保存设置（带错误提示）
        if (!Storage.set('customColorMode', currentColorMode)) {
            console.warn('无法保存主题设置：localStorage 不可用');
        }
    }

    function applyTheme() {
        const savedMode = Storage.get('customColorMode', '0');
        currentColorMode = parseInt(savedMode, 10);

        const body = DOMCache.get('body', true);
        if (body) {
            body.classList.add('wr-mode-' + currentColorMode);
            body.setAttribute('data-custom-color-mode', currentColorMode);
            log('已加载保存的主题模式:', currentColorMode);
        }
    }

    // ==================== 宽度调节 ====================
    function changeWidth(increase) {
        const readerContent = DOMCache.get('.readerContent');
        if (!readerContent) return;

        let currentWidth = parseInt(readerContent.style.width) || WIDTH_CONFIG.DEFAULT;
        let newWidth = increase ? currentWidth + WIDTH_CONFIG.STEP : currentWidth - WIDTH_CONFIG.STEP;

        // 限制宽度范围
        newWidth = Math.max(WIDTH_CONFIG.MIN, Math.min(WIDTH_CONFIG.MAX, newWidth));

        readerContent.style.width = newWidth + '%';

        // 保存设置（带错误提示）
        if (!Storage.set('readerWidth', newWidth)) {
            console.warn('无法保存宽度设置：localStorage 不可用');
        }

        log('宽度已调整至:', newWidth + '%');
    }

    function applyWidth() {
        const savedWidth = Storage.get('readerWidth');
        if (savedWidth) {
            const readerContent = DOMCache.get('.readerContent');
            if (readerContent) {
                readerContent.style.width = savedWidth + '%';
                log('已应用保存的宽度:', savedWidth + '%');
            }
        }
    }

    // ==================== 自动滚动 ====================
    let scroll_speed = 0;
    const MAX_AUTO_SCROLL_ITERATIONS = 10000;

    async function autoScroll(step, delay, maxIterations = MAX_AUTO_SCROLL_ITERATIONS) {
        let iterations = 0;

        try {
            while (scroll_speed > 0 && iterations < maxIterations) {
                iterations++;
                window.scrollBy(0, step);

                if (isPageBottom()) {
                    await nextPage();
                    await sleep(TIMING.PAGE_TURN_WAIT);
                }

                await sleep(delay);
            }

            if (iterations >= maxIterations) {
                log('autoScroll 达到最大迭代次数，自动停止');
                scroll_speed = 0;
            }
        } catch (error) {
            console.error('autoScroll 错误:', error);
            scroll_speed = 0;
        }
    }

    function isPageBottom() {
        return (window.innerHeight + Math.ceil(window.pageYOffset)) >= document.body.offsetHeight;
    }

    async function nextPage() {
        const nextButton = DOMCache.get('.readerFooter_button');
        if (nextButton) {
            nextButton.click();
            await sleep(TIMING.PAGE_TURN_WAIT);
        }
    }

    function toggleAutoScroll() {
        if (scroll_speed === 0) {
            scroll_speed = 1;
            const delay = TIMING.SCROLL_TICK;
            autoScroll(1, delay);
            log('自动滚动已启动');
        } else {
            scroll_speed = 0;
            log('自动滚动已停止');
        }
    }

    // ==================== 辅助工具函数 ====================
    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function $css(css_selector) {
        const element = document.querySelector(css_selector);
        if (element) {
            initElement(element);
        }
        return element;
    }

    // 使用 MutationObserver 优化元素等待
    async function waitElement(css_selector, max_wait_ms = TIMING.ELEMENT_WAIT_DEFAULT) {
        const elm = $css(css_selector);
        if (elm) return elm;

        return new Promise((resolve) => {
            let timeout;
            const observer = new MutationObserver(() => {
                const found = $css(css_selector);
                if (found) {
                    clearTimeout(timeout);
                    observer.disconnect();
                    log('waitElement 找到元素:', css_selector);
                    resolve(found);
                }
            });

            // 添加到清理管理器
            CleanupManager.addObserver(observer);

            timeout = setTimeout(() => {
                observer.disconnect();
                log('waitElement 超时:', css_selector);
                resolve(null);
            }, max_wait_ms);

            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
        });
    }

    // ==================== 元素增强工具 ====================
    const ElementUtils = {
        click(element) {
            element.click();
            return element;
        },
        insertHtml(element, html) {
            element.insertAdjacentHTML('beforeend', html);
            return element;
        },
        css(element, styles) {
            Object.assign(element.style, styles);
            return element;
        }
    };

    const enhancedElements = new WeakMap();

    function initElement(element) {
        if (!element || enhancedElements.has(element)) return;

        enhancedElements.set(element, true);

        for (let fn_name in ElementUtils) {
            element[fn_name] = (...args) => {
                return ElementUtils[fn_name](element, ...args);
            };
        }
    }

    // ==================== 主初始化函数 ====================
    async function init() {
        try {
            log('开始初始化微信读书增强脚本...');

            // 应用自定义主题
            applyCustomThemeStyles();
            applyTheme();
            applyWidth();

            // 等待控制栏加载
            const div_controls = await waitElement('.readerControls', TIMING.ELEMENT_WAIT_MAX);
            if (!div_controls) {
                console.warn('未找到 .readerControls 元素');
                return;
            }

            // 添加宽度控制按钮
            if (!DOMCache.get('#width-add', true)) {
                div_controls.insertHtml(`
                    <button id="width-add" class="readerControls_item" title="加宽 (+5%)">
                        <span class="readerControls_item_text">宽+</span>
                    </button>
                    <button id="width-sub" class="readerControls_item" title="减宽 (-5%)">
                        <span class="readerControls_item_text">宽-</span>
                    </button>
                `);
            }

            // 添加自动滚动按钮
            if (!DOMCache.get('#auto-scroll', true)) {
                div_controls.insertHtml(`
                    <button id="auto-scroll" class="readerControls_item" title="自动滚动">
                        <span class="readerControls_item_text">▶</span>
                    </button>
                `);
            }

            // 添加自定义主题按钮
            if (!DOMCache.get('#custom-theme', true)) {
                div_controls.insertHtml(`
                    <button id="custom-theme" class="readerControls_item" title="切换自定义主题">
                        <span class="readerControls_item_text">🎨</span>
                    </button>
                `);
            }

            // 绑定事件处理器（宽度按钮使用节流，主题按钮立即响应）
            const btn_width_add = DOMCache.get('#width-add');
            const btn_width_sub = DOMCache.get('#width-sub');
            const btn_auto_scroll = DOMCache.get('#auto-scroll');
            const btn_custom_theme = DOMCache.get('#custom-theme');

            if (btn_width_add) {
                const handler = throttle(() => changeWidth(true), 500);
                CleanupManager.addListener(btn_width_add, 'click', handler);
            }

            if (btn_width_sub) {
                const handler = throttle(() => changeWidth(false), 500);
                CleanupManager.addListener(btn_width_sub, 'click', handler);
            }

            if (btn_auto_scroll) {
                const handler = debounce(toggleAutoScroll, TIMING.DEBOUNCE_DEFAULT);
                CleanupManager.addListener(btn_auto_scroll, 'click', handler);
            }

            if (btn_custom_theme) {
                // 主题切换不使用防抖，立即响应
                const handler = () => {
                    changeCustomThemeMode();
                    // 添加视觉反馈
                    btn_custom_theme.style.transform = 'scale(1.2)';
                    const timerId = setTimeout(() => {
                        btn_custom_theme.style.transform = '';
                    }, TIMING.ANIMATION_SHORT);
                    CleanupManager.addTimer(timerId);
                };
                CleanupManager.addListener(btn_custom_theme, 'click', handler);
            }

            // 监听原生主题切换按钮（过滤掉自定义按钮）
            const customButtonIds = ['width-add', 'width-sub', 'auto-scroll', 'custom-theme'];
            const nativeThemeButtons = Array.from(document.querySelectorAll('.readerControls_item'))
                .filter(btn => !customButtonIds.includes(btn.id));

            nativeThemeButtons.forEach(button => {
                const handler = () => {
                    const body = DOMCache.get('body', true);
                    if (body && body.classList.contains('wr-mode-' + currentColorMode)) {
                        body.classList.remove('wr-mode-' + currentColorMode);
                        log('检测到原生主题切换，已移除自定义主题');
                    }
                };
                CleanupManager.addListener(button, 'click', handler);
            });

            log('微信读书增强脚本初始化完成');

        } catch (error) {
            console.error('微信读书增强脚本初始化失败:', error);
            alert('脚本加载失败: ' + error.message);
        }
    }

    // ==================== 启动 ====================
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // 页面卸载时清理资源
    window.addEventListener('beforeunload', () => {
        CleanupManager.cleanup();
        DOMCache.clear();
    });

})();