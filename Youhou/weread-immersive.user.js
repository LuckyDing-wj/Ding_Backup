// ==UserScript==
// @name              Immersive Reading (for WeRead)
// @name:zh-CN        微信阅读美化
// @namespace         chrishd
// @version           0.1.9
// @description       Immersive reading for WeRead: auto-hide top bar & controls (hover reveal), adjustable content width (wheel + memory), smooth multi-speed auto-scroll, auto page turn, light/dark custom reading themes (exclusive with native themes). weread.qq.com only.
// @description:zh-CN 微信读书沉浸阅读：顶栏/控件自动隐藏（悬停唤出），宽度滚轮调节（带记忆），多档平滑自动滚动，自动翻页，浅色/深色自定义主题（与原生主题互斥），仅适配weread.qq.com站点
// @author            chrishd
// @contributor       GinWU (original author);!Sylas;SimonDW;Li_MIxdown;hubzy;xvusrmqj;LossJ;JackieZheng;das2m;harmonyLife;yehuda
// @license           MIT
// @homepageURL       https://github.com/LuckyDing-wj/Ding_Backup/tree/main/Youhou
// @supportURL        https://github.com/LuckyDing-wj/Ding_Backup/issues
// @icon              https://weread.qq.com/favicon.ico
// @match             https://weread.qq.com/web/reader/*
// @run-at            document-start
// @grant             GM_addStyle
// ==/UserScript==

/**
 * fork from https://greasyfork.org/zh-CN/scripts/490065-%E5%BE%AE%E4%BF%A1%E8%AF%BB%E4%B9%A6weread%E9%98%85%E8%AF%BB%E7%BB%BC%E5%90%88%E5%8A%9F%E8%83%BD%E7%89%88
 * and so as https://greasyfork.org/zh-CN/scripts/458095-%E5%BE%AE%E4%BF%A1%E8%AF%BB%E4%B9%A6%E5%8A%A0%E5%AE%BD%E5%8F%AF%E8%A7%86%E8%8C%83%E5%9B%B4%E5%92%8C%E5%87%A0%E4%B8%AA%E7%99%BD%E8%89%B2%E4%B8%BB%E9%A2%98%E7%9A%84%E6%8A%A4%E7%9C%BC%E6%A8%A1%E5%BC%8F
 * original author: GinWU @ https://github.com/GinWU05/tampermonkey-user.js/tree/main/weread-immersive (v0.5.1, MIT)
 * forked & modified by chrishd since 2026-09-19
 */

