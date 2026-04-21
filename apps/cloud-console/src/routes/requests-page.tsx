import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { CloudAdminErrorBlock } from "../components/cloud-admin-error-block";
import {
  RequestProjectionBadges,
  RequestProjectionFilterControls,
  RequestStatusBadge,
  RequestStatusFilterButtons,
} from "../components/request-controls";
import { cloudAdminApi } from "../lib/cloud-admin-api";
import {
  buildRequestsRouteSearch,
  type RequestsRouteSearch,
} from "../lib/request-route-search";

function formatDateTime(value: string) {
  return new Date(value).toLocaleString();
}

export function RequestsPage() {
  const navigate = useNavigate({ from: "/requests" });
  const filters = useSearch({ from: "/requests" });
  const requestStatusFilter = filters.status;
  const projectedWorldStatusFilter = filters.projectedWorldStatus;
  const desiredStateFilter = filters.desiredState;

  function updateFilters(next: Partial<RequestsRouteSearch>) {
    void navigate({
      replace: true,
      search: (previous) => buildRequestsRouteSearch({ ...previous, ...next }),
    });
  }

  const requestsQuery = useQuery({
    queryKey: ["cloud-console", "requests", requestStatusFilter],
    queryFn: () =>
      cloudAdminApi.listRequests(
        requestStatusFilter === "all" ? undefined : requestStatusFilter,
      ),
  });
  const requests = useMemo(
    () =>
      (requestsQuery.data ?? []).filter((item) => {
        if (
          projectedWorldStatusFilter !== "all" &&
          item.projectedWorldStatus !== projectedWorldStatusFilter
        ) {
          return false;
        }

        if (
          desiredStateFilter !== "all" &&
          item.projectedDesiredState !== desiredStateFilter
        ) {
          return false;
        }

        return true;
      }),
    [desiredStateFilter, projectedWorldStatusFilter, requestsQuery.data],
  );

  return (
    <section className="rounded-[28px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] p-5 shadow-[var(--shadow-section)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xl font-semibold text-[color:var(--text-primary)]">
            World requests
          </div>
          <div className="mt-1 text-sm text-[color:var(--text-secondary)]">
            Compatibility view for the older approval workflow. Staff can still
            use it when manual intervention is needed.
          </div>
        </div>

        <RequestStatusFilterButtons
          value={requestStatusFilter}
          onChange={(status) => updateFilters({ status })}
        />
      </div>

      <RequestProjectionFilterControls
        projectedWorldStatus={projectedWorldStatusFilter}
        desiredState={desiredStateFilter}
        onProjectedWorldStatusChange={(projectedWorldStatus) =>
          updateFilters({ projectedWorldStatus })
        }
        onDesiredStateChange={(desiredState) =>
          updateFilters({ desiredState })
        }
      />

      <div className="mt-5 overflow-x-auto rounded-2xl border border-[color:var(--border-faint)]">
        <table className="min-w-[56rem] border-collapse text-left text-sm">
          <thead className="bg-[color:var(--surface-soft)] text-[color:var(--text-muted)]">
            <tr>
              <th className="px-4 py-3">World name</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Projected world</th>
              <th className="px-4 py-3">Updated</th>
            </tr>
          </thead>
          <tbody>
            {requests.map((item) => {
              return (
                <tr
                  key={item.id}
                  className="border-t border-[color:var(--border-faint)]"
                >
                  <td className="px-4 py-3">
                    <Link
                      to="/requests/$requestId"
                      params={{ requestId: item.id }}
                      className="text-[color:var(--text-primary)] hover:underline"
                    >
                      {item.worldName}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-[color:var(--text-secondary)]">
                    {item.phone}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <RequestStatusBadge status={item.status} />
                    </div>
                    <div className="mt-2 text-sm text-[color:var(--text-secondary)]">
                      {item.displayStatus ?? item.note ?? "No status detail"}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <RequestProjectionBadges
                      projectedWorldStatus={item.projectedWorldStatus}
                      projectedDesiredState={item.projectedDesiredState}
                      projectedLabel={null}
                      projectedRowClassName="flex flex-wrap items-center gap-2"
                      desiredRowClassName="mt-2 flex flex-wrap items-center gap-2 text-sm text-[color:var(--text-secondary)]"
                    />
                  </td>
                  <td className="px-4 py-3 text-[color:var(--text-secondary)]">
                    {formatDateTime(item.updatedAt)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {requestsQuery.isError && requestsQuery.error instanceof Error ? (
          <div className="p-4">
            <CloudAdminErrorBlock error={requestsQuery.error} />
          </div>
        ) : null}

        {requestsQuery.isLoading ? (
          <div className="p-4 text-sm text-[color:var(--text-muted)]">
            Loading requests...
          </div>
        ) : null}

        {!requestsQuery.isLoading &&
        !requestsQuery.isError &&
        !requests.length ? (
          <div className="p-4 text-sm text-[color:var(--text-muted)]">
            No requests match this filter.
          </div>
        ) : null}
      </div>
    </section>
  );
}
