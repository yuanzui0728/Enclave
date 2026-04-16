import type { CloudWorldBootstrapConfig } from "@yinjie/contracts";
import type { CloudWorldEntity } from "../entities/cloud-world.entity";

type ConfigReader = {
  get<T = string>(propertyPath: string): T | undefined;
};

type BootstrapWorld = Pick<
  CloudWorldEntity,
  "id" | "name" | "phone" | "slug" | "providerKey" | "providerRegion" | "providerZone" | "apiBaseUrl" | "adminUrl" | "callbackToken"
>;

const DEFAULT_WORLD_API_BASE_URL_PLACEHOLDER = "https://replace-me-with-world-api.example.com";
const DEFAULT_MANUAL_DOCKER_IMAGE = "ghcr.io/yinjie/world-api:latest";

export function buildWorldBootstrapConfig(
  world: BootstrapWorld,
  config: ConfigReader,
): CloudWorldBootstrapConfig {
  const cloudPlatformBaseUrl = resolveCloudPlatformBaseUrl(config);
  const suggestedApiBaseUrl = resolveSuggestedWorldApiBaseUrl(world, config);
  const suggestedAdminUrl = resolveSuggestedWorldAdminUrl(world, config);
  const providerLabel = resolveProviderLabel(world.providerKey);
  const deploymentMode = resolveDeploymentMode(world.providerKey);
  const callbackToken = world.callbackToken?.trim() ?? "";
  const callbackEndpoints = buildWorldCallbackEndpoints(world, config);
  const image = resolveRuntimeImage(world.providerKey, config);
  const containerName = resolveWorldContainerName(world);
  const volumeName = resolveWorldDataVolumeName(world);
  const env = {
    PUBLIC_API_BASE_URL: suggestedApiBaseUrl ?? DEFAULT_WORLD_API_BASE_URL_PLACEHOLDER,
    CLOUD_PLATFORM_BASE_URL: cloudPlatformBaseUrl,
    CLOUD_WORLD_ID: world.id,
    CLOUD_WORLD_CALLBACK_TOKEN: callbackToken,
    CLOUD_WORLD_HEARTBEAT_INTERVAL_MS: resolveDefaultHeartbeatInterval(config),
  };

  const envFileContent = Object.entries(env)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const dockerComposeSnippet =
    resolveDeploymentMode(world.providerKey) === "manual-docker"
      ? buildManualDockerComposeSnippet({
          image,
          containerName,
          volumeName,
          env,
        })
      : [
          "services:",
          "  api:",
          "    environment:",
          ...Object.entries(env).map(([key, value]) => `      ${key}: "${escapeDoubleQuotes(value)}"`),
        ].join("\n");

  const notes: string[] = [];
  if (!suggestedApiBaseUrl) {
    notes.push(
      "Set PUBLIC_API_BASE_URL to the final public world API URL, or configure CLOUD_WORLD_API_BASE_URL_TEMPLATE on the cloud platform.",
    );
  }
  if (!callbackToken) {
    notes.push("Callback token is empty. Rotate the token before deploying this world runtime.");
  }
  if (deploymentMode === "manual-docker") {
    notes.push("This provider becomes ready only after the deployed runtime reports bootstrap or heartbeat back to the cloud platform.");
  }
  notes.push("After rotating the callback token, redeploy the world instance so heartbeat and activity callbacks keep working.");

  return {
    worldId: world.id,
    worldName: world.name,
    phone: world.phone,
    slug: world.slug,
    providerKey: world.providerKey,
    providerLabel,
    deploymentMode,
    cloudPlatformBaseUrl,
    suggestedApiBaseUrl,
    suggestedAdminUrl,
    image,
    containerName,
    volumeName,
    callbackToken,
    callbackEndpoints,
    env,
    envFileContent,
    dockerComposeSnippet,
    notes,
  };
}

export function resolveProviderLabel(providerKey?: string | null) {
  switch (providerKey?.trim()) {
    case "manual":
    case "manual-docker":
      return "Manual Docker Host";
    case "mock":
    default:
      return "Mock Local Provider";
  }
}

export function resolveDeploymentMode(providerKey?: string | null) {
  switch (providerKey?.trim()) {
    case "manual":
    case "manual-docker":
      return "manual-docker";
    case "mock":
    default:
      return "mock";
  }
}

export function resolveRuntimeImage(providerKey: string | null | undefined, config: ConfigReader) {
  if (resolveDeploymentMode(providerKey) !== "manual-docker") {
    return null;
  }

  return trimToNull(config.get<string>("CLOUD_MANUAL_DOCKER_IMAGE")) ?? DEFAULT_MANUAL_DOCKER_IMAGE;
}

export function resolveWorldContainerName(world: Pick<BootstrapWorld, "id" | "slug">) {
  return `yinjie-world-${sanitizeResourceToken(world.slug ?? world.id)}`;
}

export function resolveWorldDataVolumeName(world: Pick<BootstrapWorld, "id" | "slug">) {
  return `${resolveWorldContainerName(world)}-data`;
}

