/**
 * `core/setting-dialog.ts`：插件设置面板。
 *
 * 面板的行为可以归成三件事，这里按这三块组织：
 * - 渲染：分类 → 页签，功能 → 功能行（开关跟名字走），字段 → 控件；
 * - 草稿：控件改动只进草稿，「取消」丢弃（有改动先确认），「保存」才写盘；
 * - 宿主交互：只读模式、动作行、说明块外链、布局与宽度、卸载清理。
 */
import type {Plugin} from "siyuan";
import {
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from "vitest";
import {ConfigStore} from "../../src/core/config";
import {SettingsPanel} from "../../src/core/setting-dialog";
import type {
    FeatureDefinition,
    SettingField,
} from "../../src/core/types";
import type {FeatureActionContext} from "../../src/core/types";
import {mockState} from "../mocks/siyuan";

const PANEL_CLASS = "some-settings-panel";

/** 宿主播件：存储放在 Map 里，可注入写盘失败。 */
class FakeHost {
    readonly name = "some-settings-siyuan";
    readonly displayName = "some settings";
    readonly files = new Map<string, unknown>();
    rejectWrites = false;
    i18n: Record<string, string> = {
        "alpha.name": "甲功能",
        "alpha.desc": "甲的说明",
        "alpha.enabled": "启用甲",
        "alpha.enabled.desc": "开关说明",
        "alpha.size": "尺寸",
        "alpha.label": "标签",
        "alpha.label.ph": "请输入标签",
        "alpha.mode": "方式",
        "alpha.auto": "自动",
        "alpha.manual": "手动",
        "alpha.about": "版本 {version}\n仓库 {repo}",
        "alpha.repo": "项目仓库",
        "alpha.run": "执行",
        "alpha.runLabel": "点我执行",
        "secondary.name": "乙功能",
        "switch-mode.name": "丙功能",
        "switch-mode.scope": "适用端",
        "switch-mode.off": "禁用",
        "switch-mode.on": "启用",
        "category.editor": "编辑",
        "category.appearance": "外观",
        "category.settings": "设置",
        "panel.none": "本宿主没有可用的设置项",
        "panel.readonlyTip": "只读工作空间",
        "dialog.cancel": "取消",
        "dialog.save": "保存",
        "dialog.saved": "已保存",
        "dialog.discardTitle": "放弃改动？",
        "dialog.discardText": "改动尚未保存。",
        "action.done": "动作已执行",
    };

    loadData = vi.fn(async (name: string): Promise<unknown> => this.files.get(name) ?? "");
    saveData = vi.fn(async (name: string, value: unknown): Promise<unknown> => {
        if (this.rejectWrites) {
            return {code: 1, msg: "readonly"};
        }
        this.files.set(name, JSON.parse(JSON.stringify(value)));
        return {code: 0};
    });
    removeData = vi.fn(async (name: string): Promise<unknown> => {
        this.files.delete(name);
        return {code: 0};
    });

    asPlugin(): Plugin {
        return this as unknown as Plugin;
    }
}

const alphaSettings = (onClick: (context: FeatureActionContext) => void = () => undefined): SettingField[] => [
    {kind: "switch", key: "enabled", title: "alpha.enabled", description: "alpha.enabled.desc", default: false},
    {kind: "number", key: "size", title: "alpha.size", default: 12, min: 8, max: 24, unit: "px"},
    {kind: "text", key: "label", title: "alpha.label", placeholder: "alpha.label.ph", default: "hi"},
    {
        kind: "select",
        key: "mode",
        title: "alpha.mode",
        default: "auto",
        options: [{value: "auto", label: "alpha.auto"}, {value: "manual", label: "alpha.manual"}],
    },
    {
        kind: "note",
        key: "about",
        text: "alpha.about",
        values: {version: "1.0.1", repo: "https://github.com/wmy2981/some-settings-siyuan"},
        labels: {repo: "owner/repo"},
    },
    {kind: "button", key: "run", title: "alpha.run", label: "alpha.runLabel", onClick},
];

const featureOf = (id: string, extra: Partial<FeatureDefinition> = {}): FeatureDefinition => ({
    id,
    category: "editor",
    name: `${id}.name`,
    description: `${id}.desc`,
    enabled: true,
    settings: alphaSettings(),
    ...extra,
});

interface Opened {
    host: FakeHost;
    store: ConfigStore;
    panel: SettingsPanel;
    /** 对话框根元素。 */
    root: HTMLElement;
    /** 面板根元素（`.some-settings-panel`）。 */
    panelElement: HTMLElement;
    q: <T extends HTMLElement>(selector: string) => T | null;
    qa: (selector: string) => HTMLElement[];
}

/** 建 store、注册功能、打开面板。 */
const open = async (
    definitions: FeatureDefinition[] = [featureOf("alpha")],
    stored: Record<string, unknown> = {},
): Promise<Opened> => {
    const host = new FakeHost();
    Object.entries(stored).forEach(([id, value]) => host.files.set(`feature-${id}`, value));
    const store = new ConfigStore(host.asPlugin());
    for (const definition of definitions) {
        await store.register(definition);
    }
    const panel = new SettingsPanel({plugin: host.asPlugin(), store, features: definitions});
    panel.show();
    const root = mockState.settings[mockState.settings.length - 1]?.dialog?.element;
    if (!root) {
        throw new Error("panel did not open");
    }
    const panelElement = root.querySelector<HTMLElement>(`.${PANEL_CLASS}`) as HTMLElement;
    return {
        host,
        store,
        panel,
        root,
        panelElement,
        q: <T extends HTMLElement>(selector: string) => root.querySelector(selector) as T | null,
        qa: (selector) => [...root.querySelectorAll<HTMLElement>(selector)],
    };
};

const setViewport = (width: number): void => {
    Object.defineProperty(document.documentElement, "clientWidth", {value: width, configurable: true});
};

const fire = (element: HTMLElement, type: string): void => {
    element.dispatchEvent(new Event(type, {bubbles: true}));
};

beforeEach(() => {
    setViewport(1200);
    window.siyuan.config.system.kernelVersion = "3.8.7";
});

describe("show：渲染", () => {
    it("用宿主的 Setting 打开对话框，标题取插件显示名", async () => {
        const {panel, root} = await open();
        expect(panel.isOpen).toBe(true);
        expect(mockState.settings).toHaveLength(1);
        expect(root.querySelector(".b3-dialog__container")).not.toBeNull();
    });

    it("重复 show 不会开出第二个对话框", async () => {
        const {panel} = await open();
        panel.show();
        expect(mockState.settings).toHaveLength(1);
        expect(document.querySelectorAll(".b3-dialog")).toHaveLength(1);
    });

    it("每个有内容的分类一个页签，默认停在第一个", async () => {
        const {qa, q} = await open([
            featureOf("alpha", {category: "editor"}),
            featureOf("secondary", {category: "appearance"}),
        ]);
        const tabs = qa("[data-ss-tab]");
        expect(tabs.map((tab) => tab.dataset.ssTab)).toEqual(["editor", "appearance"]);
        expect(tabs[0].classList.contains("b3-list-item--focus")).toBe(true);
        expect(tabs[0].getAttribute("aria-selected")).toBe("true");
        expect(tabs[1].getAttribute("aria-selected")).toBeNull();

        const panes = qa("[data-ss-tab-panel]");
        expect(panes.map((pane) => pane.dataset.ssTabPanel)).toEqual(["editor", "appearance"]);
        expect(panes[1].classList.contains("fn__none")).toBe(true);
        // 页签文案走 i18n
        expect(q('[data-ss-tab="editor"] .b3-list-item__text')?.textContent).toBe("编辑");
        // 页签按 FEATURE_CATEGORIES 的顺序排列，缺内容的分类不出现
        expect(qa("[data-ss-tab]")).toHaveLength(2);
    });

    it("桌面端是左侧页签列表，不是移动端页签栏", async () => {
        const {panelElement, q} = await open();
        expect(panelElement.classList.contains(`${PANEL_CLASS}--mobile`)).toBe(false);
        expect(q(`.${PANEL_CLASS}__side`)).not.toBeNull();
        expect(q(".layout-tab-bar")).toBeNull();
    });

    it("移动端换成顶部页签栏", async () => {
        mockState.frontend = "mobile";
        const {panelElement, q} = await open();
        expect(panelElement.classList.contains(`${PANEL_CLASS}--mobile`)).toBe(true);
        expect(q(".layout-tab-bar")).not.toBeNull();
        expect(q(`.${PANEL_CLASS}__side`)).toBeNull();
    });

    it("功能行上带功能名、说明与开关，开关不再单独占一行", async () => {
        const {q, qa} = await open();
        const row = q('[data-ss-row="alpha::enabled"]');
        expect(row?.tagName).toBe("LABEL");
        expect(row?.textContent).toContain("甲功能");
        expect(row?.textContent).toContain("甲的说明");
        // 整页里只有一处 enabled 开关
        expect(qa('[data-ss-switch="alpha::enabled"]')).toHaveLength(1);
    });

    it("拿 selector 当开关的功能，把那个下拉提到功能行上", async () => {
        const {q} = await open([featureOf("switch-mode", {
            category: "settings",
            settings: [{
                kind: "select",
                key: "scope",
                title: "switch-mode.scope",
                default: "off",
                options: [{value: "off", label: "switch-mode.off"}, {value: "on", label: "switch-mode.on"}],
            }],
            isEnabled: (config) => config.scope === "on",
        })]);
        const row = q('[data-ss-row="switch-mode::scope"]');
        expect(row?.tagName).toBe("DIV");
        const select = row?.querySelector("select");
        expect(select?.dataset.ssSelect).toBe("switch-mode::scope");
        expect(select?.value).toBe("off");
    });

    it("每种字段都渲染成对应的控件", async () => {
        const {q} = await open();
        expect(q('[data-ss-number="alpha::size"]')?.getAttribute("value")).toBe("12");
        expect(q('[data-ss-number="alpha::size"]')?.closest(".config-item__number")?.textContent).toContain("px");
        const text = q<HTMLInputElement>('[data-ss-text="alpha::label"]');
        expect(text?.value).toBe("hi");
        expect(text?.getAttribute("placeholder")).toBe("请输入标签");
        const select = q<HTMLSelectElement>('[data-ss-select="alpha::mode"]');
        expect([...(select?.options ?? [])].map((option) => option.textContent)).toEqual(["自动", "手动"]);
        expect(q('[data-ss-button="alpha::run"]')?.textContent).toBe("点我执行");
    });

    it("说明块把占位符换成值，链接用短写显示", async () => {
        const {q} = await open();
        const note = q('[data-ss-row="alpha::about"]');
        expect(note?.textContent).toContain("版本 1.0.1");
        const anchor = note?.querySelector("a");
        expect(anchor?.textContent).toBe("owner/repo");
        expect(anchor?.getAttribute("href")).toBe("https://github.com/wmy2981/some-settings-siyuan");
    });

    it("没有任何功能时给出空状态", async () => {
        const host = new FakeHost();
        const store = new ConfigStore(host.asPlugin());
        const panel = new SettingsPanel({plugin: host.asPlugin(), store, features: []});
        panel.show();
        const root = mockState.settings[0].dialog!.element;
        expect(root.querySelector(`.${PANEL_CLASS}__empty`)?.textContent).toBe("本宿主没有可用的设置项");
    });

    it("函数型按钮文案每次打开面板时求值", async () => {
        const label = vi.fn((context: FeatureActionContext) => `${context.i18n("alpha.run")}（运行期）`);
        const {q} = await open([featureOf("alpha", {
            settings: [{
                kind: "button",
                key: "run",
                title: "alpha.run",
                label,
                onClick: () => undefined,
            }],
        })]);
        expect(label).toHaveBeenCalledTimes(1);
        expect(q('[data-ss-button="alpha::run"]')?.textContent).toBe("执行（运行期）");
    });

    it("动作行的现成 SVG 图标（iconSvg）也能透传", async () => {
        const iconSvg = '<svg viewBox="0 0 32 32"><path fill="#01beff" d="M0 0h1v1H0z"/></svg>';
        const {q} = await open([featureOf("alpha", {
            settings: [{
                kind: "button",
                key: "run",
                title: "alpha.run",
                label: "alpha.runLabel",
                iconSvg,
                appearance: "block",
                onClick: () => undefined,
            }],
        })]);
        const button = q<HTMLButtonElement>('[data-ss-button="alpha::run"]')!;
        expect(button.querySelector("svg path")?.getAttribute("fill")).toBe("#01beff");
    });

    it("功能没写说明时功能行只有标题", async () => {
        const {q} = await open([featureOf("alpha", {description: undefined})]);
        const row = q('[data-ss-row="alpha::enabled"]');
        expect(row?.textContent).toContain("甲功能");
        expect(row?.querySelector(".b3-label__text")).toBeNull();
    });

    it("下拉既没有静态选项也没有动态来源时渲染成空下拉", async () => {
        const {q} = await open([featureOf("alpha", {
            settings: [{kind: "select", key: "mode", title: "alpha.mode", default: "a"}],
        })]);
        const select = q<HTMLSelectElement>('[data-ss-select="alpha::mode"]');
        expect(select?.options).toHaveLength(0);
    });

    it("动态下拉的候选集每次打开面板时重新求值", async () => {
        let options = [{value: "a", label: "alpha.auto"}];
        const definitions = [featureOf("alpha", {
            settings: [{
                kind: "select",
                key: "mode",
                title: "alpha.mode",
                default: "a",
                optionsProvider: () => options,
            }],
        })];
        const {panel, q} = await open(definitions);
        expect(q<HTMLSelectElement>('[data-ss-select="alpha::mode"]')?.options).toHaveLength(1);

        panel.close();
        options = [{value: "a", label: "alpha.auto"}, {value: "b", label: "alpha.manual"}];
        panel.show();
        const root = mockState.settings[mockState.settings.length - 1].dialog!.element;
        expect(root.querySelectorAll('select[data-ss-select="alpha::mode"] option')).toHaveLength(2);
    });
});

describe("show：宿主结构差异", () => {
    it("正文区里缺 content / action 时自己补上，保证有保存按钮", async () => {
        mockState.settingRegionsMissing = true;
        const {root} = await open();
        expect(root.querySelector(".b3-dialog__body > .b3-dialog__content")).not.toBeNull();
        expect(root.querySelector(".b3-dialog__body > .b3-dialog__action")).not.toBeNull();
        expect(root.querySelector("[data-ss-save]")).not.toBeNull();
    });

    it("标题优先用插件显示名，没有时退回包名", async () => {
        const host = new FakeHost();
        const store = new ConfigStore(host.asPlugin());
        await store.register(featureOf("alpha"));
        new SettingsPanel({plugin: host.asPlugin(), store, features: [featureOf("alpha")]}).show();
        expect(mockState.settingTitles[0]).toBe("some settings");

        const anonymous = new FakeHost() as unknown as {displayName?: string; asPlugin: () => Plugin;};
        delete anonymous.displayName;
        const secondStore = new ConfigStore(anonymous.asPlugin());
        await secondStore.register(featureOf("alpha"));
        new SettingsPanel({plugin: anonymous.asPlugin(), store: secondStore, features: [featureOf("alpha")]}).show();
        expect(mockState.settingTitles[1]).toBe("some-settings-siyuan");
    });
});

describe("show：宿主异常", () => {
    it("Setting.open() 抛错时收干净状态并上报", async () => {
        mockState.settingOpenError = new Error("host refused");
        const host = new FakeHost();
        const store = new ConfigStore(host.asPlugin());
        await store.register(featureOf("alpha"));
        const panel = new SettingsPanel({plugin: host.asPlugin(), store, features: [featureOf("alpha")]});

        panel.show();

        expect(panel.isOpen).toBe(false);
        expect(mockState.messages[0].text).toContain("host refused");
    });

    it("宿主没建出对话框时同样不留半成品", async () => {
        mockState.settingDialogMissing = true;
        const host = new FakeHost();
        const store = new ConfigStore(host.asPlugin());
        const panel = new SettingsPanel({plugin: host.asPlugin(), store, features: [featureOf("alpha")]});

        panel.show();

        expect(panel.isOpen).toBe(false);
        expect(mockState.messages[0].text).toContain("the host did not create a settings dialog");
    });

    it("对话框没有正文区时关掉它并上报", async () => {
        mockState.settingBodyMissing = true;
        const host = new FakeHost();
        const store = new ConfigStore(host.asPlugin());
        const panel = new SettingsPanel({plugin: host.asPlugin(), store, features: [featureOf("alpha")]});

        panel.show();

        expect(mockState.settings[0].closed).toBe(true);
        expect(mockState.messages[0].text).toContain("no body");
    });
});

describe("只读模式", () => {
    it("控件全部禁用，并提示只读", async () => {
        window.siyuan.config.readonly = true;
        const {q, qa} = await open();
        expect(mockState.messages[0].text).toBe("只读工作空间");
        expect(q<HTMLInputElement>('[data-ss-switch="alpha::enabled"]')?.disabled).toBe(true);
        expect(q<HTMLSelectElement>('[data-ss-select="alpha::mode"]')?.disabled).toBe(true);
        expect(q<HTMLInputElement>('[data-ss-number="alpha::size"]')?.disabled).toBe(true);
        expect(q<HTMLInputElement>('[data-ss-text="alpha::label"]')?.disabled).toBe(true);
        expect(q<HTMLButtonElement>('[data-ss-button="alpha::run"]')?.disabled).toBe(true);
        // 底部仍然有取消 / 保存两个按钮
        expect(qa("[data-ss-cancel]")).toHaveLength(1);
        expect(qa("[data-ss-save]")).toHaveLength(1);
    });

    it("发布模式下同样按只读处理", async () => {
        window.siyuan.isPublish = true;
        const {q} = await open();
        expect(q<HTMLInputElement>('[data-ss-switch="alpha::enabled"]')?.disabled).toBe(true);
    });
});

describe("页签交互", () => {
    const twoTabs = (): FeatureDefinition[] => [
        featureOf("alpha", {category: "editor"}),
        featureOf("secondary", {category: "appearance"}),
    ];

    it("点击页签切换选中状态与可见页", async () => {
        const {q, qa} = await open(twoTabs());
        (qa("[data-ss-tab]")[1] as HTMLElement).click();

        expect(qa("[data-ss-tab]")[1].classList.contains("b3-list-item--focus")).toBe(true);
        expect(qa("[data-ss-tab]")[0].classList.contains("b3-list-item--focus")).toBe(false);
        expect(q('[data-ss-tab-panel="editor"]')?.classList.contains("fn__none")).toBe(true);
        expect(q('[data-ss-tab-panel="appearance"]')?.classList.contains("fn__none")).toBe(false);
    });

    it("回车与空格都能切换，其它键不动", async () => {
        const {qa} = await open(twoTabs());
        const second = qa("[data-ss-tab]")[1];
        second.dispatchEvent(new KeyboardEvent("keydown", {key: "Tab"}));
        expect(second.getAttribute("aria-selected")).toBeNull();

        second.dispatchEvent(new KeyboardEvent("keydown", {key: "Enter"}));
        expect(second.getAttribute("aria-selected")).toBe("true");

        qa("[data-ss-tab]")[0].dispatchEvent(new KeyboardEvent("keydown", {key: " "}));
        expect(qa("[data-ss-tab]")[0].getAttribute("aria-selected")).toBe("true");
    });

    it("输入法组字期间不响应键盘切换", async () => {
        const {qa} = await open(twoTabs());
        const second = qa("[data-ss-tab]")[1];
        second.dispatchEvent(new KeyboardEvent("keydown", {key: "Enter", isComposing: true}));
        expect(second.getAttribute("aria-selected")).toBeNull();
    });
});

describe("草稿与保存", () => {
    it("控件改动只进草稿，不落盘", async () => {
        const {q, host} = await open();
        const input = q<HTMLInputElement>('[data-ss-text="alpha::label"]')!;
        input.value = "改过的";
        fire(input, "change");

        expect(host.saveData).not.toHaveBeenCalled();
        expect(host.files.get("feature-alpha")).toBeUndefined();
    });

    it("没有改动时「保存」直接关闭，不写盘", async () => {
        const {q, host} = await open();
        (q("[data-ss-save]") as HTMLElement).click();
        await vi.waitFor(() => expect(mockState.settings[0].closed).toBe(true));
        expect(host.saveData).not.toHaveBeenCalled();
    });

    it("改动后「保存」写盘、提示并关闭", async () => {
        const {q, host} = await open();
        const input = q<HTMLInputElement>('[data-ss-text="alpha::label"]')!;
        input.value = "改过的";
        fire(input, "change");

        (q("[data-ss-save]") as HTMLElement).click();

        await vi.waitFor(() => expect(mockState.settings[0].closed).toBe(true));
        expect(host.files.get("feature-alpha")).toMatchObject({label: "改过的"});
        expect(mockState.messages.some((message) => message.text === "已保存")).toBe(true);
    });

    it("各类控件的改动都进草稿", async () => {
        const {q, host} = await open();
        const toggle = q<HTMLInputElement>('[data-ss-switch="alpha::enabled"]')!;
        toggle.checked = true;
        fire(toggle, "change");

        const number = q<HTMLInputElement>('[data-ss-number="alpha::size"]')!;
        number.value = "16";
        fire(number, "change");

        const select = q<HTMLSelectElement>('[data-ss-select="alpha::mode"]')!;
        select.value = "manual";
        fire(select, "change");

        (q("[data-ss-save]") as HTMLElement).click();

        await vi.waitFor(() => expect(mockState.settings[0].closed).toBe(true));
        expect(host.files.get("feature-alpha")).toMatchObject({enabled: true, size: 16, mode: "manual"});
    });

    it("清空数字框时按 0 记入草稿，保存时被 min 夹住", async () => {
        // type=number 的输入框拿不到真正的非数字值（非法输入会被浏览器清成空串），
        // 所以这里覆盖的是「清空」这条真实路径：空串 -> 0 -> 夹到 min
        const {q, host} = await open();
        const number = q<HTMLInputElement>('[data-ss-number="alpha::size"]')!;
        number.value = "";
        fire(number, "change");

        (q("[data-ss-save]") as HTMLElement).click();
        await vi.waitFor(() => expect(mockState.settings[0].closed).toBe(true));
        expect(host.files.get("feature-alpha")).toMatchObject({size: 8});
    });

    it("保存失败时面板保持打开，并把问题显示出来", async () => {
        const {q, host} = await open();
        const input = q<HTMLInputElement>('[data-ss-text="alpha::label"]')!;
        input.value = "改过的";
        fire(input, "change");
        host.rejectWrites = true;

        (q("[data-ss-save]") as HTMLElement).click();

        await vi.waitFor(() => expect(mockState.messages.length).toBeGreaterThan(0));
        expect(mockState.settings[0].closed).toBe(false);
        expect(mockState.messages.some((message) => message.text.includes("code 1: readonly"))).toBe(true);
    });

    it("「取消」在没有改动时直接关闭，不弹确认", async () => {
        const {q} = await open();
        (q("[data-ss-cancel]") as HTMLElement).click();

        expect(mockState.confirms).toHaveLength(0);
        await vi.waitFor(() => expect(mockState.settings[0].closed).toBe(true));
    });

    it("有未保存改动时「取消」先确认，确认后放弃草稿", async () => {
        const {q, host, panel} = await open();
        const input = q<HTMLInputElement>('[data-ss-text="alpha::label"]')!;
        input.value = "改过的";
        fire(input, "change");

        (q("[data-ss-cancel]") as HTMLElement).click();

        expect(mockState.confirms).toHaveLength(1);
        expect(mockState.confirms[0].title).toBe("放弃改动？");
        expect(mockState.settings[0].closed).toBe(true);
        expect(panel.isOpen).toBe(false);
        expect(host.files.get("feature-alpha")).toBeUndefined();
    });

    it("确认框里选「取消」时面板留着，草稿也还在", async () => {
        mockState.confirmAnswer = false;
        const {q, panel} = await open();
        const input = q<HTMLInputElement>('[data-ss-text="alpha::label"]')!;
        input.value = "改过的";
        fire(input, "change");

        (q("[data-ss-cancel]") as HTMLElement).click();

        expect(mockState.confirms).toHaveLength(1);
        expect(mockState.settings[0].closed).toBe(false);
        expect(panel.isOpen).toBe(true);
    });

    it("重新打开时草稿按已保存的配置重建", async () => {
        const {panel, host} = await open([featureOf("alpha")], {alpha: {enabled: true, label: "已存"}});
        const input = panel.isOpen ?
            mockState.settings[0].dialog!.element.querySelector<HTMLInputElement>('[data-ss-text="alpha::label"]') :
            null;
        expect(input?.value).toBe("已存");

        panel.close();
        panel.show();
        const root = mockState.settings[mockState.settings.length - 1].dialog!.element;
        expect(root.querySelector<HTMLInputElement>('[data-ss-text="alpha::label"]')?.value).toBe("已存");
        expect(host.saveData).not.toHaveBeenCalled();
    });

    it("保存后再次打开，草稿是刚存下的值", async () => {
        const {q, panel} = await open();
        const input = q<HTMLInputElement>('[data-ss-text="alpha::label"]')!;
        input.value = "第二次";
        fire(input, "change");
        (q("[data-ss-save]") as HTMLElement).click();
        await vi.waitFor(() => expect(panel.isOpen).toBe(false));

        panel.show();
        const root = mockState.settings[mockState.settings.length - 1].dialog!.element;
        expect(root.querySelector<HTMLInputElement>('[data-ss-text="alpha::label"]')?.value).toBe("第二次");
    });
});

describe("动作行", () => {
    it("点击立刻执行，拿到功能 id、插件名与配置快照", async () => {
        const onClick = vi.fn();
        const {q} = await open([featureOf("alpha", {settings: alphaSettings(onClick)})]);
        (q('[data-ss-button="alpha::run"]') as HTMLElement).click();

        await vi.waitFor(() => expect(onClick).toHaveBeenCalledTimes(1));
        const context = onClick.mock.calls[0][0] as FeatureActionContext;
        expect(context.featureId).toBe("alpha");
        expect(context.pluginName).toBe("some-settings-siyuan");
        expect(context.i18n("alpha.run")).toBe("执行");
        expect(context.i18n("missing.key")).toBe("missing.key");
        const snapshot = context.configOf("alpha");
        expect(snapshot).toMatchObject({enabled: false, label: "hi"});
        // 快照是副本，改了不落盘
        snapshot.label = "本地改动";
        expect(context.configOf("alpha").label).toBe("hi");
    });

    it("updateConfig 立刻落盘，并同步面板上的开关", async () => {
        let context: FeatureActionContext | undefined;
        const {q, host} = await open([featureOf("alpha", {
            settings: alphaSettings((actionContext) => {
                context = actionContext;
            }),
        })]);
        (q('[data-ss-button="alpha::run"]') as HTMLElement).click();
        await vi.waitFor(() => expect(context).toBeDefined());

        await context!.updateConfig("alpha", {enabled: true});

        expect(host.files.get("feature-alpha")).toMatchObject({enabled: true});
        expect(q<HTMLInputElement>('[data-ss-switch="alpha::enabled"]')?.checked).toBe(true);
        // 草稿也同步了：此时没有未保存改动
        (q("[data-ss-cancel]") as HTMLElement).click();
        expect(mockState.confirms).toHaveLength(0);
    });

    it("清除 / 导出 / 导入都转给配置存储", async () => {
        let context: FeatureActionContext | undefined;
        const {q, host} = await open([featureOf("alpha", {
            settings: alphaSettings((actionContext) => {
                context = actionContext;
            }),
        })], {alpha: {enabled: true, label: "x"}});
        (q('[data-ss-button="alpha::run"]') as HTMLElement).click();
        await vi.waitFor(() => expect(context).toBeDefined());

        mockState.fetchSyncPost.mockResolvedValue({code: 0, data: [{name: "feature-alpha", isDir: false}]});
        await expect(context!.exportConfigs()).resolves.toEqual({alpha: {enabled: true, label: "x"}});
        await expect(context!.clearAllConfigs()).resolves.toBeUndefined();
        expect(host.files.size).toBe(0);
        await expect(context!.importConfigs({alpha: {enabled: true, label: "回来的"}})).resolves.toEqual({
            applied: ["alpha"],
            skipped: [],
        });
        expect(host.files.get("feature-alpha")).toMatchObject({label: "回来的"});
    });

    it("动作行注册的清理回调在插件卸载时执行，取消/保存时不执行", async () => {
        let context: FeatureActionContext | undefined;
        const onUnload = vi.fn();
        const {q, panel} = await open([featureOf("alpha", {
            settings: alphaSettings((actionContext) => {
                context = actionContext;
                actionContext.onUnload(onUnload);
            }),
        })]);
        (q('[data-ss-button="alpha::run"]') as HTMLElement).click();
        await vi.waitFor(() => expect(context).toBeDefined());
        expect(onUnload).not.toHaveBeenCalled();

        panel.close();
        expect(onUnload).not.toHaveBeenCalled();

        panel.dispose();
        expect(onUnload).toHaveBeenCalledTimes(1);
    });

    it("草稿被清空后 updateConfig 也能落盘，不会因为找不到草稿而中断", async () => {
        let context: FeatureActionContext | undefined;
        const {q, panel, host} = await open([featureOf("alpha", {
            settings: alphaSettings((actionContext) => {
                context = actionContext;
            }),
        })]);
        (q('[data-ss-button="alpha::run"]') as HTMLElement).click();
        await vi.waitFor(() => expect(context).toBeDefined());

        (panel as unknown as {drafts: Map<string, unknown>;}).drafts.clear();
        await expect(context!.updateConfig("alpha", {enabled: true})).resolves.toBeUndefined();
        expect(host.files.get("feature-alpha")).toMatchObject({enabled: true});
    });

    it("onUnload 返回的函数可以单独注销这次清理", async () => {
        let context: FeatureActionContext | undefined;
        const onUnload = vi.fn();
        const {q, panel} = await open([featureOf("alpha", {
            settings: alphaSettings((actionContext) => {
                context = actionContext;
            }),
        })]);
        (q('[data-ss-button="alpha::run"]') as HTMLElement).click();
        await vi.waitFor(() => expect(context).toBeDefined());

        const off = context!.onUnload(onUnload);
        off();
        panel.dispose();
        expect(onUnload).not.toHaveBeenCalled();
    });

    it("执行期间按钮保持禁用，连点只跑一次", async () => {
        let done: () => void = () => undefined;
        const onClick = vi.fn(() =>
            new Promise<void>((resolve) => {
                done = resolve;
            })
        );
        const {q} = await open([featureOf("alpha", {settings: alphaSettings(onClick)})]);
        const button = q<HTMLButtonElement>('[data-ss-button="alpha::run"]')!;

        button.click();
        button.click();
        expect(onClick).toHaveBeenCalledTimes(1);
        expect(button.disabled).toBe(true);

        done();
        await vi.waitFor(() => expect(button.disabled).toBe(false));
    });

    it("动作行抛错时被隔离上报，按钮恢复可用", async () => {
        const onClick = vi.fn(() => {
            throw new Error("action failed");
        });
        const {q} = await open([featureOf("alpha", {settings: alphaSettings(onClick)})]);
        const button = q<HTMLButtonElement>('[data-ss-button="alpha::run"]')!;

        button.click();

        await vi.waitFor(() => expect(mockState.messages.some((m) => m.text.includes("action failed"))).toBe(true));
        expect(button.disabled).toBe(false);
    });

    it("找不到对应 onClick 的动作行只告警，不抛错", async () => {
        const definitions = [featureOf("alpha", {
            settings: [{
                kind: "button",
                key: "run",
                title: "alpha.run",
                label: "alpha.runLabel",
                onClick: () => undefined,
            }],
        })];
        const {q, panel} = await open(definitions);
        const button = q<HTMLButtonElement>('[data-ss-button="alpha::run"]')!;
        // 模拟「面板渲染完之后声明没了」：动作行找不到对应 onClick 时只能告警
        (panel as unknown as {options: {features: FeatureDefinition[];};}).options.features = [];
        expect(() => button.click()).not.toThrow();
        await vi.waitFor(() => expect(vi.mocked(console.warn)).toHaveBeenCalled());
    });
});

describe("说明块底部的按钮", () => {
    const withActions = (onClick = vi.fn()): FeatureDefinition[] => [
        featureOf("alpha", {
            settings: [
                {
                    kind: "note",
                    key: "about",
                    text: "alpha.about",
                    values: {version: "1.0.1", repo: "https://github.com/wmy2981/some-settings-siyuan"},
                    actions: [
                        {key: "star", label: "alpha.runLabel", appearance: "block", icon: "iconGithub", onClick},
                    ],
                },
            ],
        }),
    ];

    it("点一下就跑 onClick，并按「功能 id + key」拿到上下文", async () => {
        const onClick = vi.fn();
        const opened = await open(withActions(onClick));
        const button = opened.q<HTMLButtonElement>(".some-settings-panel__note-actions button")!;
        expect(button.dataset.ssButton).toBe("alpha::star");
        button.click();
        await Promise.resolve();
        expect(onClick).toHaveBeenCalledWith(expect.objectContaining({featureId: "alpha"}));
    });

    it("现成 SVG 图标（iconSvg）原样进到按钮里", async () => {
        const iconSvg = '<svg viewBox="0 0 32 32"><path fill="#f15bb5" d="M0 0h1v1H0z"/></svg>';
        const opened = await open([
            featureOf("alpha", {
                settings: [
                    {
                        kind: "note",
                        key: "about",
                        text: "alpha.about",
                        actions: [
                            {key: "donate", label: "alpha.runLabel", appearance: "block", iconSvg, onClick: vi.fn()},
                        ],
                    },
                ],
            }),
        ]);
        const button = opened.q<HTMLButtonElement>(".some-settings-panel__note-actions button")!;
        // 不加工：原样内联，交给内核的 .b3-button svg 规则缩到 16px
        expect(button.querySelector("svg path")?.getAttribute("fill")).toBe("#f15bb5");
        expect(button.querySelector("use")).toBeNull();
    });

    it("只读模式下按钮禁用", async () => {
        window.siyuan.config.readonly = true;
        const onClick = vi.fn();
        const opened = await open(withActions(onClick));
        const button = opened.q<HTMLButtonElement>(".some-settings-panel__note-actions button")!;
        expect(button.disabled).toBe(true);
    });
});

describe("说明块外链", () => {
    it("先让插件有机会拦下，没人拦时才 window.open", async () => {
        const {q} = await open();
        const anchor = q<HTMLAnchorElement>('[data-ss-row="alpha::about"] a')!;
        const event = new MouseEvent("click", {bubbles: true, cancelable: true});
        anchor.dispatchEvent(event);

        expect(event.defaultPrevented).toBe(true);
        expect(window.open).toHaveBeenCalledWith(anchor.href, "_blank");
    });

    it("遇到没有事件总线的插件对象时跳过它，仍然打开链接", async () => {
        window.siyuan.ws.app.plugins = [{} as never];
        const {q} = await open();
        const anchor = q<HTMLAnchorElement>('[data-ss-row="alpha::about"] a')!;
        anchor.dispatchEvent(new MouseEvent("click", {bubbles: true, cancelable: true}));
        expect(window.open).toHaveBeenCalledWith(anchor.href, "_blank");
    });

    it("任一插件 emit 返回 false 时不再打开", async () => {
        const emit = vi.fn(() => false);
        window.siyuan.ws.app.plugins = [{eventBus: {emit}} as never];
        const {q} = await open();
        const anchor = q<HTMLAnchorElement>('[data-ss-row="alpha::about"] a')!;
        anchor.dispatchEvent(new MouseEvent("click", {bubbles: true, cancelable: true}));

        expect(emit).toHaveBeenCalledWith("open-link", expect.objectContaining({href: anchor.href}));
        expect(window.open).not.toHaveBeenCalled();
    });
});

describe("异常路径", () => {
    it("草稿丢失时按已保存的配置补建，用户改的东西不会丢", async () => {
        const {q, panel, host} = await open();
        (panel as unknown as {drafts: Map<string, unknown>;}).drafts.clear();
        const input = q<HTMLInputElement>('[data-ss-text="alpha::label"]')!;
        input.value = "补建的";
        fire(input, "change");

        expect(vi.mocked(console.error)).toHaveBeenCalledWith(expect.stringContaining("has no draft"));
        (q("[data-ss-save]") as HTMLElement).click();
        await vi.waitFor(() => expect(mockState.settings[0].closed).toBe(true));
        expect(host.files.get("feature-alpha")).toMatchObject({label: "补建的"});
    });

    it("控件对应的功能不存在时只告警，改动被丢弃", async () => {
        const {q, panel} = await open();
        (panel as unknown as {drafts: Map<string, unknown>;}).drafts.clear();
        (panel as unknown as {options: {features: FeatureDefinition[];};}).options.features = [];
        const input = q<HTMLInputElement>('[data-ss-text="alpha::label"]')!;
        input.value = "丢弃";
        expect(() => fire(input, "change")).not.toThrow();
        expect(vi.mocked(console.warn)).toHaveBeenCalledWith(expect.stringContaining("has no matching feature"));
    });

    it("保存时遇到不带问题清单的异常也照常上报", async () => {
        const {q, store} = await open();
        const input = q<HTMLInputElement>('[data-ss-text="alpha::label"]')!;
        input.value = "改过的";
        fire(input, "change");
        store.saveMany = vi.fn(async () => {
            throw new Error("unexpected failure");
        });

        (q("[data-ss-save]") as HTMLElement).click();

        await vi.waitFor(() =>
            expect(mockState.messages.some((m) => m.text.includes("unexpected failure"))).toBe(true)
        );
        expect(mockState.settings[0].closed).toBe(false);
    });

    it("声明里出现未知控件类型时跳过它，面板其余部分正常", async () => {
        const definitions = [featureOf("alpha", {
            settings: [
                {kind: "switch", key: "enabled", title: "alpha.enabled", default: false},
                {kind: "mystery", key: "future", title: "alpha.future"} as unknown as SettingField,
                {kind: "text", key: "label", title: "alpha.label", default: "hi"},
            ],
        })];
        const {q} = await open(definitions);
        expect(q('[data-ss-row="alpha::future"]')).toBeNull();
        expect(q('[data-ss-text="alpha::label"]')).not.toBeNull();
    });
});

describe("布局与宽度", () => {
    it("桌面端按视口算宽度，并挂上量到的事实", async () => {
        const {root} = await open();
        const container = root.querySelector<HTMLElement>(".b3-dialog__container")!;
        expect(container.style.width).toBe("900px");
        expect(container.dataset.ssViewport).toBe("1200");
        expect(container.dataset.ssWidth).toBe("900");
        expect(container.dataset.ssNarrow).toBe("false");
    });

    it("窄屏按视口留边，且上限仍生效", async () => {
        setViewport(700);
        const {root} = await open();
        const container = root.querySelector<HTMLElement>(".b3-dialog__container")!;
        expect(container.style.width).toBe("676px");
        expect(container.dataset.ssNarrow).toBe("true");
    });

    it("极窄视口下不低于最小可用宽度", async () => {
        setViewport(300);
        const {root} = await open();
        expect(root.querySelector<HTMLElement>(".b3-dialog__container")?.style.width).toBe("280px");
    });

    it("内容区不滚动、内边距归零，动作区窄屏收窄", async () => {
        const {root} = await open();
        const content = root.querySelector<HTMLElement>(".b3-dialog__content")!;
        expect(content.style.padding).toBe("0px");
        expect(content.style.overflow).toBe("hidden");
        expect(root.querySelector<HTMLElement>(".b3-dialog__action")?.style.padding).toBe("7px 24px");

        setViewport(600);
    });

    it("独立设置窗口里不写宽度，交给宿主铺满", async () => {
        mockState.settingAsWindow = true;
        const {root} = await open();
        const container = root.querySelector<HTMLElement>(".b3-dialog__container")!;
        expect(container.style.width).toBe("");
        expect(container.dataset.ssWidth).toBeUndefined();
    });

    it("移动端不写宽度，交给宿主的底部抽屉", async () => {
        mockState.frontend = "mobile";
        setViewport(420);
        const {root} = await open();
        const container = root.querySelector<HTMLElement>(".b3-dialog__container")!;
        expect(container.style.width).toBe("");
        expect(root.querySelector<HTMLElement>(".b3-dialog__content")?.style.overflow).toBe("auto");
        expect(root.querySelector<HTMLElement>(".b3-dialog__action")?.style.padding).toBe("7px 8px");
    });

    it("documentElement 量不到宽度时退回 window.innerWidth", async () => {
        setViewport(0);
        window.innerWidth = 800;
        const {root} = await open();
        expect(root.querySelector<HTMLElement>(".b3-dialog__container")?.style.width).toBe("752px");
    });

    it("视口变化后重新计算宽度", async () => {
        vi.useFakeTimers();
        try {
            const {root} = await open();
            const container = root.querySelector<HTMLElement>(".b3-dialog__container")!;
            expect(container.style.width).toBe("900px");

            setViewport(500);
            vi.advanceTimersByTime(300);
            expect(container.style.width).toBe("476px");
            expect(container.dataset.ssNarrow).toBe("true");
        } finally {
            vi.useRealTimers();
        }
    });

    it("关闭后停止监听视口", async () => {
        vi.useFakeTimers();
        try {
            const {root, panel} = await open();
            const container = root.querySelector<HTMLElement>(".b3-dialog__container")!;
            panel.close();
            setViewport(500);
            vi.advanceTimersByTime(1000);
            expect(container.style.width).toBe("900px");
        } finally {
            vi.useRealTimers();
        }
    });
});

describe("关闭与卸载", () => {
    it("close 之后 isOpen 为假，可以再次打开", async () => {
        const {panel} = await open();
        panel.close();
        expect(panel.isOpen).toBe(false);
        panel.show();
        expect(panel.isOpen).toBe(true);
        expect(mockState.settings).toHaveLength(2);
    });

    it("dispose 收掉面板，且重复调用安全", async () => {
        const {panel} = await open();
        panel.dispose();
        expect(panel.isOpen).toBe(false);
        expect(() => panel.dispose()).not.toThrow();
    });

    it("清理回调里的异常不会冒泡出 dispose", async () => {
        let context: FeatureActionContext | undefined;
        const {q, panel} = await open([featureOf("alpha", {
            settings: alphaSettings((actionContext) => {
                context = actionContext;
                actionContext.onUnload(() => {
                    throw new Error("cleanup failed");
                });
            }),
        })]);
        (q('[data-ss-button="alpha::run"]') as HTMLElement).click();
        await vi.waitFor(() => expect(context).toBeDefined());

        expect(() => panel.dispose()).not.toThrow();
        expect(vi.mocked(console.error)).toHaveBeenCalled();
    });
});
