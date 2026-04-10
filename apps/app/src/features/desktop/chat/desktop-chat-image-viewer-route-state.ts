const DESKTOP_CHAT_IMAGE_VIEWER_PATH = "/desktop/chat-image-viewer";

export type DesktopChatImageViewerRouteState = {
  imageUrl: string;
  title: string;
  meta?: string;
  returnTo?: string;
};

export function buildDesktopChatImageViewerRouteHash(
  input: DesktopChatImageViewerRouteState,
) {
  const params = new URLSearchParams();
  params.set("imageUrl", input.imageUrl);
  params.set("title", input.title.trim() || "图片");

  if (input.meta?.trim()) {
    params.set("meta", input.meta.trim());
  }

  if (input.returnTo?.trim()) {
    params.set("returnTo", input.returnTo.trim());
  }

  return params.toString();
}

export function buildDesktopChatImageViewerPath(
  input: DesktopChatImageViewerRouteState,
) {
  const hash = buildDesktopChatImageViewerRouteHash(input);
  return hash
    ? `${DESKTOP_CHAT_IMAGE_VIEWER_PATH}#${hash}`
    : DESKTOP_CHAT_IMAGE_VIEWER_PATH;
}

export function parseDesktopChatImageViewerRouteHash(hash: string) {
  const normalizedHash = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!normalizedHash) {
    return null;
  }

  const params = new URLSearchParams(normalizedHash);
  const imageUrl = params.get("imageUrl")?.trim();
  const title = params.get("title")?.trim();
  if (!imageUrl || !title) {
    return null;
  }

  const meta = params.get("meta")?.trim();
  const returnTo = params.get("returnTo")?.trim();

  return {
    imageUrl,
    title,
    meta: meta || undefined,
    returnTo: returnTo || undefined,
  } satisfies DesktopChatImageViewerRouteState;
}

export function openDesktopChatImageViewerWindow(
  input: DesktopChatImageViewerRouteState,
) {
  if (typeof window === "undefined") {
    return false;
  }

  const width = Math.max(
    1120,
    Math.min(window.screen.availWidth - 96, 1320),
  );
  const height = Math.max(
    760,
    Math.min(window.screen.availHeight - 96, 920),
  );
  const left = Math.max(24, Math.round((window.screen.availWidth - width) / 2));
  const top = Math.max(24, Math.round((window.screen.availHeight - height) / 2));
  const features = [
    "noopener",
    "noreferrer",
    "popup=yes",
    `width=${width}`,
    `height=${height}`,
    `left=${left}`,
    `top=${top}`,
  ].join(",");

  return Boolean(
    window.open(buildDesktopChatImageViewerPath(input), "_blank", features),
  );
}
