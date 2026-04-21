import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { SystemService } from './system.service';

const EVAL_RUNTIME_ENV_KEY = 'YINJIE_EVAL_RUNTIME_DIR';

function createSystemService() {
  return new SystemService(
    {
      get: jest.fn().mockReturnValue(undefined),
    } as never,
    {
      getConfig: jest.fn().mockResolvedValue(null),
    } as never,
    {
      count: jest.fn().mockResolvedValue(0),
    } as never,
    {
      count: jest.fn().mockResolvedValue(0),
      findOneBy: jest.fn().mockResolvedValue(null),
    } as never,
    {
      count: jest.fn().mockResolvedValue(0),
    } as never,
    {
      count: jest.fn().mockResolvedValue(0),
    } as never,
    {} as never,
    {} as never,
  );
}

describe('SystemService eval runtime execution', () => {
  let runtimeDir: string;
  let previousRuntimeEnv: string | undefined;

  beforeEach(() => {
    runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yinjie-evals-'));
    previousRuntimeEnv = process.env[EVAL_RUNTIME_ENV_KEY];
    process.env[EVAL_RUNTIME_ENV_KEY] = runtimeDir;
  });

  afterEach(() => {
    if (previousRuntimeEnv === undefined) {
      delete process.env[EVAL_RUNTIME_ENV_KEY];
    } else {
      process.env[EVAL_RUNTIME_ENV_KEY] = previousRuntimeEnv;
    }
    fs.rmSync(runtimeDir, { recursive: true, force: true });
  });

  it('runs a dataset and persists scaffolded runs and traces when provider is unavailable', async () => {
    const service = createSystemService();

    const run = await service.runEvalDataset({ datasetId: 'doctor-chat' });

    expect(run.datasetId).toBe('doctor-chat');
    expect(run.status).toBe('completed');
    expect(run.summary.caseCount).toBe(5);
    expect(run.summary.scaffoldedCases).toBe(5);

    const listedRuns = service.listEvalRuns({ datasetId: 'doctor-chat' });
    expect(listedRuns).toHaveLength(1);
    expect(listedRuns[0].id).toBe(run.id);

    const storedRun = service.getEvalRun(run.id);
    expect(storedRun.caseResults).toHaveLength(5);
    expect(
      storedRun.caseResults.every((caseResult) => caseResult.status === 'scaffolded'),
    ).toBe(true);

    const traces = service.listGenerationTraces({ characterId: 'char-default-doctor' });
    expect(traces).toHaveLength(5);
    expect(traces.every((trace) => trace.status === 'fallback')).toBe(true);
    expect(service.getGenerationTrace(traces[0].id).id).toBe(traces[0].id);

    const overview = service.getEvalOverview();
    expect(overview.runCount).toBe(1);
    expect(overview.traceCount).toBe(5);
    expect(overview.fallbackTraceCount).toBe(5);
  });

  it('runs a single experiment preset and stores a report', async () => {
    const service = createSystemService();

    const result = await service.runEvalExperimentPreset('doctor-chat-baseline');

    expect(result.preset.id).toBe('doctor-chat-baseline');
    expect(result.singleRun?.datasetId).toBe('doctor-chat');
    expect(result.pairwiseRun).toBeNull();

    const reports = service.listEvalExperimentReports();
    expect(reports).toHaveLength(1);
    expect(reports[0].presetId).toBe('doctor-chat-baseline');
    expect(reports[0].mode).toBe('single');
  });

  it('uses bar expert case baselines when chat evals fall back to scaffolded output', async () => {
    const service = createSystemService();

    const result = await service.runEvalExperimentPreset('bar-expert-chat-baseline');
    const menuCase = result.singleRun?.caseResults.find(
      (caseResult) =>
        caseResult.caseId === 'bar-expert-menu-translation-stirred-smoky',
    );

    expect(result.singleRun?.datasetId).toBe('bar-expert-chat');
    expect(result.singleRun?.summary.scaffoldedCases).toBe(
      result.singleRun?.summary.caseCount,
    );
    expect(menuCase?.status).toBe('scaffolded');
    expect(menuCase?.output).toContain('stirred 可以先理解成');
    expect(menuCase?.output).not.toContain('先说结论：这件事别急着脑补');
  });

  it('runs a pairwise eval, stores a comparison, and updates report decisions', async () => {
    const service = createSystemService();

    const pairwise = await service.runPairwiseEval({
      datasetId: 'doctor-chat',
      experimentLabel: 'doctor-manual-pairwise',
    });

    expect(pairwise.baselineRun.datasetId).toBe('doctor-chat');
    expect(pairwise.candidateRun.datasetId).toBe('doctor-chat');
    expect(pairwise.comparison.summary.totalCases).toBe(5);

    const comparisons = service.listEvalComparisons({ datasetId: 'doctor-chat' });
    expect(comparisons).toHaveLength(1);
    expect(comparisons[0].id).toBe(pairwise.comparison.id);

    const reports = service.listEvalExperimentReports();
    expect(reports).toHaveLength(1);
    expect(reports[0].mode).toBe('pairwise');

    const updated = service.updateEvalReportDecision(reports[0].id, {
      decisionStatus: 'keep-testing',
      decidedBy: 'codex',
      note: '先继续扩样。',
    });

    expect(updated.decidedBy).toBe('codex');
    expect(updated.notes[updated.notes.length - 1]).toBe('先继续扩样。');
  });
});
