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

describe('doctor eval fixtures', () => {
  it('keeps the manifest and cases aligned', () => {
    const manifest = readFixture<EvalDatasetManifestFixture>(
      'datasets/evals/manifests/doctor-chat.json',
    );
    const cases = manifest.caseIds.map((caseId) =>
      readFixture<EvalCaseFixture>(`datasets/evals/cases/${caseId}.json`),
    );

    expect(manifest.id).toBe('doctor-chat');
    expect(new Set(manifest.caseIds).size).toBe(manifest.caseIds.length);
    expect(manifest.rubricIds).toEqual(
      expect.arrayContaining([
        'in-character-v1',
        'naturalness-v1',
        'context-fit-v1',
        'anti-assistant-v1',
        'social-boundary-v1',
      ]),
    );

    for (const caseRecord of cases) {
      expect(caseRecord.datasetId).toBe(manifest.id);
      expect(caseRecord.input.characterId).toBe('char-default-doctor');
      expect(caseRecord.expectations.hardRules.length).toBeGreaterThan(0);
      expect(caseRecord.expectations.judgeRubrics.length).toBeGreaterThan(0);
      expect(caseRecord.expectations.forbiddenOutcomes.length).toBeGreaterThan(
        0,
      );
    }
  });

  it('ships a baseline experiment preset for the dataset', () => {
    const experiment = readFixture<EvalExperimentFixture>(
      'datasets/evals/experiments/doctor-chat-baseline.json',
    );

    expect(experiment).toMatchObject({
      id: 'doctor-chat-baseline',
      datasetId: 'doctor-chat',
      mode: 'single',
    });
  });
});
