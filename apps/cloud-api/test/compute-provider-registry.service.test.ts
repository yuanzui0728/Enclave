import assert from "node:assert/strict";
import test from "node:test";
import { ComputeProviderRegistryService } from "../src/providers/compute-provider-registry.service";
import { CloudRuntimeConfigValidator } from "../src/config/cloud-runtime-config.validator";

function createConfig(values: Record<string, string | undefined>) {
  return {
    get<T = string>(propertyPath: string): T | undefined {
      return values[propertyPath] as T | undefined;
    },
  };
}

const mockProvider = {
  key: "mock",
  summary: {
    key: "mock",
    label: "Mock",
    description: "mock",
    provisionStrategy: "mock",
    deploymentMode: "mock",
    defaultRegion: null,
    defaultZone: null,
    capabilities: {
      managedProvisioning: false,
      managedLifecycle: false,
      bootstrapPackage: false,
      snapshots: false,
    },
  },
};

const manualProvider = {
  key: "manual-docker",
  summary: {
    key: "manual-docker",
    label: "Manual Docker",
    description: "manual",
    provisionStrategy: "manual-docker",
    deploymentMode: "manual-docker",
    defaultRegion: "manual",
    defaultZone: "docker-host-a",
    capabilities: {
      managedProvisioning: false,
      managedLifecycle: false,
      bootstrapPackage: true,
      snapshots: false,
    },
  },
};

test("compute provider registry rejects invalid configured default providers", () => {
  const service = new ComputeProviderRegistryService(
    createConfig({
      CLOUD_DEFAULT_PROVIDER_KEY: "broken-provider",
    }) as never,
    mockProvider as never,
    manualProvider as never,
  );

  assert.throws(
    () => service.getDefaultProviderKey(),
    /Unsupported compute provider: broken-provider/,
  );
  assert.throws(
    () => service.getProvider(),
    /Unsupported compute provider: broken-provider/,
  );
});

test("cloud runtime config validator also rejects invalid configured default providers", () => {
  assert.throws(
    () =>
      new CloudRuntimeConfigValidator(
        createConfig({}) as never,
        {
          getDefaultProviderKey() {
            throw new Error("Unsupported compute provider: broken-provider");
          },
        } as never,
      ),
    /Unsupported compute provider: broken-provider/,
  );
});