GM_addStyle(`
/* 衬线字体只作用于 UI 外壳（顶栏/控件/目录/笔记面板）；
   正文 .readerChapterContent 不接管——字体由微信读书自身设置控制，避免回退成宋体导致正文难读 */
.readerTopBar, .readerTopBar *,
.readerControls, .readerControls *,
.readerCatalog, .readerCatalog *,
.readerNotePanel, .readerNotePanel * {
  font-family: 'SourceHanSerifCN-Bold', 'Source Han Serif SC', 'Noto Serif SC', 'Songti SC', serif !important;
}

/* 控件栏：左下角悬浮（右侧留给浏览器扩展），高度自适应（按钮数可变）
   定位规则全部 !important——@run-at document-start 时本样式先于站点 CSS 注入，
   同优先级会被站点后加载的规则覆盖，必须强制生效 */
.readerControls {
  margin-left: 0 !important; right: initial !important; left: 10px !important; bottom: 20px !important;
  top: initial !important; transform: none !important;
  display: flex !important; flex-direction: column !important; width: initial !important;
  gap: 0 !important; max-height: calc(100vh - 40px) !important; overflow-y: auto !important;
}

.readerTopBar, .readerControls {
  opacity: 0 !important; transition: opacity 1s !important;
}
/* 顶栏隐形时仍拦截其区域点击（灵敏度优先：hover 即唤出，正文其余区域不挡） */
.readerTopBar {
  pointer-events: auto !important;
}

/* 控件栏隐形时不可点；左缘全高宽触发区唤出（外扩到屏幕最左缘，避免 0-10px 死区） */
.readerControls {
  pointer-events: none !important;
}

.readerControls::before {
  content: ''; position: absolute !important; pointer-events: auto !important;
  left: -10px !important; top: 0 !important; bottom: 0 !important; width: 34px !important;
}

.readerControls .wr-sep { position: relative; }
.readerControls .wr-sep::before {
  content: ''; position: absolute; top: -13px; left: 15%; right: 15%; height: 1px;
  background: rgba(0,0,0,.18);
}

.readerControls_item, .readerControls_fontSize, #custom-theme-toggle-btn {
  margin: 2px 0 !important; margin-left: 10px !important; color:#6a6c6c !important; cursor:pointer !important;
  border: none !important; padding: 4px 8px !important; border-radius: 8px !important;
  box-shadow: 0 2px 6px rgba(0,0,0,.1) !important; font-size: 12px !important; white-space: nowrap !important;
  width: auto !important; height: auto !important; min-width: 0 !important; min-height: 0 !important; max-width: none !important;
  background-color: rgba(255,255,255,.9) !important;
}

.readerChapterContent { margin-left: 30px !important; margin-right: 30px !important; }

/* 唤出：快进慢出；可见期间整条可点 */
.readerControls:hover, .readerTopBar:hover {
  opacity: 1 !important; transition: opacity 0.15s !important; pointer-events: auto !important;
}

/* F9 常显模式：控件/顶栏固定可见（触屏或不想频繁悬停时用） */
html body.wr-immersive-pinned .readerTopBar,
html body.wr-immersive-pinned .readerControls {
  opacity: 1 !important; pointer-events: auto !important;
}

/* 隐藏整页滚动条（目录/笔记面板内部滚动条保留） */
html::-webkit-scrollbar, body::-webkit-scrollbar { width: 0; height: 0; }
html, body { scrollbar-width: none; }
/* toast 提示（主题切换/F9 常显）：页顶居中、自动隐；!important 同样为对抗站点后加载 CSS */
#wr-immersive-toast {
  position: fixed !important; top: 60px !important; left: 50% !important; transform: translateX(-50%) !important; z-index: 99999 !important;
  background: rgba(30,30,32,.9) !important; color: #fff !important; padding: 8px 18px !important; border-radius: 6px !important;
  font: 13px system-ui, sans-serif !important; opacity: 0 !important; transition: opacity .3s !important; pointer-events: none !important;
}

.readerCatalog {
  right: 125px !important; left: initial !important;
}
.readerAIChatPanel {
  right: 125px !important; left: initial !important;
}
`);

// 四套长读配色，参照主流网文站阅读页：
// 浅色组（原生浅色主题下循环）：浅1 起点羊皮纸米黄  浅2 纵横豆沙绿(经典护眼 #C7EDCC)
// 深色组（原生深色主题下循环）：深1 暗夜灰(微信读书夜间系)  深2 暖褐夜纸(低蓝光夜读)
// 全部实色（半透明底会叠页面原背景导致色值不稳定）；正文对比 6-9:1，弱于纯黑纸白以降低眩光
// 正文字体不归本脚本管（见 GM_addStyle 内字体规则的作用域），由微信读书自身设置控制
const colors = [
    { label: '浅1', name: '起点羊皮纸', bg: '#F5ECD8', rbg: '#EFE4C9', bgb: '#F1E7CD', bgbBar: '#E8DDBC', text: '#3B3B3B', title: '#1F1D18', white: true },
    { label: '浅2', name: '纵横豆沙绿', bg: '#C7EDCC', rbg: '#B8DFBF', bgb: '#D4EDD6', bgbBar: '#C2E4C7', text: '#2E2E2E', title: '#1A1A1A', white: true },
    { label: '深1', name: '暗夜灰', bg: '#191919', rbg: '#141414', bgb: '#222222', bgbBar: '#1F1F1F', text: '#999999', title: '#B8B8B8', white: false, dark: true },
    { label: '深2', name: '暖褐夜纸', bg: '#2B241D', rbg: '#241E18', bgb: '#332B23', bgbBar: '#2E2620', text: '#B5A98F', title: '#C9BFA9', white: false, dark: true }
];
const LIGHT_MODES = [0, 1];
const DARK_MODES = [2, 3];
const NATIVE_WHITE_THEME_CLASS = 'wr_whiteTheme';

