import { msg } from "@lingui/macro";
import type { MessageDescriptor } from "@lingui/core";

// 把后端 FriendRequest.triggerScene **以及** Friendship.source 翻成 UI 文案的
// 唯一入口（两个字段共用同一套词表，详见 api/src/modules/social/social.service.ts
// activateFriendship 的注释）。后端实际写入的 id 见
// api/src/modules/{social,need-discovery,followup-runtime,shake-discovery,characters,admin/wechat-sync-admin}：
//   - 16 个 WeChat 同款场景（coffee_shop / gym / library / park / classroom /
//     lab / office / coworking / study_room / restaurant / museum / bookstore /
//     travel / night_walk / theater / home）
//   - cafe（reply-logic 里和 coffee_shop 并列出现的别名）
//   - shake、shake_keep（shake-discovery）
//   - manual_add（用户主动添加且 autoAccept=true 时写入）
//   - need_discovery_daily / need_discovery_short_interval（need-discovery 写入）
//   - followup_runtime（followup-runtime 写入）
//   - default_seed（ensureDefaultFriendships 创建的 界闻 / 小盯）
//   - private_import（characters.service.ts 用户导入角色）
//   - contact_import（admin/wechat-sync-admin.service.ts 微信通讯录同步）
// 未知 id 一律降级到「来自相遇」，绝不把原始英文 id 直出给用户。
// 不用「新的朋友」，那是页面标题；放在 row 内当来源 label 看起来像同义重复，
// 用户读到时本能会反问"难道有不是新的朋友的好友请求？"。
export function getFriendRequestSourceLabel(
  triggerScene?: string | null,
): MessageDescriptor {
  const scene = triggerScene?.trim();
  if (!scene) {
    return msg`来自相遇`;
  }

  switch (scene) {
    case "shake":
    case "shake_keep":
      return msg`来自摇一摇`;
    case "manual_add":
      return msg`来自搜索添加`;
    case "need_discovery_daily":
    case "need_discovery_short_interval":
      return msg`来自智能推荐`;
    case "followup_runtime":
      return msg`来自智能跟进`;
    case "default_seed":
      return msg`隐界初始好友`;
    case "private_import":
      return msg`来自导入角色`;
    case "contact_import":
      return msg`来自通讯录导入`;
    case "coffee_shop":
    case "cafe":
      return msg`来自咖啡馆`;
    case "gym":
      return msg`来自健身房`;
    case "library":
      return msg`来自图书馆`;
    case "park":
      return msg`来自公园`;
    case "classroom":
      return msg`来自教室`;
    case "lab":
      return msg`来自实验室`;
    case "office":
      return msg`来自办公室`;
    case "coworking":
      return msg`来自联合办公空间`;
    case "study_room":
      return msg`来自自习室`;
    case "restaurant":
      return msg`来自餐厅`;
    case "museum":
      return msg`来自博物馆`;
    case "bookstore":
      return msg`来自书店`;
    case "travel":
      return msg`来自旅途`;
    case "night_walk":
      return msg`来自夜晚的街道`;
    case "theater":
      return msg`来自剧场`;
    case "home":
      return msg`来自居家场景`;
    default:
      return msg`来自相遇`;
  }
}

// Alias：character-detail-page / desktop friend popover 等读 `friendship.source`
// 的 surface 用这个名字读起来更顺。实现完全一致——后端两个字段同源、UI 同义。
export const getFriendshipSourceLabel = getFriendRequestSourceLabel;

// 受控词表外的 source 值（来自 wechat-sync 的 admin 自填字段，如「同事」「前同事」
// 「朋友介绍」）。switch 没匹配会落到 default 「来自相遇」分支——靠这个集合提前
// 识别出"这条命中了已知 id"，让 resolveFriendshipSourceText 知道未知 id 该走
// raw-text 兜底而不是 fallback 文案。
const KNOWN_FRIENDSHIP_SOURCE_IDS = new Set<string>([
  "shake",
  "shake_keep",
  "manual_add",
  "need_discovery_daily",
  "need_discovery_short_interval",
  "followup_runtime",
  "default_seed",
  "private_import",
  "contact_import",
  "coffee_shop",
  "cafe",
  "gym",
  "library",
  "park",
  "classroom",
  "lab",
  "office",
  "coworking",
  "study_room",
  "restaurant",
  "museum",
  "bookstore",
  "travel",
  "night_walk",
  "theater",
  "home",
]);

/**
 * Friendship.source 的最终展示文案：受控 id 走 i18n 翻译，自由文本（admin 在
 * wechat-sync 时手输的「同事」/「朋友介绍」之类）原样回显，避免被 fallback 吞掉。
 * 4 个移动/桌面 surface（character-detail-page、contact-detail-pane、
 * desktop-add-friend-result-card、desktop-message-avatar-popover）统一用这一个
 * 入口，不要直接 t(getFriendshipSourceLabel(...))。
 *
 * @param translate `useRuntimeTranslator()` 返回的 `(MessageDescriptor) => string`。
 */
export function resolveFriendshipSourceText(
  translate: (message: MessageDescriptor) => string,
  source: string | null | undefined,
): string {
  const raw = source?.trim();
  if (!raw) return translate(msg`来自相遇`);
  if (KNOWN_FRIENDSHIP_SOURCE_IDS.has(raw)) {
    return translate(getFriendshipSourceLabel(raw));
  }
  return raw;
}
