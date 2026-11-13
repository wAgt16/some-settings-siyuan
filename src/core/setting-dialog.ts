/**
 * 插件设置面板。
 *
 * 面板走思源原生的 `Setting`：对话框由宿主创建，插件只往它的正文里填自己的面板，
 * 因此移动端**不需要插件做任何事**就会被新版宿主渲染成底部抽屉（抓手、遮罩、拖动、
 * 返回键、可视视口与键盘避让全部由宿主接管），桌面端仍是居中的设置弹窗。
 *
 * 结构与参考插件的面板同构：`.b3-dialog__content > .config > (页签 + .config-items)*`。
 *
 * - 每个分类（按作用到的原生功能划分）各是一个页签，没有内容的不出现
 * - 桌面端是弹窗左侧的一列页签（照抄内核设置的 `.config__side`），
 *   移动端是顶部一条可左右滑动的页签栏（照抄内核代码片段弹窗的 `.layout-tab-bar`）
 * - 每一页里第一行是功能名与说明，随后就是设置行，**没有任何嵌套分组**
 * - 每一行都是「左侧文案 + 右侧控件」，控件用思源的 b3-* 类
 * - 行与行之间保留内核 `.b3-label` 自带的分割线，只有整页的最后一行去掉
 * - 没有底部动作区：面板里不出现任何「保存 / 取消」按钮，宿主的动作区整块收起
 *
 * 滚动：桌面端每一页自己滚（`.some-settings-panel__view`），内容区不滚，页签栏不会被滚走；
 * 移动端的抽屉高度由宿主按内容量出来，所以整块面板按自然高度排版、由宿主的内容区滚动，
 * 页签栏吸顶。
 *
 * 保存机制：**改完即落盘**。控件一变就写进该功能自己的配置文件，没有草稿、也没有「保存」，
 * 界面显示的值永远等于磁盘上的值。开关与下拉改一次写一次；文本 / 数字框在打字过程中按静默期
 * 合并写盘，失焦立即写，关面板时把还没落地的那一次补上。写盘失败时 store 已把内存态退回改动
 * 之前，面板再把控件改回磁盘上的值并让错误可见。
 *
 * 生命周期同样只有显式入口：关面板、插件卸载（外加内核自己的 Esc）。关面板时补写待落地的改动。
 * **不监听窗口失焦，也不监听 `document` 可见性** —— 两者都不等于「用户离开了」，
 * 详见 `docs/development.md` 里的第 12 条。
 */
import {
    Setting,
    showMessage,
} from "siyuan";
import type {
    Dialog,
    Plugin,
} from "siyuan";
import {bindPendingClick} from "./click";
import type {ConfigStore} from "./config";
import {storageNameOf} from "./config";
import {
    guardAsync,
    guardSilent,
    reportError,
} from "./error";
import {withoutMobileInputFocus} from "./frontend";
import {preheatDialogLayer} from "./layer";
import {openExternalLink} from "./link";
import {createLogger} from "./log";
import {
    readStoredFile,
    writeStoredFile,
} from "./storage";
import type {
    FeatureActionContext,
    FeatureCategory,
    FeatureConfig,
    FeatureDefinition,
    SettingField,
} from "./types";
import {FEATURE_CATEGORIES} from "./types";
import {
    actionButtonHtml,
    buttonRowHtml,
    ensurePanelCss,
    escapeHtml,
    isMobileFrontend,
    markLastChildRow,
    noteBodyHtml,
    noteRowHtml,
    numberRowHtml,
    PANEL_CLASS,
    type PanelTab,
    selectControlHtml,
    selectRowHtml,
    subtitleRowHtml,
    switchControlHtml,
    switchRowHtml,
    tabBarHtml,
    tabItemHtml,
    tabPaneHtml,
    tabSideHtml,
    tabViewsHtml,
    textRowHtml,
} from "./ui";

const log = createLogger("core.panel");

const CATEGORY_ORDER: FeatureCategory[] = FEATURE_CATEGORIES;
/** 面板自身的状态与功能配置放在一起，导出、导入和清除时也会一并处理。 */
const PANEL_STATE_ID = "panel-state";
const PANEL_STATE_FILE = storageNameOf(PANEL_STATE_ID);
interface PanelState {
    tab?: string;
}

/** 分类文案的 i18n key：与分类 id 一一对应，`npm run check` 会校验两份语言文件都有。 */
const categoryLabelKey = (category: FeatureCategory): string => `category.${category}`;

/** 页签条目上表示「当前选中」的类名：桌面端与移动端各一个。 */
const TAB_FOCUS_CLASSES = ["b3-list-item--focus", "item--focus"];

/**
 * 页签图标（思源内置 symbol 名），两端都显示。
 *
 * 分类与图标的对应只在这里维护：图标说的是「这个页签改的是哪块原生界面」，
 * 与分类名一一对应，不随某个功能增删而变。
 */
const CATEGORY_ICONS: Record<FeatureCategory, string> = {
    ai: "iconSparkles",
    editor: "iconEdit",
    "doc-tree": "iconFiles",
    appearance: "iconTheme",
    connection: "iconPlugZap",
    settings: "iconSettings",
    plugin: "iconPlugin",
};

export interface SettingsPanelOptions {
    plugin: Plugin;
    store: ConfigStore;
    features: FeatureDefinition[];
}

const isReadonly = (): boolean => Boolean(window.siyuan?.config?.readonly || window.siyuan?.isPublish);

