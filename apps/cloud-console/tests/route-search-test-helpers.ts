import { expect, it } from "vitest";

type RouteSearchBuildInput<T extends object> = Partial<Record<keyof T, unknown>>;

type RouteSearchBuildCase<T extends object> = {
  description: string;
  input?: RouteSearchBuildInput<T>;
  expected: T;
};

type RouteSearchValidateCase<T extends object> = {
  description: string;
  input: Record<string, unknown>;
  expected: T;
};

type RouteSearchStaticExpectation = {
  description: string;
  actual: unknown;
  expected: unknown;
};

export function defineRouteSearchStaticContractTest(config: {
  description: string;
  expectations: RouteSearchStaticExpectation[];
}) {
  it(config.description, () => {
    for (const expectation of config.expectations) {
      expect(expectation.actual, expectation.description).toEqual(
        expectation.expected,
      );
    }
  });
}

export function defineRouteSearchNormalizationTests<T extends object>(config: {
  build: (search?: RouteSearchBuildInput<T>) => T;
  validate: (search: Record<string, unknown>) => T;
  validBuildCases: RouteSearchBuildCase<T>[];
  invalidBuildCases: RouteSearchBuildCase<T>[];
  validateCases: RouteSearchValidateCase<T>[];
}) {
  it("normalizes valid route search values", () => {
    for (const testCase of config.validBuildCases) {
      expect(config.build(testCase.input), testCase.description).toEqual(
        testCase.expected,
      );
    }
  });

  it("falls back to defaults when route search values are missing or invalid", () => {
    for (const testCase of config.invalidBuildCases) {
      expect(config.build(testCase.input), testCase.description).toEqual(
        testCase.expected,
      );
    }
  });

  it("validates arbitrary router search objects through the same normalization path", () => {
    for (const testCase of config.validateCases) {
      expect(config.validate(testCase.input), testCase.description).toEqual(
        testCase.expected,
      );
    }
  });
}
