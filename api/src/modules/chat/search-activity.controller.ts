import { Body, Controller, Post } from '@nestjs/common';
import { SearchActivityService } from './search-activity.service';

@Controller('search')
export class SearchActivityController {
  constructor(private readonly searchActivityService: SearchActivityService) {}

  @Post('history')
  recordSearch(
    @Body()
    body: {
      query: string;
      source?: string | null;
    },
  ) {
    return this.searchActivityService.recordSearch(body);
  }
}
