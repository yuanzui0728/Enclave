import { MobileDocumentShell } from "../components/mobile-document-shell";

export function LegalPrivacyPage() {
  return (
    <MobileDocumentShell
      title="隐私政策"
      eyebrow="Privacy"
      summary="隐界会在维持世界运行、会话同步和安全审计所需的范围内处理你的资料与互动数据。"
      sections={[
        {
          title: "我们会保存什么",
          paragraphs: [
            "隐界会保存你的账号资料、聊天行为、动态内容和必要的运行日志，用于维持世界状态、消息同步和基础安全审计。",
            "如果你在应用内配置了专属 API Key，服务端只会按现有能力做加密存储，不会在页面里直接展示完整明文。",
          ],
        },
        {
          title: "这些数据会去哪里",
          paragraphs: [
            "远程模式下，相关数据会发送到世界实例的 Core API 与推理网关；自托管或特定部署模式下，数据会保存在对应实例的运行目录与数据库里。",
            "你可以通过资料设置、安全举报和屏蔽入口管理自己的使用范围；删除或退出后，系统会按当前产品规则回收会话与配置状态。",
          ],
        },
      ]}
    />
  );
}
