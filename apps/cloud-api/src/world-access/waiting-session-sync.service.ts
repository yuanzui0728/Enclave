import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { randomUUID } from "node:crypto";
import { In, Repository } from "typeorm";
import { WaitingSessionSyncTaskEntity } from "../entities/waiting-session-sync-task.entity";
import { WorldAccessService } from "./world-access.service";

type WaitingSessionSyncTaskType =
  | "refresh_phone"
  | "invalidate_phone"
  | "refresh_world";

type WaitingSessionSyncTask = {
  key: string;
  taskType: WaitingSessionSyncTaskType;
  targetValue: string;
  context: string;
  run: () => Promise<void>;
};

@Injectable()
export class WaitingSessionSyncService
  implements OnModuleInit, OnModuleDestroy
{
  private static readonly DEFAULT_RETRY_ATTEMPTS = 3;
  private static readonly DEFAULT_RETRY_DELAY_MS = 2_000;
  private static readonly DEFAULT_POLL_INTERVAL_MS = 1_500;
  private static readonly DEFAULT_LEASE_SECONDS = 30;
  private static readonly MAX_TASK_CLAIM_ATTEMPTS = 5;

  private readonly logger = new Logger(WaitingSessionSyncService.name);
  private readonly retryAttempts: number;
  private readonly retryDelayMs: number;
  private readonly pollIntervalMs: number;
  private readonly leaseSeconds: number;
  private readonly workerId = randomUUID();
  private readonly scheduledWakeups = new Map<string, NodeJS.Timeout>();
  private pollTimer: NodeJS.Timeout | null = null;
  private processing = false;

  constructor(
    @InjectRepository(WaitingSessionSyncTaskEntity)
    private readonly taskRepo: Repository<WaitingSessionSyncTaskEntity>,
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
    this.pollIntervalMs = this.parsePositiveInteger(
      this.configService.get<string>(
        "CLOUD_WAITING_SESSION_SYNC_POLL_INTERVAL_MS",
      ),
      WaitingSessionSyncService.DEFAULT_POLL_INTERVAL_MS,
    );
    this.leaseSeconds = this.parsePositiveInteger(
      this.configService.get<string>(
        "CLOUD_WAITING_SESSION_SYNC_LEASE_SECONDS",
      ),
      WaitingSessionSyncService.DEFAULT_LEASE_SECONDS,
    );
  }

  onModuleInit() {
    this.pollTimer = setInterval(() => {
      void this.processPendingTasks();
    }, this.pollIntervalMs);
    this.pollTimer.unref?.();
    void this.processPendingTasks();
  }

  onModuleDestroy() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    for (const timer of this.scheduledWakeups.values()) {
      clearTimeout(timer);
    }
    this.scheduledWakeups.clear();
  }

  async refreshWaitingSessionsForPhone(phone: string, context: string) {
    await this.executeTask({
      key: `refresh-phone:${phone}`,
      taskType: "refresh_phone",
      targetValue: phone,
      context,
      run: () => this.worldAccessService.refreshWaitingSessionsForPhone(phone),
    });
  }

  async invalidateWaitingSessionsForPhone(phone: string, context: string) {
    await this.executeTask({
      key: `invalidate-phone:${phone}`,
      taskType: "invalidate_phone",
      targetValue: phone,
      context,
      run: () =>
        this.worldAccessService.invalidateWaitingSessionsForPhone(phone),
    });
  }

  async refreshWaitingSessionsForWorld(worldId: string, context: string) {
    await this.executeTask({
      key: `refresh-world:${worldId}`,
      taskType: "refresh_world",
      targetValue: worldId,
      context,
      run: () => this.worldAccessService.refreshWaitingSessionsForWorld(worldId),
    });
  }

  async replayFailedTasks(taskIds: string[]) {
    const tasks = await this.taskRepo.find({
      where: {
        id: In(taskIds),
      },
    });
    const tasksById = new Map(tasks.map((task) => [task.id, task]));
    const replayedTaskIds: string[] = [];
    const skippedTaskIds: string[] = [];
    const availableAt = new Date();

    for (const taskId of taskIds) {
      const task = tasksById.get(taskId);
      if (!task || task.status !== "failed") {
        skippedTaskIds.push(taskId);
        continue;
      }

      replayedTaskIds.push(taskId);
    }

    if (replayedTaskIds.length > 0) {
      await this.taskRepo.save(
        replayedTaskIds.map((taskId) => {
          const task = tasksById.get(taskId)!;
          return this.taskRepo.create({
            id: task.id,
            taskKey: task.taskKey,
            taskType: task.taskType,
            targetValue: task.targetValue,
            context: task.context,
            attempt: 0,
            maxAttempts: task.maxAttempts,
            status: "pending",
            availableAt,
            leaseOwner: null,
            leaseExpiresAt: null,
            lastError: task.lastError,
            finishedAt: null,
          });
        }),
      );
      void this.processPendingTasks();
    }

    return {
      success: true as const,
      replayedTaskIds,
      skippedTaskIds,
    };
  }

  async clearFailedTasks(taskIds: string[]) {
    const tasks = await this.taskRepo.find({
      where: {
        id: In(taskIds),
      },
    });
    const tasksById = new Map(tasks.map((task) => [task.id, task]));
    const clearedTaskIds: string[] = [];
    const skippedTaskIds: string[] = [];

    for (const taskId of taskIds) {
      const task = tasksById.get(taskId);
      if (!task || task.status !== "failed") {
        skippedTaskIds.push(taskId);
        continue;
      }

      clearedTaskIds.push(taskId);
      this.clearWakeup(task.taskKey);
    }

    if (clearedTaskIds.length > 0) {
      await this.taskRepo.delete({
        id: In(clearedTaskIds),
      });
    }

    return {
      success: true as const,
      clearedTaskIds,
      skippedTaskIds,
    };
  }

  private async executeTask(task: WaitingSessionSyncTask) {
    try {
      await task.run();
      await this.completeTask(task.key);
    } catch (error) {
      await this.recordFailedAttempt(task, 1, error);
    }
  }

  private async processPendingTasks() {
    if (this.processing) {
      return;
    }

    this.processing = true;
    try {
      while (true) {
        const persistedTask = await this.claimNextPendingTask();
        if (!persistedTask) {
          break;
        }

        await this.executePersistedTask(persistedTask);
      }
    } finally {
      this.processing = false;
    }
  }

  private async claimNextPendingTask() {
    for (
      let attempt = 0;
      attempt < WaitingSessionSyncService.MAX_TASK_CLAIM_ATTEMPTS;
      attempt += 1
    ) {
      const now = new Date();
      const candidate = await this.taskRepo
        .createQueryBuilder("task")
        .where("task.status IN (:...statuses)", {
          statuses: ["pending", "running"],
        })
        .andWhere("task.availableAt <= :now", { now })
        .andWhere(
          "(task.leaseExpiresAt IS NULL OR task.leaseExpiresAt <= :now)",
          { now },
        )
        .orderBy("task.availableAt", "ASC")
        .addOrderBy("task.createdAt", "ASC")
        .getOne();

      if (!candidate) {
        return null;
      }

      const leaseExpiresAt = new Date(now.getTime() + this.leaseSeconds * 1000);
      const result = await this.taskRepo
        .createQueryBuilder()
        .update(WaitingSessionSyncTaskEntity)
        .set({
          status: "running",
          leaseOwner: this.workerId,
          leaseExpiresAt,
        })
        .where("id = :id", { id: candidate.id })
        .andWhere("status IN (:...statuses)", {
          statuses: ["pending", "running"],
        })
        .andWhere("availableAt <= :now", { now })
        .andWhere(
          "(leaseExpiresAt IS NULL OR leaseExpiresAt <= :now)",
          { now },
        )
        .execute();

      if ((result.affected ?? 0) !== 1) {
        continue;
      }

      candidate.leaseOwner = this.workerId;
      candidate.leaseExpiresAt = leaseExpiresAt;
      candidate.status = "running";
      return candidate;
    }

    return null;
  }

  private async executePersistedTask(taskEntity: WaitingSessionSyncTaskEntity) {
    const task = this.buildTask(taskEntity);
    const attempt = taskEntity.attempt + 1;

    try {
      await task.run();
      await this.completeTask(task.key);
    } catch (error) {
      await this.recordFailedAttempt(task, attempt, error, taskEntity);
    }
  }

  private buildTask(taskEntity: WaitingSessionSyncTaskEntity): WaitingSessionSyncTask {
    switch (taskEntity.taskType as WaitingSessionSyncTaskType) {
      case "refresh_phone":
        return {
          key: taskEntity.taskKey,
          taskType: "refresh_phone",
          targetValue: taskEntity.targetValue,
          context: taskEntity.context,
          run: () =>
            this.worldAccessService.refreshWaitingSessionsForPhone(
              taskEntity.targetValue,
            ),
        };
      case "invalidate_phone":
        return {
          key: taskEntity.taskKey,
          taskType: "invalidate_phone",
          targetValue: taskEntity.targetValue,
          context: taskEntity.context,
          run: () =>
            this.worldAccessService.invalidateWaitingSessionsForPhone(
              taskEntity.targetValue,
            ),
        };
      case "refresh_world":
      default:
        return {
          key: taskEntity.taskKey,
          taskType: "refresh_world",
          targetValue: taskEntity.targetValue,
          context: taskEntity.context,
          run: () =>
            this.worldAccessService.refreshWaitingSessionsForWorld(
              taskEntity.targetValue,
            ),
        };
    }
  }

  private async recordFailedAttempt(
    task: WaitingSessionSyncTask,
    attempt: number,
    error: unknown,
    persistedTask?: WaitingSessionSyncTaskEntity,
  ) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : "Unknown waiting session sync error.";
    const currentTask =
      persistedTask ??
      (await this.taskRepo.findOne({
        where: { taskKey: task.key },
      }));

    if (attempt >= this.retryAttempts) {
      await this.taskRepo.save(
        this.taskRepo.create({
          id: currentTask?.id,
          taskKey: task.key,
          taskType: task.taskType,
          targetValue: task.targetValue,
          context: task.context,
          attempt,
          maxAttempts: this.retryAttempts,
          status: "failed",
          availableAt:
            currentTask?.availableAt ??
            new Date(),
          leaseOwner: null,
          leaseExpiresAt: null,
          lastError: errorMessage,
          finishedAt: new Date(),
        }),
      );
      this.clearWakeup(task.key);
      this.logger.error(
        `Waiting session sync exhausted retries during ${task.context}: ${errorMessage}`,
      );
      return;
    }

    const availableAt = new Date(
      Date.now() + this.retryDelayMs * Math.max(1, attempt),
    );
    const nextAttempt = attempt + 1;

    await this.taskRepo.save(
      this.taskRepo.create({
        id: currentTask?.id,
        taskKey: task.key,
        taskType: task.taskType,
        targetValue: task.targetValue,
        context: task.context,
        attempt,
        maxAttempts: this.retryAttempts,
        status: "pending",
        availableAt,
        leaseOwner: null,
        leaseExpiresAt: null,
        lastError: errorMessage,
        finishedAt: null,
      }),
    );

    this.logger.warn(
      `Waiting session sync failed during ${task.context}: ${errorMessage}. Scheduling persistent retry ${nextAttempt}/${this.retryAttempts}.`,
    );
    this.scheduleWakeup(task.key, availableAt);
  }

  private async completeTask(taskKey: string) {
    this.clearWakeup(taskKey);
    await this.taskRepo.delete({ taskKey });
  }

  private scheduleWakeup(taskKey: string, availableAt: Date) {
    this.clearWakeup(taskKey);
    const delayMs = Math.max(0, availableAt.getTime() - Date.now());
    const timer = setTimeout(() => {
      this.scheduledWakeups.delete(taskKey);
      void this.processPendingTasks();
    }, delayMs);
    timer.unref?.();
    this.scheduledWakeups.set(taskKey, timer);
  }

  private clearWakeup(taskKey: string) {
    const timer = this.scheduledWakeups.get(taskKey);
    if (!timer) {
      return;
    }

    clearTimeout(timer);
    this.scheduledWakeups.delete(taskKey);
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
