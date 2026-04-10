import type {
  OfficialAccountArticleDetail,
  OfficialAccountDetail,
  OfficialAccountSummary,
} from "@yinjie/contracts";
import { formatTimestamp } from "../../../lib/format";
import type { DesktopFavoriteRecord } from "./desktop-favorites-storage";

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
      "查看公众号资料与最近文章。",
    meta: `${account.accountType === "service" ? "服务号" : "订阅号"} · @${
      account.handle
    }`,
    to: `/official-accounts/${account.id}`,
    badge: account.accountType === "service" ? "服务号" : "订阅号",
    avatarName: account.name,
    avatarSrc: account.avatar,
  };
}

export function buildOfficialArticleFavoriteRecord(
  article: OfficialAccountArticleDetail,
): Omit<DesktopFavoriteRecord, "collectedAt"> {
  return {
    id: `favorite-official-article-${article.id}`,
    sourceId: `official-article-${article.id}`,
    category: "officialAccounts",
    title: article.title,
    description: article.summary,
    meta: `${article.account.name} · ${formatTimestamp(article.publishedAt)}`,
    to: `/official-accounts/articles/${article.id}`,
    badge: "公众号文章",
    avatarName: article.account.name,
    avatarSrc: article.account.avatar,
  };
}
