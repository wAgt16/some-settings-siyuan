/**
 * modal 高斯模糊的实现：只注入一段 CSS。
 *
 * 生成 CSS 时永远返回非空文本（哪怕只有注释）：`core/style.ts` 的 `addStyle`
 * 收到空串会直接返回，旧样式表不会被清掉，于是"把半径调到最小"看起来没生效。
 */
import type {
    FeatureHost,
    FeatureInstance,
} from "../../core/types";

const DEFAULT_RADIUS = 10;

const radiusOf = (host: FeatureHost): number => {
    const value = Number(host.config.radius);
    return Number.isFinite(value) && value > 0 ? value : DEFAULT_RADIUS;
};

const buildCss = (radius: number): string =>
    `/* modal 高斯模糊：只作用在遮罩层，弹窗自身不受影响。
   进度遮罩（导入 / 重建索引 / 退出等待）是宿主的，它自己写了毛玻璃与底色；
   这里连它一起匹配就会顶掉宿主那份（同特异性下后注入的规则赢），所以直接排除。
   注意不能用 backdrop-filter: revert 补救 —— revert 回滚到的是浏览器默认值，不是宿主那条规则 */
.b3-dialog__scrim:not(.b3-dialog__scrim--progress) {
    -webkit-backdrop-filter: blur(${radius}px);
    backdrop-filter: blur(${radius}px);
}

/* 属性视图面板复用了同一个遮罩类名，但它不是 modal，不能被糊上 */
.av__panel > .b3-dialog__scrim {
    -webkit-backdrop-filter: none;
    backdrop-filter: none;
}

/* 非模态浮层（emoji / 图标选择面板、发布权限浮层）由内核把遮罩写成内联的
   透明底色：它只是用来接"点外面关掉"的，糊上去会把背后的正文一起糊掉 */
.b3-dialog__scrim[style*="transparent"] {
    -webkit-backdrop-filter: none;
    backdrop-filter: none;
}

/* 移动端底部弹层（mobile-bottom-sheet-dialog 加在 Dialog 最外层）自己把遮罩设成透明，
   它只接"拖动下滑关闭"，糊上去就是整页正文被模糊。按类名一次性排除，不逐个列 data-key：
   用它的地方（emoji、属性面板、反链、引用、行背景、位置编辑、数据库新建项……）还会增加。
   桌面端的 emoji 面板不是底部弹层，它的遮罩是内联透明，由上一条规则排除 */
.mobile-bottom-sheet-dialog .b3-dialog__scrim {
    -webkit-backdrop-filter: none;
    backdrop-filter: none;
}
`;

export const mountModalBlur = (host: FeatureHost): FeatureInstance => {
    const apply = () => {
        host.addStyle(buildCss(radiusOf(host)));
    };

    apply();
    host.onConfigChange(apply);

    return {};
};
