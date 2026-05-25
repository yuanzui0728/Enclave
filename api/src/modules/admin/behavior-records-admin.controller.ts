import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AdminGuard } from './admin.guard';
import { BehaviorRecordsAdminService } from './behavior-records-admin.service';

@Controller('admin/behavior-records')
@UseGuards(AdminGuard)
export class BehaviorRecordsAdminController {
  constructor(
    private readonly behaviorRecordsAdminService: BehaviorRecordsAdminService,
  ) {}

  @Get('overview')
  getOverview() {
    return this.behaviorRecordsAdminService.getOverview();
  }

  @Get('records')
  listRecords(
    @Query()
    query: {
      surface?: string;
      behaviorType?: string;
      dateFrom?: string;
      dateTo?: string;
      includeHiddenComments?: string;
      page?: number | string;
      pageSize?: number | string;
    },
  ) {
    return this.behaviorRecordsAdminService.listRecords(query);
  }

  @Get('records/export')
  exportRecords(
    @Query()
    query: {
      format?: string;
      surface?: string;
      behaviorType?: string;
      dateFrom?: string;
      dateTo?: string;
      includeHiddenComments?: string;
    },
  ) {
    return this.behaviorRecordsAdminService.exportRecords(query);
  }
}
