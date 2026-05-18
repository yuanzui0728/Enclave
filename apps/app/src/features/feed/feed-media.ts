import { msg } from "@lingui/macro";
import type {
  FeedMediaAsset,
  FeedPost,
  MomentContentType,
} from "@yinjie/contracts";
import { translateRuntimeMessage } from "@yinjie/i18n";
import { stripToolCallSyntax } from "../moments/moment-content";

const t = translateRuntimeMessage;

export function resolveFeedMomentContentType(
  media: FeedMediaAsset[],
): MomentContentType {
  if (media[0]?.kind === "audio") {
    return "audio_card";
  }
  if (media[0]?.kind === "video") {
    return "video";
  }

  if (media.length > 0) {
    return "image_album";
  }

  return "text";
}

export function getFeedSummaryText(
  post: Pick<FeedPost, "text" | "media" | "mediaType">,
) {
  const text = stripToolCallSyntax(post.text);
  if (text) {
    return text;
  }

  if (post.media[0]?.kind === "audio" || post.mediaType === "audio") {
    return t(msg`分享了一段音乐`);
  }

  if (post.media[0]?.kind === "video" || post.mediaType === "video") {
    return t(msg`分享了一段视频`);
  }

  const imageCount = post.media.filter(
    (asset) => asset.kind === "image",
  ).length;
  if (imageCount > 0) {
    return t(msg`分享了 ${imageCount} 张图片`);
  }

  return "";
}
