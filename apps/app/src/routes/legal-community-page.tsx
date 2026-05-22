import { msg } from "@lingui/macro";
import { translateRuntimeMessage } from "@yinjie/i18n";
import { MobileDocumentShell } from "../components/mobile-document-shell";

const t = translateRuntimeMessage;

export function LegalCommunityPage() {
  return (
    <MobileDocumentShell
      title={t(msg`社区规范`)}
      eyebrow="Safety"
      summary={t(msg`如果你在互动里遇到越界、骚扰或误导内容，可以使用举报和屏蔽能力保护自己的世界体验。`)}
      sections={[
        {
          title: t(msg`遇到问题时怎么办`),
          paragraphs: [
            t(msg`如果你遇到骚扰、不适、误导或越界内容，可以在角色详情、聊天页、群聊信息页和资料页发起举报，也可以直接屏蔽相关角色。`),
            t(msg`举报会进入当前世界的安全记录，用于后续审核、留档和必要处理；如果内容涉及持续性风险，系统可能同步做限制动作。`),
          ],
        },
        {
          title: t(msg`屏蔽后的影响`),
          paragraphs: [
            t(msg`屏蔽后，对应角色将不再出现在新的好友申请、发现路径和部分主动互动入口中，你也不会继续收到该角色的相关互动。`),
            t(msg`社区规范的目标不是增加使用负担，而是保证你的世界体验保持清晰、可控和可恢复。`),
          ],
        },
      ]}
    />
  );
}
