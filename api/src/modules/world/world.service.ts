import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SystemConfigService } from '../config/config.service';
import {
  DEFAULT_REPLY_LOGIC_RUNTIME_RULES,
  REPLY_LOGIC_RUNTIME_RULES_CONFIG_KEY,
  normalizeReplyLogicRuntimeRules,
  type ReplyLogicRuntimeRules,
} from '../ai/reply-logic.constants';
import { WorldContextEntity } from './world-context.entity';

function renderTemplate(
  template: string,
  variables: Record<string, string | undefined | null>,
) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) =>
    variables[key] == null ? '' : String(variables[key]),
  );
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

@Injectable()
export class WorldService {
  private readonly logger = new Logger(WorldService.name);

  constructor(
    @InjectRepository(WorldContextEntity)
    private repo: Repository<WorldContextEntity>,
    private readonly systemConfig: SystemConfigService,
  ) {}

  async snapshot(): Promise<WorldContextEntity> {
    const snapshot = await this.createSnapshot();
    return this.repo.save(this.repo.create(snapshot));
  }

  async createSnapshot(): Promise<Partial<WorldContextEntity>> {
    const now = new Date();
    const hour = now.getHours();
    const month = now.getMonth() + 1;
    const runtimeRules = await this.getRuntimeRules();
    const timeOfDay = this.resolveTimeOfDayLabel(hour, runtimeRules);
    const season = this.resolveSeasonLabel(month, runtimeRules);

    return {
      localTime: renderTemplate(runtimeRules.worldContextRules.localTimeTemplate, {
        timeOfDay,
        hour: String(now.getHours()),
        minute: String(now.getMinutes()).padStart(2, '0'),
      }),
      season,
      weather: this.getSimulatedWeather(now, season, hour, runtimeRules),
      holiday: this.getHoliday(now, runtimeRules),
    };
  }

  async getLatest(): Promise<WorldContextEntity | null> {
    return this.repo.findOne({
      where: {},
      order: { timestamp: 'DESC' },
    });
  }

  async buildContextString(ctx: WorldContextEntity | null): Promise<string> {
    if (!ctx) {
      return '';
    }

    const runtimeRules = await this.getRuntimeRules();
    const parts: string[] = [
      renderTemplate(runtimeRules.worldContextRules.contextFieldTemplates.currentTime, {
        localTime: ctx.localTime,
      }),
    ];

    if (ctx.season) {
      parts.push(
        renderTemplate(runtimeRules.worldContextRules.contextFieldTemplates.season, {
          season: ctx.season,
        }),
      );
    }
    if (ctx.weather) {
      parts.push(
        renderTemplate(runtimeRules.worldContextRules.contextFieldTemplates.weather, {
          weather: ctx.weather,
        }),
      );
    }
    if (ctx.location) {
      parts.push(
        renderTemplate(runtimeRules.worldContextRules.contextFieldTemplates.location, {
          location: ctx.location,
        }),
      );
    }
    if (ctx.holiday) {
      parts.push(
        renderTemplate(runtimeRules.worldContextRules.contextFieldTemplates.holiday, {
          holiday: ctx.holiday,
        }),
      );
    }

    return parts.join(runtimeRules.worldContextRules.contextSeparator);
  }

  async buildPromptContextBlock(ctx: WorldContextEntity | null): Promise<string> {
    const context = await this.buildContextString(ctx);
    if (!context) {
      return '';
    }

    const runtimeRules = await this.getRuntimeRules();
    return renderTemplate(runtimeRules.worldContextRules.promptContextTemplate, {
      context,
    });
  }

  async getCurrentTimeReplacementPattern(): Promise<RegExp | null> {
    const runtimeRules = await this.getRuntimeRules();
    const template =
      runtimeRules.worldContextRules.contextFieldTemplates.currentTime;
    const placeholderIndex = template.indexOf('{{');
    const prefix = (placeholderIndex >= 0
      ? template.slice(0, placeholderIndex)
      : template
    ).trim();
    if (!prefix) {
      return null;
    }

    return new RegExp(`${escapeRegExp(prefix)}[^\\n]*`);
  }

  private async getRuntimeRules() {
    const raw = await this.systemConfig.getConfig(
      REPLY_LOGIC_RUNTIME_RULES_CONFIG_KEY,
    );
    if (!raw) {
      return DEFAULT_REPLY_LOGIC_RUNTIME_RULES;
    }

    try {
      const parsed = JSON.parse(raw) as Partial<ReplyLogicRuntimeRules>;
      return normalizeReplyLogicRuntimeRules(parsed);
    } catch {
      this.logger.warn(
        `Failed to parse ${REPLY_LOGIC_RUNTIME_RULES_CONFIG_KEY}, using defaults.`,
      );
      return DEFAULT_REPLY_LOGIC_RUNTIME_RULES;
    }
  }

  private getHoliday(
    date: Date,
    runtimeRules: Awaited<ReturnType<WorldService['getRuntimeRules']>>,
  ): string | undefined {
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return runtimeRules.worldContextRules.holidays.find(
      (item) => item.month === month && item.day === day,
    )?.label;
  }

  private getSimulatedWeather(
    date: Date,
    season: string,
    hour: number,
    runtimeRules: Awaited<ReturnType<WorldService['getRuntimeRules']>>,
  ): string {
    const period = hour < 6 ? 0 : hour < 12 ? 1 : hour < 18 ? 2 : 3;
    const seed = date.getMonth() * 31 + date.getDate() + period;
    const weatherOptions = this.resolveWeatherOptions(season, runtimeRules);
    return weatherOptions[seed % weatherOptions.length] ?? '多云';
  }

  private resolveSeasonLabel(
    month: number,
    runtimeRules: Awaited<ReturnType<WorldService['getRuntimeRules']>>,
  ) {
    if (month >= 3 && month <= 5) {
      return runtimeRules.worldContextRules.seasonLabels.spring;
    }
    if (month >= 6 && month <= 8) {
      return runtimeRules.worldContextRules.seasonLabels.summer;
    }
    if (month >= 9 && month <= 11) {
      return runtimeRules.worldContextRules.seasonLabels.autumn;
    }
    return runtimeRules.worldContextRules.seasonLabels.winter;
  }

  private resolveWeatherOptions(
    season: string,
    runtimeRules: Awaited<ReturnType<WorldService['getRuntimeRules']>>,
  ) {
    const seasonLabels = runtimeRules.worldContextRules.seasonLabels;
    if (season === seasonLabels.spring) {
      return runtimeRules.worldContextRules.weatherOptions.spring;
    }
    if (season === seasonLabels.summer) {
      return runtimeRules.worldContextRules.weatherOptions.summer;
    }
    if (season === seasonLabels.autumn) {
      return runtimeRules.worldContextRules.weatherOptions.autumn;
    }
    if (season === seasonLabels.winter) {
      return runtimeRules.worldContextRules.weatherOptions.winter;
    }
    return ['多云'];
  }

  private resolveTimeOfDayLabel(
    hour: number,
    runtimeRules: Awaited<ReturnType<WorldService['getRuntimeRules']>>,
  ) {
    const labels = runtimeRules.semanticLabels.timeOfDayLabels;
    if (hour < 6) {
      return labels.lateNight;
    }
    if (hour < 9) {
      return labels.morning;
    }
    if (hour < 12) {
      return labels.forenoon;
    }
    if (hour < 14) {
      return labels.noon;
    }
    if (hour < 18) {
      return labels.afternoon;
    }
    if (hour < 21) {
      return labels.dusk;
    }
    return labels.evening;
  }
}