/** 窄屏阈值，与内核折行 .config-item 的断点一致。 */
const NARROW_WIDTH = 750;
/** 窄屏时视口两侧各留的空白。 */
const NARROW_GUTTER = 24;
/** 面板的最小可用宽度，比这更窄排版就没意义了。 */
const MIN_PANEL_WIDTH = 280;
/** 宽屏下的面板宽度上限。桌面端是「侧栏 + 内容」两栏，侧栏那 220px 直接吃掉行宽，
 *  所以上限比单栏的移动端放宽一档（内核自己的设置弹窗也是这样，上限 900px）。 */
const MAX_DESKTOP_PANEL_WIDTH = 900;

/** 取布局视口宽度。移动端的 vw 与 innerWidth 在个别内核上会不一致，用 clientWidth 更稳。 */
const viewportWidth = (): number => document.documentElement.clientWidth || window.innerWidth || 0;

/**
 * 每个控件用「功能 id + 字段 key」复合标识，避免不同功能重名时互相串台。
 *
 * 分隔符必须是可打印字符：这里最终会写进 HTML 属性，
 * 而 HTML 解析器会把属性里的 U+0000 换成 U+FFFD（实测会变成 65533），
 * 于是 id 永远匹配不上、草稿也永远查不到——这正是此前「保存后依旧是默认值」的根因。
 * 功能 id 只允许小写字母/数字/连字符，字段 key 只允许字母/数字/下划线，
 * 因此 "::" 不会与任何一侧冲突。用 indexOf 取第一个分隔符，
 * 即使 key 里含 "::" 也能正确切分。
 */
const BIND_SEPARATOR = "::";
const bindKey = (featureId: string, key: string): string => `${featureId}${BIND_SEPARATOR}${key}`;
const parseBindKey = (value: string): [string, string] => {
    const index = value.indexOf(BIND_SEPARATOR);
    return index < 0 ?
        [value, ""] :
        [value.slice(0, index), value.slice(index + BIND_SEPARATOR.length)];
};

/**
 * 给一段行 HTML 里最后一行打上「不可见最后一行」标记。
 *
 * 一个页签是一张 `.config-items` 卡片，但它的行要跨功能拼出来，
 * CSS 的 :last-child 只能看见 DOM 里的最后一个元素，所以由这里显式标记。
 * 认的是最后一份带 `config-item` 这个整词的 class 属性：说明块这类行内部还有自己的元素与
 * class（段落是 `b3-label__text`），照着最后一个 class 属性下手会标记到段落的头上。
 */
const markLastRow = (rowsHtml: string): string => {
    const pattern = /class="([^"]*)"/g;
    let index = -1;
    let match = pattern.exec(rowsHtml);
    while (match) {
        if (match[1].split(/\s+/).includes("config-item")) {
            index = match.index;
        }
        match = pattern.exec(rowsHtml);
    }
    if (index < 0) {
        return rowsHtml;
    }
    const head = rowsHtml.slice(0, index + 'class="'.length);
    const tail = rowsHtml.slice(index + 'class="'.length);
    return `${head}config-item--last-visible ${tail}`;
};

/** 视口变化轮询间隔。 */
const VIEWPORT_POLL_MS = 250;

/** 文本 / 数字框的静默期：连续敲字时把改动合并成一次写盘。 */
const TYPING_QUIET_MS = 400;

/**
 * 取对话框里的一个区域（正文区 / 动作区），没有就补一个。
 *
 * 宿主的 `Setting.open()` 正常会建好正文区；补建只是兜底 —— 结构略有差异的宿主版本上
 * 宁可自己补一个，也不能让面板没有正文。
 */
const ensureRegion = (parent: HTMLElement, className: string): HTMLElement => {
    const existing = parent.querySelector<HTMLElement>(`.${className}`);
    if (existing) {
        return existing;
    }
    const element = document.createElement("div");
    element.className = className;
    parent.append(element);
    return element;
};

/**
 * 宿主的 `Setting` 比 SDK 的类型声明多出两样东西（宿主源码里都是 public）：
 * - `open()` 会把建好的对话框挂在 `setting.dialog` 上；
 * - `close()` 会按「普通对话框 / 独立设置窗口」分别收掉。
 * 这里只做一处窄类型扩展，不扩散成全局断言。
 */
type SettingWithDialog = Setting & {
    dialog?: Dialog;
    close?: () => void;
};

export class SettingsPanel {
    private readonly options: SettingsPanelOptions;
    private setting?: SettingWithDialog;
    private dialog?: Dialog;
    /**
     * 静默期里还没落盘的改动，键是功能 id。
     *
     * 只收文本 / 数字框的在途输入：开关与下拉改一次写一次，不进这里。
     * 关面板时把这里剩下的内容补写出去。
     */
    private pending = new Map<string, FeatureConfig>();
    private flushTimer?: number;
    /** 插件卸载中：这时不再补写待落地的改动（宿主已经不再接受写入）。 */
    private disposed = false;
    private viewportTimer?: number;
    /** 动作行注册的「插件卸载时」清理回调。 */
    private readonly unloadListeners = new Set<() => void>();
    /** 当前页签；内存里先更新，关闭面板时再落盘。 */
    private currentTab?: FeatureCategory;
    /** 上一次打开面板时从磁盘读到的状态，用来挡掉没有变化的重复写盘。 */
    private storedTab?: FeatureCategory;
    /** 用户已经手动选过页签后，迟到的读盘结果不能再抢回旧页签。 */
    private tabTouched = false;
    /** 连续关闭 / 重开时页签写入按顺序完成，旧写入不能覆盖新值。 */
    private tabWriteQueue: Promise<void> = Promise.resolve();
    /** 面板的这一次打开；异步读盘回来时，旧的打开过程不能覆盖新面板。 */
    private showGeneration = 0;

