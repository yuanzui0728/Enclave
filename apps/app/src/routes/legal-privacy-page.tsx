import { msg } from "@lingui/macro";
import { translateRuntimeMessage } from "@yinjie/i18n";
import { MobileDocumentShell } from "../components/mobile-document-shell";

const t = translateRuntimeMessage;

export function LegalPrivacyPage() {
  return (
    <MobileDocumentShell
      title={t(msg`隐私政策`)}
      eyebrow="Privacy"
      summary={t(msg`隐界会在维持世界运行、会话同步和安全审计所需的范围内处理你的资料与互动数据。`)}
      sections={[
        {
          title: t(msg`我们会保存什么`),
          paragraphs: [
            t(msg`隐界会保存你的账号资料、聊天行为、动态内容和必要的运行日志，用于维持世界状态、消息同步和基础安全审计。`),
            t(msg`如果你在应用内配置了专属 API Key，服务端只会按现有能力做加密存储，不会在页面里直接展示完整明文。`),
          ],
        },
        {
          title: t(msg`这些数据会去哪里`),
          paragraphs: [
            t(msg`远程模式下，数据会发送到所在世界的服务端；自托管或特定部署模式下，数据会保存在对应世界的运行目录和数据库里。`),
            t(msg`你可以通过资料设置、安全举报和屏蔽入口管理自己的使用范围；删除或退出后，系统会按当前产品规则回收会话与配置状态。`),
          ],
        },
      ]}
    />
  );
}
