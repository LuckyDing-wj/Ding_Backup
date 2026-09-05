// ==UserScript==
// @name         网站油猴脚本发现器
// @namespace    https://github.com/LuckyDing-wj/Ding_Backup
// @version      0.0.1
// @description  智能匹配、高效管理，自动查找当前网站适用的 GreasyFork 油猴脚本，支持多维排序、响应式抽屉面板与自由拖拽定位。
// @author       LuckyDing
// @match        *://*/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      greasyfork.org
// @license      MIT
// @run-at       document-idle
// @noframes
// @homepageURL  https://github.com/LuckyDing-wj/Ding_Backup/blob/main/Youhou/FindGreasyFork.js
// @downloadURL  https://raw.githubusercontent.com/LuckyDing-wj/Ding_Backup/main/Youhou/FindGreasyFork.js
// @updateURL    https://raw.githubusercontent.com/LuckyDing-wj/Ding_Backup/main/Youhou/FindGreasyFork.js
// ==/UserScript==

/*
 * ============ 修改声明 ============
 * 原作者:   一只会飞的旺旺
 * 原出处:   https://greasyfork.org/zh-CN/scripts/539863
 * 原版本:   5.2
 *
 * 本副本为个人修改自用, 不对外传播, 禁止任何形式的收费使用。
 * 保留原作者与原出处信息。
 *
 * 修改记录:
 *   [LuckyDing] 0.0.1
 *     1. 脚本源与更新地址指向个人 GitHub 仓库 (https://github.com/LuckyDing-wj/Ding_Backup)。
 *     2. 深度重构与性能优化：
 *        - 拖拽改用 rAF + GPU 硬件加速 (translate3d)，消除页面重排卡顿，按需动态监听防内存泄漏。
 *        - 增加 5 分钟数据内存级缓存，避免反复打开/切换排序重复请求。
 *        - 增加 HTML 实体转义防范潜在 XSS 注入。
 *        - 全局样式注入隔离与重置规则，杜绝宿主网站 CSS 污染。
 *        - 适配脚本猫与 Chromium 内核特性 (@run-at document-idle, @noframes)。
 *     3. 精简代码：剔除冗余调试日志、优化模板渲染，体积大幅瘦身。
 * ============ 修改声明 ============
 */