    constructor(options: SettingsPanelOptions) {
        this.options = options;
    }

    get isOpen(): boolean {
        return Boolean(this.setting);
    }

    private t(key: string, fallback?: string): string {
        const value = this.options.plugin.i18n?.[key];
        if (typeof value === "string" && value) {
            return value;
        }
        return fallback ?? key;
    }

    private nameOf(feature: FeatureDefinition): string {
        return this.t(feature.name, feature.id);
    }

    /** 当前分类（页签）下要显示设置界面的功能。 */
    private visibleFeatures(category: FeatureCategory): FeatureDefinition[] {
        return this.visibleFeaturesAll().filter((feature) => feature.category === category);
    }

    // ------------------------------------------------------------ 生命周期

    show(): void {
        if (this.setting) {
            return;
        }
        ensurePanelCss();
        const mobile = isMobileFrontend();
        log.info("opening the settings panel", {
            frontend: mobile ? "mobile" : "desktop",
            features: this.options.features.length,
        });

        const generation = ++this.showGeneration;
        this.tabTouched = false;
        // 已落盘状态属于这一次打开，不能被上一次关闭的异步写盘顺带改掉。
        this.storedTab = undefined;
        const setting = new Setting({
            destroyCallback: () => {
                // 关面板时把还在静默期里的那一次补上：用户改完直接关窗，改动也不会丢。
                void this.flushPending();
                void this.saveTab(generation);
                this.setting = undefined;
                this.dialog = undefined;
                this.pending = new Map();
                this.clearFlushTimer();
                this.stopViewportWatch();
            },
        }) as SettingWithDialog;
        this.setting = setting;

        // 对话框由宿主建：新版宿主在移动端用 MobileDialog 把它渲染成底部抽屉，
        // 桌面端仍是居中弹窗；设置窗口模式下 Setting.close() 还会替我们收掉那个窗口。
        // open() 是同步的，返回时正文已经就绪，因此这里一次性填好整块面板内容 ——
        // 不逐项插入、不异步挂载，入场动画开始前内容就是完整的。
        //
        // 移动端还要挡掉宿主在 open() 里对正文输入控件的自动聚焦：那一下会顶起软键盘、
        // 压缩可视视口，抽屉跟着重排（见 core/frontend.ts）。
        try {
            withoutMobileInputFocus(() => {
                setting.open(this.options.plugin.displayName || this.options.plugin.name);
            });
        } catch (error) {
            // 宿主建对话框失败时不能留下「已打开」的状态，否则之后再点设置都不会有反应。
            this.setting = undefined;
            reportError("settings.open", error);
            return;
        }

        const dialog = setting.dialog;
        if (!dialog) {
            // 宿主没有建出对话框：收干净状态并报错，不留一个关不掉的半成品面板。
            this.setting = undefined;
            reportError("settings.open", new Error("the host did not create a settings dialog"));
            return;
        }
        this.dialog = dialog;

        // 入场图层预热：宿主的 Dialog 在 50ms 后才加 b3-dialog--open，这里在 open() 返回后
        // 同步补类，样式在过渡开始前就已生效（见 core/layer.ts）。
        preheatDialogLayer(dialog);

        // 面板根节点在这里就带上布局类：页签的两种外观（桌面端左侧列表 / 移动端顶部页签栏）
        // 由它决定，render() 只管往里填内容。
        const body = dialog.element.querySelector<HTMLElement>(".b3-dialog__body");
        if (!body) {
            reportError("settings.open", new Error("the settings dialog has no body"));
            this.close();
            return;
        }
        const content = ensureRegion(body, "b3-dialog__content");
        content.innerHTML = `<div class="config ${PANEL_CLASS} ${PANEL_CLASS}--tabs${
            mobile ? ` ${PANEL_CLASS}--mobile` : ""
        }"></div>`;

        if (mobile) {
            this.applySheetLayout();
        } else {
            this.applyDesktopLayout();
        }

        this.render();
        this.hideActionBar();
        void this.restoreTab(generation);

        if (isReadonly()) {
            showMessage(this.t("panel.readonlyTip"), 5000);
        }
    }

    /** 插件被禁用/重载/卸载时收掉面板；幂等。 */
    close(): void {
        if (this.setting) {
            log.info("closing the settings panel");
        }
        // Setting.close() 自己区分「普通对话框」与「独立设置窗口」两种收法。
        this.setting?.close?.();
    }

    /**
     * 插件卸载：收掉面板，并执行动作行注册的清理回调（它们打开的窗口不在挂载实例里）。
     * 与 `close()` 分开：用户关面板只收面板，动作行开的窗口仍然留着。
     */
    dispose(): void {
        this.disposed = true;
        this.close();
        const listeners = [...this.unloadListeners];
        this.unloadListeners.clear();
        listeners.forEach((listener) => guardSilent("panel.unload", listener));
    }

