import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ReminderRuntimeService } from './reminder-runtime.service';

@Controller('reminder-runtime')
export class ReminderRuntimeController {
  constructor(
    private readonly reminderRuntimeService: ReminderRuntimeService,
  ) {}

  @Get('tasks')
  getTasks(@Query('status') status?: string) {
    return this.reminderRuntimeService.getTasks({
      status: status?.trim() || undefined,
    });
  }

  @Get('tasks/upcoming')
  getUpcomingTasks(@Query('limit') limit?: string) {
    const parsedLimit = limit ? Number(limit) : undefined;
    if (
      parsedLimit != null &&
      (!Number.isFinite(parsedLimit) || parsedLimit <= 0)
    ) {
      throw new BadRequestException('limit 必须是正整数。');
    }

    return this.reminderRuntimeService.getUpcomingTasks(parsedLimit);
  }

  @Post('tasks/:id/complete')
  completeTask(@Param('id') id: string) {
    return this.reminderRuntimeService.completeTask(id);
  }

  @Post('tasks/:id/snooze')
  snoozeTask(
    @Param('id') id: string,
    @Body() body: { minutes?: number; hours?: number; until?: string },
  ) {
    return this.reminderRuntimeService.snoozeTask(id, body);
  }

  @Delete('tasks/:id')
  cancelTask(@Param('id') id: string) {
    return this.reminderRuntimeService.cancelTask(id);
  }
}
