/**
 * `core/error.ts`：错误隔离与上报。
 *
 * 这里的约定是「任何功能的异常都不许冒泡」，所以每个入口都要同时验证
 * 「异常被吞掉」与「用户/控制台确实看得见」两件事。
 */
import {
    describe,
    expect,
    it,
    vi,
} from "vitest";
import {
    guard,
    guardAsync,
    guardSilent,
    logInfo,
    logWarn,
    reportError,
} from "../../src/core/error";
import {mockState} from "../mocks/siyuan";

const PREFIX = "[some-settings-siyuan]";

describe("logInfo / logWarn", () => {
    it("带统一前缀", () => {
        logInfo("loaded", 3);
        logWarn("skipped");
        expect(vi.mocked(console.log)).toHaveBeenCalledWith(PREFIX, "loaded", 3);
        expect(vi.mocked(console.warn)).toHaveBeenCalledWith(PREFIX, "skipped");
    });
});

describe("reportError", () => {
    it("记录到控制台并提示用户", () => {
        const error = new Error("boom");
        reportError("feature.mount", error);
        expect(vi.mocked(console.error)).toHaveBeenCalledWith(`${PREFIX} [feature.mount]`, error);
        expect(mockState.messages).toEqual([
            {text: `${PREFIX} [feature.mount] boom`, timeout: 6000, type: "error"},
        ]);
    });

    it("非 Error 的值按字符串上报", () => {
        reportError("feature.mount", "plain text");
        expect(mockState.messages[0].text).toBe(`${PREFIX} [feature.mount] plain text`);
    });

    it("通知失败时不再抛错", () => {
        mockState.showMessageError = new Error("no toast");
        expect(() => reportError("feature.mount", new Error("boom"))).not.toThrow();
        expect(vi.mocked(console.error)).toHaveBeenCalled();
    });

    it("notifyUser 为 false 时只记日志", () => {
        reportError("onunload", new Error("boom"), false);
        expect(vi.mocked(console.error)).toHaveBeenCalled();
        expect(mockState.messages).toHaveLength(0);
    });
});

describe("guard", () => {
    it("成功返回 true", () => {
        expect(guard("scope", () => undefined)).toBe(true);
        expect(mockState.messages).toHaveLength(0);
    });

    it("异常被隔离，返回 false 并上报", () => {
        const error = new Error("bad");
        expect(guard("scope", () => {
            throw error;
        })).toBe(false);
        expect(vi.mocked(console.error)).toHaveBeenCalledWith(`${PREFIX} [scope]`, error);
        expect(mockState.messages).toHaveLength(1);
    });

    it("notifyUser 为 false 时不提示", () => {
        expect(guard("scope", () => {
            throw new Error("bad");
        }, false)).toBe(false);
        expect(mockState.messages).toHaveLength(0);
    });
});

describe("guardAsync", () => {
    it("成功后不产生任何上报", async () => {
        const action = vi.fn(async () => undefined);
        await guardAsync("scope", action);
        expect(action).toHaveBeenCalledTimes(1);
        expect(vi.mocked(console.error)).not.toHaveBeenCalled();
    });

    it("异步异常被吞掉并上报", async () => {
        const error = new Error("rejected");
        await expect(guardAsync("scope", async () => {
            throw error;
        })).resolves.toBeUndefined();
        expect(vi.mocked(console.error)).toHaveBeenCalledWith(`${PREFIX} [scope]`, error);
        expect(mockState.messages[0].text).toContain("rejected");
    });

    it("notifyUser 为 false 时只记日志", async () => {
        await guardAsync("scope", async () => {
            throw new Error("rejected");
        }, false);
        expect(mockState.messages).toHaveLength(0);
    });
});

describe("guardSilent", () => {
    it("成功时不留下任何记录", () => {
        guardSilent("scope", () => undefined);
        expect(vi.mocked(console.error)).not.toHaveBeenCalled();
    });

    it("失败时只记日志，既不提示也不抛错", () => {
        const error = new Error("cleanup failed");
        expect(() =>
            guardSilent("scope", () => {
                throw error;
            })
        ).not.toThrow();
        expect(vi.mocked(console.error)).toHaveBeenCalledWith(`${PREFIX} [scope] cleanup failed`, error);
        expect(mockState.messages).toHaveLength(0);
    });
});