(function() {
    'use strict';

    const SORT_OPTIONS = {
        'total_installs': '总安装量',
        'rating': '评分',
        'daily_installs': '日安装量',
        'updated': '更新日期',
        'created': '创建日期',
        'name': '名称',
    };
    const DEFAULT_SORT = 'total_installs';
    const RESULT_LIMIT = 20;
    const ANIMATION_DURATION = 300;
    const CACHE_EXPIRE = 5 * 60 * 1000;
    const DEFAULT_POSITION = { top: 20, right: 20, bottom: 'auto', left: 'auto' };

    const scriptCache = new Map();

    function escapeHtml(str) {
        return (str ?? '').replace(/[&<>"']/g, m => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[m]));
    }

    function getRootDomain(hostname) {
        const parts = hostname.split('.');
        const commonSLDs = /^(co|com|net|org|gov|edu)\.\w{2}$/;
        return parts.length > 2 && commonSLDs.test(parts.slice(-2).join('.'))
            ? parts.slice(-3).join('.')
            : parts.slice(-2).join('.');
    }

    const rootDomain = getRootDomain(window.location.hostname);

    const GM_xhr = options => new Promise((onload, onerror) =>
        GM_xmlhttpRequest({ ...options, onload, onerror, ontimeout: onerror })
    );

    async function searchGreasyForkByHTML(domain, sortBy = DEFAULT_SORT) {
        const now = Date.now();
        const cached = scriptCache.get(sortBy);
        if (cached && (now - cached.time < CACHE_EXPIRE)) {
            return cached.data;
        }

        const sortQuery = sortBy === 'daily_installs' ? '' : `?sort=${sortBy}`;
        const url = `https://greasyfork.org/zh-CN/scripts/by-site/${domain}${sortQuery}`;
        try {
            const res = await GM_xhr({ method: "GET", url });
            if (res.status !== 200) return [];
            const doc = new DOMParser().parseFromString(res.responseText, 'text/html');
            const data = [...doc.querySelectorAll('#browse-script-list > li')].map(item => ({
                title: item.dataset.scriptName || 'Untitled',
                url: `https://greasyfork.org${item.querySelector('a.script-link')?.getAttribute('href') ?? '#'}`,
                installs: parseInt(item.dataset.scriptTotalInstalls, 10) || 0,
                updatedDate: item.dataset.scriptUpdatedDate,
                description: item.querySelector('.script-description')?.textContent.trim() ?? '',
                author: item.querySelector('.script-list-author a')?.textContent.trim() ?? 'Unknown'
            }));
            scriptCache.set(sortBy, { time: now, data });
            return data;
        } catch (error) {
            console.error('[Userscript Finder] search failed:', error);
            return [];
        }
    }

    function applyPosition(element, pos) {
        ['top', 'right', 'bottom', 'left'].forEach(k => {
            element.style[k] = pos[k] !== 'auto' && pos[k] != null ? `${pos[k]}px` : 'auto';
        });
        element.style.transform = '';
    }

    function resetButtonPosition(btn) {
        applyPosition(btn, DEFAULT_POSITION);
        GM_setValue('button_position', DEFAULT_POSITION);
        btn.classList.add('position-saved');
        setTimeout(() => btn.classList.remove('position-saved'), 500);
    }

    function makeDraggable(element) {
        let isDragging = false, startX = 0, startY = 0, initLeft = 0, initTop = 0;
        let diffX = 0, diffY = 0, moved = false, rafId = null;

        const getCoord = e => e.touches ? e.touches[0] : e;

        function onStart(e) {
            if (e.button === 2) return;
            moved = false;
            isDragging = true;

            const pt = getCoord(e);
            startX = pt.clientX;
            startY = pt.clientY;
            const rect = element.getBoundingClientRect();
            initLeft = rect.left;
            initTop = rect.top;

            element.style.left = `${initLeft}px`;
            element.style.top = `${initTop}px`;
            element.style.right = 'auto';
            element.style.bottom = 'auto';
            element.classList.add('is-dragging');

            if (e.type === 'touchstart') {
                document.addEventListener('touchmove', onMove, { passive: false });
                document.addEventListener('touchend', onEnd);
            } else {
                document.addEventListener('mousemove', onMove);
                document.addEventListener('mouseup', onEnd);
                e.preventDefault();
            }
        }

        function onMove(e) {
            if (!isDragging) return;
            const pt = getCoord(e);
            diffX = pt.clientX - startX;
            diffY = pt.clientY - startY;

            if (Math.hypot(diffX, diffY) > 8) moved = true;

            if (!rafId) {
                rafId = requestAnimationFrame(() => {
                    element.style.transform = `translate3d(${diffX}px, ${diffY}px, 0)`;
                    rafId = null;
                });
            }
        }

        function onEnd() {
            if (!isDragging) return;
            isDragging = false;
            if (rafId) {
                cancelAnimationFrame(rafId);
                rafId = null;
            }

            document.removeEventListener('touchmove', onMove);
            document.removeEventListener('touchend', onEnd);
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onEnd);

            element.classList.remove('is-dragging');

            const rect = element.getBoundingClientRect();
            const vw = window.innerWidth, vh = window.innerHeight;
            const isRight = vw - (rect.left + rect.width) < rect.left;
            const isBottom = vh - (rect.top + rect.height) < rect.top;

            const pos = {
                left: isRight ? 'auto' : Math.max(10, rect.left),
                right: isRight ? Math.max(10, vw - rect.right) : 'auto',
                top: isBottom ? 'auto' : Math.max(10, rect.top),
                bottom: isBottom ? Math.max(10, vh - rect.bottom) : 'auto'
            };

            applyPosition(element, pos);
            GM_setValue('button_position', pos);
            element.classList.add('position-saved');
            setTimeout(() => element.classList.remove('position-saved'), 500);
        }

        element.addEventListener('touchstart', onStart, { passive: false });
        element.addEventListener('mousedown', onStart);

        return { wasDragged: () => moved };
    }

    async function updateAndRenderScripts() {
        const container = document.getElementById('userscript-finder-container');
        const content = container.querySelector('#userscript-finder-content');
        const titleElement = container.querySelector('#userscript-finder-title');

        content.innerHTML = `<div id="userscript-finder-loading">正在加载...</div>`;
        titleElement.textContent = '脚本查找器';

        try {
            const sortBy = GM_getValue('sort_preference', DEFAULT_SORT);
            const allScripts = await searchGreasyForkByHTML(rootDomain, sortBy);

            const oneYearAgo = new Date();
            oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

            const recentScripts = allScripts.filter(script => script.updatedDate && new Date(script.updatedDate) >= oneYearAgo);
            const finalScripts = recentScripts.slice(0, RESULT_LIMIT);
            titleElement.textContent = `脚本查找器 (${finalScripts.length} 个结果)`;

            if (finalScripts.length > 0) {
                content.innerHTML = finalScripts.map(script => `
                    <div class="script-item">
                        <h4 class="script-title"><a href="${escapeHtml(script.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(script.title)}</a></h4>
                        <div class="script-meta">
                            <span>更新于: ${escapeHtml(script.updatedDate)}</span>
                            <span class="script-installs">${script.installs.toLocaleString()} 安装</span>
                        </div>
                        ${script.description ? `<p class="script-description">${escapeHtml(script.description)}</p>` : ''}
                    </div>
                `).join('');
            } else {
                content.innerHTML = `<div class="no-scripts"><p>未找到适用于 ${escapeHtml(rootDomain)} 的脚本（或无近一年内更新）。</p></div>`;
            }
        } catch (error) {
            console.error('[Userscript Finder] Error during render:', error);
            content.innerHTML = `<div class="no-scripts"><p>搜索脚本时出现错误，请按 F12 查看控制台。</p></div>`;
        }
    }

    function createContextMenu(btn, openPanel) {
        document.querySelector('.toggle-context-menu')?.remove();

        const menu = document.createElement('div');
        menu.className = 'toggle-context-menu';
        menu.innerHTML = `
            <div class="menu-option" data-act="open">打开脚本查找器</div>
            <div class="menu-separator"></div>
            <div class="menu-option" data-act="min">最小化/恢复图标</div>
            <div class="menu-option" data-act="reset">重置位置</div>
            <div class="menu-option" data-act="hide">暂时隐藏 (30秒)</div>
        `;
        document.body.appendChild(menu);

        const rect = btn.getBoundingClientRect();
        const menuRect = menu.getBoundingClientRect();
        let left = (rect.right + 10 + menuRect.width > window.innerWidth) ? (rect.left - menuRect.width - 10) : (rect.right + 10);
        let top = (rect.top + menuRect.height > window.innerHeight) ? (window.innerHeight - menuRect.height - 10) : rect.top;

        menu.style.left = `${Math.max(10, left)}px`;
        menu.style.top = `${Math.max(10, top)}px`;

        const onAction = e => {
            const act = e.target.dataset.act;
            if (!act) return;
            if (act === 'open') openPanel();
            else if (act === 'min') btn.classList.toggle('minimized');
            else if (act === 'reset') resetButtonPosition(btn);
            else if (act === 'hide') {
                btn.classList.add('hidden');
                setTimeout(() => btn.classList.remove('hidden'), 30000);
            }
            close();
        };

        const close = () => {
            menu.remove();
            document.removeEventListener('click', onDocClick);
            document.removeEventListener('contextmenu', onDocClick);
        };

        const onDocClick = e => {
            if (!menu.contains(e.target) && e.target !== btn) close();
        };

        menu.addEventListener('click', onAction);
        setTimeout(() => {
            document.addEventListener('click', onDocClick);
            document.addEventListener('contextmenu', onDocClick);
        }, 0);
    }

    function createUI() {
        GM_addStyle(`
            :root {
                --panel-hidden-transform: translateX(calc(100% + 20px));
            }
            #userscript-finder-container, #userscript-finder-toggle, .toggle-context-menu {
                box-sizing: border-box !important;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;
                line-height: 1.5 !important;
                -webkit-font-smoothing: antialiased;
            }
            #userscript-finder-container *, #userscript-finder-toggle *, .toggle-context-menu * {
                box-sizing: border-box !important;
            }

            #userscript-finder-container {
                position: fixed; top: 20px; right: 20px; width: 400px; max-width: 95vw; max-height: 80vh;
                background: linear-gradient(135deg, #2c3e50 0%, #34495e 100%);
                border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); z-index: 999999;
                color: #ecf0f1; overflow: hidden; display: flex; flex-direction: column;
                transform: var(--panel-hidden-transform);
                transition: transform ${ANIMATION_DURATION}ms ease-in-out;
            }
            #userscript-finder-container.show { transform: translate(0, 0); }

            #userscript-finder-header { padding: 16px 20px 0; background: rgba(0,0,0,0.15); flex-shrink: 0; }
            #header-top-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
            #userscript-finder-title { font-size: 17px; font-weight: 700; margin: 0; }
            #userscript-finder-close {
                background: none; border: none; color: #ecf0f1; font-size: 24px; cursor: pointer;
                width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;
                border-radius: 50%; transition: background-color 0.2s, transform 0.2s;
            }
            #userscript-finder-close:hover { background-color: rgba(255,255,255,0.1); transform: rotate(90deg); }

            #userscript-finder-controls {
                display: flex; align-items: center; gap: 10px; padding: 5px 0 12px;
                border-bottom: 1px solid rgba(255,255,255,0.2);
            }
            #userscript-finder-controls label { font-size: 12px; }
            #sort-select {
                background: rgba(0,0,0,0.3); color: #ecf0f1; border: 1px solid rgba(255,255,255,0.4);
                border-radius: 4px; padding: 4px 8px; font-size: 12px; cursor: pointer; outline: none;
            }
            #sort-select option { background-color: #34495e; color: #ecf0f1; }
            #reset-position-btn {
                background: rgba(255,255,255,0.1); color: #ecf0f1; border: 1px solid rgba(255,255,255,0.3);
                border-radius: 4px; padding: 4px 8px; font-size: 11px; cursor: pointer; margin-left: auto;
                transition: background 0.2s, transform 0.1s;
            }
            #reset-position-btn:hover { background: rgba(255,255,255,0.2); }
            #reset-position-btn:active { transform: scale(0.96); }

            #userscript-finder-content {
                overflow-y: auto; flex-grow: 1; scrollbar-width: thin;
                scrollbar-color: rgba(255,255,255,0.3) transparent;
            }
            #userscript-finder-content::-webkit-scrollbar { width: 6px; }
            #userscript-finder-content::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.3); border-radius: 3px; }

            .script-item { padding: 14px 20px; border-bottom: 1px solid rgba(255,255,255,0.1); transition: background-color 0.2s; }
            .script-item:hover { background-color: rgba(255,255,255,0.08); }
            .script-item:last-child { border-bottom: none; }
            .script-title { font-size: 15px; font-weight: 600; margin: 0 0 6px 0; line-height: 1.3; }
            .script-title a { color: #add8e6; text-decoration: none; }
            .script-title a:hover { text-decoration: underline; color: #87ceeb; }
            .script-meta { display: flex; justify-content: space-between; align-items: center; font-size: 11px; opacity: 0.7; margin-bottom: 6px; }
            .script-installs { font-weight: 600; }
            .script-description { font-size: 12px; opacity: 0.6; line-height: 1.5; margin: 0; max-height: 40px; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
            .no-scripts, #userscript-finder-loading { padding: 40px 20px; text-align: center; opacity: 0.8; }

            #userscript-finder-toggle {
                position: fixed; width: 50px; height: 50px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                border: none; border-radius: 50%; color: white; font-size: 20px; cursor: move;
                box-shadow: 0 4px 15px rgba(0,0,0,0.4); z-index: 999998;
                transition: opacity 0.2s, transform 0.2s, box-shadow 0.2s;
                display: flex; align-items: center; justify-content: center;
                user-select: none; will-change: transform;
            }
            #userscript-finder-toggle:hover { opacity: 0.9; transform: scale(1.05); }
            #userscript-finder-toggle.hidden { display: none; }
            #userscript-finder-toggle.minimized { opacity: 0.6; transform: scale(0.7); }
            #userscript-finder-toggle.position-saved { box-shadow: 0 0 0 4px rgba(255,255,255,0.6); }
            #userscript-finder-toggle.is-dragging { cursor: grabbing; opacity: 0.7; transition: none; }

            .toggle-context-menu {
                position: fixed; background: rgba(44, 62, 80, 0.98);
                border: 1px solid rgba(255,255,255,0.2); border-radius: 6px;
                box-shadow: 0 6px 15px rgba(0,0,0,0.4); padding: 6px 0;
                z-index: 999999; font-size: 13px;
            }
            .menu-option { padding: 8px 15px; cursor: pointer; color: #ecf0f1; transition: background-color 0.2s; }
            .menu-option:hover { background: rgba(255,255,255,0.12); }
            .menu-separator { height: 1px; background: rgba(255,255,255,0.15); margin: 6px 0; }

            @media (max-width: 768px) {
                :root { --panel-hidden-transform: translateY(100%); }
                #userscript-finder-container {
                    top: auto; bottom: 0; right: 0; left: 0; width: 100%; max-width: 100%;
                    max-height: 70vh; border-radius: 16px 16px 0 0;
                }
                #userscript-finder-header { padding: 12px 16px 0; }
                #userscript-finder-controls { padding: 5px 0 12px; }
                .script-item { padding: 12px 16px; }
            }
        `);

        const sortOptionsHtml = Object.entries(SORT_OPTIONS)
            .map(([val, text]) => `<option value="${val}">${text}</option>`)
            .join('');

        const container = document.createElement("div");
        container.id = "userscript-finder-container";
        container.innerHTML = `
            <div id="userscript-finder-header">
                <div id="header-top-row">
                    <h3 id="userscript-finder-title">脚本查找器</h3>
                    <button id="userscript-finder-close" title="关闭">×</button>
                </div>
                <div id="userscript-finder-controls">
                    <label for="sort-select">排序方式:</label>
                    <select id="sort-select">${sortOptionsHtml}</select>
                    <button id="reset-position-btn">重置按钮位置</button>
                </div>
            </div>
            <div id="userscript-finder-content"></div>
        `;
        document.body.appendChild(container);

        const select = container.querySelector('#sort-select');
        select.value = GM_getValue('sort_preference', DEFAULT_SORT);
        select.addEventListener('change', e => {
            GM_setValue('sort_preference', e.target.value);
            updateAndRenderScripts();
        });

        const toggleButton = document.createElement("button");
        toggleButton.id = "userscript-finder-toggle";
        toggleButton.innerHTML = "🔍";
        toggleButton.title = "查找可用脚本 (左键打开, 右键菜单, 双击最小化, 按住拖动)";
        const savedPos = GM_getValue('button_position', DEFAULT_POSITION);
        applyPosition(toggleButton, savedPos);
        document.body.appendChild(toggleButton);

        container.querySelector('#reset-position-btn').addEventListener('click', () => resetButtonPosition(toggleButton));

        const draggable = makeDraggable(toggleButton);

        const openFinderPanel = () => {
            container.classList.add('show');
            toggleButton.classList.add('hidden');
            if (!container.dataset.loaded) {
                updateAndRenderScripts();
                container.dataset.loaded = "true";
            }
        };

        const closeFinderPanel = () => {
            container.classList.remove('show');
            setTimeout(() => toggleButton.classList.remove('hidden'), ANIMATION_DURATION);
        };

        toggleButton.addEventListener('click', () => {
            if (draggable.wasDragged()) return;
            openFinderPanel();
        });

        toggleButton.addEventListener('dblclick', e => {
            e.preventDefault();
            e.stopPropagation();
            toggleButton.classList.toggle('minimized');
        });

        toggleButton.addEventListener('contextmenu', e => {
            e.preventDefault();
            createContextMenu(toggleButton, openFinderPanel);
        });

        container.querySelector('#userscript-finder-close').addEventListener('click', closeFinderPanel);
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape' && container.classList.contains('show')) {
                closeFinderPanel();
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', createUI);
    } else {
        createUI();
    }
})();
