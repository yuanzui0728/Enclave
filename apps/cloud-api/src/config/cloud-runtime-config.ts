import {
  CLOUD_ADMIN_JWT_AUDIENCE_DEFAULT,
  CLOUD_ADMIN_REFRESH_JWT_AUDIENCE_DEFAULT,
  CLOUD_CLIENT_JWT_AUDIENCE_DEFAULT,
  CLOUD_JWT_ISSUER_DEFAULT,
} from "../auth/cloud-jwt.constants";

type ConfigReader = {
  get<T = string>(propertyPath: string): T | undefined;
};

export const DEFAULT_DEV_CLOUD_JWT_SECRET = "yinjie-cloud-jwt-secret";
export const DEFAULT_DEV_CLOUD_ADMIN_SECRET = "cloud-admin-secret";
const MIN_PRODUCTION_SECRET_LENGTH = 24;

export function resolveCloudJwtSecret(config: ConfigReader) {
  return resolveCloudSecret(
    config,
    "CLOUD_JWT_SECRET",
    DEFAULT_DEV_CLOUD_JWT_SECRET,
    "cloud JWT",
  );
}

export function resolveCloudAdminSecret(config: ConfigReader) {
  return resolveCloudSecret(
    config,
    "CLOUD_ADMIN_SECRET",
    DEFAULT_DEV_CLOUD_ADMIN_SECRET,
    "cloud admin",
  );
}

export function resolveCloudAuthTokenTtl(config: ConfigReader) {
  return config.get<string>("CLOUD_AUTH_TOKEN_TTL")?.trim() || "7d";
}

export function resolveCloudAdminTokenTtl(config: ConfigReader) {
  return config.get<string>("CLOUD_ADMIN_TOKEN_TTL")?.trim() || "15m";
}

export function resolveCloudAdminRefreshTokenTtl(config: ConfigReader) {
  return config.get<string>("CLOUD_ADMIN_REFRESH_TOKEN_TTL")?.trim() || "7d";
}

export function resolveCloudJwtIssuer(config: ConfigReader) {
  return config.get<string>("CLOUD_JWT_ISSUER")?.trim() || CLOUD_JWT_ISSUER_DEFAULT;
}

export function resolveCloudClientJwtAudience(config: ConfigReader) {
  return config.get<string>("CLOUD_CLIENT_JWT_AUDIENCE")?.trim() || CLOUD_CLIENT_JWT_AUDIENCE_DEFAULT;
}

export function resolveCloudAdminJwtAudience(config: ConfigReader) {
  return config.get<string>("CLOUD_ADMIN_JWT_AUDIENCE")?.trim() || CLOUD_ADMIN_JWT_AUDIENCE_DEFAULT;
}

export function resolveCloudAdminRefreshJwtAudience(config: ConfigReader) {
  return config.get<string>("CLOUD_ADMIN_REFRESH_JWT_AUDIENCE")?.trim() || CLOUD_ADMIN_REFRESH_JWT_AUDIENCE_DEFAULT;
}

export function resolveCloudDatabasePath(config: ConfigReader) {
  return config.get<string>("CLOUD_DATABASE_PATH")?.trim() || "cloud-platform.sqlite";
}

export function isStrictSecretValidationEnabled(config: ConfigReader) {
  const explicitFlag = config.get<string>("CLOUD_ENFORCE_STRICT_SECRETS")?.trim().toLowerCase();
  if (explicitFlag) {
    return explicitFlag === "1" || explicitFlag === "true" || explicitFlag === "yes" || explicitFlag === "on";
  }

  return config.get<string>("NODE_ENV")?.trim().toLowerCase() === "production";
}

export function assertCloudProductionSecrets(config: ConfigReader) {
  resolveCloudJwtSecret(config);
  resolveCloudAdminSecret(config);
}

function resolveCloudSecret(
  config: ConfigReader,
  envKey: string,
  fallback: string,
  label: string,
) {
  const configuredSecret = config.get<string>(envKey)?.trim();
  const strictValidation = isStrictSecretValidationEnabled(config);

  if (!configuredSecret) {
    if (strictValidation) {
      throw new Error(`${envKey} is required when strict cloud secret validation is enabled.`);
    }

    return fallback;
  }

  if (!strictValidation) {
    return configuredSecret;
  }

  if (configuredSecret === fallback) {
    throw new Error(`${envKey} must not use the development default ${label} secret in production.`);
  }

  if (configuredSecret.length < MIN_PRODUCTION_SECRET_LENGTH) {
    throw new Error(
      `${envKey} must be at least ${MIN_PRODUCTION_SECRET_LENGTH} characters long in production.`,
    );
  }

  return configuredSecret;
}

export function parseJwtDurationToMs(value: string) {
  if (/^\d+$/.test(value)) {
    return Number(value) * 1000;
  }

  const match = value.match(/^(\d+)(ms|s|m|h|d)$/i);
  if (!match) {
    return null;
  }

  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  switch (match[2].toLowerCase()) {
    case "ms":
      return amount;
    case "s":
      return amount * 1000;
    case "m":
      return amount * 60 * 1000;
    case "h":
      return amount * 60 * 60 * 1000;
    case "d":
      return amount * 24 * 60 * 60 * 1000;
    default:
      return null;
  }
}
