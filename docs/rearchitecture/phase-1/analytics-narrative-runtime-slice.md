# Analytics Narrative Runtime Slice

## Goal

Restore the old `AIBehaviorLog` and `NarrativeArc` baseline entities inside the new Core API runtime so the production-grade architecture keeps compatibility with the legacy data model, without changing business logic or public API behavior.

## What Changed

- Added runtime compatibility records in `crates/core-api/src/models.rs`
  - `AIBehaviorLogRecord`
  - `NarrativeArcRecord`
  - `NarrativeMilestoneRecord`
- Added persisted runtime state fields in `crates/core-api/src/app_state.rs`
  - `ai_behavior_logs`
  - `narrative_arcs`
- Added reusable runtime helpers in `crates/core-api/src/app_state.rs`
  - `append_behavior_log(...)`
  - `ensure_narrative_arc(...)`
- Extended `/system/status` in `crates/core-api/src/routes/system.rs`
  - `legacySurface.narrativeArcsCount`
  - `legacySurface.behaviorLogsCount`
- Updated shared system contracts in `packages/contracts/src/system.ts`

## Runtime Wiring

The new compatibility structures are now written by existing migrated flows:

- `POST /api/social/friend-requests/:id/accept`
  - ensures a `narrative_arc`
  - appends acceptance-related behavior logs
- `POST /api/social/trigger-scene`
  - appends AI friend-request behavior logs
- `POST /api/moments/generate/:characterId`
- `POST /api/moments/generate-all`
  - append `moment_post` behavior logs
- scheduler `check-moment-schedule`
  - appends scheduled `moment_post` logs
- scheduler `trigger-scene-friend-requests`
  - appends AI `friend_request` logs
- scheduler `process-pending-feed-reactions`
  - appends AI `comment` logs
- `POST /api/groups/:id/messages`
  - async AI group replies append `comment` behavior logs

## Behavior Notes

- No public route paths were changed.
- Existing response payloads remain compatible.
- These records are internal compatibility data for migration tracking, diagnostics, and future SQLite/table formalization.

## Validation

Validated on April 4, 2026 with:

- `cargo check`
- `cargo build`
- `pnpm typecheck`

Runtime validation passed with a temporary Core API instance on `http://127.0.0.1:39105`:

- initialized a user
- created a scene-triggered friend request
- accepted the friend request
- generated a moment for `char_tech`
- read `/system/status`

Observed result summary:

- `narrativeArcsCount = 1`
- `behaviorLogsCount = 4`
- `usersCount = 1`
- `charactersCount = 4`