// 带前缀的存储 key，避免与原版/其他脚本冲突；LEGACY 为历史 key，读取时自动迁移
const LS_WIDTH_KEY = 'wr-immersive-width';
const LS_WIDTH_LEGACY = 'setWidth';
const LS_THEME_KEY = 'wr-immersive-theme';
const LS_THEME_LEGACY = 'wr-custom-mode';

function lsGet(key, legacyKey) {
    let v = localStorage.getItem(key);
    if (v === null && legacyKey) {
        v = localStorage.getItem(legacyKey);
        if (v !== null) {
            localStorage.setItem(key, v);
            localStorage.removeItem(legacyKey);
        }
    }
    return v;
}

const ElementUtils = {
	cssGet: (tar_elm, property) => {
		/**
     * 获取 css 属性
     *
     * tar_elm: elementNode
     * property: string
     */
		return window.getComputedStyle(tar_elm).getPropertyValue(property);
	},
	cssSet: (tar_elm, property, value, priority) => {
		/**
     * 设置 css 属性
     *
     * tar_elm: node
     * property: string
     * value: string | number | null
     * priority: string | null
     */
		return tar_elm.style.setProperty(property, value, priority);
	},
	htmlGet: (tar_elm, is_out) => {
		/**
     * 获取 HTML 代码
     *
     * tar_elm: node
     * is_in: bool
     */
		if (is_out) {
			return tar_elm.outerHTML;
		}
		return tar_elm.innerHTML;
	},
	insertHtml: (tar_elm, ins_html, position) => {
		/**
     * 在目标元素指定位置插入 HTML 代码
     *
     * tar_elm: node
     * ins_html: string
     * position: string -> 可选项：beforeBegin、afterBegin、beforeEnd、afterEnd
     */
		position = typeof position === "undefined" ? "beforeEnd" : position;

		tar_elm.insertAdjacentHTML(position, ins_html);
	},
	insertElement: (tar_elm, ins_elm, position) => {
		/**
     * 在目标元素指定位置插入元素
     *
     * tar_elm: node
     * ins_elm: node
     * position: string -> 可选项：beforeBegin、afterBegin、beforeEnd、afterEnd
     */
		position = typeof position === "undefined" ? "beforeEnd" : position;
		tar_elm.insertAdjacentElement(position, ins_elm);
	},
};

let div_controls = $css(".readerControls");
let btn_scroll_on = $css("#scroll-on");
let scroll_speed = 0;

let styleElementForCustomTheme = null;

