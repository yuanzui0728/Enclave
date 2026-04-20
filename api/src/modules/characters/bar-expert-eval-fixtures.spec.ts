import * as fs from 'fs';
import * as path from 'path';

type EvalDatasetManifestFixture = {
  id: string;
  caseIds: string[];
  rubricIds: string[];
};

type EvalCaseFixture = {
  id: string;
  datasetId: string;
  input: {
    characterId?: string;
    scene?: string;
  };
  expectations: {
    hardRules: string[];
    judgeRubrics: string[];
    forbiddenOutcomes: string[];
  };
};

type EvalExperimentFixture = {
  id: string;
  datasetId: string;
  mode: 'single' | 'pairwise';
};

function readFixture<T>(relativePath: string): T {
  const filePath = path.resolve(__dirname, '../../../../', relativePath);
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

describe('bar expert eval fixtures', () => {
  it('keeps the chat manifest and cases aligned', () => {
    const manifest = readFixture<EvalDatasetManifestFixture>(
      'datasets/evals/manifests/bar-expert-chat.json',
    );
    const cases = manifest.caseIds.map((caseId) =>
      readFixture<EvalCaseFixture>(`datasets/evals/cases/${caseId}.json`),
    );

    expect(manifest.id).toBe('bar-expert-chat');
    expect(new Set(manifest.caseIds).size).toBe(manifest.caseIds.length);
    expect(manifest.rubricIds).toEqual(
      expect.arrayContaining([
        'in-character-v1',
        'naturalness-v1',
        'context-fit-v1',
        'anti-assistant-v1',
      ]),
    );

    for (const caseRecord of cases) {
      expect(caseRecord.datasetId).toBe(manifest.id);
      expect(caseRecord.input.characterId).toBe('char-default-bar-expert');
      expect(caseRecord.expectations.hardRules.length).toBeGreaterThan(0);
      expect(caseRecord.expectations.judgeRubrics.length).toBeGreaterThan(0);
      expect(caseRecord.expectations.forbiddenOutcomes.length).toBeGreaterThan(
        0,
      );
    }
  });

  it('keeps the moments manifest and cases aligned', () => {
    const manifest = readFixture<EvalDatasetManifestFixture>(
      'datasets/evals/manifests/bar-expert-moments.json',
    );
    const cases = manifest.caseIds.map((caseId) =>
      readFixture<EvalCaseFixture>(`datasets/evals/cases/${caseId}.json`),
    );

    expect(manifest.id).toBe('bar-expert-moments');
    expect(new Set(manifest.caseIds).size).toBe(manifest.caseIds.length);
    expect(manifest.rubricIds).toEqual(
      expect.arrayContaining([
        'in-character-v1',
        'naturalness-v1',
        'context-fit-v1',
        'anti-assistant-v1',
      ]),
    );

    for (const caseRecord of cases) {
      expect(caseRecord.datasetId).toBe(manifest.id);
      expect(caseRecord.input.characterId).toBe('char-default-bar-expert');
      expect(caseRecord.input.scene).toBe('moment_post_generate');
      expect(caseRecord.expectations.hardRules.length).toBeGreaterThan(0);
      expect(caseRecord.expectations.judgeRubrics.length).toBeGreaterThan(0);
      expect(caseRecord.expectations.forbiddenOutcomes.length).toBeGreaterThan(
        0,
      );
    }
  });

  it('ships baseline experiment presets for both datasets', () => {
    const chatExperiment = readFixture<EvalExperimentFixture>(
      'datasets/evals/experiments/bar-expert-chat-baseline.json',
    );
    const momentsExperiment = readFixture<EvalExperimentFixture>(
      'datasets/evals/experiments/bar-expert-moments-baseline.json',
    );

    expect(chatExperiment).toMatchObject({
      id: 'bar-expert-chat-baseline',
      datasetId: 'bar-expert-chat',
      mode: 'single',
    });
    expect(momentsExperiment).toMatchObject({
      id: 'bar-expert-moments-baseline',
      datasetId: 'bar-expert-moments',
      mode: 'single',
    });
  });
});
