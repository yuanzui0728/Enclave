export const MOBILE_EXPLORE_HOME_PATH = "/tabs/world";
export const DESKTOP_EXPLORE_HOME_PATH = "/tabs/discover";

// 世界改造后 /tabs/discover 退出移动底栏（成桌面发现工作台首屏），探索入口全部迁到
// /tabs/world。探索子页返回时的「家」要按布局解析：移动端回世界，桌面端回发现工作台。
// 历史上这些页硬编码 /tabs/discover 当兜底/期望上一页，移动端从世界进来再返回会被丢回
// 已不在底栏的孤儿发现页——统一改走这个 helper。
export function resolveExploreHomePath(isDesktopLayout: boolean) {
  return isDesktopLayout ? DESKTOP_EXPLORE_HOME_PATH : MOBILE_EXPLORE_HOME_PATH;
}