function getStyleStr_customTheme() {
    const style = `
    /* 主题切换平滑过渡；顶栏需与主样式的 opacity 过渡合并声明（transition 是单属性，直接写会覆盖掉） */
    body, .readerControls_item, .readerControls_fontSize, #custom-theme-toggle-btn,
    .readerFooter_button, .readerChapterContent {
        transition: background-color 0.3s ease-in-out, color 0.3s ease-in-out !important;
    }
    body .readerTopBar {
        transition: opacity 1s, background-color 0.3s ease-in-out, color 0.3s ease-in-out !important;
    }
    `;

    for (let i = 0; i < colors.length; i++) {
        const color = colors[i];
        style += `
          html body.wr-mode-${i} {
              background-color:${color.bg} !important;
          }
          html body.wr-mode-${i} .readerTopBar {
              background-color:${color.rbg} !important;
          }
          html body.wr-mode-${i} .readerControls_item,
          html body.wr-mode-${i} .readerControls_fontSize,
          html body.wr-mode-${i} .app_content,
          html body.wr-mode-${i} #custom-theme-toggle-btn /* 确保自定义按钮也应用背景 */
          {
              background-color:${color.bgb} !important;
          }
          html body.wr-mode-${i} .readerCatalog {
            background-color:${color.bgbBar} !important;
          }
          html body.wr-mode-${i} .chapterItem_link {
              border: dashed ${color.dark ? '#555555' : '#2a2a2a'} !important;
              border-width: 0 0 2px !important;
          }
          html body.wr-mode-${i} .chapterItem_text {
              font-size: 18px !important;
          }
          html body.wr-mode-${i} .readerNotePanel {
            background-color:${color.bgbBar} !important;
          }
          html body.wr-mode-${i} .sectionListItem_divider {
              border: dashed ${color.dark ? '#555555' : '#2a2a2a'} !important;
              border-width: 0 0 2px !important;
          }
          html body.wr-mode-${i} .readerNotePanelBottomBar {
              border: solid ${color.bgbBar} !important;
              border-width: 0 0 2px !important;
              background-color:${color.rbg} !important;
          }

          /* 阅读区域内容样式 */
          html body.wr-mode-${i} .readerChapterContent {
              color: ${color.text} !important;
          }

          /* 章节标题样式 */
          html body.wr-mode-${i} .readerChapterContent .chapterTitle {
              color: ${color.title} !important;
          }
        `;
        if (color.white) {
            style += `
              html body.wr-mode-${i} .readerFooter_button,
              html body.wr-mode-${i} .readerFooter_button:hover,
              html body.wr-mode-${i} #custom-theme-toggle-btn /* 自定义按钮文字颜色 */
              {
                  color:#2a2a2a !important;
              }
              html body.wr-mode-${i} .readerFooter_button {
                  background-color:${color.bg} !important;
              }
            `;
        } else {
             style += `
              html body.wr-mode-${i} #custom-theme-toggle-btn /* 自定义按钮文字颜色 */
              {
                  color:#b9b9ba !important;
              }
            `;
        }
    }
    return style;
}

function applyCustomThemeStyles() {
    const styleContent = getStyleStr_customTheme();
    if (!styleElementForCustomTheme) {
        styleElementForCustomTheme = document.createElement('style');
        styleElementForCustomTheme.id = 'weread-immersive-custom-theme';
        styleElementForCustomTheme.setAttribute('data-priority', 'highest');
        document.head.appendChild(styleElementForCustomTheme);
    }
    styleElementForCustomTheme.textContent = styleContent;
}

function removeCustomStyles() {
    const body = $css("body");
    if (!body) return;
    colors.forEach((color, index) => {
        body.classList.remove('wr-mode-' + index);
    });
    localStorage.removeItem(LS_THEME_KEY);
    localStorage.removeItem(LS_THEME_LEGACY);
    body.removeAttribute('data-custom-color-mode');

    // 可选：如果想在移除时也移除style标签内容，但通常保留规则让切换回来更快
    if (styleElementForCustomTheme) {
      styleElementForCustomTheme.textContent = '';
    }
    const themeBtn = document.getElementById('custom-theme-toggle-btn');
    if (themeBtn) themeBtn.innerHTML = '主题';
}

function changeCustomThemeMode(modeIndexStr) {
    const body = $css("body");
    if(!body) return;
    const modeIndex = parseInt(modeIndexStr);

    colors.forEach((_, index) => body.classList.remove('wr-mode-' + index));

    if (!isNaN(modeIndex) && colors[modeIndex]) {
        body.classList.add('wr-mode-' + modeIndex);
        if (!colors[modeIndex].dark) {
            // 浅色自定义主题需要原生深色类退场（canvas 才会按浅色渲染）
            body.classList.remove('wr_darkTheme');
        }
        body.setAttribute('data-custom-color-mode', modeIndex.toString());
        localStorage.setItem(LS_THEME_KEY, modeIndex.toString());
        const themeBtn = document.getElementById('custom-theme-toggle-btn');
        if (themeBtn) themeBtn.innerHTML = colors[modeIndex].label;

        console.log(`已应用自定义主题 ${modeIndex}，当前body类: ${body.classList.toString()}`);
    } else {
        console.warn(`微信读书脚本：无效的自定义模式索引: ${modeIndexStr}`);
        removeCustomStyles();
    }
}

