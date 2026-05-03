import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { CloudConfigEntity } from "../entities/cloud-config.entity";

const CACHE_TTL_MS = 5 * 1000;

@Injectable()
export class CloudConfigService {
  private readonly logger = new Logger(CloudConfigService.name);
  private cache: Map<string, { value: unknown; expiresAt: number }> = new Map();

  constructor(
    @InjectRepository(CloudConfigEntity)
    private readonly configRepo: Repository<CloudConfigEntity>,
  ) {}

  async getString(key: string, fallback: string): Promise<string> {
    const value = await this.getValue(key);
    if (typeof value === "string") return value;
    return fallback;
  }

  async getBoolean(key: string, fallback: boolean): Promise<boolean> {
    const value = await this.getValue(key);
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      if (value === "true") return true;
      if (value === "false") return false;
    }
    return fallback;
  }

  async getNumber(key: string, fallback: number): Promise<number> {
    const value = await this.getValue(key);
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
    return fallback;
  }

  async getNullableString(key: string, fallback: string | null = null): Promise<string | null> {
    const value = await this.getValue(key);
    if (value === null) return null;
    if (typeof value === "string") return value;
    return fallback;
  }

  async getValue(key: string): Promise<unknown> {
    const now = Date.now();
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > now) {
      return cached.value;
    }

    const entry = await this.configRepo.findOne({ where: { key } });
    if (!entry) {
      this.cache.set(key, { value: undefined, expiresAt: now + CACHE_TTL_MS });
      return undefined;
    }
    let parsed: unknown = entry.value;
    try {
      parsed = JSON.parse(entry.value);
    } catch {
      // 兼容历史纯字符串值
      parsed = entry.value;
    }
    this.cache.set(key, { value: parsed, expiresAt: now + CACHE_TTL_MS });
    return parsed;
  }

  async listAll(): Promise<{ key: string; value: unknown; description: string | null; updatedBy: string | null; updatedAt: string }[]> {
    const entries = await this.configRepo.find({ order: { key: "ASC" } });
    return entries.map((entry) => {
      let value: unknown = entry.value;
      try {
        value = JSON.parse(entry.value);
      } catch {
        value = entry.value;
      }
      return {
        key: entry.key,
        value,
        description: entry.description,
        updatedBy: entry.updatedBy,
        updatedAt: entry.updatedAt.toISOString(),
      };
    });
  }

  async upsert(key: string, value: unknown, description?: string | null, updatedBy?: string | null) {
    const serialized = JSON.stringify(value ?? null);
    const existing = await this.configRepo.findOne({ where: { key } });
    if (existing) {
      existing.value = serialized;
      if (description !== undefined) {
        existing.description = description;
      }
      existing.updatedBy = updatedBy ?? null;
      await this.configRepo.save(existing);
    } else {
      await this.configRepo.save(
        this.configRepo.create({
          key,
          value: serialized,
          description: description ?? null,
          updatedBy: updatedBy ?? null,
        }),
      );
    }
    this.cache.delete(key);
    this.logger.log(`Cloud config updated: ${key}`);
    const refreshed = await this.configRepo.findOne({ where: { key } });
    if (!refreshed) {
      throw new Error("Failed to upsert cloud config.");
    }
    let parsedValue: unknown = refreshed.value;
    try {
      parsedValue = JSON.parse(refreshed.value);
    } catch {
      parsedValue = refreshed.value;
    }
    return {
      key: refreshed.key,
      value: parsedValue,
      description: refreshed.description,
      updatedBy: refreshed.updatedBy,
      updatedAt: refreshed.updatedAt.toISOString(),
    };
  }
}
