import type { ComponentPropsWithoutRef, MouseEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  buildWaitingSessionSyncPermalink,
  buildWaitingSessionSyncRouteSearch,
  type WaitingSessionSyncRouteSearch,
} from "../lib/waiting-session-sync-helpers";

type WaitingSyncPermalinkLinkProps = Omit<
  ComponentPropsWithoutRef<"a">,
  "href"
> & {
  search?: Partial<WaitingSessionSyncRouteSearch>;
};

function shouldHandleClientNavigation(
  event: MouseEvent<HTMLAnchorElement>,
  target: string | undefined,
  download: WaitingSyncPermalinkLinkProps["download"],
) {
  if (event.defaultPrevented || event.button !== 0) {
    return false;
  }

  if (download || (target && target !== "_self")) {
    return false;
  }

  return !(
    event.metaKey || event.altKey || event.ctrlKey || event.shiftKey
  );
}

export function WaitingSyncPermalinkLink({
  search,
  onClick,
  target,
  download,
  ...props
}: WaitingSyncPermalinkLinkProps) {
  const navigate = useNavigate();
  const href = buildWaitingSessionSyncPermalink(
    buildWaitingSessionSyncRouteSearch(search),
  );

  return (
    <a
      {...props}
      href={href}
      target={target}
      download={download}
      onClick={(event) => {
        onClick?.(event);
        if (!shouldHandleClientNavigation(event, target, download)) {
          return;
        }

        event.preventDefault();
        void navigate({
          to: "/waiting-sync",
          search: buildWaitingSessionSyncRouteSearch(search),
        });
      }}
    />
  );
}
