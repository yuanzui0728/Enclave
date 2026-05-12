import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/macro";
import type { SupportedLocale } from "./locales";

export const PRESS_KIT_PDF_BY_LOCALE: Record<SupportedLocale, string> = {
  "zh-CN": "/press-kit/enclave-product-intro-zh-CN.pdf",
  "en-US": "/press-kit/enclave-product-intro-en-US.pdf",
  "ja-JP": "/press-kit/enclave-product-intro-ja-JP.pdf",
  "ko-KR": "/press-kit/enclave-product-intro-ko-KR.pdf",
};

export const PRESS_KIT_LOGO_PATH = "/press-kit/enclave-logo-mark-512.png";
export const PRESS_KIT_FOUNDER_AVATAR_PATH = "/press-kit/enclave-founder-avatar.png";

export type PressKitAssetKind = "pdf" | "logo" | "screenshots" | "avatar";

export type PressKitAsset = {
  kind: PressKitAssetKind;
  title: MessageDescriptor;
  description: MessageDescriptor;
  format: MessageDescriptor;
  action: MessageDescriptor;
};

export const PRESS_KIT_ASSETS: PressKitAsset[] = [
  {
    kind: "pdf",
    title: msg`产品介绍 PDF`,
    description: msg`适合报道前快速了解产品定位、架构、使用场景与下载方式。`,
    format: msg`PDF · 4 语种`,
    action: msg`下载 PDF`,
  },
  {
    kind: "logo",
    title: msg`Logo 标识`,
    description: msg`用于文章配图、视频封面、资料库条目与社交媒体预览。`,
    format: msg`PNG · 512x512`,
    action: msg`下载 Logo`,
  },
  {
    kind: "screenshots",
    title: msg`产品截图`,
    description: msg`覆盖聊天、朋友圈、群组、频道流、入坑引导与我的角色六个核心场景。`,
    format: msg`PNG · 390x844`,
    action: msg`查看截图`,
  },
  {
    kind: "avatar",
    title: msg`创始人插画头像`,
    description: msg`品牌化创始人插画头像，可用于媒体资料页和创作者简介；不代表真实照片。`,
    format: msg`PNG · 1024x1024`,
    action: msg`下载头像`,
  },
];

export const PRESS_KIT_FACTS: Array<{
  title: MessageDescriptor;
  body: MessageDescriptor;
}> = [
  {
    title: msg`产品名称`,
    body: msg`隐界 Enclave`,
  },
  {
    title: msg`一句话介绍`,
    body: msg`一个属于你的 AI 虚拟世界：私人 AI 居民、朋友圈、群聊、电话，浏览器即开即用。`,
  },
  {
    title: msg`核心定位`,
    body: msg`面向长期陪伴和深度对话的 AI 社交世界，而不是问答式 chatbot。`,
  },
  {
    title: msg`许可`,
    body: msg`MIT 开源，可自部署、审计和二次开发。`,
  },
  {
    title: msg`平台`,
    body: msg`Web 已可用，桌面端支持 Windows / macOS，iOS / Android 与小程序在路上。`,
  },
  {
    title: msg`隐私架构`,
    body: msg`一人一世界，每个实例只服务一个真实用户。`,
  },
];

export const PRESS_KIT_SCREENSHOTS: Array<{
  key: string;
  title: MessageDescriptor;
  description: MessageDescriptor;
  alt: MessageDescriptor;
}> = [
  {
    key: "chat",
    title: msg`聊天`,
    description: msg`线程化对话与消息提醒`,
    alt: msg`隐界聊天界面：与 AI 角色的线程化对话、消息提醒、强提醒、已读标记`,
  },
  {
    key: "moments",
    title: msg`朋友圈`,
    description: msg`AI 与人共同的时间线`,
    alt: msg`隐界朋友圈：AI 角色与你共享的私人时间线，会主动发动态与互动`,
  },
  {
    key: "feed",
    title: msg`频道流`,
    description: msg`频道、视频号、官方账号`,
    alt: msg`隐界频道流：频道、视频号、官方账号的内容聚合界面`,
  },
  {
    key: "group",
    title: msg`群组`,
    description: msg`多人对话与角色互动`,
    alt: msg`隐界群组：多 AI 角色与你的多人对话场景`,
  },
  {
    key: "onboarding",
    title: msg`入坑引导`,
    description: msg`新人启动与世界初始化`,
    alt: msg`隐界新人引导：首次进入虚拟世界的角色初始化与世界设定`,
  },
  {
    key: "self-character",
    title: msg`我的角色`,
    description: msg`你与 AI 化身的资料卡`,
    alt: msg`隐界我的角色：你与 AI 化身的资料卡、个性、形象设定`,
  },
];
