import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { CloudWorldEntity } from "../entities/cloud-world.entity";

type CloudAlertWebhookEvent = "world_job_failed" | "world_provider_error";

interface CloudAlertWebhookPayload {
  event: CloudAlertWebhookEvent;
  occurredAt: string;
  title: string;
  summary: string;
  text: string;
  severity: "warning" | "critical";
  tags: string[];
  links: {
    adminUrl: string | null;
    apiBaseUrl: string | null;
  };
  world: {
    id: string;
    phone: string;
    name: string;
    status: string;
    desiredState: string;
    providerKey: string | null;
    apiBaseUrl: string | null;
    adminUrl: string | null;
    healthStatus: string | null;
    healthMessage: string | null;
    failureCode: string | null;
    failureMessage: string | null;
    retryCount: number;
  };
  context: Record<string, unknown>;
}

@Injectable()
export class CloudAlertNotifierService {
  private readonly logger = new Logger(CloudAlertNotifierService.name);
  private readonly webhookUrl: string | null;
  private readonly webhookToken: string | null;
  private readonly enabledEvents: Set<CloudAlertWebhookEvent>;
  private readonly timeoutMs: number;

  constructor(private readonly configService: ConfigService) {
    this.webhookUrl = this.normalizeUrl(this.configService.get<string>("CLOUD_ALERT_WEBHOOK_URL"));
    this.webhookToken = this.normalizeToken(this.configService.get<string>("CLOUD_ALERT_WEBHOOK_TOKEN"));
    this.enabledEvents = this.parseEnabledEvents(this.configService.get<string>("CLOUD_ALERT_WEBHOOK_EVENTS"));
    this.timeoutMs = this.parsePositiveInteger(
      this.configService.get<string>("CLOUD_ALERT_WEBHOOK_TIMEOUT_MS"),
      5000,
    );
  }

  async notifyJobFailed(
    world: CloudWorldEntity,
    context: {
      jobId: string;
      jobType: string;
      failureCode: string | null;
      failureMessage: string | null;
      attempt: number;
      maxAttempts: number;
    },
  ) {
    await this.send("world_job_failed", world, context);
  }

  async notifyProviderError(
    world: CloudWorldEntity,
    context: {
      source: string;
      deploymentState: string;
      providerMessage: string | null;
      rawStatus?: string | null;
    },
  ) {
    await this.send("world_provider_error", world, context);
  }

  private async send(
    event: CloudAlertWebhookEvent,
    world: CloudWorldEntity,
    context: Record<string, unknown>,
  ) {
    if (!this.webhookUrl || !this.enabledEvents.has(event)) {
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const presentation = this.buildPresentation(event, world, context);
    const payload: CloudAlertWebhookPayload = {
      event,
      occurredAt: new Date().toISOString(),
      title: presentation.title,
      summary: presentation.summary,
      text: presentation.summary,
      severity: presentation.severity,
      tags: presentation.tags,
      links: {
        adminUrl: world.adminUrl,
        apiBaseUrl: world.apiBaseUrl,
      },
      world: {
        id: world.id,
        phone: world.phone,
        name: world.name,
        status: world.status,
        desiredState: world.desiredState,
        providerKey: world.providerKey,
        apiBaseUrl: world.apiBaseUrl,
        adminUrl: world.adminUrl,
        healthStatus: world.healthStatus,
        healthMessage: world.healthMessage,
        failureCode: world.failureCode,
        failureMessage: world.failureMessage,
        retryCount: world.retryCount,
      },
      context,
    };

    try {
      const response = await fetch(this.webhookUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(this.webhookToken ? { authorization: `Bearer ${this.webhookToken}` } : {}),
          ...(this.webhookToken ? { "x-cloud-alert-token": this.webhookToken } : {}),
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) {
        this.logger.warn(
          `Cloud alert webhook returned ${response.status} for ${event}.`,
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown webhook error.";
      this.logger.warn(`Failed to deliver cloud alert webhook for ${event}: ${message}`);
    } finally {
      clearTimeout(timeout);
    }
  }

  private parseEnabledEvents(rawValue?: string | null) {
    const parsed = rawValue
      ?.split(",")
      .map((item) => item.trim())
      .filter(Boolean) as CloudAlertWebhookEvent[] | undefined;

    if (!parsed?.length) {
      return new Set<CloudAlertWebhookEvent>(["world_job_failed", "world_provider_error"]);
    }

    return new Set(
      parsed.filter(
        (item): item is CloudAlertWebhookEvent =>
          item === "world_job_failed" || item === "world_provider_error",
      ),
    );
  }

  private normalizeUrl(value?: string | null) {
    const normalized = value?.trim();
    return normalized ? normalized : null;
  }

  private normalizeToken(value?: string | null) {
    const normalized = value?.trim();
    return normalized ? normalized : null;
  }

  private parsePositiveInteger(rawValue: string | undefined, fallback: number) {
    const parsed = Number(rawValue ?? "");
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return fallback;
    }

    return Math.floor(parsed);
  }

  private buildPresentation(
    event: CloudAlertWebhookEvent,
    world: CloudWorldEntity,
    context: Record<string, unknown>,
  ) {
    if (event === "world_job_failed") {
      const jobType = this.readString(context.jobType) ?? "unknown";
      const attempt = this.readNumber(context.attempt);
      const maxAttempts = this.readNumber(context.maxAttempts);
      const failureMessage =
        this.readString(context.failureMessage) ??
        world.failureMessage ??
        "Lifecycle job failed without a detailed error message.";
      const attemptLabel =
        attempt !== null && maxAttempts !== null ? `第 ${attempt}/${maxAttempts} 次` : "最终一次";

      return {
        title: `云世界作业失败 | ${world.name}`,
        summary: [
          `世界 ${world.name}（${world.phone}）的 ${jobType} 作业失败。`,
          `${attemptLabel} 执行未恢复。`,
          `原因：${failureMessage}`,
          `当前状态：${world.status}，期望状态：${world.desiredState}。`,
        ].join(" "),
        severity: "critical" as const,
        tags: ["cloud-world", "job-failed", jobType],
      };
    }

    const source = this.readString(context.source) ?? "provider";
    const deploymentState = this.readString(context.deploymentState) ?? "error";
    const providerMessage =
      this.readString(context.providerMessage) ??
      world.failureMessage ??
      "Provider reported an error without a detailed message.";

    return {
      title: `云世界实例异常 | ${world.name}`,
      summary: [
        `世界 ${world.name}（${world.phone}）检测到 ${source} 异常。`,
        `部署状态：${deploymentState}。`,
        `原因：${providerMessage}`,
        `当前状态：${world.status}，Provider：${world.providerKey ?? "unknown"}。`,
      ].join(" "),
      severity: "critical" as const,
      tags: ["cloud-world", "provider-error", source],
    };
  }

  private readString(value: unknown) {
    return typeof value === "string" && value.trim().length ? value.trim() : null;
  }

  private readNumber(value: unknown) {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }
}