    /**
     * 桌面端布局。
     *
     * 独立设置窗口（宿主给 `.b3-dialog` 加了 `--window`，容器被铺成 100%）只处理内边距：
     * 那里的宽高由宿主决定，插件再写定值只会让面板缩在窗口一角。
     * 普通弹窗才自己量视口定宽度，见 `applyPanelWidth()`。
     */
    private applyDesktopLayout(): void {
        const root = this.dialog?.element;
        if (!root) {
            return;
        }
        // 内边距不能交给媒体查询：它挂在容器类作用下，类一旦没挂上就整段落空
        // （实测真机就是这样，padding 一直是内核的 16px 24px）。这里直接写行内样式。
        //
        // 内容区取 0 内边距、不滚动：页签结构自己撑满这块地方，
        // 滚动交给每一页（`.some-settings-panel__view`），页签栏才不会被一起滚走。
        const content = root.querySelector<HTMLElement>(".b3-dialog__content");
        if (content) {
            content.style.padding = "0";
            content.style.overflow = "hidden";
        }
        if (root.querySelector(".b3-dialog--window")) {
            return;
        }
        this.applyPanelWidth();
        this.watchViewport();
    }

    /**
     * 按当前视口把面板宽度写成容器上的行内样式（唯一可信的宽度来源）。
     * 只在桌面端的普通弹窗里用：移动端是宿主的底部抽屉，宽度 100vw 由宿主写死；
     * 独立设置窗口由宿主铺满整个窗口。
     *
     * 面板宽度必须由插件自己定，不能交给 CSS：`Dialog` 把宽度写成容器上的行内样式，
     * 而内核给 `.b3-dialog__container` 设了 `flex-shrink: 0`。行内宽度 + 不收缩，
     * 只要视口窄于这个宽度，容器就整块溢出屏幕：一侧被裁掉、另一侧贴边；
     * 容器里空间不足又让标题挤成竖排、连 "ms" 都被 `.b3-dialog__content` 的
     * `word-break: break-all` 从中间断成两行。之前两次都靠 CSS（作用域类 + 媒体查询）
     * 纠正，真机上都不生效 —— 直接量视口写行内样式，优先级最高。
     *
     * 同时把量到的事实挂到容器属性上：判断「修没修上」只要长按 →「检查元素」，
     * 不必依赖控制台。
     */
    private applyPanelWidth(): void {
        const container = this.dialog?.element.querySelector<HTMLElement>(".b3-dialog__container");
        if (!container) {
            return;
        }
        const viewport = viewportWidth();
        const narrow = viewport <= NARROW_WIDTH;
        const width = Math.max(
            Math.min(narrow ? viewport - NARROW_GUTTER : viewport - 48, MAX_DESKTOP_PANEL_WIDTH),
            MIN_PANEL_WIDTH,
        );
        container.style.width = `${width}px`;
        container.style.maxWidth = `${width}px`;
        container.style.minWidth = "0";

        container.dataset.ssViewport = String(viewport);
        container.dataset.ssWidth = String(width);
        container.dataset.ssNarrow = String(narrow);
    }

    /**
     * 移动端（宿主把 `Setting` 渲染成底部抽屉）的布局。
     *
     * 抽屉高度由宿主按**内容的自然高度**量出来，再按可视视口裁限（拖动还能改），
     * 所以这里**不能**给容器写行内宽度和高度：写死高度要么一打开就空出一截，
     * 要么把内容裁掉。面板按内容自然排版（见 `PANEL_CSS` 里 `--mobile` 那一段），
     * 整块由宿主的内容区滚动，页签栏吸顶。
     */
    private applySheetLayout(): void {
        const content = this.dialog?.element.querySelector<HTMLElement>(".b3-dialog__content");
        if (content) {
            // 内容区取 0 内边距，行自己的内边距由面板给；滚动仍交给宿主的内容区。
            content.style.padding = "0";
            content.style.overflow = "auto";
        }
    }

    /**
     * 面板宽度是按视口算出来的定值，改窗口大小后必须重算（桌面端专用）。
     * 用轮询而不是 resize 事件：桌面窗口的最大化 / 还原在个别内核上只改布局视口、
     * 不派发（或延迟派发）resize，轮询更可靠；250ms 只为改一个字符串。
     */
    private watchViewport(): void {
        if (this.viewportTimer !== undefined) {
            return;
        }
        let last = viewportWidth();
        this.viewportTimer = window.setInterval(() => {
            // 对话框已经不在页面里（宿主收掉了它、页面正在拆除）就没有量视口的必要：
            // 继续轮询只会在没有 document 的环境里抛错，也白留一个定时器。
            if (!this.dialog || !this.dialog.element.isConnected) {
                this.stopViewportWatch();
                return;
            }
            const current = viewportWidth();
            if (Math.abs(current - last) >= 1) {
                last = current;
                this.applyPanelWidth();
            }
        }, VIEWPORT_POLL_MS);
    }

    private stopViewportWatch(): void {
        if (this.viewportTimer === undefined) {
            return;
        }
        window.clearInterval(this.viewportTimer);
        this.viewportTimer = undefined;
    }

    // ------------------------------------------------------------ 渲染

    /**
     * 面板里会出现的全部功能。
     * 前端、宿主版本与 `enabled` 声明已经由 activeFeatures() 统一筛过，这里不重复判定。
     */
    private visibleFeaturesAll(): FeatureDefinition[] {
        return this.options.features;
    }