function loadCustomThemeFeature() {
    if (!div_controls) {
        console.warn("微信读书脚本：.readerControls 未找到，无法添加自定义主题按钮。");
        return;
    }

    applyCustomThemeStyles();

    const customThemeButton = createElement('button', {
        title: '切换自定义主题',
        id: 'custom-theme-toggle-btn',
        class: 'readerControls_item wr-sep'
    });
    customThemeButton.textContent = '主题';

    customThemeButton.onclick = async () => {
        const body = $css("body");
        if (!body) {
            console.warn("微信读书脚本：未找到 body 元素。");
            return;
        }

        customThemeButton.style.transform = "scale(1.1)";
        customThemeButton.style.transition = "transform 0.2s";
        setTimeout(() => {
            customThemeButton.style.transform = "";
        }, 200);

        // 四档无脑循环 0→1→2→3→0（对齐 mock 手感，不按原生主题分组）
        const cur = body.getAttribute('data-custom-color-mode');
        const nextCustomModeIndex = cur === null ? 0 : (parseInt(cur) + 1) % colors.length;

        changeCustomThemeMode(nextCustomModeIndex.toString());
        toast(`自定义主题 ${colors[nextCustomModeIndex].label}（${colors[nextCustomModeIndex].name}）`);
    };

    div_controls.appendChild(customThemeButton);

    // 事件委托：原生深/浅色按钮可能被站点重渲染，固定绑定会失效；
    // 文档级捕获监听对任何时刻渲染的按钮都生效（capture 防止站点 stopPropagation）
    document.addEventListener('click', (e) => {
        const target = e.target && e.target.closest('[title="深色"], [title="浅色"]');
        if (target) {
            console.log("原生主题按钮点击，移除自定义主题样式。");
            removeCustomStyles();
        }
    }, true);

    // 从 localStorage 初始化主题（兼容旧 key）；四档循环下不再按原生主题分组
    const localMode = lsGet(LS_THEME_KEY, LS_THEME_LEGACY);
    const bodyForRestore = $css("body");
    if (
        localMode !== null &&
        colors[parseInt(localMode)] &&
        bodyForRestore
    ) {
        changeCustomThemeMode(localMode);
    }
}

async function init() {
	"use strict";

	// 最多等待 30 秒页面加载完成
	let book = await waitElement(".wr_canvasContainer canvas", 30000);
	if (!book) {
		alert("书本内容加载失败，请手动刷新页面！");
		return;
	}

	// 控件栏可能晚于 canvas 渲染；不等就 insertHtml 会在 undefined 上崩，init 静默失败
	div_controls = await waitElement(".readerControls", 10000);
	if (!div_controls) {
		console.warn("微信读书脚本：.readerControls 未出现，跳过按钮注入。");
		return;
	}
	// 添加功能按键;
	div_controls.insertHtml(`
<button title="自动滚动：点击启动/加速自动阅读" id='scroll-on' class='readerControls_item wr-sep'>自动X0</button>
<button title="状态显示；点击停止自动阅读" id='turn-page-tips' class='readerControls_item'>等待翻页</button>
<button title="鼠标悬停滚轮调节宽度；点击恢复默认 750px" id='width-btn' class='readerControls_item wr-sep'>宽度</button>
<button title="专注模式（浏览器全屏，Esc 退出）" id='focus-mode' class='readerControls_item wr-sep'>专注</button>
`);
	btn_scroll_on = $css("#scroll-on");

	// 额外功能按钮功能实现
	btn_scroll_on.onclick = () => {
		scroll_speed++;
		if (scroll_speed == 1) {
			autoScroll();
		}
		setBtnText("scroll-on", "自动X" + scroll_speed);
	};

	// "等待翻页"按钮兼作自动阅读开关：点击 = 自动X1 起步 / 停止
	$css("#turn-page-tips").onclick = () => {
		if (scroll_speed > 0) {
			scroll_speed = 0;
			setBtnText("scroll-on", "自动X0");
			setBtnText("turn-page-tips", "等待翻页");
		} else {
			scroll_speed = 1;
			setBtnText("scroll-on", "自动X1");
			autoScroll();
		}
	};

	// 宽度按钮：悬停滚轮调节（每个滚轮事件 ±1px），点击恢复默认 750px
	let btn_width = $css("#width-btn");
	btn_width.addEventListener('wheel', (e) => {
		e.preventDefault();
		changeWidthBy(e.deltaY < 0 ? 1 : -1);
	}, { passive: false });
	btn_width.onclick = () => setWidth(750);

	// 专注模式：浏览器级全屏，Esc 或再点退出
	let btn_focus = $css("#focus-mode");
	btn_focus.onclick = () => {
		if (document.fullscreenElement) {
			document.exitFullscreen();
		} else {
			document.documentElement.requestFullscreen();
		}
	};

	// F9 切换控件/顶栏常显
	document.addEventListener('keydown', (e) => {
		if (e.key === 'F9') {
			document.body.classList.toggle('wr-immersive-pinned');
			toast('常显模式：' + (document.body.classList.contains('wr-immersive-pinned') ? '开' : '关'));
		}
	});

    // 应用localStorage中的宽度设置（兼容旧 key）
    setWidth(lsGet(LS_WIDTH_KEY, LS_WIDTH_LEGACY));

    // 加载自定义主题相关功能
    loadCustomThemeFeature();
}; // init 函数结束括号
init();

