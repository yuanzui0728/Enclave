import { useEffect, useState } from "react";
import { msg } from "@lingui/macro";
import { Trans } from "@lingui/react/macro";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
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
import { PageShell } from "../components/page-shell";

export function HomePage() {
  const t = translateRuntimeMessage;
  const { user } = useAuth();
  const navigate = useNavigate();
  const charactersQ = useQuery({
    queryKey: ["wiki", "characters"],
    queryFn: () => wikiApi.listCharacters(),
    // 服务端 listPages 已带 60s 内存 TTL；这边再加 30s staleTime，避免来回
    // 切 home / character 详情时每次都触发 273 行的网络往返 + JSON parse。
    staleTime: 30_000,
  });

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
        <span>
          <Trans>共 {total} 个词条</Trans>
        </span>
        <span className="opacity-50">·</span>
        <span>
          <Trans>点击进入查看 / 编辑 / 历史 / 讨论</Trans>
        </span>
      </div>

      {charactersQ.isLoading && <LoadingBlock />}
      {charactersQ.isError && (
        <ErrorBlock message={(charactersQ.error as Error).message} />
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
      {charactersQ.data && charactersQ.data.length > 0 && (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {charactersQ.data.map((c) => (
            <li key={c.id}>
              <Link
                to="/character/$characterId"
                params={{ characterId: c.id }}
                className="group flex h-full flex-col gap-2 rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] p-4 shadow-[var(--shadow-soft)] transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)]"
              >
                <div className="flex items-start gap-3">
                  <Avatar name={c.name} url={c.avatar ?? undefined} />
                  <div className="min-w-0 flex-1">
                    {/* truncate 后用户看不到完整名字，加 title 走原生 tooltip 兜底。
                        最长见过 80x'x' 的测试角色，不加 title 完全没法辨识。 */}
                    <div
                      title={c.name}
                      className="truncate text-base font-semibold text-[color:var(--text-primary)] group-hover:underline"
                    >
                      {c.name}
                    </div>
                    {(() => {
                      // 个别测试 / 历史角色 relationship 为空（API 不会过滤），
                      // 直接拼会渲染出 " · friend" 的前导分隔符。两端都给走判断。
                      const rel =
                        c.relationship && c.relationshipType
                          ? `${c.relationship} · ${c.relationshipType}`
                          : c.relationship || c.relationshipType || "";
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
                <p className="line-clamp-3 text-sm leading-6 text-[color:var(--text-secondary)]">
                  {c.bio || t(msg`（暂无简介）`)}
                </p>
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

  if (trimmed && !loadFailed) {
    if (isLikelyImageSource(trimmed)) {
      return (
        <img
          src={trimmed}
          alt={name}
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
          role="img"
          aria-label={name}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-[color:var(--surface-soft)] text-2xl leading-none md:h-12 md:w-12 md:text-3xl"
        >
          <span aria-hidden="true">{trimmed}</span>
        </div>
      );
    }
  }
  // name?.[0] 取的是 UTF-16 code unit，遇到表情或扩展平面汉字会切半个代理对
  // 渲染成 "?" 方块。Array.from 按 code point 切，至少保证字形完整。
  const initial = name ? Array.from(name)[0] : "?";
  return (
    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-[image:var(--brand-gradient)] text-base font-semibold text-[color:var(--text-on-brand)] md:h-12 md:w-12">
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
