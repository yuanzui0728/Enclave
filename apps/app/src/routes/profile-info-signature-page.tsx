import { useEffect, useRef, useState } from "react";
import { msg } from "@lingui/macro";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { isApiRequestError, updateWorldOwner } from "@yinjie/contracts";
import { useRuntimeTranslator } from "@yinjie/i18n";
import { AppPage, TextAreaField, cn } from "@yinjie/ui";
import { TabPageTopBar } from "../components/tab-page-top-bar";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { translateAppErrorCode } from "../lib/error-translate";
import { navigateBackOrFallback } from "../lib/history-back";
import { describeRequestError } from "../lib/request-error";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";
import { useWorldOwnerStore } from "../store/world-owner-store";

const SIGNATURE_MAX_LENGTH = 30;

// 把所有 ASCII / Unicode 控制字符折叠成空格、压缩连续空白、再 trim。
// 抽到 component 外是为了让 dirty 比较和 initial draft 都走同一份逻辑（之前
// 比较时 baseline 用 `signature.trim()`，sanitized 已去 \n，legacy 用户存的是
// 带 \n 的签名 → 一打开页面 dirty 就为 true、「完成」绿着 → 用户没改任何东西
// 也能误点保存）。
// 走查 R1：之前只剥 \r\n\t，跟服务端 sanitizeOwnerSignature 用的 CONTROL_CHAR_REGEX
// (U+0000..U+001F / U+007F..U+009F) 不一致——curl 直 PATCH 进来的旧脏数据如
// "abcdef"（BEL），客户端打开页面 sanitized=raw，下次保存就把 BEL 原样
// 上传，服务端剥成 "abc def" 又 hydrate 回来，draft 跟着变；用户体感是「我没改
// 什么，怎么签名突然变了」。跟服务端同口径剥控制字符，且跟同目录 name-page 的
// CONTROL_CHAR_PATTERN 完全对齐。eslint no-control-regex 故意 disable —— 这里
// 就是要拿控制字符 codepoint 范围做 sanitize，不是误写。
const CONTROL_CHAR_PATTERN = new RegExp(
  // eslint-disable-next-line no-control-regex
  "[\\u0000-\\u001f\\u007f-\\u009f]+",
  "g",
);
function sanitizeOwnerSignature(value: string): string {
  return value.replace(CONTROL_CHAR_PATTERN, " ").replace(/\s+/g, " ").trim();
}

