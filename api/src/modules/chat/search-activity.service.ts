import { BadRequestException, Injectable } from '@nestjs/common';
import { WorldOwnerService } from '../auth/world-owner.service';
import { SystemConfigService } from '../config/config.service';

export type SearchHistoryRecord = {
  query: string;
  usedAt: string;
  source?: string | null;
};

const SEARCH_HISTORY_CONFIG_KEY = 'owner_search_history_records';
const MAX_SEARCH_HISTORY_RECORDS = 60;

@Injectable()
export class SearchActivityService {
  constructor(
    private readonly worldOwnerService: WorldOwnerService,
    private readonly systemConfigService: SystemConfigService,
  ) {}

  async listSearchHistory(): Promise<SearchHistoryRecord[]> {
    const raw = await this.systemConfigService.getConfig(SEARCH_HISTORY_CONFIG_KEY);
    if (!raw?.trim()) {
      return [];
    }

    try {
      const parsed = JSON.parse(raw) as SearchHistoryRecord[];
      return normalizeSearchHistoryRecords(parsed);
    } catch {
      return [];
    }
  }

  async recordSearch(input: {
    query: string;
    source?: string | null;
  }): Promise<{ success: true; item: SearchHistoryRecord }> {
    const query = normalizeSearchQuery(input.query);
    if (!query) {
      throw new BadRequestException('搜索词不能为空。');
    }

    await this.worldOwnerService.getOwnerOrThrow();
    const item: SearchHistoryRecord = {
      query,
      usedAt: new Date().toISOString(),
      source: normalizeSearchSource(input.source),
    };

    const current = await this.listSearchHistory();
    const next = [
      item,
      ...current.filter(
        (entry) => entry.query.trim().toLowerCase() !== query.toLowerCase(),
      ),
    ].slice(0, MAX_SEARCH_HISTORY_RECORDS);

    await this.systemConfigService.setConfig(
      SEARCH_HISTORY_CONFIG_KEY,
      JSON.stringify(next),
    );

    return {
      success: true as const,
      item,
    };
  }
}

function normalizeSearchHistoryRecords(value: SearchHistoryRecord[]) {
  if (!Array.isArray(value)) {
    return [] as SearchHistoryRecord[];
  }

  return value
    .map((item) => ({
      query: normalizeSearchQuery(item?.query),
      usedAt: normalizeTimestamp(item?.usedAt),
      source: normalizeSearchSource(item?.source),
    }))
    .filter((item) => Boolean(item.query) && Boolean(item.usedAt))
    .sort((left, right) => right.usedAt.localeCompare(left.usedAt))
    .slice(0, MAX_SEARCH_HISTORY_RECORDS);
}

function normalizeSearchQuery(value: unknown) {
  return typeof value === 'string' ? value.trim().slice(0, 120) : '';
}

function normalizeSearchSource(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().slice(0, 40);
  return normalized || null;
}

function normalizeTimestamp(value: unknown) {
  if (typeof value !== 'string') {
    return '';
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}
