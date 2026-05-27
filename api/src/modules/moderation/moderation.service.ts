import { HttpStatus, Injectable } from '@nestjs/common';
import { AppError } from '../../common/app-error.exception';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WorldOwnerService } from '../auth/world-owner.service';
import { TenantRepository } from '../tenancy/tenant-scoped.repository';
import { ModerationReportEntity } from './moderation-report.entity';

// i18n-ignore-start: data / seed / preset content — not user-facing UI.
const MODERATION_TARGET_TYPES = new Set([
  'character',
  'message',
  'moment',
  'feedPost',
  'comment',
]);

const MODERATION_STATUSES = new Set(['open', 'reviewed', 'resolved']);

type CreateModerationReportInput = {
  targetType: string;
  targetId: string;
  reason: string;
  details?: string;
};

@Injectable()
export class ModerationService {
  constructor(
    @InjectRepository(ModerationReportEntity)
    private readonly moderationRepo: Repository<ModerationReportEntity>,
    private readonly worldOwnerService: WorldOwnerService,
  ) {}

  async listReports() {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const reports = await new TenantRepository(this.moderationRepo).find({
      where: { ownerId: owner.id },
      order: { createdAt: 'DESC' },
    });
    return reports.map((report) => this.serializeReport(report));
  }

  async createReport(input: CreateModerationReportInput) {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const targetType = input.targetType.trim();
    const targetId = input.targetId.trim();
    const reason = input.reason.trim();
    const details = input.details?.trim();

    if (!MODERATION_TARGET_TYPES.has(targetType)) {
      throw new AppError('MODERATION_TARGET_TYPE_INVALID', {
        legacyMessage: 'Unsupported moderation target type.',
      });
    }

    if (!targetId) {
      throw new AppError('MODERATION_TARGET_ID_REQUIRED', {
        legacyMessage: 'Moderation target id is required.',
      });
    }

    if (!reason) {
      throw new AppError('MODERATION_REASON_REQUIRED', {
        legacyMessage: 'Moderation reason is required.',
      });
    }

    const report = this.moderationRepo.create({
      ownerId: owner.id,
      targetType,
      targetId,
      reason,
      details: details || null,
      status: 'open',
    });

    const saved = await this.moderationRepo.save(report);
    return this.serializeReport(saved);
  }

  async updateReportStatus(reportId: string, status: string) {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const normalizedStatus = status.trim();
    if (!MODERATION_STATUSES.has(normalizedStatus)) {
      throw new AppError('MODERATION_STATUS_INVALID', {
        legacyMessage: 'Unsupported moderation status.',
      });
    }

    const report = await new TenantRepository(this.moderationRepo).findOneBy({
      id: reportId,
      ownerId: owner.id,
    });

    if (!report) {
      throw new AppError('MODERATION_REPORT_NOT_FOUND', {
        status: HttpStatus.NOT_FOUND,
        legacyMessage: 'Moderation report not found.',
      });
    }

    report.status = normalizedStatus;
    const saved = await this.moderationRepo.save(report);
    return this.serializeReport(saved);
  }

  private serializeReport(report: ModerationReportEntity) {
    return {
      id: report.id,
      targetType: report.targetType,
      targetId: report.targetId,
      reason: report.reason,
      details: report.details ?? undefined,
      status: report.status,
      createdAt: report.createdAt,
    };
  }
}
// i18n-ignore-end
