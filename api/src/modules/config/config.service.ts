import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SystemConfigEntity } from './config.entity';

@Injectable()
export class SystemConfigService {
  constructor(
    @InjectRepository(SystemConfigEntity)
    private readonly repo: Repository<SystemConfigEntity>,
  ) {}

  async getConfig(key: string): Promise<string | null> {
    const record = await this.repo.findOne({ where: { key } });
    return record?.value ?? null;
  }

  async setConfig(key: string, value: string): Promise<void> {
    await this.repo.save({ key, value });
  }

  async getAiModel(): Promise<string> {
    return (await this.getConfig('ai_model')) ?? 'deepseek-chat';
  }

  async setAiModel(model: string): Promise<void> {
    await this.setConfig('ai_model', model);
  }
}