    private render(): void {
        // 面板直接落在弹窗内容区里（与参考插件同构）：桌面端滚动交给每一页自己，
        // 移动端交给宿主的内容区，插件不再自己套一层滚动容器——多一层就多一份内边距。
        const panel = this.dialog?.element.querySelector<HTMLElement>(`.${PANEL_CLASS}`);
        if (!panel) {
            return;
        }
        const readonly = isReadonly();
        const mobile = isMobileFrontend();
        const tabs: PanelTab[] = [];
        const panes: string[] = [];
        this.currentTab = undefined;
        CATEGORY_ORDER.forEach((category) => {
            const features = this.visibleFeatures(category);
            if (features.length === 0) {
                return;
            }
            // 一页是一张连续的行列表：功能名与它下面的设置行全部平铺在一起，
            // 因此「哪一行是最后一行」要跨功能判定，不能交给 :last-child。
            const rows: string[] = [];
            features.forEach((feature) => {
                const config = this.options.store.get(feature.id);
                // 功能自己的开关跟着功能名走，不单独占一行；剩下的才是它的参数
                const toggle = feature.settings.find(
                    (field): field is Extract<SettingField, {kind: "switch";}> =>
                        field.kind === "switch" && field.key === "enabled",
                );
                // 拿 selector 当开关的功能（声明了 isEnabled）没有 enabled 开关，
                // 那个 selector 就是它的开关，同样提到功能名那一行，不另起一行。
                // 只有 select 型才会被提上来：别的控件不是「开关」这个角色的写法。
                const inlineSelect = !toggle && feature.isEnabled ?
                    feature.settings.find((field): field is Extract<SettingField, {kind: "select";}> =>
                        field.kind === "select"
                    ) :
                    undefined;
                const inline = toggle ?
                    {
                        key: bindKey(feature.id, toggle.key),
                        html: switchControlHtml(
                            bindKey(feature.id, toggle.key),
                            this.t(toggle.title),
                            Boolean(config[toggle.key]),
                            readonly,
                        ),
                        toggles: true,
                    } :
                    inlineSelect && {
                        key: bindKey(feature.id, inlineSelect.key),
                        html: selectControlHtml(
                            bindKey(feature.id, inlineSelect.key),
                            this.selectOptionsOf(inlineSelect),
                            String(config[inlineSelect.key] ?? inlineSelect.default),
                            readonly,
                        ),
                    };
                rows.push(
                    subtitleRowHtml(
                        this.nameOf(feature),
                        feature.description ? this.t(feature.description) : "",
                        inline || undefined,
                    ),
                );
                // 子行先各自成串，再给这个功能的最后一行打上标记：层级引导线要在那里收尾（画成 └）。
                // 不能交给 CSS 的 :last-child —— 行是跨功能平铺的，它只看得见整页最后一行。
                const childRows: string[] = [];
                feature.settings
                    .filter((field) => field !== toggle && field !== inlineSelect)
                    .forEach((field) => childRows.push(this.fieldHtml(feature, field, config, readonly)));
                rows.push(markLastChildRow(childRows.join("")));
            });
            // 页签只在这里出现一次：顺序、文案与图标都由这一处决定，默认打开第一个有内容的页签
            tabs.push({
                id: category,
                label: this.t(categoryLabelKey(category), category),
                icon: CATEGORY_ICONS[category],
            });
            panes.push(tabPaneHtml(category, markLastRow(rows.join("")), tabs.length === 1));
            this.currentTab ??= category;
        });
        if (tabs.length === 0) {
            panel.innerHTML = `<div class="${PANEL_CLASS}__empty">${escapeHtml(this.t("panel.none"))}</div>`;
            this.bindControls(panel);
            return;
        }
        const items = tabs.map((tab, index) => tabItemHtml(tab, index === 0, mobile)).join("");
        panel.innerHTML = (mobile ? tabBarHtml(items) : tabSideHtml(items)) + tabViewsHtml(panes.join(""));
        this.bindControls(panel);
        this.bindTabs(panel);
        log.info(`panel rendered with ${tabs.length} tab(s)`, tabs.map((tab) => tab.id));
    }

    /**
     * 页签的交互：点条目切换，键盘上与内核设置页一致 —— 回车与空格都算。
     * 条目自带 `tabindex="0"`，所以 Tab 键能在页签之间移动。
     */
    private bindTabs(scope: HTMLElement): void {
        scope.querySelectorAll<HTMLElement>("[data-ss-tab]").forEach((item) => {
            const id = item.dataset.ssTab as string;
            item.addEventListener("click", () => {
                this.tabTouched = true;
                this.activateTab(id);
            });
            item.addEventListener("keydown", (event) => {
                if (event.isComposing || (event.key !== "Enter" && event.key !== " ")) {
                    return;
                }
                event.preventDefault();
                event.stopPropagation();
                this.tabTouched = true;
                this.activateTab(id);
            });
        });
    }

    /**
     * 切到某个页签。
     *
     * 桌面端与移动端用的是两套标记，选中类也各有一个（`b3-list-item--focus` /
     * `item--focus`），这里同时切换两者：另一套类名在当前结构里没有任何样式，无害，
     * 换来的是这一段不必知道面板此刻是哪种布局。
     */
    private activateTab(id: string): void {
        const root = this.dialog?.element;
        if (!root) {
            return;
        }
        root.querySelectorAll<HTMLElement>("[data-ss-tab]").forEach((item) => {
            const active = item.dataset.ssTab === id;
            TAB_FOCUS_CLASSES.forEach((name) => item.classList.toggle(name, active));
            item.setAttribute("aria-selected", String(active));
        });
        root.querySelectorAll<HTMLElement>("[data-ss-tab-panel]").forEach((pane) => {
            pane.classList.toggle("fn__none", pane.dataset.ssTabPanel !== id);
        });
        this.currentTab = id as FeatureCategory;
    }

