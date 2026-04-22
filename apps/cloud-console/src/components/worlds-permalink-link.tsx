import type { ComponentPropsWithoutRef, MouseEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  buildWorldsPermalink,
  buildWorldsRouteSearch,
  type WorldsRouteSearch,
} from "../lib/world-route-search";

type WorldsPermalinkLinkProps = Omit<ComponentPropsWithoutRef<"a">, "href"> & {
  search?: Partial<WorldsRouteSearch>;
};

function shouldHandleClientNavigation(
  event: MouseEvent<HTMLAnchorElement>,
  target: string | undefined,
  download: WorldsPermalinkLinkProps["download"],
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

export function WorldsPermalinkLink({
  search,
  onClick,
  target,
  download,
  ...props
}: WorldsPermalinkLinkProps) {
  const navigate = useNavigate();
  const href = buildWorldsPermalink(search);

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
          to: "/worlds",
          search: buildWorldsRouteSearch(search),
        });
      }}
    />
  );
}