function changeWidthBy(delta) {
	const appContentDiv = $css(".app_content");
	let width = 0;
	if (appContentDiv) {
		let currentMaxWidth = appContentDiv.cssGet("max-width");
		if (currentMaxWidth && currentMaxWidth !== "none" && currentMaxWidth.endsWith("px")) {
			width = Number(currentMaxWidth.replace("px", ""));
		} else {
			width = appContentDiv.clientWidth;
		}
	}
	if (!width || width <= 0) width = 1000;
	setWidth(width + delta);
}

function setWidth(width) {
	if (!width) {
		return;
	}
  const numericWidth = Math.min(2000, Math.max(320, parseFloat(width)));
  if (isNaN(numericWidth) || numericWidth <= 0) {
      console.warn("setWidth: 无效的宽度值", width);
      return;
  }

  let div_content_el = $css(".app_content");
  let div_top_bar_el = $css(".readerTopBar");

  if (div_content_el) {
    div_content_el.cssSet("max-width", numericWidth + "px");
  }
  if (div_top_bar_el) {
	  div_top_bar_el.cssSet("max-width", numericWidth + "px");
  }
	window.localStorage.setItem(LS_WIDTH_KEY, numericWidth.toString());
	window.localStorage.removeItem(LS_WIDTH_LEGACY);
	setBtnText("width-btn", "宽度" + numericWidth);
	let resize_event = new Event("resize");
	window.dispatchEvent(resize_event);
}

// 平滑自动滚动：requestAnimationFrame 累积亚像素位移，速度档 X -> X² px/s（与原版节奏一致）；
// 后台标签页 rAF 自动暂停，比 setTimeout 轮询更省电
let scrollAcc = 0;
let lastFrameTime = 0;

function autoScroll() {
	scrollAcc = 0;
	lastFrameTime = 0;
	requestAnimationFrame(scrollStep);
}

async function scrollStep(ts) {
	if (scroll_speed <= 0) {
		return;
	}
	if (!lastFrameTime) {
		lastFrameTime = ts;
	}
	const dt = Math.min(ts - lastFrameTime, 100); // 长时间丢帧（如切回标签页）时限速，避免瞬移
	lastFrameTime = ts;
	scrollAcc += ((scroll_speed * scroll_speed) / 1000) * dt;
	const px = Math.floor(scrollAcc);
	if (px > 0) {
		scrollAcc -= px;
		window.scrollBy(0, px);
	}
	if (isPageBottom()) {
		// 书尾判定放到底部时才做：readerFooter_ending 仅全书最后一页出现，不必每帧查
		if (isShowInView($css(".readerFooter_ending"))) {
			scroll_speed = 0;
			setBtnText("scroll-on", "自动X0");
			setBtnText("turn-page-tips", "等待翻页");
		} else {
			toast('已到页底，6s 后翻页');
			await nextPage(); // 倒计时并翻页；用户停止时内部直接退出
		}
	}
	if (scroll_speed > 0) {
		requestAnimationFrame(scrollStep);
	}
}

