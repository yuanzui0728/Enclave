import { Injectable, NotFoundException } from '@nestjs/common';
import { NeedDiscoveryService } from '../need-discovery/need-discovery.service';
import { CyberAvatarRealWorldService } from './cyber-avatar-real-world.service';
import { CyberAvatarService } from './cyber-avatar.service';

@Injectable()
export class CyberAvatarAdminService {
  constructor(
    private readonly cyberAvatar: CyberAvatarService,
    private readonly realWorld: CyberAvatarRealWorldService,
    private readonly needDiscovery: NeedDiscoveryService,
  ) {}

  async getOverview() {
    const [overview, realWorld, needDiscovery] = await Promise.all([
      this.cyberAvatar.getOverview(),
      this.realWorld.getOverview(),
      this.needDiscovery.getOverview(),
    ]);
    return {
      ...overview,
      realWorld,
      needDiscovery: {
        config: needDiscovery.config,
        stats: needDiscovery.stats,
        recentRuns: needDiscovery.recentRuns.slice(0, 6),
        activeCandidates: needDiscovery.activeCandidates.slice(0, 6),
      },
    };
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

  async listRealWorldItems(limit?: number) {
    return this.realWorld.listItems(limit);
  }

  async listRealWorldBriefs(limit?: number) {
    return this.realWorld.listBriefs(limit);
  }

  async runRealWorldSync() {
    return this.realWorld.runSync({ trigger: 'manual' });
  }
}
