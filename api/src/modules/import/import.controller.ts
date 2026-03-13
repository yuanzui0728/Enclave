import { Controller, Post, Get, Param, Body } from '@nestjs/common';
import { ImportService } from './import.service';

@Controller('import')
export class ImportController {
  constructor(private readonly importService: ImportService) {}

  @Post('start')
  startImport(@Body() body: { personName: string; fileContent: string }) {
    const job = this.importService.createJob(body.personName);
    // Process async, don't await
    this.importService.processImport(job.id, body.fileContent, body.personName);
    return { jobId: job.id };
  }

  @Get('status/:jobId')
  getStatus(@Param('jobId') jobId: string) {
    const job = this.importService.getJob(jobId);
    if (!job) return { error: 'Job not found' };
    return job;
  }
}