    /**
     * 恢复上一次关闭时的页签。
     *
     * show() 保持同步：先画出默认页签，再读状态，存储慢也不会拖住对话框。
     * 页签可能因功能退役或前端不同而消失，只恢复当前确实存在的页签。
     */
    private async restoreTab(generation: number): Promise<void> {
        const stored = await readStoredFile(this.options.plugin, PANEL_STATE_FILE);
        if (generation !== this.showGeneration || !this.setting || this.tabTouched) {
            return;
        }
        const tab = typeof stored === "object" && stored !== null && !Array.isArray(stored) ?
            (stored as PanelState).tab :
            undefined;
        if (typeof tab !== "string") {
            return;
        }
        const available = CATEGORY_ORDER.some((category) =>
            category === tab && this.visibleFeatures(category).length > 0
        );
        if (!available) {
            return;
        }
        this.storedTab = tab as FeatureCategory;
        this.activateTab(tab);
    }

    /** 关闭面板时记住当前页签；与功能配置一样写后读回，失败必须可见。 */
    private saveTab(generation: number): Promise<void> {
        const tab = this.currentTab;
        const task = this.tabWriteQueue.catch((): void => undefined).then(async () => {
            if (isReadonly() || !tab || tab === this.storedTab) {
                return;
            }
            const value: PanelState = {tab};
            const status = await writeStoredFile(this.options.plugin, PANEL_STATE_FILE, value);
            if (!status.ok) {
                throw new Error(status.detail);
            }
            const readBack = await readStoredFile(this.options.plugin, PANEL_STATE_FILE);
            const actual = typeof readBack === "object" && readBack !== null && !Array.isArray(readBack) ?
                (readBack as PanelState).tab :
                undefined;
            if (actual !== tab) {
                throw new Error(`tab: wrote ${JSON.stringify(tab)} / read back ${JSON.stringify(actual)}`);
            }
            if (generation === this.showGeneration) {
                this.storedTab = tab;
            }
        });
        this.tabWriteQueue = task;
        return task.catch((error: unknown) => reportError("settings.panel-state", error));
    }

    /**
     * 下拉的候选集。功能自己那一行与参数行都要用它，所以只在这里算一次。
     * 候选集可以在打开面板时才算出来（笔记本、插件列表这类运行时数据）；
     * 两者同时给出时以动态来源为准，避免静态列表与真实数据打架。
     */
    private selectOptionsOf(field: Extract<SettingField, {kind: "select";}>): {value: string; label: string;}[] {
        const raw = field.optionsProvider ? field.optionsProvider() : (field.options ?? []);
        return raw.map((option) => ({value: option.value, label: this.t(option.label)}));
    }

    private fieldHtml(
        feature: FeatureDefinition,
        field: SettingField,
        config: FeatureConfig,
        readonly: boolean,
    ): string {
        switch (field.kind) {
            case "switch":
                return switchRowHtml(
                    bindKey(feature.id, field.key),
                    this.t(field.title),
                    Boolean(config[field.key]),
                    field.description ? this.t(field.description) : "",
                    readonly,
                );
            case "select":
                return selectRowHtml(
                    bindKey(feature.id, field.key),
                    this.t(field.title),
                    this.selectOptionsOf(field),
                    String(config[field.key] ?? field.default),
                    field.description ? this.t(field.description) : "",
                    readonly,
                );
            case "note":
                // 只读说明块：没有取值，只把 i18n 文案里的 {version} / {repo} 之类的占位符填上。
                // 它底部的按钮与动作行同一套语义：只读 / 发布模式下禁用，点击统一走 bindPendingClick
                return noteRowHtml(
                    bindKey(feature.id, field.key),
                    noteBodyHtml(this.t(field.text), field.values, field.labels),
                    (field.actions ?? [])
                        .map((action) =>
                            actionButtonHtml(
                                bindKey(feature.id, action.key),
                                this.actionLabel(action.label, feature.id),
                                {
                                    disabled: readonly,
                                    appearance: action.appearance,
                                    tone: action.tone,
                                    icon: action.icon,
                                    iconSvg: action.iconSvg,
                                },
                            )
                        )
                        .join(""),
                );
            case "button":
                return buttonRowHtml(
                    bindKey(feature.id, field.key),
                    this.t(field.title),
                    this.actionLabel(field.label, feature.id),
                    {
                        description: field.description ? this.t(field.description) : "",
                        // 动作行在只读/发布模式下不提供，避免点了没有反应
                        disabled: readonly,
                        appearance: field.appearance,
                        tone: field.tone,
                        icon: field.icon,
                        iconSvg: field.iconSvg,
                    },
                );
            case "number":
                return numberRowHtml(
                    bindKey(feature.id, field.key),
                    this.t(field.title),
                    Number(config[field.key] ?? field.default),
                    {
                        min: field.min,
                        max: field.max,
                        step: field.step,
                        // 单位同样按 i18n key 解析：像 "px" 这种查不到的会原样返回，
                        // 而 "kernelAutoReconnect.times" 这种才能翻成「次」/ "times"。
                        // 以前这里直接把 key 当字面量渲染，面板上真的会显示那串 key。
                        unit: field.unit ? this.t(field.unit) : undefined,
                        description: field.description ? this.t(field.description) : "",
                        disabled: readonly,
                    },
                );
            case "text":
                return textRowHtml(
                    bindKey(feature.id, field.key),
                    this.t(field.title),
                    String(config[field.key] ?? field.default),
                    {
                        placeholder: field.placeholder ? this.t(field.placeholder) : "",
                        description: field.description ? this.t(field.description) : "",
                        disabled: readonly,
                    },
                );
            default:
                return "";
        }
    }

