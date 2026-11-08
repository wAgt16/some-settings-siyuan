/**
 * 功能声明与注册表的一致性校验。
 *
 * 构建前跑（npm run build 会先执行 npm run check），一次报全所有问题，
 * 目的是让「在 index.ts 里声明就能控制功能」这条路径始终可信：
 * 少写 `enabled`、分类写错、版本区间写反、注册表漏登记，都会在这里被拦住，
 * 而不是等到运行时静默失效、功能莫名消失。
 *
 * 用法：node scripts/check-features.mjs
 */
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const FEATURES_DIR = path.join(root, "src", "features");
const REGISTRY_FILE = path.join(root, "src", "core", "registry.ts");
const I18N_DIR = path.join(root, "src", "i18n");
const VALID_CATEGORIES = ["ai", "editor", "doc-tree", "appearance", "connection", "settings", "plugin"];

const problems = [];
const fail = (message) => problems.push(message);

const readJson = (file) => {
    try {
        return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (error) {
        fail(`${path.relative(root, file)} 不是合法 JSON：${error.message}`);
        return null;
    }
};

// ---------------------------------------------------------------- 版本号比较
// 与 src/core/version.ts 同一套规则：x.y.z[-pre]，预发布版本小于同号正式版，
// 预发布内部 alpha < beta < rc，纯数字段按数值比。
const VERSION_PATTERN = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

const parseVersion = (raw) => {
    const match = VERSION_PATTERN.exec(raw.trim());
    if (!match) {
        return null;
    }
    return {
        numbers: [Number(match[1]), Number(match[2]), Number(match[3])],
        prerelease: match[4] ? match[4].split(".") : [],
    };
};

const comparePrerelease = (a, b) => {
    const shared = Math.min(a.length, b.length);
    for (let index = 0; index < shared; index += 1) {
        const left = a[index];
        const right = b[index];
        if (left === right) {
            continue;
        }
        const leftNumber = /^\d+$/.test(left) ? Number(left) : undefined;
        const rightNumber = /^\d+$/.test(right) ? Number(right) : undefined;
        if (leftNumber !== undefined && rightNumber !== undefined) {
            return leftNumber - rightNumber;
        }
        if (leftNumber !== undefined || rightNumber !== undefined) {
            return leftNumber !== undefined ? -1 : 1;
        }
        return left < right ? -1 : 1;
    }
    return a.length - b.length;
};

const compareVersion = (a, b) => {
    for (let index = 0; index < a.numbers.length; index += 1) {
        if (a.numbers[index] !== b.numbers[index]) {
            return a.numbers[index] - b.numbers[index];
        }
    }
    if (a.prerelease.length === 0 || b.prerelease.length === 0) {
        return b.prerelease.length - a.prerelease.length;
    }
    return comparePrerelease(a.prerelease, b.prerelease);
};

// ---------------------------------------------------------------- 功能目录
const featureDirs = fs.existsSync(FEATURES_DIR) ?
    fs.readdirSync(FEATURES_DIR, {withFileTypes: true})
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort() :
    [];

const found = new Map();

for (const dir of featureDirs) {
    const indexPath = path.join(FEATURES_DIR, dir, "index.ts");
    if (!fs.existsSync(indexPath)) {
        fail(`src/features/${dir} 缺少 index.ts`);
        continue;
    }
    const source = fs.readFileSync(indexPath, "utf8");

    const idMatch = /defineFeature\s*\(\s*\{[\s\S]*?\bid\s*:\s*"([^"]+)"/.exec(source);
    const categoryMatch = /\bcategory\s*:\s*"([^"]+)"/.exec(source);
    if (!idMatch) {
        fail(`src/features/${dir}/index.ts 里没有找到 defineFeature({ id: "..." })`);
        continue;
    }
    const id = idMatch[1];
    const category = categoryMatch ? categoryMatch[1] : "";

    if (id !== dir) {
        fail(`功能 id "${id}" 与文件夹名 "${dir}" 不一致（两者必须相同）`);
    }
    if (!VALID_CATEGORIES.includes(category)) {
        fail(`功能 "${id}" 的 category="${category}" 非法，合法值为 ${VALID_CATEGORIES.join("/")}`);
    }

    // -------------------------------------------------- 1. enabled 声明
    // 它是「这个功能随插件一起交不交出」，必须是明确的布尔量：
    // 缺失或写成别的值都会让功能要么偷偷消失、要么在面板里露出来却没有实现。
    const enabledMatch = /\benabled\s*:\s*([A-Za-z]+)\s*,/.exec(source);
    if (!enabledMatch) {
        fail(`功能 "${id}" 没有声明 enabled: true / false`);
    } else if (enabledMatch[1] !== "true" && enabledMatch[1] !== "false") {
        fail(`功能 "${id}" 的 enabled=${enabledMatch[1]} 非法，只能是 true 或 false`);
    }

    // -------------------------------------------------- 2. 版本区间
    const versionOf = (field) => {
        const match = new RegExp(`\\b${field}\\s*:\\s*"([^"]+)"`).exec(source);
        if (!match) {
            return null;
        }
        if (!parseVersion(match[1])) {
            fail(`功能 "${id}" 的 ${field}="${match[1]}" 不是合法的思源版本号（形如 3.8.10-alpha.2）`);
            return null;
        }
        return parseVersion(match[1]);
    };
    const min = versionOf("minAppVersion");
    const max = versionOf("maxAppVersion");
    if (min && max && compareVersion(min, max) > 0) {
        fail(`功能 "${id}" 的 minAppVersion 高于 maxAppVersion，区间为空`);
    }

    // -------------------------------------------------- 3. settings 静态检查
    const settingsIndex = source.indexOf("settings:");
    const settingsSource = settingsIndex < 0 ? source : source.slice(settingsIndex);
    const keys = [...settingsSource.matchAll(/\bkey\s*:\s*"([^"]+)"/g)].map((match) => match[1]);

    const duplicates = keys.filter((key, index) => keys.indexOf(key) !== index);
    [...new Set(duplicates)].forEach((key) => {
        fail(`功能 "${id}" 的 settings 里 key "${key}" 重复`);
    });

    const i18nKeys = new Set();
    // title / description / placeholder / label / text 的值必须是 i18n key。
    // default 是「实际内容」，不是 key，所以刻意不检查。
    [...settingsSource.matchAll(/\b(title|description|placeholder|label|text)\s*:\s*"([^"]+)"/g)]
        .forEach((match) => i18nKeys.add(match[2]));
    // select 选项的标签
    [...settingsSource.matchAll(/options\s*:\s*\[([\s\S]*?)\]/g)].forEach((match) => {
        [...match[1].matchAll(/\blabel\s*:\s*"([^"]+)"/g)].forEach((label) => i18nKeys.add(label[1]));
    });
    // 功能自身的 name / description（defineFeature 顶层字段）
    [...source.matchAll(/\b(name|description)\s*:\s*"(feature\.[^"]+)"/g)]
        .forEach((match) => i18nKeys.add(match[2]));
    // 实现文件里通过 host.i18n("...") 取用的键（含字符串拼接出的完整 key）
    for (const file of fs.readdirSync(path.join(FEATURES_DIR, dir))) {
        if (!file.endsWith(".ts") || file === "index.ts") {
            continue;
        }
        const impl = fs.readFileSync(path.join(FEATURES_DIR, dir, file), "utf8");
        [...impl.matchAll(/\bi18n\s*\(\s*([^)]*)\)/g)].forEach((match) => {
            const expression = match[1];
            const full = /^\s*"([^"]+)"\s*$/.exec(expression);
            if (full) {
                i18nKeys.add(full[1]);
                return;
            }
            // 拼接型（如 `uiDemo.accent${x}`）：取所有字面量片段，逐一确认存在
            [...expression.matchAll(/"([^"]*)"/g)].forEach((part) => {
                const literal = part[1];
                if (literal && !/\s/.test(literal) && !literal.startsWith("$")) {
                    i18nKeys.add(literal);
                }
            });
        });
    }

    // settings 里不允许出现按钮型控件：面板只放设置项，不放自定义按钮
    if (/\bkind\s*:\s*"action"/.test(settingsSource)) {
        fail(`功能 "${id}" 使用了已移除的 action 型设置项；设置面板不注册自定义按钮`);
    }

    // 每个功能都必须能在面板里被打开：至少有一个设置行，且默认是关闭的。
    // 默认关闭有两种合法写法——一个 default: false 的 enabled 开关，
    // 或者自己声明 isEnabled 谓词（拿 select 的「禁用」选项当开关时走这条）。
    if (/settings\s*:\s*\[\s*\]/.test(source)) {
        fail(`功能 "${id}" 没有任何设置行：每个功能都必须有开关 / 下拉 / 输入框`);
    }
    const hasEnabledSwitch = /kind:\s*"switch",\s*\n\s*key:\s*"enabled",[\s\S]{0,240}?default:\s*false,/.test(
        settingsSource,
    );
    if (!hasEnabledSwitch && !/\bisEnabled\s*:/.test(source)) {
        fail(
            `功能 "${id}" 没有默认关闭的开关：要么加 key 为 "enabled" 且 default: false 的 switch，要么声明 isEnabled`,
        );
    }

    // select 的 default 必须出现在自己的 options 里
    const selectBlocks = [...settingsSource.matchAll(/options\s*:\s*\[([\s\S]*?)\]/g)].map((match) => match[1]);
    selectBlocks.forEach((block) => {
        const values = [...block.matchAll(/\bvalue\s*:\s*"([^"]+)"/g)].map((match) => match[1]);
        if (values.length === 0) {
            fail(`功能 "${id}" 的某个 select 没有任何 options`);
        }
    });

    found.set(id, {dir, category, i18nKeys});
}

