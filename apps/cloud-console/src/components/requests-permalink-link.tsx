import type { ComponentPropsWithoutRef, MouseEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  buildRequestsPermalink,
  buildRequestsRouteSearch,
  type RequestsRouteSearch,
} from "../lib/request-route-search";

type RequestsPermalinkLinkProps = Omit<
  ComponentPropsWithoutRef<"a">,
  "href"
> & {
  search?: Partial<RequestsRouteSearch>;
};

function shouldHandleClientNavigation(
  event: MouseEvent<HTMLAnchorElement>,
  target: string | undefined,
  download: RequestsPermalinkLinkProps["download"],
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

export function RequestsPermalinkLink({
  search,
  onClick,
  target,
  download,
  ...props
}: RequestsPermalinkLinkProps) {
  const navigate = useNavigate();
  const href = buildRequestsPermalink(search);

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
          to: "/requests",
          search: buildRequestsRouteSearch(search),
        });
      }}
    />
  );
}
