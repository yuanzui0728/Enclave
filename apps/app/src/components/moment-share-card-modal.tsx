import { msg } from "@lingui/macro";
import { translateRuntimeMessage } from "@yinjie/i18n";
import type { Moment } from "@yinjie/contracts";
import { ShareCardModal } from "./share-card-modal";
import { WeChatMomentCard } from "./wechat-moment-card";

const t = translateRuntimeMessage;

type Props = {
  moment: Moment | null;
  /** 卡片上"自己点过赞"展示用 — 不影响导出逻辑，与 actionBubble 共享 */
  liked: boolean;
  /** 当前用户 id，传给 WeChatMomentCard 用于"是否本人发布"等判断 */
  ownerId: string | null;
  /** 水印文案里的 "{name} 的 AI 朋友圈" */
  ownerDisplayName: string;
  onClose: () => void;
};

/**
 * 朋友圈分享图卡 — 复用通用 ShareCardModal 的离屏截图 / Web Share 逻辑，
 * 只塞一个微信样式 WeChatMomentCard 进去当卡片内容。
 */
export function MomentShareCardModal({
  moment,
  liked,
  ownerId,
  ownerDisplayName,
  onClose,
}: Props) {
  // 导出渲染时禁用 ⋯ 按钮 + 删除按钮（onDelete 不传即可）
  const exportMoment: Moment | null = moment
    ? { ...moment, canInteract: false }
    : null;

  // 主朋友圈页里"分享图卡"对所有 moment 都可点，包括角色发的。
  // 之前 modalTitle 一律写"分享我的朋友圈"，分享角色 moment 时这句话明显不对。
  // 按作者归属切换：自己发的 → "我的"；其它一律退化成中性的"分享朋友圈"。
  const isOwnMoment = Boolean(
    moment && ownerId && moment.authorType === "user" && moment.authorId === ownerId,
  );

  return (
    <ShareCardModal
      cardKey={moment?.id ?? null}
      modalTitle={
        isOwnMoment ? t(msg`分享我的朋友圈`) : t(msg`分享朋友圈`)
      }
      watermarkSubtitle={t(msg`${ownerDisplayName} 的 AI 朋友圈`)}
      bottomHint={t(
        msg`保存图片到相册，发到 X / 小红书 / 微博 让朋友看看你的 AI 世界`,
      )}
      filenamePrefix="enclave-moment"
      onClose={onClose}
    >
      {exportMoment ? (
        <WeChatMomentCard
          moment={exportMoment}
          ownerId={ownerId}
          liked={liked}
          flush={false}
          onOpenActionMenu={() => {}}
        />
      ) : null}
    </ShareCardModal>
  );
}
