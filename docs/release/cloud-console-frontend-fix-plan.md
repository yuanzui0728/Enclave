# Cloud Console Frontend Fix Plan

## Scope

Applies to `apps/cloud-console`, the official cloud orchestration console for:

- request review
- world lifecycle operations
- drift and alert inspection
- lifecycle job tracing

## Current Frontend Shape

- Stack: React 19 + Vite + TanStack Router + TanStack Query
- Main routes: `dashboard`, `requests`, `worlds`, `jobs`, `request detail`, `world detail`
- API mode: direct `fetch` calls to `apps/cloud-api` under `/admin/cloud/*`
- Auth mode: `CLOUD_ADMIN_SECRET` stored in browser `localStorage`

## Confirmed Issues

### P0

- Query defaults were missing in `cloud-console`, so detail forms could refetch on window focus and overwrite unsaved edits.
- World detail exposed `resume`, `suspend`, and `retry` too broadly, which made healthy worlds easy to misoperate.
- Request and world detail forms relied on backend validation only, so invalid saves produced avoidable 400 responses.

### P1

- Wide tables were clipped on narrow windows because they used `overflow-hidden` instead of horizontal scrolling.
- Network failures from the admin API were surfaced as generic fetch errors, which slowed down operator diagnosis.

### P2

- Bootstrap package actions lacked copy helpers for runtime env, compose snippets, and callback credentials.
- Request detail did not lock endpoint edits when operators moved a request into terminal review states.
- There was no interaction-level coverage for confirmation dialogs, success notices, or clipboard actions.

## Changes Applied In This Pass

- Added `react-query` defaults: `retry: 1` and `refetchOnWindowFocus: false`.
- Added form hydration guards so validation does not flash before server data populates the detail pages.
- Added client-side validation for request/world detail saves.
- Disabled invalid `resume`, `suspend`, and `retry` actions in world detail based on lifecycle state.
- Converted data tables to horizontal-scroll containers for narrow layouts.
- Improved admin API network error messages to include the target API base.
- Added console-level success notices for secret saves, request saves, world saves, and lifecycle actions.
- Added explicit confirmation for `suspend`, `retry`, and callback-token rotation in world detail.
- Added route smoke coverage for dashboard, requests, worlds, jobs, and both detail routes.
- Tightened `cloud-api` action guards so `suspend` and `retry` follow the same lifecycle constraints as the console UI.
- Added copy-to-clipboard actions for callback endpoints, callback token, runtime env overlay, and docker compose snippets.
- Locked request-detail endpoint edits while a request is in `rejected` or `disabled`, and omit those fields from PATCH payloads in terminal review states.
- Added focused interaction tests that cover request terminal-state validation, copy success notices, and confirmation-gated suspend actions.
- Restored missing `dashboard-page.tsx` and `jobs-page.tsx` route source files so router lazy imports resolve from source instead of only existing in built assets.
- Added browser-style interaction assertions for dialog dismissal via `Escape` and console notice auto-expiry after the toast timeout.
- Added a live smoke test that boots a real local `cloud-api`, creates a pending request through public auth endpoints, activates it through the console UI, and verifies live data across dashboard, worlds, world detail, and jobs routes.
- Extracted a reusable ephemeral `cloud-api` test harness so backend API e2e and console live smoke share the same startup and cleanup logic.
- Normalized empty `world-instance` admin responses to `null` instead of `undefined`, preventing `react-query` warnings for worlds that do not have an instance row yet.
- Added raw smoke script variants plus a root `pnpm ci:cloud` command so local and CI cloud validation run the same ordered command chain without rebuilding `cloud-api` twice.
- Wired the repository CI workflow with a dedicated `cloud-smoke` job that runs the cloud lint, unit/smoke tests, backend e2e, frontend build, and live admin-console smoke on every `main` push and pull request.
- Added a real Chromium-based Playwright smoke that boots a live `cloud-api`, serves `cloud-console` through Vite, activates a request in-browser, and verifies route navigation plus modal dismissal behavior in an actual browser runtime.
- Added `test:browser`, `test:browser:raw`, and `test:browser:install` console scripts plus a root `pnpm ci:cloud:browser` chain so browser validation can run locally and in CI from the same command flow.
- Extended the CI `cloud-smoke` job to install Playwright Chromium and run the full browser-inclusive cloud validation chain on every `main` push and pull request.

## Recommended Next Steps

1. Expand the Playwright suite beyond the single smoke path if you need richer browser guarantees around copy-to-clipboard permissions, responsive layout, or retry/suspend confirmation flows.
2. Split the `cloud-smoke` workflow into parallel backend/frontend/browser jobs only if CI latency becomes a real problem; the current ordered chain optimizes for simplicity and shared setup.
