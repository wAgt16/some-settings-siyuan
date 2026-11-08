/**
 * 移动端文档树标题字号的实现：一段 CSS。
 *
 * 3.8.10 起内核把移动端侧栏列表（文档树、大纲、书签等）的字号从 14px 提到了 16px，
 * 同样的屏宽下能读完的标题短了一大截。这里只把那一条字号改回 3.8.9 的比例，
 * 内核自己那套大小（图标、箭头、计数器）一个字都不动 —— 它们两版之间没有变化。
 *
 * 字号按思源自己的「字体大小」设置等比缩放：3.8.9 的 14px 是思源默认字号 16px 的 0.875，
 * 用户把字号调大时标题跟着长，而不是被钉死在 14px 上。
 *
 * 选择器比内核多一个 `body`：内核那条是 `#sidebar .b3-list--mobile .b3-list-item`，
 * 两者 id 与类名数量相同，多出来的元素选择器才让它不以样式表先后顺序取胜。
 */
import type {
    FeatureHost,
    FeatureInstance,
} from "../../core/types";

/** 3.8.9 的 14px 相对思源默认字号 16px 的比例。 */
const RATIO = 14 / 16;

const CSS = `/* 移动端文档树 / 侧栏列表的标题字号回到 3.8.9：
   内核给的是固定 16px，这里按思源字号设置等比缩回 0.875（默认 16px 即 14px）。 */
body #sidebar .b3-list--mobile .b3-list-item,
body #sidebarRight .b3-list--mobile .b3-list-item {
    font-size: calc(var(--b3-font-size-editor, 16px) * ${RATIO});
}
`;

export const mountMobileDocTreeTitleSize = (host: FeatureHost): FeatureInstance => {
    host.addStyle(CSS);
    return {};
};
