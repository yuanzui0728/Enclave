import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { SubscriptionService } from "./subscription.service";

const SWEEP_INTERVAL_MS = 60 * 60 * 1000;

@Injectable()
export class SubscriptionSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SubscriptionSchedulerService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly subscription: SubscriptionService) {}

  async onModuleInit() {
    await this.runSweep();
    this.timer = setInterval(() => {
      void this.runSweep();
    }, SWEEP_INTERVAL_MS);
    if (this.timer.unref) {
      this.timer.unref();
    }
  }

  async onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async runSweep() {
    try {
      const expired = await this.subscription.expireDueSubscriptions();
      if (expired > 0) {
        this.logger.log(`Subscription sweep: ${expired} marked expired.`);
      }
    } catch (error) {
      this.logger.error(
        `Subscription sweep failed: ${(error as Error).message}`,
        (error as Error).stack,
      );
    }
  }
}
