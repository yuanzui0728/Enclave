import { isDesktopRuntimeAvailable } from "@yinjie/ui";
import {
  buildDesktopStandaloneWindowLabel,
  openBrowserStandaloneWindow,
  openDesktopStandaloneWindow,
} from "../../../runtime/desktop-windowing";
import { createDesktopNoteDraft } from "../../favorites/note-drafts-storage";
import {
  buildDesktopNoteWindowPath,
  type DesktopNoteWindowRouteState,
} from "../../favorites/note-window-route-state";

export {
  buildDesktopNoteWindowPath,
  buildDesktopNoteWindowRouteHash,
  parseDesktopNoteEditorRouteHash,
  parseDesktopNoteWindowRouteHash,
  type DesktopNoteWindowRouteState,
} from "../../favorites/note-window-route-state";

function buildDesktopNoteWindowLabel(input: DesktopNoteWindowRouteState) {
  return buildDesktopStandaloneWindowLabel(
    "desktop-note-window",
    input.noteId ?? input.draftId,
  );
}

export async function openDesktopNoteWindow(input?: {
  noteId?: string;
  draftId?: string;
  returnTo?: string;
}) {
  if (typeof window === "undefined") {
    return false;
  }

  const draft = createDesktopNoteDraft({
    draftId: input?.draftId,
    noteId: input?.noteId,
  });
  const routeState: DesktopNoteWindowRouteState = {
    draftId: draft.draftId,
    noteId: input?.noteId?.trim() || undefined,
    returnTo: input?.returnTo?.trim() || undefined,
  };
  const windowLabel = buildDesktopNoteWindowLabel(routeState);
  const routePath = buildDesktopNoteWindowPath(routeState);
  const width = Math.max(980, Math.min(window.screen.availWidth - 120, 1100));
  const height = Math.max(780, Math.min(window.screen.availHeight - 96, 920));
  const left = Math.max(24, Math.round((window.screen.availWidth - width) / 2));
  const top = Math.max(
    24,
    Math.round((window.screen.availHeight - height) / 2),
  );
  const features = [
    "popup=yes",
    `width=${width}`,
    `height=${height}`,
    `left=${left}`,
    `top=${top}`,
  ].join(",");

  if (!isDesktopRuntimeAvailable()) {
    return openBrowserStandaloneWindow({
      label: windowLabel,
      url: routePath,
      features,
    });
  }

  if (
    await openDesktopStandaloneWindow({
      label: windowLabel,
      url: routePath,
      title: "笔记",
      width,
      height,
      minWidth: 980,
      minHeight: 760,
    })
  ) {
    return true;
  }

  return openBrowserStandaloneWindow({
    label: windowLabel,
    url: routePath,
    features,
  });
}
