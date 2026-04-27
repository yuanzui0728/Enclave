import { Injectable, Logger } from '@nestjs/common';
import type { Request } from 'express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SystemConfigService } from '../config/config.service';
import {
  WorldLanguageService,
  type WorldLanguageCode,
} from '../config/world-language.service';
import {
  DEFAULT_REPLY_LOGIC_RUNTIME_RULES,
  REPLY_LOGIC_RUNTIME_RULES_CONFIG_KEY,
  normalizeReplyLogicRuntimeRules,
  type ReplyLogicRuntimeRules,
} from '../ai/reply-logic.constants';
import { WorldContextEntity } from './world-context.entity';

const WORLD_RUNTIME_LOCATION_CONFIG_KEY = 'world_runtime_location';
const WORLD_CONTEXT_MAX_AGE_MS = 20 * 60 * 1000;
const WORLD_LOCATION_CACHE_TTL_MS = 60 * 1000;
const WORLD_LOCATION_REFRESH_TTL_MS = 6 * 60 * 60 * 1000;

const DEFAULT_WORLD_LOCATION = Object.freeze({
  source: 'default' as const,
  sourceIp: null,
  country: '中国',
  region: '浙江',
  city: '杭州',
  latitude: 30.2741,
  longitude: 120.1551,
  timezone: 'Asia/Shanghai',
});

const LOCALIZED_TIME_OF_DAY_LABELS: Record<
  WorldLanguageCode,
  Record<
    | 'lateNight'
    | 'morning'
    | 'forenoon'
    | 'noon'
    | 'afternoon'
    | 'dusk'
    | 'evening',
    string
  >
> = {
  'zh-CN': {
    lateNight: '深夜',
    morning: '早上',
    forenoon: '上午',
    noon: '中午',
    afternoon: '下午',
    dusk: '傍晚',
    evening: '晚上',
  },
  'en-US': {
    lateNight: 'late night',
    morning: 'morning',
    forenoon: 'late morning',
    noon: 'noon',
    afternoon: 'afternoon',
    dusk: 'dusk',
    evening: 'evening',
  },
  'ja-JP': {
    lateNight: '深夜',
    morning: '朝',
    forenoon: '午前',
    noon: '昼',
    afternoon: '午後',
    dusk: '夕方',
    evening: '夜',
  },
  'ko-KR': {
    lateNight: '심야',
    morning: '아침',
    forenoon: '오전',
    noon: '정오',
    afternoon: '오후',
    dusk: '해질녘',
    evening: '밤',
  },
};

const LOCALIZED_SEASON_LABELS: Record<
  WorldLanguageCode,
  Record<'spring' | 'summer' | 'autumn' | 'winter', string>
> = {
  'zh-CN': {
    spring: '春天',
    summer: '夏天',
    autumn: '秋天',
    winter: '冬天',
  },
  'en-US': {
    spring: 'spring',
    summer: 'summer',
    autumn: 'autumn',
    winter: 'winter',
  },
  'ja-JP': {
    spring: '春',
    summer: '夏',
    autumn: '秋',
    winter: '冬',
  },
  'ko-KR': {
    spring: '봄',
    summer: '여름',
    autumn: '가을',
    winter: '겨울',
  },
};

const LOCALIZED_FALLBACK_WEATHER: Record<
  WorldLanguageCode,
  Record<'spring' | 'summer' | 'autumn' | 'winter', string[]>
