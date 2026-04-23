export function normalizePathname(pathname: string) {
  const trimmed = pathname.trim();
  if (!trimmed.startsWith("/")) {
    return trimmed;
  }

  if (trimmed === "/") {
    return "/";
  }

  return trimmed.replace(/\/+$/, "");
}
