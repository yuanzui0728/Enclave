import { useEffect, useRef, useState } from "react";
import { msg } from "@lingui/macro";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { isApiRequestError, updateWorldOwner } from "@yinjie/contracts";
import { useRuntimeTranslator } from "@yinjie/i18n";
import { AppPage, TextField, cn } from "@yinjie/ui";
import { TabPageTopBar } from "../components/tab-page-top-bar";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { translateAppErrorCode } from "../lib/error-translate";
import { navigateBackOrFallback } from "../lib/history-back";
import { describeRequestError } from "../lib/request-error";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";
import { useWorldOwnerStore } from "../store/world-owner-store";

const NAME_MAX_LENGTH = 20;
const NAME_MIN_LENGTH = 2;

// 粘贴时连带 \r \n \t 等控制字符（从富文本编辑器 / 表格里复制名字常见），
// 之前 trim 只去首尾，内嵌的不动。落库后 chat / moments 拿这串 username 渲染
// 会出现「foo↵bar」断行 / 制表位空白，profile-page 头部 truncate
// 又会让它看起来像 "foo bar"（实际数据有 \n），用户根本看不出哪里坏。
// 保存前折叠掉所有 ASCII / Unicode 控制字符（U+0000..U+001F、U+007F、U+0080..U+009F），
// 内部的连续空白合并成一个普通空格。跟 api/.../world-owner.service.ts 同款
// server-side 兜底口径对齐。eslint no-control-regex 故意 disable —— 这里就是
// 要拿控制字符 codepoint 范围做 sanitize，不是误写。
const CONTROL_CHAR_PATTERN = new RegExp(
  // eslint-disable-next-line no-control-regex
  "[\\u0000-\\u001f\\u007f-\\u009f]+",
  "g",
);
function sanitizeOwnerName(value: string): string {
  return value.replace(CONTROL_CHAR_PATTERN, " ").replace(/\s+/g, " ").trim();
}

