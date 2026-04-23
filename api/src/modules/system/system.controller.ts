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
      ttsEndpoint?: string;
      ttsApiKey?: string;
      ttsModel?: string;
      ttsVoice?: string;
      imageGenerationEndpoint?: string;
      imageGenerationModel?: string;
      imageGenerationApiKey?: string;
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
      ttsEndpoint?: string;
      ttsApiKey?: string;
      ttsModel?: string;
      ttsVoice?: string;
      imageGenerationEndpoint?: string;
      imageGenerationModel?: string;
      imageGenerationApiKey?: string;
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

  @Post('evals/experiments/:id/run')
  runEvalExperimentPreset(@Param('id') id: string) {
    return this.systemService.runEvalExperimentPreset(id);
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

  @Post('evals/runs')
  runEvalDataset(
    @Body()
    body: {
      datasetId: string;
      mode?: 'single' | 'pairwise';
      experimentLabel?: string;
      providerOverride?: string;
      judgeModelOverride?: string;
      promptVariant?: string;
      memoryPolicyVariant?: string;
    },
  ) {
    return this.systemService.runEvalDataset(body);
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

  @Post('evals/compare')
  compareEvalRuns(
    @Body()
    body: {
      baselineRunId: string;
      candidateRunId: string;
    },
  ) {
    return this.systemService.compareEvalRuns(body);
  }

  @Post('evals/compare/run')
  runPairwiseEval(
    @Body()
    body: {
      datasetId: string;
      experimentLabel?: string;
      baselineProviderOverride?: string;
      baselineJudgeModelOverride?: string;
      baselinePromptVariant?: string;
      baselineMemoryPolicyVariant?: string;
      candidateProviderOverride?: string;
      candidateJudgeModelOverride?: string;
      candidatePromptVariant?: string;
      candidateMemoryPolicyVariant?: string;
    },
  ) {
    return this.systemService.runPairwiseEval(body);
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

  @Post('evals/reports/:id/decision')
  updateEvalReportDecision(
    @Param('id') id: string,
    @Body()
    body: {
      decisionStatus: 'keep-testing' | 'promote' | 'rollback' | 'archive';
      appliedAction?: string | null;
      decidedBy?: string | null;
      note?: string | null;
    },
  ) {
    return this.systemService.updateEvalReportDecision(id, body);
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
