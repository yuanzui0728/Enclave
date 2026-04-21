import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { SystemService } from './system.service';

function createSystemService(runtimeDir?: string) {
  if (runtimeDir) {
    process.env.YINJIE_EVAL_RUNTIME_DIR = runtimeDir;
  } else {
    delete process.env.YINJIE_EVAL_RUNTIME_DIR;
  }

  return new SystemService(
    { get: jest.fn().mockReturnValue(undefined) } as never,
    { getConfig: jest.fn().mockResolvedValue(null) } as never,
    { count: jest.fn().mockResolvedValue(0) } as never,
    { findOneBy: jest.fn().mockResolvedValue(null), count: jest.fn().mockResolvedValue(0) } as never,
    { count: jest.fn().mockResolvedValue(0) } as never,
    { count: jest.fn().mockResolvedValue(0) } as never,
    {} as never,
    {} as never,
  );
}

describe('SystemService eval dataset loading', () => {
  let runtimeDir: string;

  beforeEach(() => {
    runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yinjie-evals-'));
    process.env.YINJIE_EVAL_RUNTIME_DIR = runtimeDir;
  });

  afterEach(() => {
    delete process.env.YINJIE_EVAL_RUNTIME_DIR;
    fs.rmSync(runtimeDir, { recursive: true, force: true });
  });

  it('lists eval datasets from local fixtures', () => {
    const service = createSystemService();
    const datasets = service.listEvalDatasets();

    expect(datasets.length).toBeGreaterThan(0);
    expect(
      datasets.some((dataset) => dataset.id === 'relationship-expert-chat'),
    ).toBe(true);
    expect(datasets.some((dataset) => dataset.id === 'doctor-chat')).toBe(true);
  });

  it('returns eval dataset details with ordered cases', () => {
    const service = createSystemService();
    const detail = service.getEvalDataset('relationship-expert-chat');

    expect(detail.manifest.id).toBe('relationship-expert-chat');
    expect(detail.cases.map((caseRecord) => caseRecord.id)).toEqual(
      detail.manifest.caseIds,
    );
    expect(detail.cases.every((caseRecord) => caseRecord.datasetId === detail.manifest.id)).toBe(
      true,
    );
  });

  it('lists eval experiment presets from local fixtures', () => {
    const service = createSystemService();
    const experiments = service.listEvalExperimentPresets();

    expect(
      experiments.some(
        (experiment) => experiment.id === 'relationship-expert-baseline',
      ),
    ).toBe(true);
  });

  it('reports eval dataset counts from loaded manifests', () => {
    const service = createSystemService();
    const overview = service.getEvalOverview();

    expect(overview.datasetCount).toBe(service.listEvalDatasets().length);
  });

  it('runs a dataset and persists scaffolded runs plus traces', async () => {
    const service = createSystemService(runtimeDir);
    const run = await service.runEvalDataset({
      datasetId: 'relationship-expert-chat',
      experimentLabel: 'relationship-smoke',
      promptVariant: 'warmer',
    });

    expect(run.status).toBe('completed');
    expect(run.caseResults).toHaveLength(4);
    expect(run.caseResults.every((caseResult) => caseResult.status === 'scaffolded')).toBe(
      true,
    );
    expect(
      run.caseResults.every((caseResult) => caseResult.judgeSource === 'scaffolded'),
    ).toBe(true);
    expect(run.caseResults[0]?.output).toContain('先别一下跳到爱不爱');

    const runs = service.listEvalRuns({
      datasetId: 'relationship-expert-chat',
      promptVariant: 'warmer',
    });
    const traces = service.listGenerationTraces({ limit: 10 });
    const overview = service.getEvalOverview();

    expect(runs).toHaveLength(1);
    expect(service.getEvalRun(run.id).id).toBe(run.id);
    expect(traces).toHaveLength(4);
    expect(service.getGenerationTrace(traces[0]?.id ?? '').status).toBe('fallback');
    expect(overview.runCount).toBe(1);
    expect(overview.traceCount).toBe(4);
    expect(overview.fallbackTraceCount).toBe(4);
  });

  it('builds pairwise comparisons and stores report decisions', async () => {
    const service = createSystemService(runtimeDir);
    const pairwise = await service.runPairwiseEval({
      datasetId: 'relationship-expert-chat',
      experimentLabel: 'relationship-ab',
      candidatePromptVariant: 'warmer',
    });

    expect(pairwise.comparison.summary.totalCases).toBe(4);
    expect(service.listEvalComparisons({ datasetId: 'relationship-expert-chat' })).toHaveLength(
      1,
    );

    const reports = service.listEvalExperimentReports();
    expect(reports).toHaveLength(1);
    expect(reports[0]?.mode).toBe('pairwise');

    const updatedReport = service.updateEvalReportDecision(reports[0]!.id, {
      decisionStatus: 'promote',
      appliedAction: 'promote-candidate',
      decidedBy: 'tester',
    });

    expect(updatedReport.decisionStatus).toBe('promote');
    expect(updatedReport.appliedAction).toBe('promote-candidate');
    expect(updatedReport.decidedBy).toBe('tester');
  });

  it('runs a single experiment preset and creates a report', async () => {
    const service = createSystemService(runtimeDir);
    const result = await service.runEvalExperimentPreset('relationship-expert-baseline');

    expect(result.preset.id).toBe('relationship-expert-baseline');
    expect(result.singleRun?.datasetId).toBe('relationship-expert-chat');
    expect(result.pairwiseRun).toBeNull();

    const reports = service.listEvalExperimentReports();
    expect(reports).toHaveLength(1);
    expect(reports[0]?.presetId).toBe('relationship-expert-baseline');
    expect(reports[0]?.singleRunId).toBe(result.singleRun?.id);
  });

  it('uses llm judge results when provider and judge model are available', async () => {
    const service = createSystemService(runtimeDir);
    jest.spyOn(service as any, 'resolveProviderConfig').mockResolvedValue({
      endpoint: 'https://example.test',
      model: 'gen-model',
      apiKey: 'test-key',
      mode: 'cloud',
      apiStyle: 'openai-chat-completions',
    });

    const completionMock = jest
      .fn()
      .mockResolvedValueOnce({
        choices: [{ message: { content: '我还在。今晚先别继续硬扛，明天再拆。' } }],
        model: 'gen-model',
      })
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify({
                status: 'passed',
                scores: [
                  { key: 'in-character-v1', value: 0.96, rationale: '像真人朋友。' },
                  { key: 'naturalness-v1', value: 0.94 },
                  { key: 'context-fit-v1', value: 0.91 },
                ],
                failureTags: [],
                judgeRationale: '回复自然且跟住深夜疲惫场景。',
                ruleViolations: [],
              }),
            },
          },
        ],
        model: 'judge-model',
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: '先别急着把自己判死。今天难受，但不等于你整个人。' } }],
        model: 'gen-model',
      })
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify({
                status: 'passed',
                scores: [
                  { key: 'social-boundary-v1', value: 0.95, rationale: '边界克制。' },
                  { key: 'naturalness-v1', value: 0.92 },
                ],
                failureTags: [],
                judgeRationale: '安慰克制，没有越界。',
                ruleViolations: [],
              }),
            },
          },
        ],
        model: 'judge-model',
      });

    jest.spyOn(service as any, 'createProviderClient').mockReturnValue({
      chat: {
        completions: {
          create: completionMock,
        },
      },
    } as any);

    const run = await service.runEvalDataset({
      datasetId: 'chat-foundation',
      judgeModelOverride: 'judge-model',
    });

    expect(run.judgeVersion).toBe('llm-judge-v1');
    expect(run.effectiveJudgeModel).toBe('judge-model');
    expect(run.caseResults).toHaveLength(2);
    expect(run.caseResults.every((caseResult) => caseResult.status === 'passed')).toBe(
      true,
    );
    expect(run.caseResults.every((caseResult) => caseResult.judgeSource === 'llm')).toBe(
      true,
    );
    expect(run.caseResults[0]?.judgeTraceIds).toHaveLength(1);
    expect(run.caseResults[0]?.traceIds).toHaveLength(2);
    expect(run.caseResults[0]?.judgeRationale).toContain('深夜疲惫场景');
    expect(completionMock).toHaveBeenCalledTimes(4);
    expect(completionMock.mock.calls[0][0].model).toBe('gen-model');
    expect(completionMock.mock.calls[1][0].model).toBe('judge-model');
    expect(completionMock.mock.calls[1][0].messages[1].content).toContain(
      'candidateOutput',
    );
    const judgeTraces = service.listGenerationTraces({ source: 'eval.judge' });
    expect(judgeTraces).toHaveLength(2);
    expect(
      judgeTraces.some(
        (trace) =>
          trace.output.judgePayload &&
          (trace.output.judgePayload as { status?: string }).status === 'passed',
      ),
    ).toBe(true);
    expect(
      judgeTraces.every((trace) => trace.evaluationSummary?.judgeSource === 'llm'),
    ).toBe(true);
  });

  it('falls back to heuristic judge when llm judge output is invalid', async () => {
    const service = createSystemService(runtimeDir);
    jest.spyOn(service as any, 'resolveProviderConfig').mockResolvedValue({
      endpoint: 'https://example.test',
      model: 'gen-model',
      apiKey: 'test-key',
      mode: 'cloud',
      apiStyle: 'openai-chat-completions',
    });

    const completionMock = jest
      .fn()
      .mockResolvedValueOnce({
        choices: [{ message: { content: '我还在。你今天先别再硬扛了。' } }],
        model: 'gen-model',
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: 'not-json' } }],
        model: 'judge-model',
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: '先别急着把自己判死。今天会难受，但还不等于你整个人。' } }],
        model: 'gen-model',
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: 'still not json' } }],
        model: 'judge-model',
      });

    jest.spyOn(service as any, 'createProviderClient').mockReturnValue({
      chat: {
        completions: {
          create: completionMock,
        },
      },
    } as any);

    const run = await service.runEvalDataset({
      datasetId: 'chat-foundation',
      judgeModelOverride: 'judge-model',
    });

    expect(run.judgeVersion).toBe('heuristic-judge-v1');
    expect(run.effectiveJudgeModel).toBe('heuristic-local-judge-v1');
    expect(run.caseResults.every((caseResult) => caseResult.status === 'passed')).toBe(
      true,
    );
    expect(
      run.caseResults.every((caseResult) => caseResult.judgeSource === 'heuristic'),
    ).toBe(true);
    expect(run.caseResults[0]?.judgeTraceIds).toHaveLength(1);
    expect(run.caseResults[0]?.traceIds).toHaveLength(2);
    expect(run.caseResults[0]?.judgeRationale).toContain('启发式');
    const judgeTraces = service.listGenerationTraces({ source: 'eval.judge' });
    expect(judgeTraces).toHaveLength(2);
    expect(judgeTraces.every((trace) => trace.status === 'fallback')).toBe(true);
    expect(judgeTraces.some((trace) => trace.output.rawOutput === 'not-json')).toBe(true);
    expect(judgeTraces.some((trace) => trace.output.rawOutput === 'still not json')).toBe(
      true,
    );
    expect(judgeTraces.every((trace) => trace.output.judgePayload === null)).toBe(true);
    expect(
      judgeTraces.every((trace) => trace.evaluationSummary?.judgeSource === 'heuristic'),
    ).toBe(true);
  });

  it('accepts concrete first-drink guidance for the bar expert beginner case', () => {
    const service = createSystemService(runtimeDir);
    const caseRecord = service
      .getEvalDataset('bar-expert-chat')
      .cases.find((item) => item.id === 'bar-expert-first-bar-low-pressure');

    expect(caseRecord).toBeDefined();

    const evaluation = (service as any).evaluateLegacyEvalOutput(
      caseRecord,
      '第一次去 cocktail bar，不用想着点得专业，先点得舒服就行。你如果怕苦、也不想太醉，第一杯可以直接点 Daiquiri、Aperol Spritz 或 Tom Collins 这种清爽型，酒精压力不会太顶。跟 bartender 直接说“想要一杯清爽一点、不苦、别太烈、适合第一杯的”，他们就能顺着给你推荐。',
      'success',
    );

    expect(evaluation.status).toBe('passed');
    expect(evaluation.failureTags).toEqual([]);
    expect(evaluation.ruleViolations).toEqual([]);
  });
});
