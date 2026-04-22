import type { ComponentPropsWithoutRef, MouseEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  buildJobsPermalink,
  buildJobsRouteSearch,
  type JobsRouteSearch,
} from "../lib/job-route-search";

type JobsPermalinkLinkProps = Omit<ComponentPropsWithoutRef<"a">, "href"> & {
  search?: Partial<JobsRouteSearch>;
};

function shouldHandleClientNavigation(
  event: MouseEvent<HTMLAnchorElement>,
  target: string | undefined,
  download: JobsPermalinkLinkProps["download"],
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

export function JobsPermalinkLink({
  search,
  onClick,
  target,
  download,
  ...props
}: JobsPermalinkLinkProps) {
  const navigate = useNavigate();
  const href = buildJobsPermalink(search);

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
          to: "/jobs",
          search: buildJobsRouteSearch(search),
        });
      }}
    />
  );
}
