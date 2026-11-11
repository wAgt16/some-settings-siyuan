import {
    describe,
    expect,
    it,
} from "vitest";
import type {FeatureHost} from "../../src/core/types";
import {mountHideBazaarDownloadedDonate} from "../../src/features/hide-bazaar-downloaded-donate/style";

describe("隐藏集市已下载列表的捐赠按钮", () => {
    it("注入只覆盖两种捐赠按钮的已下载卡片样式", () => {
        let css = "";
        const host = {addStyle: (value: string) => css = value} as unknown as FeatureHost;

        expect(mountHideBazaarDownloadedDonate(host)).toEqual({});
        expect(css).toContain("#configBazaarDownloaded > .b3-card > .b3-card__actions");
        expect(css).toContain('a.block__icon[target="_blank"][href]');
        expect(css).toContain('span.block__icon[data-type="copy-funding"]');
        expect(css).toContain("display: none");
        expect(css).not.toContain(":has(");
        expect(css).not.toContain("#configBazaarReadme");
    });
});
