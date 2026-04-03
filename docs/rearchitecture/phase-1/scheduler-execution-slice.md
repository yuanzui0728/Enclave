# Phase 1 Slice: Scheduler Execution Runtime

## Scope

This slice moves scheduler parity from a read-only visibility surface into an executable Rust runtime:

- recurring job installation during Core API boot
- manual job execution via system route
- runtime job metrics and recent run history
- admin dashboard scheduler controls
- real behavior verification through legacy-compatible APIs

## What Landed

### 1. Executable scheduler runtime

`crates/core-api/src/scheduler.rs` now installs a live Tokio-driven scheduler module when the Core API starts.

The runtime currently executes these parity jobs:

- `update-world-context`
- `expire-friend-requests`
- `update-ai-active-status`
- `check-moment-schedule`
- `trigger-scene-friend-requests`
- `process-pending-feed-reactions`
- `update-character-status`
- `trigger-memory-proactive-messages`

Cold-start execution is preserved for the same subset already marked by the scaffold baseline.

### 2. Runtime status and manual trigger surface

The Core API system layer now exposes:

- `GET /system/scheduler`
- `POST /system/scheduler/run/:id`

The scheduler status payload now includes runtime execution fields:

- `startedAt`
- `recentRuns`
- per-job `runCount`
- per-job `running`
- per-job `lastRunAt`
- per-job `lastDurationMs`
- per-job `lastResult`

### 3. Admin runtime controls

`apps/admin/src/routes/dashboard-page.tsx` now surfaces:

- scheduler mode
- world snapshot count
- recent run count
- per-job run-now actions
- per-job execution stats
- recent scheduler run history

This means the new admin runtime is no longer just observing scheduler intent. It can now actively drive parity jobs for operational verification.

## Validation Notes

This slice was verified locally with a real Core API process:

- `cargo check`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm build`
- `POST /system/scheduler/run/update-world-context`
- `POST /api/auth/init`
- `POST /api/feed`
- `POST /system/scheduler/run/process-pending-feed-reactions`

Observed results during verification:

- world snapshot count increased from `2` to `3`
- latest world snapshot id changed to the newly generated snapshot
- `update-world-context` reported incremented `runCount` and stored `lastResult`
- a user-authored feed post moved from `commentCount = 0` to `commentCount = 2`
- the same feed post changed to `aiReacted = true`
- scheduler recent run history recorded both manual executions

## Current Behavior Notes

- scheduler execution is now live, but it still operates against the in-memory runtime store rather than SQLite-backed persistence
- time-of-day calculations remain lightweight and epoch-derived, matching the current scaffold style rather than a timezone-aware production clock
- proactive memory messages are persisted into conversation message state, but are not yet pushed through the realtime socket runtime
- probabilistic scheduler jobs such as scene triggers and moment scheduling intentionally remain non-deterministic

## Recommended Next Slice

1. proactive scheduler messages into realtime delivery
2. persistence alignment for scheduler-driven writes
3. inference gateway runtime beyond provider probe scaffolding
