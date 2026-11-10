/**
 * 测试公共环境。
 *
 * 每个测试前把 DOM、`window.siyuan`（宿主注入的全局配置）和宿主替身的状态复位，
 * 让测试之间互不影响；同时把 `console` 的噪声压掉，只在断言里显式观察。
 */
import {
    afterEach,
    beforeEach,
    vi,
} from "vitest";
import {resetMockState} from "./mocks/siyuan";

/** 宿主注入 `window.siyuan` 的最小形状：核心用到的字段都在这里。 */
const baseSiyuan = () => ({
    config: {
        readonly: false,
        system: {
            kernelVersion: "3.8.7",
            container: "",
        },
    },
    isPublish: false,
    languages: {
        cancel: "Cancel",
        save: "Save",
    },
    ws: {
        app: {
            plugins: [] as unknown[],
        },
    },
});

beforeEach(() => {
    document.head.innerHTML = "";
    document.body.innerHTML = "";
    window.siyuan = baseSiyuan() as unknown as typeof window.siyuan;
    window.open = vi.fn() as unknown as typeof window.open;
    resetMockState();
    // 被隔离的错误路径会打一堆日志，测试里只关心断言，不关心控制台的噪声
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
    vi.restoreAllMocks();
});
