import { Injectable, Logger, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { isSharedWorldMode } from './tenant-context';
import { INTERNAL_USER_PHONE_HEADER } from './internal-headers';
import { TenantService } from './tenant.service';

// 共享 world 的 HTTP 入口：从受信头读 phone → 在租户帧里跑后续处理链。
// LPP / wiki 进程 (非 shared 模式) 直接 next()，行为零变化。
// shared 模式缺头即 401 (fail-closed)，绝不让没有租户身份的请求落到 owner 查询。
@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  private readonly logger = new Logger(TenantContextMiddleware.name);

  constructor(private readonly tenantService: TenantService) {}

  use(request: Request, response: Response, next: NextFunction): void {
    if (!isSharedWorldMode()) {
      next();
      return;
    }

    const raw = request.headers[INTERNAL_USER_PHONE_HEADER];
    const phone = (Array.isArray(raw) ? raw[0] : raw)?.trim();
    if (!phone) {
      response.status(401).json({
        statusCode: 401,
        errorCode: 'TENANT_PHONE_MISSING',
        message: 'Missing tenant identity.', // i18n-ignore-line: internal trust-boundary error, never reaches end users
      });
      return;
    }

    // runAsTenant 在 ALS 帧里调 fn=next()，帧一直存活到响应 finish/close；下游
    // 同步+异步链都继承到这个 TenantContext。建档 (ensureOwnerForPhone) 在 next 前完成。
    void this.tenantService
      .runAsTenant(
        phone,
        () =>
          new Promise<void>((resolve) => {
            response.on('finish', resolve);
            response.on('close', resolve);
            next();
          }),
      )
      .catch((error) => {
        this.logger.error(
          `tenant context setup failed phone=${phone}: ${error instanceof Error ? error.message : String(error)}`,
        );
        if (!response.headersSent) {
          response.status(500).json({
            statusCode: 500,
            errorCode: 'TENANT_CONTEXT_SETUP_FAILED',
            message: 'Tenant context setup failed.', // i18n-ignore-line: internal error, never reaches end users
          });
        }
      });
  }
}
