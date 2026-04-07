import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WorldContextEntity } from './world-context.entity';

@Injectable()
export class WorldService {
  constructor(
    @InjectRepository(WorldContextEntity)
    private repo: Repository<WorldContextEntity>,
  ) {}

  async snapshot(): Promise<WorldContextEntity> {
    const snapshot = await this.createSnapshot();
    return this.repo.save(this.repo.create(snapshot));
  }

  async createSnapshot(): Promise<Partial<WorldContextEntity>> {
    const now = new Date();
    const hour = now.getHours();
    const month = now.getMonth() + 1;
    const timeOfDay =
      hour < 6 ? '深夜' :
      hour < 9 ? '早上' :
      hour < 12 ? '上午' :
      hour < 14 ? '中午' :
      hour < 18 ? '下午' :
      hour < 21 ? '傍晚' : '晚上';
    const season =
      month >= 3 && month <= 5 ? '春天' :
      month >= 6 && month <= 8 ? '夏天' :
      month >= 9 && month <= 11 ? '秋天' : '冬天';

    return {
      localTime: `${timeOfDay}${now.getHours()}点${String(now.getMinutes()).padStart(2, '0')}分`,
      season,
      weather: this.getSimulatedWeather(now, season, hour),
      holiday: this.getHoliday(now),
    };
  }

  async getLatest(): Promise<WorldContextEntity | null> {
    return this.repo.findOne({ order: { timestamp: 'DESC' } });
  }

  buildContextString(ctx: WorldContextEntity | null): string {
    if (!ctx) return '';
    const parts: string[] = [`当前时间：${ctx.localTime}`];
    if (ctx.season) parts.push(`季节：${ctx.season}`);
    if (ctx.weather) parts.push(`天气：${ctx.weather}`);
    if (ctx.location) parts.push(`位置：${ctx.location}`);
    if (ctx.holiday) parts.push(`节日：${ctx.holiday}`);
    return parts.join('；');
  }

  private getHoliday(date: Date): string | undefined {
    const m = date.getMonth() + 1;
    const d = date.getDate();
    if (m === 1 && d === 1) return '元旦';
    if (m === 2 && d === 14) return '情人节';
    if (m === 5 && d === 1) return '劳动节';
    if (m === 6 && d === 1) return '儿童节';
    if (m === 10 && d === 1) return '国庆节';
    if (m === 12 && d === 25) return '圣诞节';
    return undefined;
  }

  private getSimulatedWeather(date: Date, season: string, hour: number): string {
    const period = hour < 6 ? 0 : hour < 12 ? 1 : hour < 18 ? 2 : 3;
    const seed = date.getMonth() * 31 + date.getDate() + period;
    const optionsBySeason: Record<string, string[]> = {
      春天: ['多云微暖', '小雨微凉', '阴天但空气清新'],
      夏天: ['晴朗偏热', '闷热多云', '阵雨将至'],
      秋天: ['秋高气爽', '晴空微凉', '多云和风'],
      冬天: ['阴冷干燥', '晴冷微风', '多云偏寒'],
    };
    const seasonOptions = optionsBySeason[season] ?? ['多云'];
    return seasonOptions[seed % seasonOptions.length] ?? '多云';
  }
}
