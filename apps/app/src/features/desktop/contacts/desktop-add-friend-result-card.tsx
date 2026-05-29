import { msg } from "@lingui/macro";
import type { MessageDescriptor } from "@lingui/core";
import {
  CheckCircle2,
  MessageCircleMore,
  ShieldBan,
  UserPlus,
} from "lucide-react";
import type { Character, FriendListItem, FriendRequest } from "@yinjie/contracts";
import { Button, cn } from "@yinjie/ui";
import { useRuntimeTranslator } from "@yinjie/i18n";
import { AvatarChip } from "../../../components/avatar-chip";
import {
  translateCharacterActivity,
  translateCharacterBio,
  translateExpertDomains,
} from "../../../lib/character-i18n";
import { getFriendDisplayName } from "../../contacts/contact-utils";
import { resolveFriendshipSourceText } from "../../contacts/friend-request-scene-label";

export type DesktopAddFriendRelationshipState =
  | "available"
  | "blocked"
  | "friend"
  | "pending";

type DesktopAddFriendResultCardProps = {
  character: Character;
  identifier: string;
  matchReason: string;
  status: DesktopAddFriendRelationshipState;
  friendship?: FriendListItem["friendship"] | null;
  pendingRequest?: FriendRequest | null;
  actionPending?: boolean;
  onOpenProfile: () => void;
  onPrimaryAction: () => void;
};