async function nextPage(sleep_time) {
	sleep_time = typeof sleep_time === "undefined" ? 6000 : sleep_time;
	while (scroll_speed > 0) {
		// 每轮重新查询，避免翻页后 DOM 重建导致引用失效
		let btn_turn = document.querySelector(".readerFooter_button");
		if (!isShowInView(btn_turn)) {
			return; // 翻页后按钮不在视野，交给 autoScroll 继续滚动
		}
		console.log(`wait ${sleep_time / 1000} seconds. turn page.`);
		let last_time = sleep_time / 1000;
		let stopped = false;
		while (last_time > 0) {
			if (scroll_speed <= 0) { // 倒计时中用户点停止，立即退出
				stopped = true;
				break;
			}
			setBtnText("turn-page-tips", `${last_time}s翻页`);
			last_time--;
			await sleep(1000);
		}
		if (stopped) {
			setBtnText("turn-page-tips", `等待翻页`);
			return;
		}
		pressKey("right");
		await sleep(3000);
		setBtnText("turn-page-tips", `等待翻页`);
	}
}

/** ------ 常用函数 ------ **/

function initElement(elements) {
	/**
   * 初始化元素属性和函数
   *
   * element: elementNode
   */
	if (!Array.isArray(elements)) {
		elements = [elements];
	}
	for (let element of elements) {
		for (let fn_name in ElementUtils) {
			element[fn_name] = (...args) => {
				return ElementUtils[fn_name](element, ...args);
			};
		}
	}
}

function $css(query) {
	/**
   * css 选择器，单元素
   *
   * query: string
   */
	let elm = document.querySelector(query);
	if (!elm) {
		return;
	}
	initElement(elm);
	return elm;
}

