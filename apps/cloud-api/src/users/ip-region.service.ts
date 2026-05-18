// i18n-ignore-start: server-side log/admin payloads — not user-facing UI.
import { Injectable, Logger } from "@nestjs/common";
// 用 undici 自带的 fetch（而非 Node 内置的全局 fetch）：dispatcher 是 undici
// 私有 API，全局 fetch 用 Node 内部的 undici 版本，传入外部 undici 的
// dispatcher 会因为 onRequestStart 等接口不兼容而 TypeError。
import { fetch as undiciFetch, ProxyAgent } from "undici";
import {
  translateChineseCity,
  translateChineseRegion,
} from "./cn-region-i18n";

export interface IpRegionLookup {
  ip: string;
  countryCode: string | null;
  // country 字段维持 provider 原文（一般是英文，前端用 Intl.DisplayNames 本地化）。
  country: string | null;
  region: string | null;
  city: string | null;
  source: "ip-api.com" | "ipinfo.io" | "cache" | "unresolved";
}

interface CacheEntry {
  payload: Omit<IpRegionLookup, "source">;
  resolved: boolean;
  cachedAt: number;
}

// 解析成功的结果缓存 7 天；解析失败缓存 30 分钟避免被某个 dead provider 持续拖住。
const POSITIVE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const NEGATIVE_TTL_MS = 30 * 60 * 1000;
const FETCH_TIMEOUT_MS = 5000;

// Node 内置 fetch (undici) 默认不走 http_proxy/https_proxy 环境变量；ip-api.com
// 和 ipwho.is 的直连出口在本机网络环境下连不上（curl 不走代理时也 timeout），
// 必须通过本机的 Xray HTTP CONNECT 代理（127.0.0.1:10808）才能稳定出网。
function resolveProxyDispatcher(): ProxyAgent | undefined {
  const url =
    process.env.https_proxy ??
    process.env.HTTPS_PROXY ??
    process.env.http_proxy ??
    process.env.HTTP_PROXY;
  if (!url) return undefined;
  try {
    return new ProxyAgent(url);
  } catch {
    return undefined;
  }
}

const PROXY_DISPATCHER = resolveProxyDispatcher();

@Injectable()
export class IpRegionService {
  private readonly logger = new Logger(IpRegionService.name);
  private readonly cache = new Map<string, CacheEntry>();

  async resolve(rawIp: string): Promise<IpRegionLookup> {
    const ip = (rawIp ?? "").trim();
    if (!ip) {
      return this.unresolved(ip);
    }

    const cached = this.cache.get(ip);
    if (cached) {
      const ttl = cached.resolved ? POSITIVE_TTL_MS : NEGATIVE_TTL_MS;
      if (Date.now() - cached.cachedAt < ttl) {
        return { ...cached.payload, source: "cache" };
      }
    }

    // 首选 ip-api.com：lang=zh-CN 直接给中文国家/省/市，但 free tier 不支持
    // IPv6（403），fallback 到 ipinfo.io（IPv4 + IPv6 都支持，返回英文，
    // 由 cn-region-i18n 翻译成中文）。
    // ipwho.is 试过：Node fetch 即使走代理也固定回 "CORS not supported on
    // the Free plan"（headers 试遍都没用），所以不再列入 chain。
    const providers = [
      () => this.fetchIpApi(ip),
      () => this.fetchIpInfoIo(ip),
    ];

    for (const provider of providers) {
      try {
        const result = await provider();
        this.cache.set(ip, {
          payload: result,
          resolved: Boolean(result.countryCode || result.country),
          cachedAt: Date.now(),
        });
        return { ...result, source: result.source };
      } catch (error) {
        this.logger.warn(
          `IP region provider failed for ${ip}: ${(error as Error).message}`,
        );
      }
    }

    const fallback = this.unresolved(ip);
    this.cache.set(ip, {
      payload: { ...fallback },
      resolved: false,
      cachedAt: Date.now(),
    });
    return fallback;
  }

  private unresolved(ip: string): IpRegionLookup {
    return {
      ip,
      countryCode: null,
      country: null,
      region: null,
      city: null,
      source: "unresolved",
    };
  }

  private async fetchIpApi(ip: string): Promise<IpRegionLookup> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await undiciFetch(
        `http://ip-api.com/json/${encodeURIComponent(ip)}?lang=zh-CN&fields=status,message,country,countryCode,regionName,city`,
        { signal: controller.signal, dispatcher: PROXY_DISPATCHER },
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = (await response.json()) as {
        status?: string;
        message?: string;
        country?: string;
        countryCode?: string;
        // regionName 是省/州的完整名（lang=zh-CN 下是中文），不是 state code
        regionName?: string;
        city?: string;
      };
      if (data.status !== "success") {
        throw new Error(data.message ?? "ip-api lookup failed");
      }
      return {
        ip,
        countryCode: data.countryCode ?? null,
        country: data.country ?? null,
        region: data.regionName ?? null,
        city: data.city ?? null,
        source: "ip-api.com",
      };
    } finally {
      clearTimeout(timer);
    }
  }

  private async fetchIpInfoIo(ip: string): Promise<IpRegionLookup> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await undiciFetch(
        `https://ipinfo.io/${encodeURIComponent(ip)}/json`,
        { signal: controller.signal, dispatcher: PROXY_DISPATCHER },
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = (await response.json()) as {
        country?: string; // ipinfo 只回两位 country code
        region?: string;
        city?: string;
        bogon?: boolean;
      };
      if (data.bogon) throw new Error("bogon IP");
      // ipinfo.io region/city 永远是英文，国内的按词表翻译；国家保留 code
      // 让前端用 Intl.DisplayNames 转中文国家名。
      const isChina = (data.country ?? "").toUpperCase() === "CN";
      const region = isChina
        ? translateChineseRegion(data.region)
        : (data.region ?? null);
      const city = isChina
        ? translateChineseCity(data.city)
        : (data.city ?? null);
      return {
        ip,
        countryCode: data.country ?? null,
        country: null,
        region,
        city,
        source: "ipinfo.io",
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
// i18n-ignore-end
