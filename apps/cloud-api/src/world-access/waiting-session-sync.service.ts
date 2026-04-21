import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { WorldAccessService } from "./world-access.service";

type WaitingSessionSyncTask = {
  key: string;
  context: string;
  run: () => Promise<void>;
};

@Injectable()
export class WaitingSessionSyncService implements OnModuleDestroy {
  private static readonly DEFAULT_RETRY_ATTEMPTS = 3;
  private static readonly DEFAULT_RETRY_DELAY_MS = 2_000;

  private readonly logger = new Logger(WaitingSessionSyncService.name);
  private readonly retryAttempts: number;
  private readonly retryDelayMs: number;
  private readonly scheduledRetries = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly worldAccessService: WorldAccessService,
    private readonly configService: ConfigService,
  ) {
    this.retryAttempts = this.parsePositiveInteger(
      this.configService.get<string>(
        "CLOUD_WAITING_SESSION_SYNC_RETRY_ATTEMPTS",
      ),
      WaitingSessionSyncService.DEFAULT_RETRY_ATTEMPTS,
    );
    this.retryDelayMs = this.parseNonNegativeInteger(
      this.configService.get<string>(
        "CLOUD_WAITING_SESSION_SYNC_RETRY_DELAY_MS",
      ),
      WaitingSessionSyncService.DEFAULT_RETRY_DELAY_MS,
    );
  }

  onModuleDestroy() {
    for (const timer of this.scheduledRetries.values()) {
      clearTimeout(timer);
    }
    this.scheduledRetries.clear();
  }

  async refreshWaitingSessionsForPhone(phone: string, context: string) {
    await this.runTask(
      {
        key: `refresh-phone:${phone}`,
        context,
        run: () => this.worldAccessService.refreshWaitingSessionsForPhone(phone),
      },
      1,
    );
  }

  async invalidateWaitingSessionsForPhone(phone: string, context: string) {
    await this.runTask(
      {
        key: `invalidate-phone:${phone}`,
        context,
        run: () =>
          this.worldAccessService.invalidateWaitingSessionsForPhone(phone),
      },
      1,
    );
  }

  async refreshWaitingSessionsForWorld(worldId: string, context: string) {
    await this.runTask(
      {
        key: `refresh-world:${worldId}`,
        context,
        run: () => this.worldAccessService.refreshWaitingSessionsForWorld(worldId),
      },
      1,
    );
  }

  private async runTask(task: WaitingSessionSyncTask, attempt: number) {
    try {
      await task.run();
      this.clearScheduledRetry(task.key);
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Unknown waiting session sync error.";
      const nextAttempt = attempt + 1;

      if (nextAttempt > this.retryAttempts) {
        this.clearScheduledRetry(task.key);
        this.logger.error(
          `Waiting session sync exhausted retries during ${task.context}: ${errorMessage}`,
        );
        return;
      }

      this.logger.warn(
        `Waiting session sync failed during ${task.context}: ${errorMessage}. Scheduling retry ${nextAttempt}/${this.retryAttempts}.`,
      );
      this.scheduleRetry(task, nextAttempt);
    }
  }

  private scheduleRetry(task: WaitingSessionSyncTask, attempt: number) {
    if (this.scheduledRetries.has(task.key)) {
      return;
    }

    const delayMs = this.retryDelayMs * Math.max(1, attempt - 1);
    const timer = setTimeout(() => {
      this.scheduledRetries.delete(task.key);
      void this.runTask(task, attempt);
    }, delayMs);
    timer.unref?.();
    this.scheduledRetries.set(task.key, timer);
  }

  private clearScheduledRetry(key: string) {
    const timer = this.scheduledRetries.get(key);
    if (!timer) {
      return;
    }

    clearTimeout(timer);
    this.scheduledRetries.delete(key);
  }

  private parsePositiveInteger(rawValue: string | undefined, fallback: number) {
    if (!rawValue) {
      return fallback;
    }

    const parsed = Number.parseInt(rawValue, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  private parseNonNegativeInteger(
    rawValue: string | undefined,
    fallback: number,
  ) {
    if (!rawValue) {
      return fallback;
    }

    const parsed = Number.parseInt(rawValue, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
  }
}
