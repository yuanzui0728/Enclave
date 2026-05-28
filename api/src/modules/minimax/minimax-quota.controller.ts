// i18n-ignore-start: admin-only diagnostics endpoint — JSON payload, no UI strings.
import { Controller, Get, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../admin/admin.guard';
import { TOKEN_PLAN_DAILY_LIMITS } from './minimax-quota.constants';
import { MinimaxQuotaService, type QuotaSnapshot } from './minimax-quota.service';

export interface MinimaxQuotaResponse {
  // Asia/Shanghai 计费日 yyyy-MM-dd
  date: string;
  // 每个 model 的当日 used / reserved / committed / limit / remaining（跨 key 求和的整池视图）
  byModel: Record<string, QuotaSnapshot>;
  // 按 token-plan key fingerprint 拆开（每把 plan 用各自 per-key 日限）→ 核对两把是否均衡
  byKey: Record<string, Record<string, QuotaSnapshot>>;
  // remaining ≤ 1 的 model（用于 admin 面板高亮）
  warnings: string[];
}

function shanghaiDateString(): string {
  const now = new Date();
  const shifted = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const d = String(shifted.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

@Controller('admin/minimax/quota')
@UseGuards(AdminGuard)
export class MinimaxQuotaController {
  constructor(private readonly quota: MinimaxQuotaService) {}

  @Get()
  async getQuota(): Promise<MinimaxQuotaResponse> {
    const [byModel, byKey] = await Promise.all([
      this.quota.snapshotToday(),
      this.quota.snapshotTodayByKey(),
    ]);
    const warnings: string[] = [];
    for (const model of Object.keys(TOKEN_PLAN_DAILY_LIMITS)) {
      if (byModel[model] && byModel[model].remaining <= 1) {
        warnings.push(model);
      }
    }
    return {
      date: shanghaiDateString(),
      byModel,
      byKey,
      warnings,
    };
  }
}

// i18n-ignore-end
