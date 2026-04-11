import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { SystemService } from './system.service';

@Controller('system')
export class SystemController {
  constructor(private readonly systemService: SystemService) {}

  @Get('status')
  getStatus() {
    return this.systemService.getStatus();
  }

  @Get('scheduler')
  getSchedulerStatus() {
    return this.systemService.getSchedulerStatus();
  }

  @Post('scheduler/run/:id')
  runSchedulerJob(@Param('id') id: string) {
    return this.systemService.runSchedulerJob(id);
  }

  @Get('realtime')
  getRealtimeStatus() {
    return this.systemService.getRealtimeStatus();
  }

  @Get('provider')
  getProviderConfig() {
    return this.systemService.getProviderConfig();
  }

  @Put('provider')
  setProviderConfig(
    @Body()
    body: {
      endpoint: string;
      model: string;
      apiKey?: string;
      mode?: string;
      apiStyle?: string;
      transcriptionEndpoint?: string;
      transcriptionModel?: string;
      transcriptionApiKey?: string;
    },
  ) {
    return this.systemService.setProviderConfig(body);
  }

  @Post('provider/test')
  testProviderConnection(
    @Body()
    body: {
      endpoint: string;
      model: string;
      apiKey?: string;
      mode?: string;
      apiStyle?: string;
      transcriptionEndpoint?: string;
      transcriptionModel?: string;
      transcriptionApiKey?: string;
    },
  ) {
    return this.systemService.testProviderConnection(body);
  }

  @Post('inference/preview')
  runInferencePreview(
    @Body() body: { prompt: string; model?: string; systemPrompt?: string },
  ) {
    return this.systemService.runInferencePreview(body);
  }

  @Get('logs')
  getSystemLogs() {
    return this.systemService.getSystemLogs();
  }

  @Get('evals/overview')
  getEvalOverview() {
    return this.systemService.getEvalOverview();
  }

  @Get('evals/datasets')
  listEvalDatasets() {
    return this.systemService.listEvalDatasets();
  }

  @Get('evals/datasets/:id')
  getEvalDataset(@Param('id') id: string) {
    return this.systemService.getEvalDataset(id);
  }

  @Get('evals/strategies')
  listEvalStrategies() {
    return this.systemService.listEvalMemoryStrategies();
  }

  @Get('evals/prompt-variants')
  listEvalPromptVariants() {
    return this.systemService.listEvalPromptVariants();
  }

  @Get('evals/experiments')
  listEvalExperimentPresets() {
    return this.systemService.listEvalExperimentPresets();
  }

  @Get('evals/reports')
  listEvalExperimentReports() {
    return this.systemService.listEvalExperimentReports();
  }

  @Get('evals/runs')
  listEvalRuns(
    @Query('datasetId') datasetId?: string,
    @Query('experimentLabel') experimentLabel?: string,
    @Query('providerModel') providerModel?: string,
    @Query('judgeModel') judgeModel?: string,
    @Query('promptVariant') promptVariant?: string,
    @Query('memoryPolicyVariant') memoryPolicyVariant?: string,
  ) {
    return this.systemService.listEvalRuns({
      datasetId,
      experimentLabel,
      providerModel,
      judgeModel,
      promptVariant,
      memoryPolicyVariant,
    });
  }

  @Get('evals/runs/:id')
  getEvalRun(@Param('id') id: string) {
    return this.systemService.getEvalRun(id);
  }

  @Get('evals/comparisons')
  listEvalComparisons(
    @Query('datasetId') datasetId?: string,
    @Query('experimentLabel') experimentLabel?: string,
    @Query('providerModel') providerModel?: string,
    @Query('judgeModel') judgeModel?: string,
    @Query('promptVariant') promptVariant?: string,
    @Query('memoryPolicyVariant') memoryPolicyVariant?: string,
  ) {
    return this.systemService.listEvalComparisons({
      datasetId,
      experimentLabel,
      providerModel,
      judgeModel,
      promptVariant,
      memoryPolicyVariant,
    });
  }

  @Get('evals/traces')
  listGenerationTraces(
    @Query('source') source?: string,
    @Query('status') status?: string,
    @Query('characterId') characterId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.systemService.listGenerationTraces({
      source,
      status,
      characterId,
      limit: limit ? Number.parseInt(limit, 10) : undefined,
    });
  }

  @Get('evals/traces/:id')
  getGenerationTrace(@Param('id') id: string) {
    return this.systemService.getGenerationTrace(id);
  }

  @Post('diag/export')
  exportDiagnostics() {
    return this.systemService.exportDiagnostics();
  }

  @Post('backup/create')
  createBackup() {
    return this.systemService.createBackup();
  }

  @Post('backup/restore')
  restoreBackup() {
    return this.systemService.restoreBackup();
  }
}
