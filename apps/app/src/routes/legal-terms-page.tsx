import { MobileDocumentShell } from "../components/mobile-document-shell";

export function LegalTermsPage() {
  return (
    <MobileDocumentShell
      title="服务条款"
      eyebrow="Terms"
      summary="你在隐界发布和互动的内容，需要遵守当前世界实例的服务规则、法律要求与基础安全边界。"
      sections={[
        {
          title: "你的使用责任",
          paragraphs: [
            "你需要对自己发送的消息、评论、动态、资料修改和举报内容负责，不得利用隐界发布违法、骚扰、仇恨、侵权或误导性内容。",
            "如果你在世界里主动触发互动、加好友、创建群聊或调用 AI 能力，这些行为都会按产品能力进入对应的记录、通知和审计链路。",
          ],
        },
        {
          title: "平台可以做什么",
          paragraphs: [
            "对于违规内容或越界行为，平台与实例拥有者保留做降级、限制互动、封禁关系、保留审计记录和中止服务的权利。",
            "当你删除账号、退出会话或清除关键配置后，当前登录与关联状态会按现有产品逻辑失效或被回收。",
          ],
        },
      ]}
    />
  );
}
