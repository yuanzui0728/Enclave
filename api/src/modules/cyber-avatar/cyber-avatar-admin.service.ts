import { Injectable, NotFoundException } from '@nestjs/common';
import { CyberAvatarService } from './cyber-avatar.service';

@Injectable()
export class CyberAvatarAdminService {
  constructor(private readonly cyberAvatar: CyberAvatarService) {}

  async getOverview() {
    return this.cyberAvatar.getOverview();
  }

  async getRules() {
    return this.cyberAvatar.getRules();
  }

  async setRules(input: Parameters<CyberAvatarService['setRules']>[0]) {
    return this.cyberAvatar.setRules(input);
  }

  async getProfile() {
    return this.cyberAvatar.getProfile();
  }

  async listSignals(limit?: number) {
    return this.cyberAvatar.listSignals({ limit });
  }

  async listRuns(limit?: number) {
    return this.cyberAvatar.listRuns({ limit });
  }

  async getRunDetail(runId: string) {
    const detail = await this.cyberAvatar.getRunDetail(runId);
    if (!detail) {
      throw new NotFoundException(`Cyber avatar run ${runId} not found`);
    }

    return detail;
  }

  async runIncremental() {
    return this.cyberAvatar.runIncrementalRefresh({ trigger: 'manual' });
  }

  async runDeepRefresh() {
    return this.cyberAvatar.runDeepRefresh({ trigger: 'manual' });
  }

  async runFullRebuild() {
    return this.cyberAvatar.runFullRebuild({ trigger: 'manual' });
  }

  async runProjection() {
    return this.cyberAvatar.reprojectProfile({ trigger: 'manual' });
  }
}
