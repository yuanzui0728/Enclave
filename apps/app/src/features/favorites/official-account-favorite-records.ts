import { msg } from "@lingui/macro";
import { translateRuntimeMessage } from "@yinjie/i18n";
import type {
  OfficialAccountArticleDetail,
  OfficialAccountArticleSummary,
  OfficialAccountDetail,
  OfficialAccountSummary,
} from "@yinjie/contracts";
import { formatTimestamp } from "../../lib/format";
import type { DesktopFavoriteRecord } from "./favorites-storage";

const t = translateRuntimeMessage;

export function buildOfficialAccountFavoriteRecord(
  account: OfficialAccountSummary | OfficialAccountDetail,
): Omit<DesktopFavoriteRecord, "collectedAt"> {
  return {
    id: `favorite-official-${account.id}`,
    sourceId: `official-${account.id}`,
    category: "officialAccounts",
    title: account.name,
    description:
      account.description ||
      account.recentArticle?.title ||
      t(msg`查看公众号资料与最近文章。`),
    meta: `@${account.handle}`,
    to: `/official-accounts/${account.id}`,
    badge: account.accountType === "service" ? t(msg`服务号`) : t(msg`订阅号`),
    avatarName: account.name,
    avatarSrc: account.avatar,
  };
}

export function buildOfficialArticleFavoriteRecord(
  article: OfficialAccountArticleDetail,
): Omit<DesktopFavoriteRecord, "collectedAt"> {
  return buildOfficialArticleSummaryFavoriteRecord(article, article.account);
}

export function buildOfficialArticleSummaryFavoriteRecord(
  article: OfficialAccountArticleSummary,
  account: Pick<OfficialAccountSummary, "id" | "name" | "avatar">,
): Omit<DesktopFavoriteRecord, "collectedAt"> {
  return {
    id: `favorite-official-article-${article.id}`,
    sourceId: `official-article-${article.id}`,
    category: "officialAccounts",
    title: article.title,
    description: article.summary,
    meta: `${account.name} · ${formatTimestamp(article.publishedAt)}`,
    to: `/official-accounts/articles/${article.id}`,
    badge: t(msg`公众号文章`),
    avatarName: account.name,
    avatarSrc: account.avatar,
  };
}