export function DesktopAddFriendResultCard({
  character,
  identifier,
  matchReason,
  status,
  friendship,
  pendingRequest,
  actionPending = false,
  onOpenProfile,
  onPrimaryAction,
}: DesktopAddFriendResultCardProps) {
  const t = useRuntimeTranslator();
  const displayName = friendship
    ? getFriendDisplayName({ character, friendship })
    : character.name;
  const signature =
    character.currentStatus?.trim() ||
    translateCharacterBio(t, character.bio) ||
    t(msg`这个角色还没有签名。`);
  const relationshipSummary =
    displayName !== character.name
      ? t(msg`昵称：${character.name}`)
      : character.relationship?.trim() || t(msg`世界角色`);
  const expertDomains = character.expertDomains.slice(0, 4);
  const translatedExpertDomains = translateExpertDomains(
    t,
    expertDomains,
    "slash",
  );
  const statusMetaDescriptor: {
    badge: MessageDescriptor;
    badgeClassName: string;
    helperText: MessageDescriptor;
    icon: typeof MessageCircleMore;
    primaryLabel: MessageDescriptor;
    primaryDisabled: boolean;
  } =
    status === "friend"
      ? {
          badge: msg`已在通讯录中`,
          badgeClassName:
            "border-[color:var(--state-success-bg)] bg-[color:var(--state-success-bg)] text-[color:var(--state-success-text)]",
          helperText: msg`你们已经是朋友，可以直接开始聊天。`,
          icon: MessageCircleMore,
          primaryLabel: actionPending ? msg`打开中...` : msg`发消息`,
          primaryDisabled: actionPending,
        }
      : status === "pending"
        ? {
            badge: msg`等待验证`,
            badgeClassName:
              "border-[color:var(--state-warning-bg)] bg-[color:var(--state-warning-bg)] text-[color:var(--state-warning-text)]",
            helperText: pendingRequest?.createdAt
              ? msg`好友申请已发送，等待对方处理。`
              : msg`当前申请还在等待对方通过。`,
            icon: CheckCircle2,
            primaryLabel: msg`已发送`,
            primaryDisabled: true,
          }
        : status === "blocked"
          ? {
              badge: msg`黑名单中`,
              badgeClassName:
                "border-[color:var(--state-danger-bg)] bg-[color:var(--state-danger-bg)] text-[color:var(--state-danger-text)]",
              helperText: msg`当前角色已在黑名单中，移出黑名单后才能重新添加。`,
              icon: ShieldBan,
              primaryLabel: msg`已拉黑`,
              primaryDisabled: true,
            }
          : {
              badge: msg`可添加到通讯录`,
              badgeClassName:
                "border-[color-mix(in_srgb,var(--brand-primary)_14%,transparent)] bg-[color-mix(in_srgb,var(--brand-primary)_8%,transparent)] text-[color:var(--state-success-text)]",
              helperText: msg`发送验证申请后，对方通过即可成为朋友。`,
              icon: UserPlus,
              primaryLabel: actionPending
                ? msg`发送中...`
                : msg`添加到通讯录`,
              primaryDisabled: actionPending,
            };
  const statusMeta = {
    ...statusMetaDescriptor,
    badge: t(statusMetaDescriptor.badge),
    helperText: t(statusMetaDescriptor.helperText),
    primaryLabel: t(statusMetaDescriptor.primaryLabel),
  };
  const PrimaryIcon = statusMeta.icon;

  return (
    <section className="overflow-hidden rounded-[10px] border border-[color:var(--border-subtle)] bg-white shadow-none">
      <div className="border-b border-[color:var(--border-faint)] px-8 py-8">
        <div className="flex items-start gap-5">
          <AvatarChip name={displayName} src={character.avatar} size="xl" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
              <h2 className="truncate text-[30px] font-medium tracking-[-0.02em] text-[color:var(--text-primary)]">
                {displayName}
              </h2>
              <div className="text-[length:var(--text-caption)] text-[color:var(--text-muted)]">
                {identifier}
              </div>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[length:var(--text-caption)] text-[color:var(--text-muted)]">
              <span>{relationshipSummary}</span>
              <span>·</span>
              <span>{matchReason}</span>
            </div>

            <p className="mt-4 max-w-[720px] text-[length:var(--text-body)] leading-7 text-[color:var(--text-secondary)]">
              {signature}
            </p>

            <div
              className={cn(
                "mt-4 inline-flex rounded-full border px-2.5 py-1 text-[length:var(--text-eyebrow)] font-medium",
                statusMeta.badgeClassName,
              )}
            >
              {statusMeta.badge}
            </div>
          </div>
        </div>
      </div>

      <div className="divide-y divide-[color:var(--border-faint)]">
        <DesktopAddFriendDetailRow label={t(msg`昵称`)} value={character.name} />
        <DesktopAddFriendDetailRow label={t(msg`隐界号`)} value={identifier} />
        <DesktopAddFriendDetailRow
          label={t(msg`关系`)}
          value={character.relationship?.trim() || t(msg`世界角色`)}
        />
        <DesktopAddFriendDetailRow
          label={t(msg`当前活动`)}
          value={
            translateCharacterActivity(t, character.currentActivity) ||
            t(msg`暂无活动`)
          }
        />
        <DesktopAddFriendDetailRow
          label={t(msg`擅长领域`)}
          value={translatedExpertDomains || t(msg`未设置`)}
        />
        {friendship ? (
          <>
            <DesktopAddFriendDetailRow
              label={t(msg`备注`)}
              value={friendship.remarkName?.trim() || t(msg`未设置`)}
            />
            <DesktopAddFriendDetailRow
              label={t(msg`来源`)}
              value={
                friendship.source?.trim()
                  ? resolveFriendshipSourceText(t, friendship.source)
                  : t(msg`未设置`)
              }
            />
          </>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-4 border-t border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-8 py-4">
        <div className="max-w-[420px] text-[length:var(--text-caption)] leading-6 text-[color:var(--text-muted)]">
          {statusMeta.helperText}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <Button
            variant="secondary"
            size="lg"
            onClick={onOpenProfile}
            className="rounded-[8px] border-[color:var(--border-strong)] bg-white px-5 shadow-none hover:bg-[color:var(--surface-console)]"
          >
            {t(msg`查看资料`)}
          </Button>
          <Button
            variant="primary"
            size="lg"
            disabled={statusMeta.primaryDisabled}
            onClick={onPrimaryAction}
            className={cn(
              "rounded-[8px] px-5 shadow-none",
              status === "pending"
                ? "bg-[color:var(--state-info-bg)] text-white hover:bg-[color:var(--state-info-bg)]"
                : undefined,
              status === "blocked"
                ? "bg-[color:var(--state-danger-bg)] text-white hover:bg-[color:var(--state-danger-bg)]"
                : undefined,
            )}
          >
            <PrimaryIcon size={17} />
            {statusMeta.primaryLabel}
          </Button>
        </div>
      </div>
    </section>
  );
}

function DesktopAddFriendDetailRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="grid gap-2 px-8 py-4 md:grid-cols-[96px_minmax(0,1fr)] md:items-center">
      <div className="text-[length:var(--text-caption)] text-[color:var(--text-muted)]">{label}</div>
      <div className="text-[length:var(--text-body)] leading-6 text-[color:var(--text-primary)]">
        {value}
      </div>
    </div>
  );
}