> = {
  'zh-CN': {
    spring: ['多云微暖', '小雨微凉', '阴天但空气清新'],
    summer: ['晴朗偏热', '闷热多云', '阵雨将至'],
    autumn: ['秋高气爽', '晴空微凉', '多云和风'],
    winter: ['阴冷干燥', '晴冷微风', '多云偏寒'],
  },
  'en-US': {
    spring: ['mild and cloudy', 'cool light rain', 'overcast with fresh air'],
    summer: ['clear and warm', 'humid and cloudy', 'showers approaching'],
    autumn: ['crisp autumn air', 'clear and cool', 'cloudy with a soft breeze'],
    winter: ['cold and dry', 'clear with a cold breeze', 'cloudy and chilly'],
  },
  'ja-JP': {
    spring: ['穏やかな曇り', '少し肌寒い小雨', '曇りでも空気は澄んでいる'],
    summer: ['晴れて暑い', '蒸し暑い曇り', 'にわか雨が近い'],
    autumn: ['秋らしく爽やか', '晴れて少し涼しい', '曇りで風が穏やか'],
    winter: ['冷たく乾燥している', '晴れて冷たい風', '曇りで寒い'],
  },
  'ko-KR': {
    spring: ['구름 끼고 포근함', '조금 서늘한 약한 비', '흐리지만 공기가 맑음'],
    summer: ['맑고 더움', '후덥지근하고 흐림', '소나기가 다가오는 중'],
    autumn: [
      '가을 공기가 상쾌함',
      '맑고 조금 서늘함',
      '구름 끼고 바람이 부드러움',
    ],
    winter: ['춥고 건조함', '맑고 찬바람', '흐리고 쌀쌀함'],
  },
};

const HOLIDAY_TRANSLATIONS: Record<
  string,
  Record<Exclude<WorldLanguageCode, 'zh-CN'>, string>
> = {
  元旦: {
    'en-US': "New Year's Day",
    'ja-JP': '元日',
    'ko-KR': '새해 첫날',
  },
  情人节: {
    'en-US': "Valentine's Day",
    'ja-JP': 'バレンタインデー',
    'ko-KR': '밸런타인데이',
  },
  劳动节: {
    'en-US': 'Labor Day',
    'ja-JP': 'メーデー',
    'ko-KR': '노동절',
  },
  儿童节: {
    'en-US': "Children's Day",
    'ja-JP': 'こどもの日',
    'ko-KR': '어린이날',
  },
  国庆节: {
    'en-US': 'National Day',
    'ja-JP': '国慶節',
    'ko-KR': '국경절',
  },
  圣诞节: {
    'en-US': 'Christmas',
    'ja-JP': 'クリスマス',
    'ko-KR': '크리스마스',
  },
};

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

type WorldResolvedLocation = {
  source: 'default' | 'ip';
  sourceIp: string | null;
  country: string;
  region: string;
  city: string;
  latitude: number;
  longitude: number;
  timezone: string;
  resolvedAt: string;
};

type WorldCalendar = {
  location: WorldResolvedLocation;
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number;
  dateTimeText: string;
  timeText: string;
  displayLocation: string;
};

type IpWhoIsResponse = {
  success?: boolean;
  country?: string;
  region?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  timezone?: {
    id?: string;
  };
};

type OpenMeteoCurrentResponse = {
  current?: {
    temperature_2m?: number;
    weather_code?: number;
    is_day?: number;
  };
};

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

function normalizeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeNumber(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

@Injectable()
export class WorldService {
  private readonly logger = new Logger(WorldService.name);
  private locationCache: WorldResolvedLocation | null = null;
  private locationCacheExpiresAt = 0;
  private locationRefreshPromise: Promise<void> | null = null;

  constructor(
    @InjectRepository(WorldContextEntity)
    private repo: Repository<WorldContextEntity>,
    private readonly systemConfig: SystemConfigService,
    private readonly worldLanguage: WorldLanguageService,
  ) {}

  async snapshot(): Promise<WorldContextEntity> {
    const snapshot = await this.createSnapshot();
    return this.repo.save(this.repo.create(snapshot));
  }

  async createSnapshot(): Promise<Partial<WorldContextEntity>> {
    const runtimeRules = await this.getRuntimeRules();
    const language = await this.worldLanguage.getLanguage();
    const worldCalendar = await this.getWorldCalendar();
    const timeOfDay = this.resolveTimeOfDayLabel(
      worldCalendar.hour,
      runtimeRules,
      language,
    );
    const season = this.resolveSeasonLabel(
      worldCalendar.month,
      runtimeRules,
      language,
    );

    return {
      localTime: this.buildLocalTimeText(
        language,
        runtimeRules.worldContextRules.localTimeTemplate,
        timeOfDay,
        worldCalendar,
      ),
      season,
      weather: await this.getLiveWeather(
        worldCalendar.location,
        season,
        worldCalendar.hour,
        runtimeRules,
        language,
      ),
      location: worldCalendar.displayLocation,
      holiday: this.getHoliday(
        worldCalendar.month,
        worldCalendar.day,
        runtimeRules,
        language,
      ),
    };
  }

  async getLatest(): Promise<WorldContextEntity | null> {
    const latest = await this.repo.findOne({
      where: {},
      order: { timestamp: 'DESC' },
    });

    const currentLocation = await this.getResolvedLocation();
    const language = await this.worldLanguage.getLanguage();
    const expectedLocation = this.buildLocationLabel(currentLocation, language);
    const languageChangedAt = await this.worldLanguage.getChangedAt();
    const isBeforeLanguageChange =
      Boolean(latest && languageChangedAt) &&
      latest!.timestamp.getTime() < Date.parse(languageChangedAt!);
    const isStale =
      !latest ||
      isBeforeLanguageChange ||
      !latest.localTime?.trim() ||
      !latest.weather?.trim() ||
      !latest.location?.trim() ||
      latest.location.trim() !== expectedLocation ||
      Date.now() - latest.timestamp.getTime() > WORLD_CONTEXT_MAX_AGE_MS;

    if (isStale) {
      return this.snapshot();
    }

    return latest;
  }

  async buildContextString(ctx: WorldContextEntity | null): Promise<string> {
    if (!ctx) {
      return '';
    }

    const language = await this.worldLanguage.getLanguage();
    const runtimeRules = await this.getRuntimeRules();
    if (language !== 'zh-CN') {
      return this.buildLocalizedContextString(ctx, language);
    }

    const parts: string[] = [
      renderTemplate(
        runtimeRules.worldContextRules.contextFieldTemplates.currentTime,
        {
          localTime: ctx.localTime,
        },
      ),
    ];

    if (ctx.season) {
      parts.push(
        renderTemplate(
          runtimeRules.worldContextRules.contextFieldTemplates.season,
          {
            season: ctx.season,
          },
        ),
      );
    }
    if (ctx.weather) {
      parts.push(
        renderTemplate(
          runtimeRules.worldContextRules.contextFieldTemplates.weather,
          {
            weather: ctx.weather,
          },
        ),
      );
    }
    if (ctx.location) {
      parts.push(
        renderTemplate(
          runtimeRules.worldContextRules.contextFieldTemplates.location,
          {
            location: ctx.location,
          },
        ),
      );
    }
    if (ctx.holiday) {
      parts.push(
        renderTemplate(
          runtimeRules.worldContextRules.contextFieldTemplates.holiday,
          {
            holiday: ctx.holiday,
          },
        ),
      );
    }

    return parts.join(runtimeRules.worldContextRules.contextSeparator);
  }

  async buildPromptContextBlock(
    ctx: WorldContextEntity | null,
  ): Promise<string> {
    const context = await this.buildContextString(ctx);
    if (!context) {
      return '';
    }

    const runtimeRules = await this.getRuntimeRules();
    const language = await this.worldLanguage.getLanguage();
    if (language !== 'zh-CN') {
      return this.buildLocalizedPromptContextBlock(context, language);
    }

    return renderTemplate(
      runtimeRules.worldContextRules.promptContextTemplate,
      {
        context,
      },
    );
  }

  async getCurrentTimeReplacementPattern(): Promise<RegExp | null> {
    const runtimeRules = await this.getRuntimeRules();
    const template =
      runtimeRules.worldContextRules.contextFieldTemplates.currentTime;
    const placeholderIndex = template.indexOf('{{');
    const prefix = (
      placeholderIndex >= 0 ? template.slice(0, placeholderIndex) : template
    ).trim();
    if (!prefix) {
      return null;
    }

    return new RegExp(`${escapeRegExp(prefix)}[^\\n]*`);
  }

  async syncRequestLocation(request?: Request | null): Promise<void> {
    const sourceIp = this.extractClientIp(request);
    const currentLocation = await this.getResolvedLocation();

    if (!sourceIp || this.isPrivateIp(sourceIp)) {
      return;
    }

    const locationFresh =
      currentLocation.sourceIp === sourceIp &&
      Date.now() - Date.parse(currentLocation.resolvedAt) <
        WORLD_LOCATION_REFRESH_TTL_MS;
    if (locationFresh) {
      return;
    }

    if (this.locationRefreshPromise) {
      await this.locationRefreshPromise;
      return;
    }

    const refreshPromise = this.refreshLocationFromIp(
      sourceIp,
      currentLocation,
    );
    this.locationRefreshPromise = refreshPromise;
    try {
      await refreshPromise;
    } finally {
      if (this.locationRefreshPromise === refreshPromise) {
        this.locationRefreshPromise = null;
      }
    }
  }

  async getWorldCalendar(referenceTime = new Date()): Promise<WorldCalendar> {
    const location = await this.getResolvedLocation();
    const language = await this.worldLanguage.getLanguage();
    const locale = this.worldLanguage.getIntlLocale(language);
    const dateTimeParts = this.formatDateParts(
      referenceTime,
      location.timezone,
    );
    const weekdayKey = new Intl.DateTimeFormat('en-US', {
      timeZone: location.timezone,
      weekday: 'short',
    }).format(referenceTime);

    return {
      location,
      year: Number(dateTimeParts.year),
      month: Number(dateTimeParts.month),
      day: Number(dateTimeParts.day),
      hour: Number(dateTimeParts.hour),
      minute: Number(dateTimeParts.minute),
      weekday: WEEKDAY_INDEX[weekdayKey] ?? referenceTime.getUTCDay(),
      dateTimeText: new Intl.DateTimeFormat(locale, {
        timeZone: location.timezone,
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        weekday: 'long',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(referenceTime),
      timeText: new Intl.DateTimeFormat(locale, {
        timeZone: location.timezone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(referenceTime),
      displayLocation: this.buildLocationLabel(location, language),
    };
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
    month: number,
    day: number,
    runtimeRules: Awaited<ReturnType<WorldService['getRuntimeRules']>>,
    language: WorldLanguageCode,
  ): string | undefined {
    const label = runtimeRules.worldContextRules.holidays.find(
      (item) => item.month === month && item.day === day,
    )?.label;
    if (!label || language === 'zh-CN') {
      return label;
    }

    return HOLIDAY_TRANSLATIONS[label]?.[language] ?? label;
  }

  private async getLiveWeather(
    location: WorldResolvedLocation,
    season: string,
    hour: number,
    runtimeRules: Awaited<ReturnType<WorldService['getRuntimeRules']>>,
    language: WorldLanguageCode,
  ): Promise<string> {
    try {
      const search = new URLSearchParams({
        latitude: String(location.latitude),
        longitude: String(location.longitude),
        current: 'temperature_2m,weather_code,is_day',
        timezone: location.timezone,
      });
      const response = await fetch(
        `https://api.open-meteo.com/v1/forecast?${search.toString()}`,
        { signal: AbortSignal.timeout(3000) },
      );

      if (!response.ok) {
        throw new Error(`weather response ${response.status}`);
      }

      const payload = (await response.json()) as OpenMeteoCurrentResponse;
      const current = payload.current;
      if (!current) {
        throw new Error('weather payload missing current data');
      }

      const label = this.worldLanguage.mapWeatherCodeToLabel(
        language,
        current.weather_code,
        current.is_day,
      );
      const temperature =
        typeof current.temperature_2m === 'number' &&
        Number.isFinite(current.temperature_2m)
          ? `${Math.round(current.temperature_2m)}°C`
          : '';

      return [label, temperature].filter(Boolean).join(' ');
    } catch (error) {
      this.logger.warn(
        `Failed to fetch live weather for ${location.timezone}, falling back to seasonal preset.`,
      );
      return this.getFallbackWeather(season, hour, runtimeRules, language);
    }
  }

  private getFallbackWeather(
    season: string,
    hour: number,
    runtimeRules: Awaited<ReturnType<WorldService['getRuntimeRules']>>,
    language: WorldLanguageCode,
  ): string {
    const period = hour < 6 ? 0 : hour < 12 ? 1 : hour < 18 ? 2 : 3;
    const weatherOptions = this.resolveWeatherOptions(
      season,
      runtimeRules,
      language,
    );
    return (
      weatherOptions[period % weatherOptions.length] ??
      this.worldLanguage.mapWeatherCodeToLabel(language)
    );
  }

  private resolveSeasonLabel(
    month: number,
    runtimeRules: Awaited<ReturnType<WorldService['getRuntimeRules']>>,
    language: WorldLanguageCode,
  ) {
    if (language !== 'zh-CN') {
      if (month >= 3 && month <= 5) {
        return LOCALIZED_SEASON_LABELS[language].spring;
      }
      if (month >= 6 && month <= 8) {
        return LOCALIZED_SEASON_LABELS[language].summer;
      }
      if (month >= 9 && month <= 11) {
        return LOCALIZED_SEASON_LABELS[language].autumn;
      }
      return LOCALIZED_SEASON_LABELS[language].winter;
    }

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
    language: WorldLanguageCode,
  ) {
    if (language !== 'zh-CN') {
      const seasons = LOCALIZED_SEASON_LABELS[language];
      if (season === seasons.spring) {
        return LOCALIZED_FALLBACK_WEATHER[language].spring;
      }
      if (season === seasons.summer) {
        return LOCALIZED_FALLBACK_WEATHER[language].summer;
      }
      if (season === seasons.autumn) {
        return LOCALIZED_FALLBACK_WEATHER[language].autumn;
      }
      if (season === seasons.winter) {
        return LOCALIZED_FALLBACK_WEATHER[language].winter;
      }
      return LOCALIZED_FALLBACK_WEATHER[language].spring;
    }

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
    language: WorldLanguageCode = 'zh-CN',
  ) {
    const labels =
      language === 'zh-CN'
        ? runtimeRules.semanticLabels.timeOfDayLabels
        : LOCALIZED_TIME_OF_DAY_LABELS[language];
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

  private async refreshLocationFromIp(
    sourceIp: string,
    _currentLocation: WorldResolvedLocation,
  ) {
    try {
      const resolved = await this.lookupLocationByIp(sourceIp);
      await this.saveResolvedLocation(resolved);
    } catch (error) {
      this.logger.warn(
        `Failed to resolve request IP ${sourceIp}, keeping existing world location.`,
      );
    }
  }

  private async getResolvedLocation(): Promise<WorldResolvedLocation> {
    if (this.locationCache && Date.now() < this.locationCacheExpiresAt) {
      return this.locationCache;
    }

    const raw = await this.systemConfig.getConfig(
      WORLD_RUNTIME_LOCATION_CONFIG_KEY,
    );
    const parsed = this.parseResolvedLocation(raw);
    if (parsed) {
      this.primeLocationCache(parsed);
      return parsed;
    }

    const fallback = this.createDefaultLocation();
    await this.saveResolvedLocation(fallback);
    return fallback;
  }

  private parseResolvedLocation(
    raw: string | null,
  ): WorldResolvedLocation | null {
    if (!raw?.trim()) {
      return null;
    }

    try {
      const parsed = JSON.parse(raw) as Partial<WorldResolvedLocation>;
      const source = parsed.source === 'ip' ? 'ip' : 'default';
      const timezone =
        normalizeString(parsed.timezone) || DEFAULT_WORLD_LOCATION.timezone;
      const country =
        normalizeString(parsed.country) || DEFAULT_WORLD_LOCATION.country;
      const region =
        normalizeString(parsed.region) || DEFAULT_WORLD_LOCATION.region;
      const city = normalizeString(parsed.city) || DEFAULT_WORLD_LOCATION.city;
      const resolvedAt =
        normalizeString(parsed.resolvedAt) || new Date().toISOString();

      return {
        source,
        sourceIp: normalizeString(parsed.sourceIp) || null,
        country,
        region,
        city,
        latitude: normalizeNumber(
          parsed.latitude,
          DEFAULT_WORLD_LOCATION.latitude,
        ),
        longitude: normalizeNumber(
          parsed.longitude,
          DEFAULT_WORLD_LOCATION.longitude,
        ),
        timezone,
        resolvedAt,
      };
    } catch {
      this.logger.warn(
        `Failed to parse ${WORLD_RUNTIME_LOCATION_CONFIG_KEY}, using Hangzhou fallback.`,
      );
      return null;
    }
  }

  private async saveResolvedLocation(location: WorldResolvedLocation) {
    await this.systemConfig.setConfig(
      WORLD_RUNTIME_LOCATION_CONFIG_KEY,
      JSON.stringify(location),
    );
    this.primeLocationCache(location);
  }

  private primeLocationCache(location: WorldResolvedLocation) {
    this.locationCache = location;
    this.locationCacheExpiresAt = Date.now() + WORLD_LOCATION_CACHE_TTL_MS;
  }

  private createDefaultLocation(): WorldResolvedLocation {
    return {
      ...DEFAULT_WORLD_LOCATION,
      resolvedAt: new Date().toISOString(),
    };
  }

  private async lookupLocationByIp(
    sourceIp: string,
  ): Promise<WorldResolvedLocation> {
    const response = await fetch(
      `https://ipwho.is/${encodeURIComponent(sourceIp)}`,
      {
        signal: AbortSignal.timeout(3000),
      },
    );
    if (!response.ok) {
      throw new Error(`ipwho.is response ${response.status}`);
    }

    const payload = (await response.json()) as IpWhoIsResponse;
    if (!payload.success) {
      throw new Error('ipwho.is lookup failed');
    }

    return {
      source: 'ip',
      sourceIp,
      country:
        normalizeString(payload.country) || DEFAULT_WORLD_LOCATION.country,
      region: normalizeString(payload.region) || DEFAULT_WORLD_LOCATION.region,
      city: normalizeString(payload.city) || DEFAULT_WORLD_LOCATION.city,
      latitude: normalizeNumber(
        payload.latitude,
        DEFAULT_WORLD_LOCATION.latitude,
      ),
      longitude: normalizeNumber(
        payload.longitude,
        DEFAULT_WORLD_LOCATION.longitude,
      ),
      timezone:
        normalizeString(payload.timezone?.id) ||
        DEFAULT_WORLD_LOCATION.timezone,
      resolvedAt: new Date().toISOString(),
    };
  }

  private formatDateParts(date: Date, timezone: string) {
    return Object.fromEntries(
      new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        hourCycle: 'h23',
      })
        .formatToParts(date)
        .filter((part) => part.type !== 'literal')
        .map((part) => [part.type, part.value]),
    ) as Record<'year' | 'month' | 'day' | 'hour' | 'minute', string>;
  }

  private buildLocalTimeText(
    language: WorldLanguageCode,
    template: string,
    timeOfDay: string,
    worldCalendar: WorldCalendar,
  ) {
    const hour = String(worldCalendar.hour);
    const minute = String(worldCalendar.minute).padStart(2, '0');
    if (language === 'zh-CN') {
      return renderTemplate(template, {
        timeOfDay,
        hour,
        minute,
      });
    }

    switch (language) {
      case 'en-US':
        return `${timeOfDay} ${hour}:${minute}`;
      case 'ja-JP':
        return `${timeOfDay}${hour}時${minute}分`;
      case 'ko-KR':
        return `${timeOfDay} ${hour}시 ${minute}분`;
      default:
        return `${timeOfDay} ${hour}:${minute}`;
    }
  }

  private buildLocalizedContextString(
    ctx: WorldContextEntity,
    language: Exclude<WorldLanguageCode, 'zh-CN'>,
  ) {
    const labels: Record<
      Exclude<WorldLanguageCode, 'zh-CN'>,
      {
        currentTime: string;
        season: string;
        weather: string;
        location: string;
        holiday: string;
        separator: string;
      }
    > = {
      'en-US': {
        currentTime: 'Current time',
        season: 'Season',
        weather: 'Weather',
        location: 'Location',
        holiday: 'Holiday',
        separator: '; ',
      },
      'ja-JP': {
        currentTime: '現在時刻',
        season: '季節',
        weather: '天気',
        location: '場所',
        holiday: '祝日',
        separator: '；',
      },
      'ko-KR': {
        currentTime: '현재 시간',
        season: '계절',
        weather: '날씨',
        location: '위치',
        holiday: '기념일',
        separator: '；',
      },
    };
    const activeLabels = labels[language];
    const parts = [`${activeLabels.currentTime}: ${ctx.localTime}`];
    if (ctx.season) {
      parts.push(`${activeLabels.season}: ${ctx.season}`);
    }
    if (ctx.weather) {
      parts.push(`${activeLabels.weather}: ${ctx.weather}`);
    }
    if (ctx.location) {
      parts.push(`${activeLabels.location}: ${ctx.location}`);
    }
    if (ctx.holiday) {
      parts.push(`${activeLabels.holiday}: ${ctx.holiday}`);
    }
    return parts.join(activeLabels.separator);
  }

  private buildLocalizedPromptContextBlock(
    context: string,
    language: Exclude<WorldLanguageCode, 'zh-CN'>,
  ) {
    switch (language) {
      case 'en-US':
        return `[Current world state] ${context}`;
      case 'ja-JP':
        return `【現在の世界状態】${context}`;
      case 'ko-KR':
        return `【현재 세계 상태】${context}`;
      default:
        return context;
    }
  }

  private buildLocationLabel(
    location: WorldResolvedLocation,
    language: WorldLanguageCode,
  ) {
    const fallback = this.worldLanguage.getLocationFallback(language);
    if (location.country === '中国') {
      if (location.city === DEFAULT_WORLD_LOCATION.city) {
        return fallback;
      }
      return location.city || location.region || fallback;
    }

    if (location.city && location.region && location.region !== location.city) {
      return `${location.city} · ${location.region}`;
    }

    return location.city || location.region || location.country || fallback;
  }

  private extractClientIp(request?: Request | null) {
    if (!request) {
      return null;
    }

    const forwarded = request.headers['x-forwarded-for'];
    const firstForwarded = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    const candidate = normalizeString(firstForwarded)
      ? normalizeString(firstForwarded).split(',')[0]?.trim()
      : (request.ip ?? request.socket.remoteAddress ?? null);

    if (!candidate) {
      return null;
    }

    const normalized = candidate
      .replace(/^::ffff:/i, '')
      .replace(/^\[(.*)\]$/, '$1')
      .trim();
    return normalized || null;
  }

  private isPrivateIp(sourceIp: string) {
    if (
      sourceIp === '::1' ||
      sourceIp === '::' ||
      sourceIp.startsWith('127.') ||
      sourceIp.startsWith('10.') ||
      sourceIp.startsWith('192.168.') ||
      sourceIp.startsWith('169.254.')
    ) {
      return true;
    }

    if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(sourceIp)) {
      return true;
    }

    const lower = sourceIp.toLowerCase();
    return (
      lower.startsWith('fc') ||
      lower.startsWith('fd') ||
      lower.startsWith('fe80:')
    );
  }
}
