import { randomUUID } from "node:crypto";
import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import express from "express";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { AppModule } from "./app.module";
import { CloudApiExceptionFilter } from "./i18n/cloud-api-exception.filter";
import { WorldApiProxyService } from "./world-api-proxy/world-api-proxy.service";
import { setupWorldApiWsProxy } from "./world-api-proxy/world-api-ws-proxy";

const WORLD_API_PROXY_PATH_REGEX = /^\/cloud\/world-api(\/|$|\?)/;

// world-api 反代路径要把 raw stream pipe 给 child process，express.json 把
// body 解析成对象后 IncomingMessage 就读不出来了；这里把 body parser 包一层，
// 让反代路径直接跳过解析，其他路径行为不变。
function skipBodyParserForProxy(handler: RequestHandler): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    if (WORLD_API_PROXY_PATH_REGEX.test(req.url)) {
      return next();
    }
    return handler(req, res, next);
  };
}

// socket.io polling 把 cloud token 放在 query (?token=...)，CloudClientAuthGuard
// 只读 Authorization header → 直接 401。反代路径下，这里把 query token 复制成
// header，让 guard 和反代 controller 都能识别。注意只对 /cloud/world-api/*
// 生效，其他 endpoint 仍然必须显式带 Authorization header。
function rewriteWorldApiQueryTokenToHeader(): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!WORLD_API_PROXY_PATH_REGEX.test(req.url)) return next();
    if (req.headers["authorization"]) return next();
    try {
      const url = new URL(req.url, "http://x");
      const queryToken =
        url.searchParams.get("token") || url.searchParams.get("auth_token");
      if (queryToken) {
        req.headers["authorization"] = `Bearer ${queryToken.trim()}`;
      }
    } catch {
      // bad URL, leave as-is and let guard reject
    }
    next();
  };
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  // 启用 express 的 trust proxy，让 req.ip 解析 X-Forwarded-For；
  // 这是 extractIp() 兜底链里 req.ip 那一跳能拿到真实客户端 IP 的前提。
  // 反向代理（nginx）在本机回环上，所以 trust = true（信任所有上游）即可；
  // 公网入口我们不直接暴露 cloud-api，没有 spoof 风险。
  app.getHttpAdapter().getInstance().set("trust proxy", true);
  app.use(rewriteWorldApiQueryTokenToHeader());
  app.use(skipBodyParserForProxy(express.json({ limit: "32mb" })));
  app.use(
    skipBodyParserForProxy(
      express.urlencoded({ extended: true, limit: "32mb" }),
    ),
  );
  app.use((request, response, next) => {
    const incomingRequestId =
      typeof request.header === "function"
        ? request.header("X-Request-Id")?.trim()
        : "";
    const requestId = incomingRequestId || randomUUID();
    response.setHeader("X-Request-Id", requestId);
    next();
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      validationError: {
        target: false,
        value: false,
      },
    }),
  );
  app.useGlobalFilters(new CloudApiExceptionFilter());
  app.enableCors({
    origin: true,
    credentials: false,
    exposedHeaders: ["X-Request-Id"],
  });
  // 拿原生 http.Server 后挂 'upgrade' listener 做 world-api ws 反代。Nest 自身
  // 不解析 ws，要在 listen 前挂上，否则客户端 socket.io 升级会被默认 502。
  await app.init();
  const httpServer = app.getHttpServer();
  setupWorldApiWsProxy(
    httpServer,
    app.get(JwtService),
    app.get(ConfigService),
    app.get(WorldApiProxyService),
  );
  await app.listen(process.env.PORT ? Number(process.env.PORT) : 3001);
}

void bootstrap();
