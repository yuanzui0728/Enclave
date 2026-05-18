import { msg } from "@lingui/macro";
import type { FeedChannelHomeSection } from "@yinjie/contracts";
import type { useRuntimeTranslator } from "@yinjie/i18n";

// 视频号每张 slide 左上角的胶囊标签——按当前 section 显示，对齐移动端 / 桌面端两套 UI。
export function getChannelsSectionBadge(
  section: FeedChannelHomeSection,
  t: ReturnType<typeof useRuntimeTranslator>,
) {
  switch (section) {
    case "friends":
      return t(msg`朋友视频号`);
    case "following":
      return t(msg`关注视频号`);
    case "live":
      return t(msg`视频号直播`);
    case "recommended":
    default:
      return t(msg`视频号推荐`);
  }
}

// 视频号每个 tab 在 posts 为空时的空状态文案——通用 "暂时没有可看的内容" 太
// 笼统，看不出"为什么空"。按 section 给具体原因 + 引导。
export function getChannelsEmptyState(
  section: FeedChannelHomeSection,
  t: ReturnType<typeof useRuntimeTranslator>,
) {
  switch (section) {
    case "friends":
      return {
        title: t(msg`朋友们还没有发视频号`),
        description: t(msg`等几位朋友发新视频号后，这里就有内容了。`),
      };
    case "following":
      return {
        title: t(msg`你还没有关注的视频号作者`),
        description: t(msg`先去推荐流里点 +关注 喜欢的作者，他们发新内容就会出现在这里。`),
      };
    case "live":
      return {
        title: t(msg`现在没有正在直播的内容`),
        description: t(msg`等有人开播或者剪出直播回放，这里会自动更新。`),
      };
    case "recommended":
    default:
      return {
        title: t(msg`视频号还没有内容`),
        description: t(msg`点右上的「换一批」生成一条新内容，或等角色自动发布。`),
      };
  }
}