    // ------------------------------------------------------------ 交互

    private bindControls(scope: HTMLElement): void {
        // 开关与下拉：改一次写一次，没有草稿可存。
        scope.querySelectorAll<HTMLInputElement>("[data-ss-switch]").forEach((input) => {
            input.addEventListener(
                "change",
                () => this.commitControl(input.dataset.ssSwitch as string, input.checked),
            );
        });
        scope.querySelectorAll<HTMLSelectElement>("[data-ss-select]").forEach((select) => {
            select.addEventListener(
                "change",
                () => this.commitControl(select.dataset.ssSelect as string, select.value),
            );
        });
        // 文本 / 数字框：打字过程按静默期合并写盘（每敲一个字都写一次文件没有意义），
        // 失焦 / 回车触发的 change 立即写。
        scope.querySelectorAll<HTMLInputElement>("[data-ss-number]").forEach((input) => {
            input.addEventListener("input", () => this.typeInput(input.dataset.ssNumber as string, input.value));
            input.addEventListener("change", () => this.commitInput(input.dataset.ssNumber as string, input.value));
        });
        scope.querySelectorAll<HTMLInputElement>("[data-ss-text]").forEach((input) => {
            input.addEventListener("input", () => this.typeInput(input.dataset.ssText as string, input.value));
            input.addEventListener("change", () => this.commitInput(input.dataset.ssText as string, input.value));
        });
        // 说明块里的链接：不让 <a> 走默认跳转 —— 移动端 WebView 可能把整个前端导航走。
        scope.querySelectorAll<HTMLAnchorElement>(`.${PANEL_CLASS}__note a[href]`).forEach((anchor) => {
            anchor.addEventListener("click", (event) => {
                event.preventDefault();
                openExternalLink(anchor.href, event);
            });
        });
        // 动作行：点击立刻执行，不进草稿，因此不受「取消 / 保存」影响。
        // 一律走 bindPendingClick：动作行常常是「先异步准备，再开窗」（导出配置就是这样），
        // 执行期间按钮必须禁掉，否则连点几下会一次冒出好几个弹窗。
        scope.querySelectorAll<HTMLButtonElement>("[data-ss-button]").forEach((button) => {
            const encoded = button.dataset.ssButton as string;
            bindPendingClick(button, encoded, () => {
                const [featureId, key] = parseBindKey(encoded);
                const action = this.actionOf(featureId, key);
                if (!action) {
                    log.warn(`action "${encoded}" has no matching onClick, ignoring it`);
                    return;
                }
                log.info(`action "${encoded}" triggered`);
                return guardAsync(
                    `${featureId}.${key}`,
                    () => Promise.resolve(action.onClick(this.actionContext(featureId))),
                );
            });
        });
    }

    /**
     * 动作按钮的文案：字符串是 i18n key；函数型每次打开面板求值，返回值直接当文案。
     * 动作行与说明块底部的按钮都从这里取，两处不各写一份。
     */
    private actionLabel(
        label: string | ((context: FeatureActionContext) => string),
        featureId: string,
    ): string {
        return typeof label === "function" ? label(this.actionContext(featureId)) : this.t(label);
    }

    /**
     * 按「功能 id + key」找一个动作：独立的动作行与说明块底部的按钮都能找到。
     */
    private actionOf(
        featureId: string,
        key: string,
    ): {onClick: (context: FeatureActionContext) => void | Promise<void>;} | undefined {
        const feature = this.options.features.find((item) => item.id === featureId);
        for (const field of feature?.settings ?? []) {
            if (field.kind === "button" && field.key === key) {
                return field;
            }
            if (field.kind === "note") {
                const action = field.actions?.find((item) => item.key === key);
                if (action) {
                    return action;
                }
            }
        }
        return undefined;
    }

    /**
     * 动作行能拿到的平台能力。动作行不参与挂载，拿不到 FeatureHost，
     * 所以它需要的东西只能由面板在这里现搭一个。
     */
    private actionContext(featureId: string): FeatureActionContext {
        return {
            i18n: (key: string) => this.t(key),
            featureId,
            pluginName: this.options.plugin.name,
            onUnload: (listener: () => void) => {
                this.unloadListeners.add(listener);
                return () => this.unloadListeners.delete(listener);
            },
            configOf: (id: string) => ({...this.options.store.get(id)}),
            updateConfig: async (id: string, patch: FeatureConfig) => {
                await this.options.store.patch(id, patch);
                // 开关状态变了就把面板上的控件一起改掉，不让界面和磁盘各说各话
                this.syncControls(id);
            },
            clearAllConfigs: () => this.options.store.clearAll(),
            exportConfigs: () => this.options.store.exportAll(),
            importConfigs: (config: Record<string, unknown>) => this.options.store.importMany(config),
        };
    }

    /**
     * 把宿主的动作区整块收起。
     *
     * 面板没有「保存 / 取消」这一步 —— 控件改动当场落盘，所以宿主建的那条动作区直接
     * 用 `fn__none` 收起来，插件也不往里放任何按钮。宿主没建动作区时什么都不用做。
     */
    private hideActionBar(): void {
        this.dialog?.element.querySelector<HTMLElement>(".b3-dialog__action")?.classList.add("fn__none");
    }

    // ------------------------------------------------------------ 改完即写

    /** 开关 / 下拉的一次改动：立即落盘。 */
    private commitControl(encodedKey: string, value: unknown): void {
        const target = this.targetOf(encodedKey);
        if (target) {
            void this.commit(target.featureId, {[target.key]: value});
        }
    }

