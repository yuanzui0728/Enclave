import { getSystemStatus, resolveCoreApiBaseUrl } from "@yinjie/contracts";

type WorldEndpointProbe = {
  body: string;
  ok: boolean;
  status: number;
};

function joinBaseUrl(baseUrl: string, path: string) {
  return `${baseUrl.replace(/\/+$/, "")}${path}`;
}

async function probeWorldEndpoint(baseUrl: string, path: string): Promise<WorldEndpointProbe | null> {
  const resolvedBaseUrl = resolveCoreApiBaseUrl(baseUrl, { allowDefault: false }) ?? baseUrl;

  try {
    const response = await fetch(joinBaseUrl(resolvedBaseUrl, path), {
      cache: "no-store",
      headers: {
        Accept: "application/json, text/plain, text/html",
      },
    });
    const body = await response.text();

    return {
      body: body.trim(),
      ok: response.ok,
      status: response.status,
    };
  } catch {
    return null;
  }
}

export async function assertWorldReachable(baseUrl: string) {
  try {
    const status = await getSystemStatus(baseUrl);
    if (!status.coreApi.healthy) {
      throw new Error(status.coreApi.message?.trim() || "当前世界实例暂时不可用，请稍后再试。");
    }

    return status;
  } catch (error) {
    const [healthzProbe, healthProbe] = await Promise.all([
      probeWorldEndpoint(baseUrl, "/healthz"),
      probeWorldEndpoint(baseUrl, "/health"),
    ]);
    const worldEntryHealthy =
      healthzProbe?.ok && healthzProbe.body.toLowerCase() === "ok";

    if (worldEntryHealthy && healthProbe?.status === 502) {
      throw new Error(
        "世界入口页面可访问，但 Core API 当前不可用（/health 返回 502 Bad Gateway）。请确认后端服务已启动，并检查反向代理是否仍将 /api 和 /health 转发到 api:3000。",
      );
    }

    if (worldEntryHealthy && healthProbe && healthProbe.status >= 500) {
      throw new Error(
        `世界入口页面可访问，但 Core API 当前不可用（/health 返回 ${healthProbe.status}）。请确认后端服务已启动，并检查反向代理的 API 转发配置。`,
      );
    }

    throw error;
  }
}
