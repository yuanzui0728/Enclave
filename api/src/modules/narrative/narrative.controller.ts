import { Controller, Get, Query } from '@nestjs/common';
import { NarrativeService } from './narrative.service';

@Controller('narrative')
export class NarrativeController {
  constructor(private readonly narrativeService: NarrativeService) {}

  @Get()
  getNarratives(@Query('userId') userId: string) {
    if (!userId) {
      return [];
    }

    return this.narrativeService.getByUser(userId);
  }
}