function sleep(ms) {
	ms = typeof ms === "undefined" ? 1000 : ms;
	/**
   * 休眠函数，单位：ms
   * 使用方法：
   * sleep(500).then(() => { Do something after the sleep! });
   * 或者
   * await sleep(500); Do something after the sleep!
   */
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function isShowInView(element) {
	/**
   * 判断元素是否出现在视窗中
   */
	if (element === null || element === undefined) {
		return false;
	}
	let documentHeight = Math.max(
		document.documentElement.scrollHeight,
		document.documentElement.offsetHeight,
		document.documentElement.clientHeight
	);
	let screenHeight = window.innerHeight || documentHeight;
	let screenWidth = window.innerWidth || document.documentElement.clientWidth;
	let { top, right, bottom, left } = element.getBoundingClientRect();
	return (
		top >= 0 && left >= 0 && right <= screenWidth && bottom <= screenHeight
	);
}

function setBtnText(id, html) {
	/**
   * 按 id 现查按钮并更新文案
   * 站点重建 .readerControls 后旧引用会变成游离节点，写它不报错但不可见
   */
	const btn = document.getElementById(id);
	if (btn) {
		btn.innerHTML = html;
	}
}

let toastTimer = null;
/**
 * 页顶居中 toast（主题切换/F9 常显反馈）；元素懒创建，1.6s 后自动隐
 * 仅用户主动操作时调用——初始化恢复主题不弹 toast
 */
function toast(msg) {
	if (!document.body) return;
	let el = document.getElementById('wr-immersive-toast');
	if (!el) {
		el = document.createElement('div');
		el.id = 'wr-immersive-toast';
		document.body.appendChild(el);
	}
	el.textContent = msg;
	el.style.opacity = '1';
	clearTimeout(toastTimer);
	toastTimer = setTimeout(() => {
		el.style.opacity = '0';
	}, 1600);
}

function createElement(tagName, attributes) {
	const elm = document.createElement(tagName);
	for (const attr in attributes) {
		elm.setAttribute(attr, attributes[attr]);
	}
	return elm;
}

async function waitElement(css_selector, max_wait_ms) {
	/**
   * 等待指定元素出现
   */
	max_wait_ms = typeof max_wait_ms === "undefined" ? 3000 : max_wait_ms;
	let start_time = new Date().getTime();
	let elm = $css(css_selector);
	while (!elm && start_time + max_wait_ms >= new Date().getTime()) {
		await sleep(300);
		elm = $css(css_selector);
		if (elm) {
			break;
		}
	}
	return elm;
}

function getScrollTop() {
	/**
   * 滚动条在Y轴上已经滚动的距离
   */
	return document.documentElement.scrollTop || document.body.scrollTop;
}

function getScrollHeight() {
	/**
   * 整个页面的高度
   */
	return document.documentElement.scrollHeight || document.body.scrollHeight;
}

function getWindowHeight() {
	/**
   * 浏览器可视窗口高度
   */
	return document.documentElement.clientHeight || document.body.clientHeight;
}

function isPageBottom(deviation_value) {
	/**
   * 判断页面是否滚动到底，默认允许3个像素的误差，大部分情况下总是会差0.3-0.8像素
   */
	deviation_value =
		typeof deviation_value === "undefined" ? 3 : deviation_value;
	if (
		getScrollHeight() - getScrollTop() - getWindowHeight() <
		deviation_value
	) {
		return true;
	}
	return false;
}

function pressKeyByCode(code) {
	/**
   * 按键触发，根据传入的按键编号
   *
   * code: Number
   */
	return document.dispatchEvent(
		new KeyboardEvent("keydown", {
			bubbles: true,
			cancelable: true,
			keyCode: code,
		})
	);
}

function pressKey(name) {
	/**
   * 按键触发，根据传入的按键名
   *
   * name: string
   */
	const KeyNameToCode = {
		back: 8,
		tab: 9,
		clear: 12,
		enter: 13,
		shift: 16,
		ctrl: 17,
		alt: 18,
		capelock: 20,
		esc: 27,
		space: 32,
		pageup: 33,
		pagedown: 34,
		end: 35,
		home: 36,
		left: 37,
		up: 38,
		right: 39,
		down: 40,
		insert: 45,
		delete: 46,
		0: 48,
		1: 49,
		2: 50,
		3: 51,
		4: 52,
		5: 53,
		6: 54,
		7: 55,
		8: 56,
		9: 57,
		a: 65,
		b: 66,
		c: 67,
		d: 68,
		e: 69,
		f: 70,
		g: 71,
		h: 72,
		i: 73,
		j: 74,
		k: 75,
		l: 76,
		m: 77,
		n: 78,
		o: 79,
		p: 80,
		q: 81,
		r: 82,
		s: 83,
		t: 84,
		u: 85,
		v: 86,
		w: 87,
		x: 88,
		y: 89,
		z: 90,
		f1: 112,
		f2: 113,
		f3: 114,
		f4: 115,
		f5: 116,
		f6: 117,
		f7: 118,
		f8: 119,
		f9: 120,
		f10: 121,
		f11: 122,
		f12: 123,

		// 数字小键盘部分
		n0: 96,
		n1: 97,
		n2: 98,
		n3: 99,
		n4: 100,
		n5: 101,
		n6: 102,
		n7: 103,
		n8: 104,
		n9: 105,
		"n*": 106,
		"n+": 107,
		nenter: 108,
		"n-": 109,
		"n.": 110,
		"n/": 111,

		numlock: 144,
		";": 186,
		":": 186,
		"=": 187,
		"+": 187,
		",": 188,
		"<": 188,
		"-": 189,
		_: 189,
		".": 190,
		">": 190,
		"/": 191,
		"?": 191,
		"`": 192,
		"~": 192,
		"[": 219,
		"{": 219,
		"\\": 220,
		"|": 220,
		"]": 221,
		"}": 221,
		"'": 222,
		'"': 222,
	};

	return pressKeyByCode(KeyNameToCode[name.toLowerCase()]);
}
