import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { msg } from "@lingui/macro";
import { Trans } from "@lingui/react/macro";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { translateRuntimeMessage } from "@yinjie/i18n";
import {
  Button,
  ErrorBlock,
  LoadingBlock,
  PanelEmpty,
  StatusPill,
} from "@yinjie/ui";
import { useAuth } from "../lib/use-auth";
import { wikiApi } from "../lib/wiki-api";
import { relationshipTypeLabel } from "../lib/character-labels";
import { PageShell } from "../components/page-shell";

export function HomePage() {
  const t = translateRuntimeMessage;
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const charactersQ = useQuery({
    queryKey: ["wiki", "characters"],
    queryFn: () => wikiApi.listCharacters(),
    // 服务端 listPages 已带 60s 内存 TTL；这边再加 30s staleTime，避免来回
    // 切 home / character 详情时每次都触发 273 行的网络往返 + JSON parse。
    staleTime: 30_000,
  });

  // hover / focus 时预拉角色详情，命中后 click→render 直接走 cache 不等网络。
  // 用 Set 记录已预拉的 id，避免反复 hover 同一张卡反复触发 prefetch。
  // staleTime 60s 跟服务端 etag 304 配合：30s 内重复访问同一角色完全零开销。
  const prefetchedRef = useRef<Set<string>>(new Set());
  // 加 120ms debounce：键盘 Tab 30 张卡片在 67ms 内能跑过去，原来一次性
  // 打 30 个 prefetch 请求，浏览器 6-conn 限制下排队还可能挡住真正的
  // Enter 触发的 page-fetch。focus/hover 都走同一 timer：120ms 内焦点又走
  // 了就不发请求；停留 120ms 表示 "user 想看这张"，再发。touchstart 不
  // 走 debounce — 手机点 = 用户已决定要进。
  const pendingFocusRef = useRef<number | null>(null);
  const prefetchNow = useCallback(
    (characterId: string) => {
      if (prefetchedRef.current.has(characterId)) return;
      prefetchedRef.current.add(characterId);
      void qc.prefetchQuery({
        queryKey: ["wiki", "page", characterId, "stable"],
        queryFn: () => wikiApi.getPage(characterId, "stable"),
        staleTime: 60_000,
      });
    },
    [qc],
  );
  const prefetchDebounced = useCallback(
    (characterId: string) => {
      if (prefetchedRef.current.has(characterId)) return;
      if (pendingFocusRef.current !== null) {
        window.clearTimeout(pendingFocusRef.current);
      }
      pendingFocusRef.current = window.setTimeout(() => {
        pendingFocusRef.current = null;
        prefetchNow(characterId);
      }, 120);
    },
    [prefetchNow],
  );
  useEffect(() => {
    return () => {
      if (pendingFocusRef.current !== null) {
        window.clearTimeout(pendingFocusRef.current);
      }
    };
  }, []);

  // 角色目录是用户的入口，下一步几乎必然进某张卡。character-page 是
  // lazyWithReload chunk（~7KB gzipped），cold click→h1 实测 376ms 里
  // 有 ~30-50ms 是这个 chunk 的网络往返 + parse。home 进来后 idle 时
  // 预拉，第一次点卡 click→navigate 直接走内存里的 module；命中后
  // 整体降到 ~200ms。requestIdleCallback 不阻塞首屏；不支持的浏览器
  // 走 setTimeout 200ms 兜底——比 home 首屏渲染稍后，肯定来得及。
  useEffect(() => {
    const preloadChunk = () => {
      void import("./character-page");
    };
    const w = window as typeof window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    };
    if (typeof w.requestIdleCallback === "function") {
      const handle = w.requestIdleCallback(preloadChunk, { timeout: 1500 });
      return () => {
        const w2 = window as typeof window & {
          cancelIdleCallback?: (id: number) => void;
        };
        w2.cancelIdleCallback?.(handle);
      };
    }
    const id = window.setTimeout(preloadChunk, 200);
    return () => window.clearTimeout(id);
  }, []);

  // 服务端按 name.localeCompare('zh-Hans-CN') 排序，但下划线在该排序下 < 中
  // 文 / 英文字母 → 21 个 `_xxx_smoke_*` / `_test_*` 测试 import 始终排在最
  // 前面，公网访客打开目录第一眼就是一堆乱码名。前端做一次稳定二级排序：
  // 名字以 `_` 开头的下沉到末尾，其它保持服务端 zh 拼音序不变。
  const sortedCharacters = useMemo(() => {
    if (!charactersQ.data) return charactersQ.data;
    const isLeadingUnderscore = (c: { name?: string | null }) =>
      typeof c.name === "string" && c.name.startsWith("_");
    return [...charactersQ.data].sort((a, b) => {
      const ua = isLeadingUnderscore(a) ? 1 : 0;
      const ub = isLeadingUnderscore(b) ? 1 : 0;
      return ua - ub;
    });
  }, [charactersQ.data]);
  const total = charactersQ.data?.length ?? 0;

  return (
    <PageShell
      eyebrow={t(msg`角色目录`)}
      title={t(msg`所有角色词条`)}
      description={t(
        msg`按维基百科模式管理世界角色：任何登录用户都能创建角色、编辑画像和运行逻辑、申请删除或恢复；高风险改动进入巡查队列，通过后才发布到角色运行时。`,
      )}
      actions={
        user ? (
          <Button
            variant="primary"
            onClick={() => void navigate({ to: "/create" })}
          >
            <Trans>✨ 创建角色</Trans>
          </Button>
        ) : (
          <Button
            variant="secondary"
            onClick={() => void navigate({ to: "/login" })}
          >
            <Trans>登录后参与编辑</Trans>
          </Button>
        )
      }
    >
      <div className="flex items-center gap-2 text-sm text-[color:var(--text-muted)]">
        {/* 加载阶段 total=0 → fetch 完跳 273，"共 X 个词条" 宽度从 6 字
            变 8 字，把右边 "·" + 点击提示一起往右推 16px，单次 CLS 0.066
            （Web Vitals 把整页 CLS 顶到 0.084 — Good 但临界）。等数据落定
            再渲染计数；同时给整行 min-h，避免上方 description ↔ 卡片 grid
            之间出现 20px 高度差导致下方 footer/content 二次跳动。 */}
        <span className="inline-flex min-h-5 items-center gap-2">
          {charactersQ.data ? (
            <>
              <span>
                <Trans>共 {total} 个词条</Trans>
              </span>
              <span className="opacity-50">·</span>
              <span>
                <Trans>点击进入查看 / 编辑 / 历史 / 讨论</Trans>
              </span>
            </>
          ) : charactersQ.isError ? (
            // 出错时不要再喊"正在加载词条…"——下方 ErrorBlock 已经在报错了，
            // 顶部还停在"加载中"会让用户以为还在转圈、与红色错误条自相矛盾。
            // 留空（外层 span 的 min-h-5 仍占位防跳动），错误信息交给 ErrorBlock。
            null
          ) : (
            // 用 t(msg) 而不是 <Trans>：<Trans> 的新 message 没在
            // packages/i18n/catalogs/wiki/*.po 里抽取过，会在 console 抛
            // "Uncompiled message detected"；t(msg) 走 translateRuntimeMessage，
            // 没翻译就回落原文，无运行时警告。
            t(msg`正在加载词条…`)
          )}
        </span>
      </div>

      {charactersQ.isLoading && <LoadingBlock />}
      {charactersQ.isError && (
        <ErrorBlock role="alert" message={(charactersQ.error as Error).message} />
      )}
      {charactersQ.data && charactersQ.data.length === 0 && (
        <PanelEmpty
          message={
            user
              ? t(msg`还没有任何角色词条。点右上方"✨ 创建角色"开始第一个。`)
              : t(msg`还没有任何角色词条。登录后即可创建第一个。`)
          }
        />
      )}
      {sortedCharacters && sortedCharacters.length > 0 && (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {sortedCharacters.map((c) => (
            <li key={c.id}>
              <Link
                to="/character/$characterId"
                params={{ characterId: c.id }}
                onMouseEnter={() => prefetchDebounced(c.id)}
                onFocus={() => prefetchDebounced(c.id)}
                // touchstart 在移动端滚动时也会触发（手指落点）：滚 10 张卡
                // 就发 10 个 prefetch。现代手机 click latency 已经≈0，对比
                // 浪费的带宽不值。只在 desktop hover/focus 时 prefetch。
                // shadow-[var(--shadow-soft)] 在 @layer utilities，覆盖了全局
                // @layer base `:focus-visible { box-shadow: var(--shadow-focus) }`，
                // 导致 keyboard 用户 Tab 过 273 个卡片完全看不到焦点。
                // Tailwind 4 里 outline-2 只写 width 不写 style，碰上全局 base
                // 的 outline:none 仍然 0px solid 不可见；直接用 arbitrary value
                // 一次性写满 width+style+color，让 utility 一条规则压住 base。
                className="group flex h-full flex-col gap-2 rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] p-4 shadow-[var(--shadow-soft)] transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)] focus-visible:[outline:2px_solid_var(--brand-primary)] focus-visible:[outline-offset:2px]"
              >
                <div className="flex items-start gap-3">
                  <Avatar name={c.name} url={c.avatar ?? undefined} />
                  <div className="min-w-0 flex-1">
                    {/* truncate 后用户看不到完整名字，加 title 走原生 tooltip 兜底。
                        最长见过 80x'x' 的测试角色，不加 title 完全没法辨识。
                        语义上用 h2：PageShell 给整页 h1，每张卡是 wiki 词条，
                        screen reader 用户能用 H 键逐张跳。className 把 h2 浏览器
                        默认 size/margin 全压回 text-base，视觉不变。 */}
                    <h2
                      title={c.name}
                      className="m-0 truncate text-base font-semibold text-[color:var(--text-primary)] group-hover:underline"
                    >
                      {c.name}
                    </h2>
                    {(() => {
                      // 个别测试 / 历史角色 relationship 为空（API 不会过滤），
                      // 直接拼会渲染出 " · friend" 的前导分隔符。两端都给走判断。
                      // relationshipType 预设是英文哨兵值（friend/expert/mentor…），
                      // 经 relationshipTypeLabel 翻成中文；自定义自由文本原样透出。
                      const relType = relationshipTypeLabel(c.relationshipType);
                      const rel =
                        c.relationship && relType
                          ? `${c.relationship} · ${relType}`
                          : c.relationship || relType || "";
                      if (!rel) return null;
                      return (
                        <div
                          title={rel}
                          className="mt-0.5 truncate text-xs text-[color:var(--text-muted)]"
                        >
                          {rel}
                        </div>
                      );
                    })()}
                  </div>
                </div>
                {/* 数据观察：273 行里 264 行三个 pill 都不需要显示（active +
                    none + 非社区贡献）。把 wrapper 也条件化，DOM 节点直接砍掉
                    一截，主线程 hydrate 也省事。 */}
                {(c.lifecycleStatus !== "active" ||
                  c.protectionLevel !== "none" ||
                  c.sourceType === "wiki_contributed") && (
                  <div className="flex flex-wrap gap-1.5">
                    {c.lifecycleStatus !== "active" && (
                      <StatusPill>
                        {c.lifecycleStatus === "pending_create"
                          ? t(msg`待创建`)
                          : c.lifecycleStatus === "deleted"
                            ? t(msg`已删除`)
                            : c.lifecycleStatus}
                      </StatusPill>
                    )}
                    {c.protectionLevel !== "none" && (
                      <StatusPill>
                        {c.protectionLevel === "semi"
                          ? t(msg`半保护`)
                          : t(msg`完全保护`)}
                      </StatusPill>
                    )}
                    {c.sourceType === "wiki_contributed" && (
                      <StatusPill>
                        <Trans>社区创建</Trans>
                      </StatusPill>
                    )}
                  </div>
                )}
                {/* 96/273 张卡片 bio 为空，原本用同样字色/字重渲染 "(暂无简介)"
                    导致快速浏览时眼睛要在 35% 占位文案上停顿。空 bio 给斜体
                    扫视时大脑能直接跳过；颜色仍用 text-secondary 保证 14px 字
                    在 white card 上对比度 >= WCAG AA 4.5（用 text-muted+
                    opacity-70 会跌到 2.97 不合规）。 */}
                {c.bio ? (
                  <p className="line-clamp-3 text-sm leading-6 text-[color:var(--text-secondary)]">
                    {c.bio}
                  </p>
                ) : (
                  <p className="line-clamp-3 text-sm italic leading-6 text-[color:var(--text-secondary)]">
                    {t(msg`（暂无简介）`)}
                  </p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  );
}

// 角色 avatar 可能是 URL，也可能是单 emoji（隐界 APP 里 142 角色 ~80 是 emoji）。
// URL → <img>（带 onError 兜底）；emoji → 文字 glyph；其余 → 渐变首字母方块。
// 不能让 <img src="🧰"> 走 404 兜底破图。
function Avatar({ name, url }: { name: string; url?: string }) {
  const trimmed = (url ?? "").trim();
  const [loadFailed, setLoadFailed] = useState(false);
  useEffect(() => {
    setLoadFailed(false);
  }, [trimmed]);

  // 所有 avatar 分支都标 decorative：每张卡的 <a> 里已有 <h2>{name}</h2>，
  // 屏读把链接整体读出来时会把 h2 文本作为可访问名称。若 avatar 自带 alt /
  // aria-label / 单字母 glyph，SR 会再读一遍 "name, name" 或 "_, name"，对
  // 用 name 起头是 `_` 的测试角色尤其碍事（前后 21 张卡读 "下划线"）。
  if (trimmed && !loadFailed) {
    if (isLikelyImageSource(trimmed)) {
      return (
        <img
          src={trimmed}
          alt=""
          // 首屏 273 张卡片，eager fetch 全部头像会让 chromium 把 connection
          // pool 占满 + 阻塞 css/json。lazy + async 让浏览器只在 viewport
          // 附近才发请求；DOMContentLoaded 提速 ~3-4x。
          loading="lazy"
          decoding="async"
          onError={() => setLoadFailed(true)}
          className="h-10 w-10 shrink-0 rounded-2xl object-cover md:h-12 md:w-12"
        />
      );
    }
    if (isEmojiAvatar(trimmed)) {
      return (
        <div
          aria-hidden="true"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-[color:var(--surface-soft)] text-2xl leading-none md:h-12 md:w-12 md:text-3xl"
        >
          {trimmed}
        </div>
      );
    }
  }
  // name?.[0] 取的是 UTF-16 code unit，遇到表情或扩展平面汉字会切半个代理对
  // 渲染成 "?" 方块。Array.from 按 code point 切，至少保证字形完整。
  const initial = name ? Array.from(name)[0] : "?";
  return (
    <div
      aria-hidden="true"
      className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-[image:var(--brand-gradient)] text-base font-semibold text-[color:var(--text-on-brand)] md:h-12 md:w-12"
    >
      {initial}
    </div>
  );
}

const EMOJI_PICTOGRAPHIC = /\p{Extended_Pictographic}/u;

function isEmojiAvatar(value: string) {
  if (!value || value.length > 12) return false;
  return EMOJI_PICTOGRAPHIC.test(value);
}

function isLikelyImageSource(value: string) {
  if (!value) return false;
  // 协议相对 URL（"//evil.example/icon.png"）以 `/` 起头会被当成同源绝对路径
  // 误放过；浏览器实际向 evil.example 发请求，等于让任意写入 avatar 的用户
  // 把所有访客 IP / UA 泄给外部域名。
  // 反斜杠在 WHATWG URL parser 里被当成正斜杠 ("/\evil/x" → "//evil/x" →
  // 协议相对 → http://evil/x)，同样的攻击路径要一起堵。HTTP 图片 URL 没有
  // 任何合法使用反斜杠的场景，整串带 `\` 一律拒。
  if (value.startsWith("//")) return false;
  if (value.includes("\\")) return false;
  return (
    value.startsWith("/") ||
    value.startsWith("./") ||
    value.startsWith("../") ||
    value.startsWith("blob:") ||
    /^https?:\/\//i.test(value) ||
    /^data:image\//i.test(value) ||
    /\.(png|jpe?g|gif|webp|avif|svg)(\?.*)?$/i.test(value)
  );
}