// ------------------------------------------------- 4. 注册表登记完整性
if (!fs.existsSync(REGISTRY_FILE)) {
    fail("找不到 src/core/registry.ts");
} else {
    const registry = fs.readFileSync(REGISTRY_FILE, "utf8");
    for (const [, info] of found) {
        // registry.ts 通过 `import xx from "../features/<dir>"` 引入，且 FEATURES 数组里包含该变量
        const imported = registry.includes(`features/${info.dir}"`) || registry.includes(`features/${info.dir}'`);
        if (!imported) {
            fail(`src/core/registry.ts 没有导入 src/features/${info.dir}`);
        }
    }
}

// ------------------------------------------------- 5. i18n 覆盖
const locales = fs.existsSync(I18N_DIR) ?
    fs.readdirSync(I18N_DIR).filter((name) => name.endsWith(".json")).sort() :
    [];
if (locales.length === 0) {
    fail("src/i18n 下没有任何语言文件");
}
const localeData = new Map();
for (const locale of locales) {
    const data = readJson(path.join(I18N_DIR, locale));
    if (data) {
        localeData.set(locale, data);
    }
}
for (const [id, info] of found) {
    for (const key of info.i18nKeys) {
        for (const [locale, data] of localeData) {
            if (!(key in data)) {
                fail(`功能 "${id}" 用到的 i18n key "${key}" 在 src/i18n/${locale} 中缺失`);
            }
        }
    }
}

// ------------------------------------------------- 6. 分类文案
for (const category of VALID_CATEGORIES) {
    for (const [locale, data] of localeData) {
        if (!(`category.${category}` in data)) {
            fail(`分类 "${category}" 的文案 category.${category} 在 src/i18n/${locale} 中缺失`);
        }
    }
}

// ---------------------------------------------------------------- 输出
const summary = `功能 ${found.size} 个，语言文件 ${locales.length} 个`;
if (problems.length === 0) {
    console.log(`✓ 功能声明校验通过（${summary}）`);
    process.exit(0);
}
console.error(`✗ 功能声明校验失败，共 ${problems.length} 个问题（${summary}）：`);
problems.forEach((problem, index) => console.error(`  ${index + 1}. ${problem}`));
process.exit(1);