    /**
     * 文本 / 数字框在打字过程中的一次输入：只进静默队列，等用户停下来再写。
     *
     * 数字框打到一半的形态（清空、只有一个负号、小数点）不是合法值，先不落盘；
     * 写完（失焦的 change）时再按 0 处理，与改动前「保存时被 min 夹住」的行为一致。
     */
    private typeInput(encodedKey: string, raw: string): void {
        const target = this.targetOf(encodedKey);
        if (!target) {
            return;
        }
        if (!target.numeric) {
            this.schedule(target.featureId, {[target.key]: raw});
            return;
        }
        if (raw.trim() === "") {
            return;
        }
        const value = Number(raw);
        if (Number.isFinite(value)) {
            this.schedule(target.featureId, {[target.key]: value});
        }
    }

    /** 文本 / 数字框失焦（或回车）触发的提交：立即落盘。 */
    private commitInput(encodedKey: string, raw: string): void {
        const target = this.targetOf(encodedKey);
        if (target) {
            void this.commit(target.featureId, {[target.key]: target.numeric ? Number(raw) : raw});
        }
    }

    /**
     * 把控件标识（`功能 id::字段 key`）解析成落盘需要的信息。
     *
     * 声明里找不到这个功能时只告警并丢弃这次改动：面板渲染完之后声明被改掉属于异常，
     * 没有 schema 就没有可写的东西。
     */
    private targetOf(encodedKey: string): {featureId: string; key: string; numeric: boolean;} | undefined {
        const [featureId, key] = parseBindKey(encodedKey);
        const feature = this.options.features.find((item) => item.id === featureId);
        if (!feature) {
            log.warn(`control "${encodedKey}" has no matching feature, change discarded`);
            return undefined;
        }
        const field = feature.settings.find((item) => item.key === key);
        return {featureId, key, numeric: field?.kind === "number"};
    }

    /** 立即写盘；同一功能还有排队中的输入时一起写掉，同一个文件不写两遍。 */
    private commit(featureId: string, patch: FeatureConfig): Promise<void> {
        const queued = this.pending.get(featureId);
        this.pending.delete(featureId);
        // 立即提交后旧计时器必须失效，否则写入途中再次输入会留下一次没有新输入触发的静默写盘。
        this.clearFlushTimer();
        return this.write(featureId, queued ? {...queued, ...patch} : patch);
    }

    /** 把一次改动放进静默队列；静默期结束后统一写盘。 */
    private schedule(featureId: string, patch: FeatureConfig): void {
        this.pending.set(featureId, {...this.pending.get(featureId), ...patch});
        this.clearFlushTimer();
        this.flushTimer = window.setTimeout(() => {
            this.flushTimer = undefined;
            void this.flushPending();
        }, TYPING_QUIET_MS);
    }

    /** 把静默期里剩下的改动立刻写盘（定时器到点、失焦合并、关面板时调用）；幂等。 */
    private async flushPending(): Promise<void> {
        this.clearFlushTimer();
        if (this.pending.size === 0) {
            return;
        }
        // 卸载途中宿主已经不再接受写入（saveData 会以 410 拒绝）：待落地的改动直接丢掉，
        // 不要让一次注定失败的写入再弹一个错误提示。
        if (this.disposed) {
            this.pending = new Map();
            return;
        }
        const queued = [...this.pending];
        this.pending = new Map();
        for (const [featureId, patch] of queued) {
            await this.write(featureId, patch);
        }
    }

    private clearFlushTimer(): void {
        if (this.flushTimer === undefined) {
            return;
        }
        window.clearTimeout(this.flushTimer);
        this.flushTimer = undefined;
    }

    /**
     * 写盘并处理失败。
     *
     * 写完后按 store 的归一化结果回显（例如数字被 min / max 夹取）；失败时 store 已回退内存态，
     * 这里把控件改回磁盘上的值，再把错误交给用户，不允许界面停在「看着改了、其实没存」的状态。
     */
    private async write(featureId: string, patch: FeatureConfig): Promise<void> {
        try {
            await this.options.store.patch(featureId, patch);
        } catch (error) {
            reportError(`settings.${featureId}`, error);
        } finally {
            this.syncControls(featureId);
        }
    }

    /**
     * 把某个功能的控件改回存储里的值（写盘失败后使用）。
     *
     * 只动这一个功能的控件：别的功能没有改动，不该被动过。
     */
    private syncControls(featureId: string): void {
        const root = this.dialog?.element;
        if (!root) {
            return;
        }
        const config = this.options.store.get(featureId);
        const keyOf = (encoded: string | undefined): string | undefined => {
            if (typeof encoded !== "string") {
                return undefined;
            }
            const [id, key] = parseBindKey(encoded);
            return id === featureId ? key : undefined;
        };
        root.querySelectorAll<HTMLInputElement>("[data-ss-switch]").forEach((input) => {
            const key = keyOf(input.dataset.ssSwitch);
            if (key) {
                input.checked = config[key] === true;
            }
        });
        root.querySelectorAll<HTMLSelectElement>("[data-ss-select]").forEach((select) => {
            const key = keyOf(select.dataset.ssSelect);
            if (key) {
                select.value = String(config[key] ?? "");
            }
        });
        root.querySelectorAll<HTMLInputElement>("[data-ss-number], [data-ss-text]").forEach((input) => {
            const key = keyOf(input.dataset.ssNumber ?? input.dataset.ssText);
            if (key) {
                input.value = String(config[key] ?? "");
            }
        });
    }
}