export function ProfileInfoSignaturePage() {
  const t = useRuntimeTranslator();
  const navigate = useNavigate();
  const isDesktopLayout = useDesktopLayout();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const queryClient = useQueryClient();

  const signature = useWorldOwnerStore((state) => state.signature);
  const hydrateOwner = useWorldOwnerStore((state) => state.hydrateOwner);

  // 进页面时把 stored signature 先过一遍 sanitize（去 \n / 多余空白），
  // 避免 legacy 用户的 "行A\n行B" 显示在 textarea 里、跟 dirty 比较的
  // sanitized 形态对不上 → 误判 dirty=true、「完成」绿着。
  const [draft, setDraft] = useState(() => sanitizeOwnerSignature(signature));
  // 见 profile-info-name-page 同名 ref：用户已经动过输入框时，不要被
  // 后台 hydrate 把 draft 覆盖回 store 值。
  const userTouchedRef = useRef(false);
  // 保存中用户手动 ← 退出页面后，几秒后 onSuccess 还会再调 goBack 一次，
  // 多跳一格——见 profile-info-name-page / -avatar-page 同款 ref。
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!userTouchedRef.current) {
      setDraft(sanitizeOwnerSignature(signature));
    }
  }, [signature]);

  useEffect(() => {
    if (isDesktopLayout) {
      void navigate({ to: "/desktop/settings", replace: true });
    }
  }, [isDesktopLayout, navigate]);

  const goBack = () =>
    navigateBackOrFallback(
      () => navigate({ to: "/profile/info", replace: true }),
      "/profile/info",
    );

  // textarea 默认允许 Enter 换行，用户敲 "line1\nline2" 后落库就是带 \n 的原文。
  // 但 profile-page / profile-info-page 都用 truncate / line-clamp-1 单行展示
  // （placeholder 文案"写一句此刻想说的话"也暗示单行短语），换行根本看不出来；
  // 下次重新进编辑页又因为 textarea preserve \n 让用户以为存进去了 → 反复修不掉。
  // 用顶部抽出的 sanitizeOwnerSignature 同时做 sanitize（保留中间空格、不剥所有控制字符）。
  const sanitized = sanitizeOwnerSignature(draft);
  // 跟 sanitized 对齐 baseline，避免 legacy 多行 signature 一打开就 dirty=true。
  const dirty = sanitized !== sanitizeOwnerSignature(signature);
  // 防御性 length gate：textarea maxLength=30 只挡 user input/paste，挡不住
  // 程序设值 / legacy DB 里 >30 字符的旧数据。后者用户再编辑（dirty=true）时
  // 「完成」会发出超长 payload 被服务端 400 拒掉，错误条挂在底部毫无头绪。
  // 客户端 length 超限直接 disable 「完成」，counter 同步显示 sanitized.length
  // 让用户先看到红色 overflow 数字、自己删字。
  const overLimit = sanitized.length > SIGNATURE_MAX_LENGTH;
  const canSave = dirty && !overLimit;

  const saveMutation = useMutation({
    mutationFn: async () => {
      const owner = await updateWorldOwner({ signature: sanitized }, baseUrl);
      queryClient.setQueryData(["world-owner", baseUrl], owner);
      hydrateOwner(owner);
    },
    onSuccess: () => {
      if (!isMountedRef.current) return;
      goBack();
    },
  });

  if (isDesktopLayout) {
    return null;
  }

  // 优先 translateAppErrorCode（命中 KnownAppErrorCode 出当前 locale 文案），
  // miss 才退到 raw error.message。详见 profile-info-name-page 同款注释。
  // 走查 R1：非 ApiRequestError 分支走 describeRequestError，让 "Failed to fetch" /
  // 5xx / SyntaxError 在 en/ja/ko 下也是本地化文案。
  const errorMessage = (() => {
    if (!saveMutation.isError) return null;
    const err = saveMutation.error;
    if (isApiRequestError(err)) {
      return translateAppErrorCode(err) ?? err.message;
    }
    return err instanceof Error ? describeRequestError(err) : null;
  })();

  return (
    <AppPage className="space-y-0 bg-[color:var(--bg-canvas)] px-0 py-0">
      <TabPageTopBar
        title={t(msg`个性签名`)}
        titleAlign="center"
        leftActions={
          <button
            type="button"
            onClick={goBack}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[color:var(--text-primary)] transition-colors active:bg-black/[0.05]"
            aria-label={t(msg`返回`)}
          >
            <ArrowLeft size={17} />
          </button>
        }
        rightActions={
          <button
            type="button"
            disabled={!canSave || saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
            className={cn(
              "rounded-full px-3 py-1 text-[13px] font-medium transition-colors",
              !canSave || saveMutation.isPending
                ? "text-[color:var(--text-dim)]"
                : "text-[#07c160] active:bg-black/[0.05]",
            )}
          >
            {saveMutation.isPending ? t(msg`保存中`) : t(msg`完成`)}
          </button>
        }
      />

      <div className="mt-1 border-y border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)] px-4 py-3">
        <TextAreaField
          autoFocus
          value={draft}
          disabled={saveMutation.isPending}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          onChange={(event) => {
            userTouchedRef.current = true;
            // 用 1:1 替换（不用 +），保持 length 不变 → 浏览器原生 cursor 位置不跳。
            // 把 \r \n \t 立即变成 space 后 textarea 永远不出现换行：用户敲 Enter
            // 看到光标后多一格空格而不是一行新行，跟 profile-page / profile-info-page
            // 的单行 truncate 展示自然对齐；不然敲完保存看到 "line1 line2" 一行回放
            // 时还反复想要再加换行。
            const normalized = event.target.value.replace(/[\r\n\t]/g, " ");
            setDraft(normalized);
            // 用户已经动手敲新的签名，意味着上一次保存失败翻篇了，把红字
            // banner 清掉，免得新尝试还挂着旧 attempt 的失败说明。
            saveMutation.reset();
          }}
          onKeyDown={(event) => {
            // IME 选词阶段按回车「确认拼音」也会触发 keydown，这时不能 submit——
            // 跟 name 页同款 gate。
            if (event.nativeEvent.isComposing) {
              return;
            }
            if (event.key === "Enter") {
              // textarea 默认 Enter 插入 \n，但单行字段不要换行。挡掉 → onChange
              // 也不会拿到 \n。如果 canSave 且 not pending，按 Enter 直接 submit。
              event.preventDefault();
              if (canSave && !saveMutation.isPending) {
                saveMutation.mutate();
              }
            }
          }}
          enterKeyHint="done"
          maxLength={SIGNATURE_MAX_LENGTH}
          placeholder={t(msg`写一句此刻想说的话`)}
          // text-[16px]: iOS Safari focus 时 <16px 会强制 viewport zoom-in。
          // 本 textarea autoFocus，进页就 focus，字号偏小会让整页抖一下。
          // disabled={isPending}: 上传中继续敲会被 onSuccess→goBack 一起带走，
          //   见 profile-info-avatar-page 同款修法（commit 5fe4e7e3）。
          className="min-h-[5.5rem] resize-none rounded-[10px] border-[color:var(--border-faint)] bg-white px-3 py-2.5 text-[16px] leading-6 shadow-none focus:translate-y-0 disabled:bg-[color:var(--bg-canvas)] disabled:text-[color:var(--text-muted)]"
        />
        <div
          className={cn(
            "mt-1.5 text-right text-[11px]",
            // overLimit 时 counter 染红 → 跟 disabled「完成」按钮一起给用户两个
            // 视觉信号：知道「为什么不让我保存」。
            overLimit
              ? "text-[color:var(--state-danger-text)]"
              : "text-[color:var(--text-dim)]",
          )}
          data-i18n-skip="true"
        >
          {/* 显示 sanitized.length 而非 draft.length——用户粘了 "line1\n\nline2"
              (12 字符) 时 textarea raw 字符比真正会落库的 "line1 line2" (11) 多。
              counter 跟实际保存的字符数对齐，免得用户看到 12/30 满意但实际
              占用更少 / 看到 11/30 (全空白) 时实际保存为 0。*/}
          {sanitized.length}/{SIGNATURE_MAX_LENGTH}
        </div>
      </div>

      {/* sanitized.length < draft.length：用户粘了 "a   b" 之类含多连空白的文本，
          实际保存会被压成 "a b"。counter 已经显示更小的数字，但用户看着 textarea
          里仍然是 raw 形态会困惑「打了 5 个字怎么算 3 个」。加一行短 hint 把口径
          统一。draft 为空时不显示，避免空页面下出现一个永远 false 的位置浪费版面。*/}
      {draft.length > 0 && sanitized.length < draft.length ? (
        <div className="px-4 pt-2 text-[11px] leading-5 text-[color:var(--text-muted)]">
          {t(msg`签名按单行保存：换行和多余空白会被折叠为一个空格。`)}
        </div>
      ) : null}

      {/* overLimit 走查 R1：legacy DB >30 字符的旧签名（之前没卡上限）进编辑页时 sanitized 直接超限、「完成」灰着但没文字说明，跟 name-page 同款修。i18n-ignore-line */}
      {overLimit ? (
        <div className="mx-4 mt-3 rounded-[10px] border border-[rgba(245,158,11,0.20)] bg-[rgba(255,251,235,0.96)] px-3 py-2 text-[12px] leading-5 text-[#92400e]">
          {t(msg`签名太长啦，最多 ${SIGNATURE_MAX_LENGTH} 个字符，请删掉一些。`)}
        </div>
      ) : null}

      {errorMessage ? (
        // role="alert"：屏幕阅读器立即朗读保存失败原因，跟红字 banner 视觉同步。
        <div
          role="alert"
          className="mx-4 mt-3 rounded-[10px] border border-[rgba(220,38,38,0.18)] bg-[rgba(254,242,242,0.96)] px-3 py-2 text-[12px] leading-5 text-[color:var(--state-danger-text)]"
        >
          {errorMessage}
        </div>
      ) : null}
    </AppPage>
  );
}
