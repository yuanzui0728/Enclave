function readEnvUrl(value: string | undefined, fallback: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

export const siteLinks = {
  app: readEnvUrl(
    import.meta.env.VITE_SITE_APP_URL,
    "https://www.enclave.top/",
  ),
  deploy: readEnvUrl(
    import.meta.env.VITE_SITE_DEPLOY_URL,
    "https://github.com/yuanzui0728/yinjie-app/blob/main/DEPLOY.md",
  ),
  github: readEnvUrl(
    import.meta.env.VITE_SITE_GITHUB_URL,
    "https://github.com/yuanzui0728/yinjie-app",
  ),
  contact: "mailto:yuanzui0728@gmail.com",
};