export function ProfileInfoNamePage() {
  const t = useRuntimeTranslator();
  const navigate = useNavigate();
  const isDesktopLayout = useDesktopLayout();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const queryClient = useQueryClient();

  const username = useWorldOwnerStore((state) => state.username);
  const hydrateOwner = useWorldOwnerStore((state) => state.hydrateOwner);

  // 跟 profile-info-signature-page 同款：进页面前先 sanitize 一遍，避免
  // legacy 用户的 "foo\nbar" 直接灌进 <input>——单行 input 里 \r\n\t 显示成
  // 不可见空白，但 React state 仍保留原字符，光标点位跟可视字符不对应，
  // 用户改一个字位置会跳。同时 dirty 比对、initial 值都基于同样的 sanitize 形态。
  const [draft, setDraft] = useState(() => sanitizeOwnerName(username ?? ""));
  // 用户进页面时 store 可能还没 hydrate（cold start / 重置 cloud session），
  // username 之后才被异步灌进来。这时候想让 draft 同步成"刚 hydrate 出来的
  // username"。但如果用户已经在输入框里改过字了，再被外部 store 更新覆盖回
  // 去就是吞输入。用 ref 记一下用户有没有动过输入框，动过就不再 auto-sync。
  const userTouchedRef = useRef(false);
  // 用户在保存中点了 ← 返回 / Back 键退出本页时，saveMutation 不会因此被
  // 取消，几秒后 onSuccess 仍会再调一次 goBack——这时 navigate 会从用户已经
  // 退到的页（如 /profile/info）再退一格到 /tabs/profile，一跳两格。
  const isMountedRef = useRef(true);
  // 新走查 R4：「完成」按钮 + Enter 提交都走 saveMutation.mutate()，只靠
  // disabled={!canSave || saveMutation.isPending} 兜双触发；isPending 走
  // React commit 才 propagate，同帧 <16ms 第二次 click / 两次同帧 Enter 都过门
  // 发 2 个 PATCH。username 改动幂等但仍浪费 RTT；onSuccess 跑 2 遍 goBack 也会
  // 把 navigateBackOrFallback 推 2 格 history。Sync ref 守 propagation gap。
  const saveInFlightRef = useRef(false);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!userTouchedRef.current) {
      setDraft(sanitizeOwnerName(username ?? ""));
    }
  }, [username]);

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

  // 比较 dirty 和长度 gate 走同一份 sanitize：用户粘贴 "foo\nbar" 后能看出
  // 「完成」会保存的是 "foo bar"（长度 7），同时 dirty 比对的是真正会落库的
  // 形态而不是 draft 原样。
  const sanitized = sanitizeOwnerName(draft);
  const baselineUsername = sanitizeOwnerName(username ?? "");
  const dirty = sanitized !== baselineUsername;
  // input maxLength=20 只挡 user input/paste，挡不住 legacy DB 里 >20 字符的
  // 旧 username（之前几版没卡上限）。这种用户编辑（dirty=true）时点「完成」
  // 会发出超长 payload 被服务端 400 拒掉。客户端 length 超限直接 disable，
  // 跟「至少 2 字符」同语义放在 canSave 里。
  const overLimit = sanitized.length > NAME_MAX_LENGTH;
  const canSave =
    sanitized.length >= NAME_MIN_LENGTH && !overLimit && dirty;

  const saveMutation = useMutation({
    mutationFn: async () => {
      const owner = await updateWorldOwner(
        { username: sanitized },
        baseUrl,
      );
      queryClient.setQueryData(["world-owner", baseUrl], owner);
      hydrateOwner(owner);
    },
    onSuccess: () => {
      if (!isMountedRef.current) return;
      goBack();
    },
  });

  const handleSave = () => {
    if (saveInFlightRef.current) return;
    if (!canSave || saveMutation.isPending) return;
    saveInFlightRef.current = true;
    saveMutation.mutate(undefined, {
      onSettled: () => {
        saveInFlightRef.current = false;
      },
    });
  };

  if (isDesktopLayout) {
    return null;
  }

  // backend 抛 AppError 时优先用 translateAppErrorCode 命中 KnownAppErrorCode
  // 的 i18n（同一份 error-translate.ts 给非中文 locale 出本地化文案），
  // miss 时回退 raw error.message（多半是后端塞的 legacyMessage 中文兜底）。
  // 走查 R1：非 ApiRequestError 分支之前直出 err.message，"Failed to fetch" /
  // SyntaxError "Unexpected token <" 等浏览器原生错误 en/ja/ko 用户也只能看
  // 裸英文。改走 describeRequestError 给网络错误 / 5xx / SyntaxError 一组 locale
  // 兜底文案；ApiRequestError 一支保留原 server legacyMessage 中文兜底（注释里说
  // 的"后端兜底"路径）。
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
        title={t(msg`名字`)}
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
            onClick={handleSave}
            className={cn(
              "rounded-full px-3 py-1 text-[13px] font-medium transition-colors",
              !canSave || saveMutation.isPending
                ? "text-[color:var(--text-dim)]"
                : "text-[#f59e0b] active:bg-black/[0.05]",
            )}
          >
            {saveMutation.isPending ? t(msg`保存中`) : t(msg`完成`)}
          </button>
        }
      />

      <div className="mt-1 border-y border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)] px-4 py-3">
        <TextField
          autoFocus
          value={draft}
          disabled={saveMutation.isPending}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          onChange={(event) => {
            userTouchedRef.current = true;
            // 4th-R1 走查：用户粘贴 "foo\nbar" 进 input type=text 时，浏览器
            // 把 \n 当 line separator 渲染（视觉上像空格）但 value.length 把
            // \n 算 1 字，结果 counter 数字 vs 用户视觉看到的字数会差一截。
            // 跟同目录 signature-page onChange 同款 1:1 替换（不用 +，保持 length
            // 不变 → 光标位置稳定），\r\n\t 立即变成普通空格、 onKeyDown 那条
            // Enter 提交路径也不会被 \n 干扰。剩下的 sanitize（包括其它控制字符
            // + 折叠连续空白 + trim）依然走 sanitizeOwnerName 在 save 时兜底。
            const normalized = event.target.value.replace(/[\r\n\t]/g, " ");
            setDraft(normalized);
            // 用户已经动手敲新的名字，意味着上一次保存失败这件事翻篇了，把
            // 红字 banner 清掉，免得新尝试还挂着旧 attempt 的失败说明。
            saveMutation.reset();
          }}
          onKeyDown={(event) => {
            // 跟 welcome-page.tsx ownerName 输入框对齐（line 1417）：iOS / 安卓
            // 软键盘点 Done 默认只 blur，外面没 form 包，回车也不会触发任何
            // submit；用户要再戳一下右上「完成」按钮才能保存。手动接 Enter 在
            // canSave 时调 mutate，路径短一步。
            // isComposing：中文 IME 选词阶段按回车「确认拼音」会触发 keydown，
            // 这时不能 submit——会把半截拼音状态当作完成保存。chat-composer /
            // moment-comment-composer 同款 gate（grep "isComposing"）。
            if (event.nativeEvent.isComposing) {
              return;
            }
            if (event.key === "Enter" && canSave && !saveMutation.isPending) {
              event.preventDefault();
              handleSave();
            }
          }}
          enterKeyHint="done"
          maxLength={NAME_MAX_LENGTH}
          placeholder={t(msg`输入名字`)}
          // text-[16px]: iOS Safari focus 时 <16px 会强制 viewport zoom-in。
          // 本输入框 autoFocus，进页就 focus，字号偏小会让整页抖一下。
          // disabled={isPending}: 上传中再敲字也会被 onSuccess→goBack 一起带走，
          //   见 profile-info-avatar-page 同款修法（commit 5fe4e7e3）。
          className="rounded-[10px] border-[color:var(--border-faint)] bg-white px-3 py-2.5 text-[16px] shadow-none focus:translate-y-0 disabled:bg-[color:var(--bg-canvas)] disabled:text-[color:var(--text-muted)]"
        />
        <div
          className={cn(
            "mt-1.5 text-right text-[11px]",
            // overLimit 时 counter 染红，让用户跟「完成」灰按钮对上原因。
            overLimit
              ? "text-[color:var(--state-danger-text)]"
              : "text-[color:var(--text-dim)]",
          )}
          data-i18n-skip="true"
        >
          {sanitized.length}/{NAME_MAX_LENGTH}
        </div>
      </div>

      <div className="px-4 pt-2 text-[11px] leading-5 text-[color:var(--text-muted)]">
        {t(
          msg`好名字让朋友更容易找到你，至少 ${NAME_MIN_LENGTH} 个字、最多 ${NAME_MAX_LENGTH} 个字符。`,
        )}
      </div>

      {/* sanitized.length < draft.length：用户输入带首尾/连续空白（如 "abc " / "a  b"），sanitize 折叠后短一截。counter 显示的是 sanitized.length，用户看着 input 里 4 个字符、计数器却显示 3，没说明的话会以为是 bug。跟同目录 signature-page 同款 hint。i18n-ignore-line */}
      {draft.length > 0 && sanitized.length < draft.length ? (
        <div className="px-4 pt-1 text-[11px] leading-5 text-[color:var(--text-muted)]">
          {t(msg`名字保存时会去掉首尾空白、把连续空格合成一个。`)}
        </div>
      ) : null}

      {/* 名字短于下限时（legacy 1 字用户进入页面也是这种情况），把 disabled
          「完成」的原因显式告诉用户；之前 trimmed.length===0 完全不提示，用户
          清空输入后只看到「完成」灰着，毫无线索，以为是 bug。这里改成：
          ① 0 字符 → 文案 "请输入名字"（之前 gate 在 draft.length>0 上漏掉了
            「用户把名字完全清空」这条最常见的路径——清空后只看到「完成」灰着，
            没有任何文字说明，跟「以为是 bug」的描述一致；R1 走查实测）
          ② 全空白/控制字符 → 文案 "请输入有效的名字（不能只有空白或换行符）"
          ③ 1 字符 → 文案 "至少 N 字符"  */}
      {sanitized.length === 0 && draft.length === 0 ? (
        <div className="mx-4 mt-3 rounded-[10px] border border-[rgba(245,158,11,0.20)] bg-[rgba(255,251,235,0.96)] px-3 py-2 text-[12px] leading-5 text-[#92400e]">
          {t(msg`请输入名字。`)}
        </div>
      ) : sanitized.length === 0 && draft.length > 0 ? (
        <div className="mx-4 mt-3 rounded-[10px] border border-[rgba(245,158,11,0.20)] bg-[rgba(255,251,235,0.96)] px-3 py-2 text-[12px] leading-5 text-[#92400e]">
          {t(msg`请输入有效的名字（不能只有空白或换行符）。`)}
        </div>
      ) : sanitized.length > 0 && sanitized.length < NAME_MIN_LENGTH ? (
        <div className="mx-4 mt-3 rounded-[10px] border border-[rgba(245,158,11,0.20)] bg-[rgba(255,251,235,0.96)] px-3 py-2 text-[12px] leading-5 text-[#92400e]">
          {t(msg`名字太短啦，至少要 ${NAME_MIN_LENGTH} 个字符。`)}
        </div>
      ) : overLimit ? (
        // 走查 R1：input maxLength=20 挡 user input/paste，但 legacy DB 有 >20 字符
        // 的旧 username（早期版本没卡上限）。这类用户一进编辑页 sanitized 立刻超限、
        // 「完成」永远灰着、计数器虽然变红但没文字说明，跟之前"clear 后看灰按钮以为
        // 是 bug"的体验同款。补一条 banner，让用户明确知道要删掉几个字。
        <div className="mx-4 mt-3 rounded-[10px] border border-[rgba(245,158,11,0.20)] bg-[rgba(255,251,235,0.96)] px-3 py-2 text-[12px] leading-5 text-[#92400e]">
          {t(msg`名字太长啦，最多 ${NAME_MAX_LENGTH} 个字符，请删掉一些。`)}
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
