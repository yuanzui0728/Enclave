# Gateway Social Greeting Slice

## Goal

Route first-contact social greetings through the inference gateway without changing:

- `/api/social/shake`
- `/api/social/trigger-scene`
- friend-request persistence shape
- candidate selection and pending-request guards
- fallback behavior when provider is unavailable

## What Changed

- Added `generate_social_greeting_text(...)` in `crates/core-api/src/generation.rs`
- `shake` now snapshots the selected character, then generates the greeting through the gateway outside the runtime lock
- `trigger_scene` now:
  - snapshots the candidate character outside the write lock
  - preserves the pending-request early return
  - generates the greeting through the gateway
  - re-checks for pending requests before final insert
- Existing static greeting strings remain as the fallback path

## Validation

Validated on April 4, 2026 with:

- `cargo check`
- `cargo build`

Runtime validation passed against a temporary local OpenAI-compatible mock provider:

- `POST /api/social/shake`
  - returned `Mock social greeting: ...`
- `POST /api/social/trigger-scene`
  - returned `Mock scene greeting: ...`
- `/system/status.inferenceGateway.successfulRequests` increased to `2`
- `/system/status.inferenceGateway.lastError` remained `null`

## Remaining Follow-up

- route more social discovery copy through the same gateway abstraction if new entry points are added
- eventually remove repeated fallback strings after the social generation layer is fully consolidated
