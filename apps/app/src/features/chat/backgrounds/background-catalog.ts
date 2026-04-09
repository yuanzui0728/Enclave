import type { ChatBackgroundAsset } from "@yinjie/contracts";

export const CHAT_BACKGROUND_PRESETS: ChatBackgroundAsset[] = [
  buildPreset("amber-dunes", "暖沙晨光"),
  buildPreset("jade-garden", "青庭微风"),
  buildPreset("mist-lake", "雾湖清晨"),
  buildPreset("night-market", "夜市灯影"),
  buildPreset("paper-clouds", "云纸留白"),
];

function buildPreset(assetId: string, label: string): ChatBackgroundAsset {
  const url = `/chat-backgrounds/${assetId}.svg`;

  return {
    source: "preset",
    assetId,
    url,
    thumbnailUrl: url,
    label,
  };
}