export function resolveSuggestedWorldApiBaseUrl(
  world: Pick<BootstrapWorld, "id" | "phone" | "slug" | "providerRegion" | "providerZone" | "apiBaseUrl">,
  config: ConfigReader,
) {
  const currentValue = normalizeUrl(world.apiBaseUrl);
  if (currentValue) {
    return currentValue;
  }

  const templateValue = trimToNull(config.get<string>("CLOUD_WORLD_API_BASE_URL_TEMPLATE"));
  if (templateValue) {
    return normalizeUrl(applyWorldTemplate(templateValue, world));
  }

  const legacyMockValue = trimToNull(config.get<string>("CLOUD_MOCK_WORLD_API_BASE_URL"));
  if (legacyMockValue) {
    return normalizeUrl(legacyMockValue);
  }

  return null;
}

export function resolveSuggestedWorldAdminUrl(
  world: Pick<BootstrapWorld, "id" | "phone" | "slug" | "providerRegion" | "providerZone" | "adminUrl">,
  config: ConfigReader,
) {
  const currentValue = normalizeUrl(world.adminUrl);
  if (currentValue) {
    return currentValue;
  }

  const templateValue = trimToNull(config.get<string>("CLOUD_WORLD_ADMIN_URL_TEMPLATE"));
  if (!templateValue) {
    return null;
  }

  return normalizeUrl(applyWorldTemplate(templateValue, world));
}

export function resolveCloudPlatformBaseUrl(config: ConfigReader) {
  const configuredValue =
    trimToNull(config.get<string>("CLOUD_PLATFORM_PUBLIC_BASE_URL")) ??
    trimToNull(config.get<string>("CLOUD_PLATFORM_BASE_URL"));
  if (configuredValue) {
    return normalizeUrl(configuredValue) ?? configuredValue;
  }

  const port = trimToNull(config.get<string>("PORT")) ?? "3001";
  return `http://localhost:${port}`;
}

export function buildWorldCallbackEndpoints(world: Pick<BootstrapWorld, "id">, config: ConfigReader) {
  const cloudPlatformBaseUrl = resolveCloudPlatformBaseUrl(config);
  return {
    bootstrap: `${cloudPlatformBaseUrl}/internal/worlds/${world.id}/bootstrap`,
    heartbeat: `${cloudPlatformBaseUrl}/internal/worlds/${world.id}/heartbeat`,
    activity: `${cloudPlatformBaseUrl}/internal/worlds/${world.id}/activity`,
    health: `${cloudPlatformBaseUrl}/internal/worlds/${world.id}/health`,
    fail: `${cloudPlatformBaseUrl}/internal/worlds/${world.id}/fail`,
  };
}

function resolveDefaultHeartbeatInterval(config: ConfigReader) {
  return trimToNull(config.get<string>("CLOUD_DEFAULT_WORLD_HEARTBEAT_INTERVAL_MS")) ?? "30000";
}

function buildManualDockerComposeSnippet({
  image,
  containerName,
  volumeName,
  env,
}: {
  image?: string | null;
  containerName: string;
  volumeName: string;
  env: Record<string, string>;
}) {
  const environment = {
    DATABASE_PATH: "/app/data/database.sqlite",
    ...env,
  };

  return [
    "services:",
    "  api:",
    `    image: "${escapeDoubleQuotes(image ?? DEFAULT_MANUAL_DOCKER_IMAGE)}"`,
    `    container_name: "${escapeDoubleQuotes(containerName)}"`,
    "    restart: unless-stopped",
    "    environment:",
    ...Object.entries(environment).map(([key, value]) => `      ${key}: "${escapeDoubleQuotes(value)}"`),
    "    volumes:",
    `      - "${escapeDoubleQuotes(volumeName)}:/app/data"`,
    "volumes:",
    `  ${volumeName}: {}`,
  ].join("\n");
}

function applyWorldTemplate(
  template: string,
  world: Pick<BootstrapWorld, "id" | "phone" | "slug" | "providerRegion" | "providerZone">,
) {
  const phoneDigits = world.phone.replace(/\D+/g, "");
  const phoneSuffix = phoneDigits.slice(-4) || "0000";

  return template.replace(/\{(worldId|slug|phone|phoneSuffix|region|zone)\}/g, (_, token: string) => {
    switch (token) {
      case "worldId":
        return world.id;
      case "slug":
        return world.slug ?? world.id;
      case "phone":
        return phoneDigits || world.phone;
      case "phoneSuffix":
        return phoneSuffix;
      case "region":
        return world.providerRegion ?? "auto";
      case "zone":
        return world.providerZone ?? "auto";
      default:
        return "";
    }
  });
}

function normalizeUrl(value?: string | null) {
  const trimmedValue = trimToNull(value);
  if (!trimmedValue) {
    return null;
  }

  return trimmedValue.replace(/\/+$/, "");
}

function trimToNull(value?: string | null) {
  const trimmedValue = value?.trim();
  return trimmedValue ? trimmedValue : null;
}

function sanitizeResourceToken(value: string) {
  const normalizedValue = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalizedValue || "world";
}

function escapeDoubleQuotes(value: string) {
  return value.replace(/"/g, '\\"');
}
