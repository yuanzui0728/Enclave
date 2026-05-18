import { msg } from "@lingui/macro";
import type {
  Moment,
  MomentContentType,
  MomentMediaAsset,
} from "@yinjie/contracts";
import { translateRuntimeMessage } from "@yinjie/i18n";

const t = translateRuntimeMessage;

// 偶尔 LLM 会把本该走 tool-call 通道的 web_search/code_interpreter 等调用
// 当成普通正文发出来，下游把它原样存成 moment.text / comment.text。
// 后端目前没有兜底过滤，于是 UI 上会看到 `[TOOL_CALL] {tool => web_search ...`
// 或 `<tool_call><tool name=...><args>...</args></tool></tool_call>` 这种内部语法。
// 这里在展示层把这些片段清掉——只是兜底，真正的 fix 应该在生成端。
export function stripToolCallSyntax(input: string): string {
  if (!input) return input;
  let out = input;
  // <tool_call>...</tool_call> 多行 XML（含未闭合情况：吃到字符串末尾）
  out = out.replace(/<tool_call\b[\s\S]*?(?:<\/tool_call>|$)/gi, "");
  // <tool ...>...</tool> 同样的 XML 风格
  out = out.replace(/<tool\b[\s\S]*?(?:<\/tool>|$)/gi, "");
  // [TOOL_CALL] {...} 风格：通常会被截断不闭合，直接吃到结尾
  out = out.replace(/\[TOOL_CALL\][\s\S]*$/i, "");
  // 孤立闭合标签（前面已经被吃掉了开头的）
  out = out.replace(/<\/tool_call>/gi, "").replace(/<\/tool>/gi, "");
  // gpt-4.1 等非推理模型在生成"广场评论"时，偶尔把整段 CoT prose 当成回复发出来
  // （没有 <think> 标签包裹，sanitizeAiText 抓不到）：
  //   "用户让我以 Andrej Karpathy 的身份，对一条...动态进行评论...
  //    我需要用一句话自然地评论...
  //    Andrej Karpathy 的风格是：- 简洁..."
  //   "用户要求我作为沈砚角色...沈砚的风格是：- 稳、低..."
  //   "用户想让我以闻樾的身份，对界闻的朋友圈评论进行回复..."
  //   "用户发了一条朋友圈，内容是关于经济形势..."
  //   "The user wants me to respond to a friend's moment..."
  // 共性：开头是 "用户" / "The user" / "我需要" / "让我" / "Let me" 这种第三人称
  // 叙述任务的 prose + 多段落（含换行）+ > ~80 字。正常评论 < 30 字的单句不会触发。
  // 命中模式直接清空，下游用 emptyTextFallback 兜底；DB 里已经存进去的脏评论
  // 在 render 层一并过掉。走查实测在 yuanzui0728 库里只 80+ 字阈值就发现 15 条
  // 漏网（"用户发/让/想/要求/在", "The user wants me to ...", "让我分析" 等）。
  const trimmed = out.trim();
  const isCotProse =
    trimmed.length > 80 &&
    /\n/.test(trimmed) &&
    /^(用户[发让想要求希望给需要在说作为问]|让我(想|数|考虑|分析|看看|思考)|我需要|我应该|我可以|我得|我会|我必须|我打算|这条朋友圈|这是一条|这条动态|The user (wants|is|asks|asked|said|told|wants me|is asking)|Let me (think|analy[sz]e|see|consider|look)|I (need|should|want|have|will|must) to|Looking at|Analy[sz]ing)/i.test(
      trimmed,
    );
  if (isCotProse) {
    return "";
  }
  return trimmed;
}

export function describeMomentMediaContent(
  contentType: MomentContentType,
  media: MomentMediaAsset[],
) {
  if (!media.length) {
    return t(msg`朋友圈动态`);
  }

  if (contentType === "video") {
    return t(msg`一条视频`);
  }

  const imageCount = media.filter((asset) => asset.kind === "image").length;
  if (contentType === "live_photo") {
    return imageCount > 0 ? t(msg`${imageCount} 张实况照片`) : t(msg`实况照片`);
  }

  return imageCount > 0 ? t(msg`${imageCount} 张图片`) : t(msg`朋友圈动态`);
}

export function getMomentSummaryText(
  moment: Pick<Moment, "text" | "contentType" | "media">,
) {
  const text = stripToolCallSyntax(moment.text);
  if (text) {
    return text;
  }

  return describeMomentMediaContent(moment.contentType, moment.media);
}
