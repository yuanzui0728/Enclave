import { useEffect, useId, useRef, useState } from "react";
import { msg } from "@lingui/macro";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ChevronRight, Copy } from "lucide-react";
import { isApiRequestError, updateWorldOwner } from "@yinjie/contracts";
import { AppPage, Button, cn } from "@yinjie/ui";
import { useRuntimeTranslator } from "@yinjie/i18n";
import { AvatarChip } from "../components/avatar-chip";
import { TabPageTopBar } from "../components/tab-page-top-bar";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { translateAppErrorCode } from "../lib/error-translate";
import { navigateBackOrFallback } from "../lib/history-back";
import { describeRequestError } from "../lib/request-error";
import { buildYinjieId } from "../lib/yinjie-id";
import { registerAndroidBackInterceptor } from "../runtime/android-back-button";
import { writeClipboardText } from "../runtime/native-clipboard";
import { pickImageFiles } from "../runtime/native-image-picker";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";
import { useWorldOwnerStore } from "../store/world-owner-store";

// 跟原 profile-info-avatar-page 同步：服务端 world-owner.service 落库上限 2MB，
// 客户端 picking 这一侧把 1MB 当上限，避免把巨型 base64 推到服务端再被拒。
const MAX_AVATAR_BYTES = 1024 * 1024;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

type PickedAvatar = {
  dataUrl: string;
  size: number;
  name: string;
};

