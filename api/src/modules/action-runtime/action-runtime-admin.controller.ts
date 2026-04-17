import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../admin/admin.guard';
import { ActionRuntimeService } from './action-runtime.service';

@Controller('admin/action-runtime')
@UseGuards(AdminGuard)
export class ActionRuntimeAdminController {
  constructor(
    private readonly actionRuntimeService: ActionRuntimeService,
  ) {}

  @Post('connectors/:id/test')
  testConnector(
    @Param('id') id: string,
    @Body() body?: { sampleMessage?: string | null },
  ) {
    return this.actionRuntimeService.testConnector(id, {
      sampleMessage: body?.sampleMessage?.trim() || undefined,
    });
  }

  @Post('connectors/:id/discover')
  discoverConnector(
    @Param('id') id: string,
    @Body() body?: { query?: string | null; limit?: number | null },
  ) {
    return this.actionRuntimeService.discoverConnector(id, {
      query: body?.query?.trim() || undefined,
      limit: typeof body?.limit === 'number' ? body.limit : undefined,
    });
  }

  @Post('runs/:id/retry')
  retryRun(@Param('id') id: string) {
    return this.actionRuntimeService.retryRun(id);
  }
}
