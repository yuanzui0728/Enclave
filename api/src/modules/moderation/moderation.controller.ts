import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ModerationService } from './moderation.service';

@Controller('moderation')
export class ModerationController {
  constructor(private readonly moderationService: ModerationService) {}

  @Get('reports')
  listReports() {
    return this.moderationService.listReports();
  }

  @Post('reports')
  createReport(
    @Body()
    body: {
      targetType: string;
      targetId: string;
      reason: string;
      details?: string;
    },
  ) {
    return this.moderationService.createReport(body);
  }

  @Patch('reports/:id/status')
  updateReportStatus(
    @Param('id') id: string,
    @Body() body: { status: string },
  ) {
    return this.moderationService.updateReportStatus(id, body.status);
  }
}