export function ProfileInfoPage() {
  const t = useRuntimeTranslator();
  const navigate = useNavigate();
  const isDesktopLayout = useDesktopLayout();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const queryClient = useQueryClient();
  const username = useWorldOwnerStore((state) => state.username);
  const ownerId = useWorldOwnerStore((state) => state.id);
  const avatar = useWorldOwnerStore((state) => state.avatar);
  const signature = useWorldOwnerStore((state) => state.signature);
  const contact = useWorldOwnerStore((state) => state.contact);
  const hydrateOwner = useWorldOwnerStore((state) => state.hydrateOwner);
  // 隐界号像微信号一样要能复制给好友——之前这一行是 readOnly、点不动也长按
  // 没菜单（mobile webview 长按选中文本经常被 yj-no-callout 一类的祖先样式吃掉），
  // 用户想分享给朋友只能在 Welcome 页拼一次拿到。给它配 toast 短反馈，{key} 走
  // mobile-moments-publish-page 同款 setTimeout 重置，连点也稳。
  const [toast, setToast] = useState<{ message: string; key: number } | null>(
    null,
  );
  const toastKeyRef = useRef(0);
  // 复制隐界号是 async（writeClipboardText 走 native bridge ~50-200ms），
  // 同帧多次点击会重复打 bridge + 弹冗余 toast。简单 boolean ref 同步守卫。
  const copyInFlightRef = useRef(false);
  // 新走查 R1：头像 saveMutation 同帧双击防抖。AvatarConfirmDialog「完成」按钮
  // 只靠 disabled={isSaving}（=saveMutation.isPending）兜双触发；isPending 走
  // React commit 才 propagate 到 DOM，同帧 <16ms 第二次 click 时 disabled 仍是
  // false，两次都过门进 saveMutation.mutate(dataUrl)。avatar payload 是 ≤1MB
  // 的 data URL，重复发等于浪费一份 ~1MB 带宽 + 一个 RTT；账号在公网隧道下
  // 双发更明显。和 account-security-panel.tsx 同款 ref 守卫，onSettled 释放。
  const saveAvatarInFlightRef = useRef(false);
  function showToast(message: string) {
    toastKeyRef.current += 1;
    setToast({ message, key: toastKeyRef.current });
  }
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 1600);
    return () => window.clearTimeout(timer);
    // dep 钉在 toast?.key 上不是 toast：showToast 每次都自增 key，新 toast 一定有
    // 新 key，所以 key 一变就触发 effect；同时跳过「toast 从 null 进入 null 时
    // 多触发一次 effect 又立刻 early return」的无用 re-run。react-hooks/exhaustive-deps
    // 看不出这条意图，disable 抑制误报。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast?.key]);

  useEffect(() => {
    if (isDesktopLayout) {
      void navigate({ to: "/desktop/settings", replace: true });
    }
  }, [isDesktopLayout, navigate]);

  // 头像换图：选完图片弹本页内联确认弹层，用户点「完成」才落库。
  // 防 race：用户连点两次「头像」行（picker A 在场时再点出 picker B），FileReader
  // / native bridge 的回调不保证顺序——大图 A 先开始读、小图 B 更快完成，会让
  // B 的 setPickedAvatar(B) 先落、A 的 onload 再覆写成 A。用自增 id 给每次 pick
  // 编号，回调时只信"最新那次"。跟原 avatar page 同款。
  const [pickedAvatar, setPickedAvatar] = useState<PickedAvatar | null>(null);
  const latestPickIdRef = useRef(0);
  // 防 stale onload 死锁：每个进行中的 FileReader 把 pickId 加进集合，
  // onload/onerror 不管 pickId 是否最新都先把自己从集合移除。集合空了再清
  // "读取中"。原 avatar page 走查过这个细节（连点两次 + 第二次取消会让旧
  // reader 因 pickId mismatch 早退、状态钉死），照搬。
  const [isReadingFile, setIsReadingFile] = useState(false);
  const inFlightReadersRef = useRef<Set<number>>(new Set());

  const saveMutation = useMutation({
    mutationFn: async (dataUrl: string) => {
      const owner = await updateWorldOwner({ avatar: dataUrl }, baseUrl);
      queryClient.setQueryData(["world-owner", baseUrl], owner);
      hydrateOwner(owner);
    },
    onSuccess: () => {
      setPickedAvatar(null);
    },
  });

  async function handlePickAvatar() {
    const pickId = ++latestPickIdRef.current;
    // pickImageFiles 在原生壳侧调 pickImagesWithNativeShell，权限被拒 / capacitor
    // bridge 故障 / 用户系统层面阻断都会 throw（web 分支自己永不 reject，但原生
    // 分支没保证）。不接 try/catch 异常会被 onClick 的 `void handlePickAvatar()`
    // 吞掉，用户点完头像没反应也没提示，会一直以为点击没触发。
    let files: File[];
    try {
      files = await pickImageFiles({ multiple: false });
    } catch {
      if (pickId === latestPickIdRef.current) {
        showToast(t(msg`打开相册失败，请重试。`));
      }
      return;
    }
    if (pickId !== latestPickIdRef.current) return;
    const file = files[0];
    if (!file) {
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      showToast(t(msg`图片过大，请压缩到 1MB 以内再试。`));
      return;
    }
    if (file.size === 0) {
      // 0 字节文件多半是相册导出失败 / 文件损坏。不拦的话 FileReader 会读出
      // "data:image/...;base64,"（只有 MIME 头没有数据），照样塞进 pickedAvatar
      // → 用户保存"空头像"，下次进来 AvatarChip onError 回落到 fallback，用户
      // 以为自己改了头像却看到 initials，毫无线索可查。
      showToast(t(msg`这张图片是空文件，请换一张试试。`));
      return;
    }
    if (!file.type.startsWith("image/")) {
      // <input accept="image/*"> 只是 hint，桌面 Safari / 拖拽场景仍能丢 PDF
      // / text/plain 进来。FileReader 照读不误，能塞进 pickedAvatar 拼出
      // "data:application/pdf;base64,..." 落库，AvatarChip 加载失败回 fallback。
      // 跟 chat-composer / compress-chat-background-image 同款 MIME 严校。
      showToast(t(msg`只能选择图片文件。`));
      return;
    }
    saveMutation.reset();
    inFlightReadersRef.current.add(pickId);
    setIsReadingFile(true);
    const reader = new FileReader();
    const finish = () => {
      inFlightReadersRef.current.delete(pickId);
      if (inFlightReadersRef.current.size === 0) {
        setIsReadingFile(false);
      }
    };
    reader.onerror = () => {
      if (pickId === latestPickIdRef.current) {
        showToast(t(msg`读取图片失败，请换一张试试。`));
      }
      finish();
    };
    reader.onload = () => {
      if (pickId === latestPickIdRef.current) {
        const result = reader.result;
        if (typeof result === "string") {
          setPickedAvatar({
            dataUrl: result,
            size: file.size,
            name: file.name,
          });
        }
      }
      finish();
    };
    reader.readAsDataURL(file);
  }

  if (isDesktopLayout) {
    return null;
  }

  // 后端早期数据里有过 username = "" 的脏行，?? 只兜 null/undefined，会
  // 让空串穿透下来 → AvatarChip alt / 名字行都渲染成空。用 || 把空串也
  // 一起 fallback 到「世界主人」。
  const ownerLabel = username?.trim() || t(msg`世界主人`);
  const trimmedSignature = signature?.trim() ?? "";
  const trimmedContact = contact?.trim() ?? "";
  const yinjieIdText = ownerId ? buildYinjieId(ownerId) : null;

  async function handleCopyYinjieId() {
    if (!yinjieIdText) {
      return;
    }
    // 走查 R1：之前没 in-flight 守卫，移动端连点「隐界号」行（按钮 active 状态
    // 不 disable，writeClipboardText 又是异步走 native bridge ~50-200ms）会让
    // 同一份 yinjieId 串行写剪贴板 2-3 次 + 弹 2-3 条 toast，每条 toast 内部
    // setTimeout 1.6s 自清又互相干扰（先 setToast({key:1}) → setToast({key:2}) →
    // 第一个 timer 已被取消，第二个紧跟第三个，最后只看到最末一条，但 native
    // bridge 已经被打了 3 次无用写。
    if (copyInFlightRef.current) return;
    copyInFlightRef.current = true;
    try {
      const copied = await writeClipboardText(yinjieIdText);
      showToast(copied ? t(msg`已复制隐界号`) : t(msg`复制失败，请重试`));
    } finally {
      copyInFlightRef.current = false;
    }
  }

  function translateMutationError(err: unknown): string | null {
    if (isApiRequestError(err)) {
      return translateAppErrorCode(err) ?? err.message;
    }
    return err instanceof Error ? describeRequestError(err) : null;
  }

  return (
    <AppPage className="space-y-0 bg-[color:var(--bg-canvas)] px-0 py-0">
      <TabPageTopBar
        title={t(msg`个人信息`)}
        titleAlign="center"
        leftActions={
          <button
            type="button"
            onClick={() =>
              navigateBackOrFallback(
                () => navigate({ to: "/tabs/profile", replace: true }),
                "/tabs/profile",
              )
            }
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[color:var(--text-primary)] transition-colors active:bg-black/[0.05]"
            aria-label={t(msg`返回`)}
          >
            <ArrowLeft size={17} />
          </button>
        }
      />

      <div className="pb-8">
        <InfoRowGroup className="mt-1">
          <InfoRow
            label={t(msg`头像`)}
            onClick={() => {
              void handlePickAvatar();
            }}
            disabled={isReadingFile || saveMutation.isPending}
            ariaLabel={t(msg`更换头像`)}
            value={
              <AvatarChip name={ownerLabel} src={avatar} size="wechat" />
            }
            denseValue
          />
          <InfoRow
            label={t(msg`名字`)}
            to="/profile/info/name"
            value={
              <span className="truncate text-[14px] text-[color:var(--text-primary)]">
                {ownerLabel}
              </span>
            }
          />
          {yinjieIdText ? (
            <InfoRow
              label={t(msg`隐界号`)}
              value={
                <span className="flex min-w-0 items-center gap-1.5">
                  <span
                    className="truncate text-[13px] text-[color:var(--text-muted)]"
                    data-i18n-skip="true"
                  >
                    {yinjieIdText}
                  </span>
                  <Copy
                    size={13}
                    className="shrink-0 text-[color:var(--text-dim)]"
                    aria-hidden="true"
                  />
                </span>
              }
              onClick={() => {
                void handleCopyYinjieId();
              }}
              // aria-label 设上后视觉上的「隐界号 yinjie_xxx Copy」按钮内容
              // 都被屏蔽——VoiceOver/TalkBack 用户只听到 "复制隐界号"，不知
              // 道自己即将复制哪个 ID。带上 yinjieIdText 让无障碍用户跟 sighted
              // 用户拿到等量信息。data-i18n-skip 那个 span 是给 lingui 跳过
              // 提取，但 aria-label 这里就是字符串拼接，编号字符走原文。
              ariaLabel={t(msg`复制隐界号 ${yinjieIdText}`)}
            />
          ) : (
            <InfoRow
              label={t(msg`隐界号`)}
              value={
                <span className="truncate text-[13px] text-[color:var(--text-muted)]">
                  {t(msg`未生成`)}
                </span>
              }
              readOnly
            />
          )}
        </InfoRowGroup>

        <InfoRowGroup className="mt-2">
          <InfoRow
            label={t(msg`个性签名`)}
            to="/profile/info/signature"
            value={
              <span
                className={cn(
                  "max-w-[55vw] truncate text-[13px]",
                  trimmedSignature
                    ? "text-[color:var(--text-muted)]"
                    : "text-[color:var(--text-dim)]",
                )}
              >
                {trimmedSignature || t(msg`未填写`)}
              </span>
            }
          />
          {/* 联系方式：分身相遇匹配成功后才会披露给对方，平时只在这里编辑。 */}
          <InfoRow
            label={t(msg`联系方式`)}
            to="/profile/info/contact"
            value={
              <span
                className={cn(
                  "max-w-[55vw] truncate text-[13px]",
                  trimmedContact
                    ? "text-[color:var(--text-muted)]"
                    : "text-[color:var(--text-dim)]",
                )}
              >
                {trimmedContact || t(msg`未填写`)}
              </span>
            }
          />
        </InfoRowGroup>
      </div>

      <AvatarConfirmDialog
        picked={pickedAvatar}
        ownerLabel={ownerLabel}
        isSaving={saveMutation.isPending}
        errorMessage={
          saveMutation.isError
            ? translateMutationError(saveMutation.error)
            : null
        }
        onCancel={() => {
          setPickedAvatar(null);
          saveMutation.reset();
        }}
        onConfirm={() => {
          if (!pickedAvatar) return;
          if (saveAvatarInFlightRef.current) return;
          saveAvatarInFlightRef.current = true;
          saveMutation.mutate(pickedAvatar.dataUrl, {
            onSettled: () => {
              saveAvatarInFlightRef.current = false;
            },
          });
        }}
      />

      {toast ? (
        // role="status" + aria-live=polite：之前 toast 完全没 a11y 属性，VoiceOver /
        // TalkBack 用户点完「复制隐界号」按钮听不到任何反馈，以为没成功又点一次。
        // 加 polite 让屏幕阅读器在当前朗读结束后宣读这条消息（不中断按钮点击反馈）。
        <div
          className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom,0px)+96px)] z-[1100] flex justify-center"
          role="status"
          aria-live="polite"
        >
          <div className="rounded-[6px] bg-black/72 px-3 py-1.5 text-[13px] text-white">
            {toast.message}
          </div>
        </div>
      ) : null}
    </AppPage>
  );
}

