import { msg } from "@lingui/macro";
import type { MessageDescriptor } from "@lingui/core";

// 把后端 FriendRequest.triggerScene 翻成 UI 文案的唯一入口。
// 后端实际写入的 scene id 见 api/src/modules/{social,need-discovery,followup-runtime,shake-discovery}：
//   - 16 个 WeChat 同款场景（coffee_shop / gym / library / park / classroom /
//     lab / office / coworking / study_room / restaurant / museum / bookstore /
//     travel / night_walk / theater / home）
//   - cafe（reply-logic 里和 coffee_shop 并列出现的别名）
//   - shake、shake_keep（shake-discovery）
//   - manual_add（用户主动添加且 autoAccept=true 时写入）
//   - need_discovery_daily / need_discovery_short_interval（need-discovery 写入）
//   - followup_runtime（followup-runtime 写入）
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
