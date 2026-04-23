import type { ComponentPropsWithoutRef, MouseEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  buildAdminSessionsPermalink,
  buildAdminSessionsRouteSearch,
  type AdminSessionsRouteSearch,
} from "../lib/admin-sessions-route-search";

type SessionsPermalinkLinkProps = Omit<
  ComponentPropsWithoutRef<"a">,
  "href"
> & {
  search?: Partial<AdminSessionsRouteSearch>;
};

function shouldHandleClientNavigation(
  event: MouseEvent<HTMLAnchorElement>,
  target: string | undefined,
  download: SessionsPermalinkLinkProps["download"],
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

export function SessionsPermalinkLink({
  search,
  onClick,
  target,
  download,
  ...props
}: SessionsPermalinkLinkProps) {
  const navigate = useNavigate();
  const href = buildAdminSessionsPermalink(search);

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
          to: "/sessions",
          search: buildAdminSessionsRouteSearch(search),
        });
      }}
    />
  );
}