function InfoRowGroup({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden border-y border-[color:var(--border-faint)] divide-y divide-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

type InfoRowProps = {
  label: string;
  value?: React.ReactNode;
  to?: string;
  readOnly?: boolean;
  denseValue?: boolean;
  // onClick：纯按钮型行（如「点一下复制隐界号」/「点一下换头像」），不导航也不是 readOnly。
  // 跟 to 互斥；同时传时 onClick 优先。
  onClick?: () => void;
  // disabled 仅对 onClick 分支生效——避免在 FileReader 读图 / 保存上传过程中
  // 用户连点头像行再开第二次 picker。Link 分支没有 disabled 概念。
  disabled?: boolean;
  ariaLabel?: string;
};

function InfoRow({
  label,
  value,
  to,
  readOnly,
  denseValue,
  onClick,
  disabled,
  ariaLabel,
}: InfoRowProps) {
  const inner = (
    <>
      <div className="min-w-0 flex-1 text-[15px] text-[color:var(--text-primary)]">
        {label}
      </div>
      {value ? (
        <div
          className={cn(
            "flex shrink-0 items-center justify-end",
            denseValue ? "min-w-0" : "min-w-0 max-w-[60%]",
          )}
        >
          {value}
        </div>
      ) : null}
      {readOnly || onClick ? null : (
        <ChevronRight
          size={14}
          className="shrink-0 text-[color:var(--text-dim)]"
          aria-hidden="true"
        />
      )}
    </>
  );

  const interactive = !readOnly && (Boolean(to) || Boolean(onClick));
  // active:bg-... 给移动端「按下」反馈，hover:bg-... 给桌面鼠标悬停。两者
  // 都要：mobile webview tap 不会触发 hover（即便触发，hover 会"卡住"在被
  // 点击的行上直到下一次 tap，体验糟糕），所以移动端真正按下反馈靠 active。
  // 之前 cellClass 只有 hover，导致用户在 mobile 点头像/名字/签名等 Link 行
  // 时完全没有视觉按压反馈；button 形态（onClick）则在下面 cn() 里又重复加
  // 了一次 active。把 active 统一收进 cellClass 里，两条分支都享受到。
  const cellClass = cn(
    "flex w-full items-center gap-3 px-4 text-left transition-colors duration-[var(--motion-fast)] ease-[var(--ease-standard)]",
    denseValue ? "py-2" : "py-3",
    interactive
      ? "hover:bg-[color:var(--surface-card-hover)] active:bg-[color:var(--surface-card-hover)]"
      : undefined,
  );

  if (onClick && !readOnly) {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={ariaLabel}
        // disabled 时 cellClass 里的 hover:bg-... / active:bg-... 不会被浏览器自
        // 动抑制——mobile 上 tap disabled 按钮仍会闪一下高亮，看起来像"在响应"。
        // 显式 disabled:hover/active:bg-transparent 把按下视觉效果断掉。
        className={cn(
          cellClass,
          "disabled:opacity-60 disabled:hover:bg-transparent disabled:active:bg-transparent",
        )}
      >
        {inner}
      </button>
    );
  }

  if (readOnly || !to) {
    return <div className={cellClass}>{inner}</div>;
  }

  return (
    <Link to={to as never} className={cellClass}>
      {inner}
    </Link>
  );
}

type AvatarConfirmDialogProps = {
  picked: PickedAvatar | null;
  ownerLabel: string;
  isSaving: boolean;
  errorMessage: string | null;
  onCancel: () => void;
  onConfirm: () => void;
};

function AvatarConfirmDialog({
  picked,
  ownerLabel,
  isSaving,
  errorMessage,
  onCancel,
  onConfirm,
}: AvatarConfirmDialogProps) {
  const t = useRuntimeTranslator();
  const open = picked !== null;
  const titleId = useId();
  // 镜像 onCancel：deps 收紧到 [open]，避免 parent 任意 re-render 让 ESC/Back
  // listener 反复拆装。跟 feature-unavailable-dialog 同款修法（见同文件 R6 注释）。
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      onCancelRef.current();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const unregister = registerAndroidBackInterceptor((event) => {
      event.preventDefault();
      onCancelRef.current();
      return true;
    });
    return unregister;
  }, [open]);

  if (!open || !picked) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[rgba(17,24,39,0.32)] p-6 backdrop-blur-[3px]">
      <button
        type="button"
        aria-label={t(msg`关闭`)}
        onClick={onCancel}
        // 背景按钮纯鼠标 affordance；键盘 Tab 跳到这里会拿到 invisible focus
        // 然后按 Enter 直接关掉，所以 tabIndex=-1 让 Tab 路径只走到真按钮。
        //
        // 走查 R2：dismiss 路径不 gate isSaving——对齐 ESC / Android Back / 原
        // avatar page 顶栏返回箭头的行为。updateWorldOwner 没 abort signal，user
        // 点取消不可能真撤回请求；与其假装"保存中无法取消"把用户卡住，不如让
        // 模态随时能关，PATCH 继续在后台跑完，AvatarChip 走 store 反应式更新。
        tabIndex={-1}
        className="absolute inset-0"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative w-full max-w-[320px] overflow-hidden rounded-[20px] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] shadow-[var(--shadow-overlay)]"
      >
        <div className="flex flex-col items-center px-6 pb-2 pt-6">
          <AvatarChip name={ownerLabel} src={picked.dataUrl} size="xl" />
          <div
            id={titleId}
            className="mt-4 max-w-full truncate text-[14px] text-[color:var(--text-primary)]"
            title={picked.name}
          >
            {picked.name || t(msg`本地图片`)}
          </div>
          <div
            className="mt-0.5 text-[11px] text-[color:var(--text-muted)]"
            data-i18n-skip="true"
          >
            {formatBytes(picked.size)}
          </div>
        </div>

        {errorMessage ? (
          <div
            role="alert"
            className="mx-4 mt-3 rounded-[12px] border border-[rgba(220,38,38,0.18)] bg-[rgba(254,242,242,0.96)] px-3 py-2 text-[12px] leading-5 text-[color:var(--state-danger-text)]"
          >
            {errorMessage}
          </div>
        ) : null}

        <div className="mt-4 flex gap-2 border-t border-[color:var(--border-faint)] px-4 pb-4 pt-3">
          <Button
            type="button"
            variant="secondary"
            onClick={onCancel}
            // 走查 R2：取消按钮不随 isSaving disable——跟 ESC / Android Back / 背景
            // 点击 / 原 avatar page 顶栏返回箭头同口径。save 没有 abort signal，
            // 让用户能随时关 modal，PATCH 继续在后台跑。
            className="flex-1 rounded-[12px] py-2 shadow-none"
          >
            {t(msg`取消`)}
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={onConfirm}
            disabled={isSaving}
            // 走查新 R3：「完成」按钮 mobile tap 没按压反馈——hover:opacity-95
            // 是桌面鼠标悬停的渐变，mobile tap 不触发 hover。补 active:opacity-90
            // 让按下瞬间有视觉响应；跟 profile-subscription 复制/开通按钮同款补漏。
            className="flex-1 rounded-[16px] bg-[#f59e0b] py-2 text-[#3b2206] shadow-none hover:opacity-95 active:opacity-90"
          >
            {isSaving ? t(msg`保存中`) : t(msg`完成`)}
          </Button>
        </div>
      </div>
    </div>
  );
}
