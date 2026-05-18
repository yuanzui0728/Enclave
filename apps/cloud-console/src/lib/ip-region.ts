import { useQuery } from "@tanstack/react-query";
import { cloudAdminApi } from "./cloud-admin-api";

export interface IpRegionInfo {
  // 用于直接渲染的人类可读地区文案（已尽量本地化为中文国家名 + 省市）
  display: string;
  countryCode: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
}

// 私网/保留段：直接本地判断，省一次后端调用
function classifyLocalIp(ip: string): IpRegionInfo | null {
  const trimmed = ip.trim();
  if (!trimmed) return null;
  if (trimmed === "::1" || trimmed.startsWith("127.")) return makeLocal("本机");
  if (trimmed.startsWith("10.")) return makeLocal("内网 (10/8)");
  if (trimmed.startsWith("192.168.")) return makeLocal("内网 (192.168/16)");
  if (trimmed.startsWith("169.254.")) return makeLocal("链路本地 (169.254/16)");
  const m172 = trimmed.match(/^172\.(\d{1,3})\./);
  if (m172) {
    const second = Number(m172[1]);
    if (second >= 16 && second <= 31) return makeLocal("内网 (172.16/12)");
  }
  // CGNAT 100.64.0.0/10：中国移动/联通 4G/5G 客户端常见
  const m100 = trimmed.match(/^100\.(\d{1,3})\./);
  if (m100) {
    const second = Number(m100[1]);
    if (second >= 64 && second <= 127) return makeLocal("CGNAT (100.64/10)");
  }
  // IPv6 link-local fe80::/10, unique-local fc00::/7
  if (/^fe[89ab][0-9a-f]?:/i.test(trimmed)) return makeLocal("IPv6 链路本地");
  if (/^f[cd][0-9a-f]{2}:/i.test(trimmed)) return makeLocal("IPv6 ULA");
  if (/^(::ffff:)?(0\.|255\.)/.test(trimmed)) return makeLocal("保留段");
  return null;
}

function makeLocal(label: string): IpRegionInfo {
  return {
    display: label,
    countryCode: null,
    country: null,
    region: null,
    city: null,
  };
}

let regionDisplayNames: Intl.DisplayNames | null | undefined;
function getRegionDisplayNames(): Intl.DisplayNames | null {
  if (regionDisplayNames !== undefined) return regionDisplayNames;
  try {
    regionDisplayNames = new Intl.DisplayNames(["zh-CN"], { type: "region" });
  } catch {
    regionDisplayNames = null;
  }
  return regionDisplayNames;
}

function localizeCountry(
  countryCode: string | undefined | null,
  fallback: string | undefined | null,
): string | null {
  if (countryCode) {
    const names = getRegionDisplayNames();
    if (names) {
      try {
        const localized = names.of(countryCode.toUpperCase());
        if (localized && localized.toUpperCase() !== countryCode.toUpperCase())
          return localized;
      } catch {
        // ignore
      }
    }
  }
  return fallback?.trim() || null;
}

function composeDisplay(
  info: Omit<IpRegionInfo, "display">,
  ipFallback: string,
): string {
  const parts: string[] = [];
  if (info.country) parts.push(info.country);
  if (info.region && info.region !== info.country) parts.push(info.region);
  if (info.city && info.city !== info.region) parts.push(info.city);
  // 后端解析失败 / 所有字段都空时，退回展示原始 IP
  return parts.length ? parts.join(" · ") : ipFallback;
}

async function fetchIpRegion(ip: string): Promise<IpRegionInfo> {
  const local = classifyLocalIp(ip);
  if (local) return local;

  // 走 cloud-api 代理：浏览器到 ipwho.is/ipinfo.io 在国内常被墙，
  // 服务器侧出口更稳；同时缓存集中，避免每个操作员各自命中。
  const lookup = await cloudAdminApi.lookupIpRegion(ip);
  const country = localizeCountry(lookup.countryCode, lookup.country);
  const info = {
    countryCode: lookup.countryCode ?? null,
    country,
    region: lookup.region ?? null,
    city: lookup.city ?? null,
  };
  return { ...info, display: composeDisplay(info, ip) };
}

export function useIpRegion(ip: string | null | undefined) {
  const trimmed = typeof ip === "string" ? ip.trim() : "";
  return useQuery({
    // version key 用于在 provider chain / 翻译规则升级后强制 invalidate 旧 cache，
    // 否则 staleTime=Infinity 会让浏览器继续吐之前那条英文结果。
    queryKey: ["ip-region", "v3", trimmed],
    queryFn: () => fetchIpRegion(trimmed),
    enabled: Boolean(trimmed),
    // 同一 IP 解析结果几乎不变（后端也有 7 天缓存），前端长期复用
    staleTime: Infinity,
    gcTime: Infinity,
    retry: 1,
  });
}
