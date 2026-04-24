import http from "node:http";

import type {
  ConnectorContactBundleRequest,
  ConnectorScanRequest,
  LocalUpstreamServiceKey,
} from "./contracts.js";
import type { ConnectorRuntime } from "./runtime.js";

export function createConnectorServer(runtime: ConnectorRuntime) {
  return http.createServer(async (request, response) => {
    applyCorsHeaders(request, response, runtime);

    if (request.method === "OPTIONS") {
      response.writeHead(204);
      response.end();
      return;
    }

    try {
      const url = new URL(
        request.url ?? "/",
        `http://${request.headers.host ?? "127.0.0.1"}`,
      );
      const method = request.method ?? "GET";

      if (method === "GET" && (url.pathname === "/" || url.pathname === "/health")) {
        sendJson(response, runtime.getHealth());
        return;
      }

      if (method === "GET" && url.pathname === "/api/config") {
        sendJson(response, runtime.getConfigResponse());
        return;
      }

      if (method === "PATCH" && url.pathname === "/api/config") {
        const body = await readJsonBody<{
          connectorLabel?: string;
          manualJsonPath?: string | null;
          providerKey?: "manual-json" | "wechat-decrypt-http" | "weflow-http";
          wechatDecryptBaseUrl?: string | null;
          weflowBaseUrl?: string | null;
          weflowAccessToken?: string | null;
        }>(request);
        sendJson(response, runtime.patchConfig(body ?? {}));
        return;
      }

      if (method === "POST" && url.pathname === "/api/scan") {
        const body = await readJsonBody<ConnectorScanRequest>(request);
        sendJson(response, await runtime.scan(body));
        return;
      }

      if (method === "GET" && url.pathname === "/api/contacts") {
        sendJson(
          response,
          runtime.listContacts({
            query: url.searchParams.get("query"),
            includeGroups: url.searchParams.get("includeGroups") === "true",
            limit: parseOptionalInteger(url.searchParams.get("limit")),
          }),
        );
        return;
      }

      if (method === "POST" && url.pathname === "/api/contact-bundles") {
        const body = await readJsonBody<ConnectorContactBundleRequest>(request);
        sendJson(response, await runtime.buildBundles(body ?? {}));
        return;
      }

      if (method === "GET" && url.pathname === "/api/upstream-services") {
        sendJson(response, await runtime.listUpstreamServices());
        return;
      }

      const startMatch = url.pathname.match(
        /^\/api\/upstream-services\/(wechat-decrypt|weflow)\/start$/u,
      );
      if (method === "POST" && startMatch) {
        sendJson(
          response,
          await runtime.startUpstreamService(startMatch[1] as LocalUpstreamServiceKey),
        );
        return;
      }

      sendJson(response, { error: "Not found" }, 404);
    } catch (error) {
      sendJson(
        response,
        {
          error: error instanceof Error ? error.message : String(error),
        },
        500,
      );
    }
  });
}

function applyCorsHeaders(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  runtime: ConnectorRuntime,
) {
  const origin = request.headers.origin;
  const allowOrigin = origin
    ? resolveAllowedOrigin(origin, runtime.getConfig().allowedOrigins)
    : null;

  if (allowOrigin) {
    response.setHeader("Access-Control-Allow-Origin", allowOrigin);
    response.setHeader("Vary", "Origin");
  }

  response.setHeader(
    "Access-Control-Allow-Methods",
    "GET,POST,PATCH,OPTIONS",
  );
  response.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type,Authorization",
  );
}

function resolveAllowedOrigin(origin: string, allowedOrigins: string[]) {
  if (allowedOrigins.includes(origin)) {
    return origin;
  }

  try {
    const url = new URL(origin);
    if (
      (url.hostname === "127.0.0.1" || url.hostname === "localhost") &&
      url.protocol === "http:"
    ) {
      return origin;
    }
  } catch {
    return null;
  }

  return null;
}

async function readJsonBody<T>(request: http.IncomingMessage): Promise<T | null> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) {
    return null;
  }

  return JSON.parse(raw) as T;
}

function sendJson(
  response: http.ServerResponse,
  payload: unknown,
  statusCode = 200,
) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(payload));
}

function parseOptionalInteger(value: string | null) {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : undefined;
}
