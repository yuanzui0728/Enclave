# Phase 1 Slice: Gateway-backed Content Generation

## Scope

This slice starts routing real content generation through the new inference gateway without changing business triggers:

- character moment generation
- scheduled moment generation
- scheduled feed reaction comments
- fallback preservation when provider is unavailable

## What Landed

### 1. Generation helper layer

`crates/core-api/src/generation.rs` now centralizes gateway-backed content generation helpers for:

- moment text generation
- feed comment generation

The helper behavior is intentionally conservative:

- if an active provider is configured, call the inference gateway
- if the provider is missing or the request fails, fall back to the existing placeholder text

This keeps route semantics and scheduler behavior stable while removing demo-only hardcoded generation from the primary runtime path.

### 2. Moments compatibility routes now use the gateway

`crates/core-api/src/routes/legacy/moments.rs` now routes:

- `POST /api/moments/generate/:characterId`
- `POST /api/moments/generate-all`

through the new generation helper.

The route surface, response shape, persistence behavior, and generated post insertion flow remain unchanged.

### 3. Scheduler content generation now uses the gateway

`crates/core-api/src/scheduler.rs` now routes two jobs through the generation helper:

- `check-moment-schedule`
- `process-pending-feed-reactions`

Important parity rule preserved:

- probability gates, active-hour checks, count limits, and scheduler cadence are unchanged
- only the text generation source changed from hardcoded placeholder strings to gateway-first generation with fallback

### 4. Locking model improved

This slice also removes content-generation awaits from inside runtime write locks:

- candidates are selected under read lock
- gateway calls happen outside the runtime lock
- final records are persisted under write lock

This is an important production-readiness improvement because high-latency inference no longer blocks runtime state mutation behind a long-held write lock.

## Validation Notes

This slice was verified locally with:

- `cargo check` in `crates/core-api`
- `cargo build` in `crates/core-api`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm build`

Runtime verification used a local mock OpenAI-compatible provider on `127.0.0.1:39116`, then:

- `PUT /system/provider`
- `POST /api/moments/generate/char_tech`
- `POST /api/feed`
- `POST /system/scheduler/run/process-pending-feed-reactions`
- `GET /api/feed/:id`

Observed results during verification:

- generated moment text came back from the gateway mock provider
- feed reaction comments came back from the gateway mock provider
- scheduler still processed one pending feed post and marked `aiReacted=true`
- generated feed comment count remained consistent with the current two-comment reaction behavior

## Current Behavior Notes

- this slice does not yet route proactive memory messages through the gateway
- this slice does not yet add retry / circuit-breaker policy knobs for business generation paths
- fallback content is still present by design so the app remains stable without provider setup

## Recommended Next Slice

1. route proactive memory messages through the gateway
2. route richer social reply generation through the gateway
3. move provider secrets from snapshot persistence toward keyring-backed storage
