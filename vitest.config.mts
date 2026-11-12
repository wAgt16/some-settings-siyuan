/**
 * 单元测试配置。
 *
 * 只跑 `src/core/` 的机制层：功能（`src/features/`）不在这里测。
 * `siyuan` 是宿主的运行时包，npm 上那份只有类型声明，所以统一替换成
 * `tests/mocks/siyuan.ts` 里的替身——所有测试通过它驱动宿主行为
 * （前端类型、内核响应、Setting 对话框、confirm 结果）。
 */
import {fileURLToPath} from "node:url";
import {defineConfig} from "vitest/config";

const pathOf = (relative: string): string => fileURLToPath(new URL(relative, import.meta.url));

export default defineConfig({
    resolve: {
        alias: {
            siyuan: pathOf("./tests/mocks/siyuan.ts"),
        },
    },
    test: {
        environment: "jsdom",
        include: ["tests/**/*.test.ts"],
        setupFiles: [pathOf("./tests/setup.ts")],
        restoreMocks: true,
        coverage: {
            provider: "v8",
            // 机制层与功能层都要算：功能是自己一个目录一个实现，漏测哪块一眼就能看出来
            include: ["src/core/**/*.ts", "src/features/**/*.ts"],
            reporter: ["text", "text-summary"],
        },
    },
});
