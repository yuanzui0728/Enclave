function readEnvUrl(value: string | undefined, fallback: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

export const siteLinks = {
  app: readEnvUrl(
    process.env.NEXT_PUBLIC_SITE_APP_URL,
    "https://1gw06751dd053.vicp.fun",
  ),
  deploy: readEnvUrl(
    process.env.NEXT_PUBLIC_SITE_DEPLOY_URL,
    "https://github.com/yuanzui0728/yinjie-app/blob/main/DEPLOY.md",
  ),
  github: readEnvUrl(
    process.env.NEXT_PUBLIC_SITE_GITHUB_URL,
    "https://github.com/yuanzui0728/yinjie-app",
  ),
  releases: readEnvUrl(
    process.env.NEXT_PUBLIC_SITE_RELEASES_URL,
    "https://github.com/yuanzui0728/yinjie-app/releases",
  ),
  contact: "mailto:yuanzui0728@gmail.com",
};
