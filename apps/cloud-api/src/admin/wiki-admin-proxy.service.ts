// i18n-ignore-start: server-side proxy, no user-facing strings.
import {
  BadGatewayException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type {
  WikiUserListQuery,
  WikiUserListResponse,
  WikiUserPrivateCharacterListResponse,
} from "@yinjie/contracts";
import { resolveWorldAdminSecret } from "./admin-bootstrap-resolver";

// 2026-05-20 wiki 拆库改造后，wiki 不再寄生在某个 cloud user 的 world child 里，而是
// 走独立进程 main-wiki.ts (api/dist/main-wiki.js)，固定端口 3500。原来寄生在 3045 时
// cloud-api 端口池 first-available 分配，谁先 spawn 抢到 3045 谁就拿到 wiki 后台流量
// ——历史上多次串台。现在 wiki-api 不属于 cloud-api orchestration，端口稳定。
// 生产环境用 env WIKI_API_BASE_URL 显式覆盖（如改成对外域名）。
const DEFAULT_API_BASE_URL = "http://127.0.0.1:3500/api";
const FETCH_TIMEOUT_MS = 10_000;

@Injectable()
export class WikiAdminProxyService {
  private readonly logger = new Logger(WikiAdminProxyService.name);

  constructor(private readonly config: ConfigService) {}

  async listUsers(query: WikiUserListQuery): Promise<WikiUserListResponse> {
    const params = new URLSearchParams();
    if (query.q) params.set("q", query.q);
    if (typeof query.page === "number") params.set("page", String(query.page));
    if (typeof query.pageSize === "number")
      params.set("pageSize", String(query.pageSize));
    const qs = params.toString();
    const path = `/admin/wiki-users${qs ? `?${qs}` : ""}`;
    return this.proxyGet<WikiUserListResponse>(path);
  }

  async listPrivateCharacters(
    userId: string,
  ): Promise<WikiUserPrivateCharacterListResponse> {
    const encoded = encodeURIComponent(userId);
    return this.proxyGet<WikiUserPrivateCharacterListResponse>(
      `/admin/wiki-users/${encoded}/private-characters`,
    );
  }

  private getApiBase(): string {
    return (
      this.config.get<string>("WIKI_API_BASE_URL")?.trim()?.replace(/\/+$/, "") ||
      DEFAULT_API_BASE_URL
    );
  }

  private getSecret(): string {
    const secret = resolveWorldAdminSecret(this.config);
    if (!secret) {
      throw new InternalServerErrorException(
        "ADMIN_SECRET 未配置：cloud-api 既未在自己 .env 里声明，也读不到 api/.env。",
      );
    }
    return secret;
  }

  private async proxyGet<T>(path: string): Promise<T> {
    const base = this.getApiBase();
    const url = `${base}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(url, {
        method: "GET",
        headers: {
          "X-Admin-Secret": this.getSecret(),
          Accept: "application/json",
        },
        signal: controller.signal,
      });
    } catch (err) {
      this.logger.error(`proxyGet ${url} 网络失败：${(err as Error).message}`);
      throw new BadGatewayException(
        `无法连接到 api/（${base}）：${(err as Error).message}`,
      );
    } finally {
      clearTimeout(timer);
    }

    if (response.status === 404) {
      const message = await readErrorMessage(response, "目标资源不存在");
      throw new NotFoundException(message);
    }
    if (!response.ok) {
      const message = await readErrorMessage(response, "");
      this.logger.error(
        `proxyGet ${url} 返回 ${response.status}：${message.slice(0, 200)}`,
      );
      throw new BadGatewayException(
        message
          ? `api/ 响应 ${response.status}：${message.slice(0, 200)}`
          : `api/ 响应 ${response.status}`,
      );
    }

    try {
      return (await response.json()) as T;
    } catch (err) {
      throw new BadGatewayException(
        `api/ 返回非 JSON：${(err as Error).message}`,
      );
    }
  }
}

// api/ 错误返回的是 NestJS 标准结构：{statusCode, message, error, code, legacyMessage}。
// 直接把整个 JSON body 当字符串往 cloud-api 异常里塞 → 客户端拿到双层 JSON-in-JSON，
// 没法直接 toast 给运营看。这里只提取 message/legacyMessage，纯文本回退到 raw text。
async function readErrorMessage(
  response: Response,
  fallback: string,
): Promise<string> {
  let raw = "";
  try {
    raw = await response.text();
  } catch {
    return fallback;
  }
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const m =
      typeof parsed.message === "string"
        ? parsed.message
        : typeof parsed.legacyMessage === "string"
          ? parsed.legacyMessage
          : null;
    if (m) return m;
  } catch {
    // 非 JSON body（罕见，比如 nginx 502）就当纯文本展示
  }
  return raw.slice(0, 500);
}
// i18n-ignore-end
