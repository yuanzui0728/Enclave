# Phase 1 Slice: World / Scheduler Visibility

## Scope

This slice continues the production migration by moving the observable part of the world and scheduler layer into the new runtime:

- legacy-compatible `world/context`
- system-level scheduler visibility

## What Landed

### 1. Legacy-compatible world route

The Rust Core API now exposes:

- `GET /api/world/context`

This route returns the latest world snapshot shape using the same field names as the legacy NestJS module:

- `id`
- `localTime`
- `weather`
- `location`
- `season`
- `holiday`
- `recentEvents`
- `timestamp`

### 2. Scheduler visibility surface

The new runtime now exposes:

- `GET /system/scheduler`

This is not a legacy business API. It is a production-oriented observability surface that mirrors the current scheduler cadence list, including:

- world snapshot update
- friend request expiry
- AI active status refresh
- moments scheduling
- scene friend requests
- feed reactions
- character activity refresh
- proactive memory messages

### 3. Shared contracts and UI wiring

`packages/contracts` now includes:

- `world`
- `scheduler` status shapes inside `system`

The new app and admin runtime UIs now read:

- latest world context
- scheduler job list
- world snapshot counts

## Current Behavior Notes

- world context is currently scaffolded from runtime state and time-derived defaults
- scheduler is currently represented as a visibility and planning surface, not an executing Rust cron runtime yet
- old NestJS `world` and `scheduler` implementations remain the behavior baseline for full parity

## Recommended Next Slice

Recommended next migration focus:

1. `social`
2. `chat` + `groups` + WebSocket
3. `moments` + `feed`
