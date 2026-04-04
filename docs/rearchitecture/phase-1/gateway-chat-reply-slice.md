# Gateway Chat Reply Slice

## Goal

Route realtime `/chat` character replies through the new inference gateway without changing:

- Socket.IO namespace or event names
- busy / sleeping interception
- conversation persistence shape
- group conversation update emission
- fallback behavior when provider is unavailable

## What Changed

- Added gateway-backed chat reply generation in `crates/core-api/src/generation.rs`
- Added chat-specific prompt assembly with:
  - character identity and relationship
  - expert domains
  - current activity
  - memory summary
  - optional world context
  - group chat awareness
- Added history window shaping so realtime replies use recent conversation turns instead of placeholder-only text
- Added `persist_conversation_turn_gateway(...)` in `crates/core-api/src/realtime.rs`
- Realtime `/chat` now snapshots conversation context first, waits on inference outside the runtime write lock, then persists the finished turn
- Existing placeholder reply logic remains as the fallback path when gateway generation fails

## Compatibility Notes

- `join_conversation`
- `send_message`
- `new_message`
- `typing_start`
- `typing_stop`
- `conversation_updated`

The event contract above stays unchanged.

The generated reply path still preserves:

- direct chat vs group chat branching
- participant order for group replies
- typing delay based on generated character reply length
- same conversation/message persistence structure

## Validation

Validated on April 3, 2026 with:

- `cargo check`
- `cargo build`
- `pnpm typecheck`
- `pnpm build`

Realtime validation also passed against a temporary local OpenAI-compatible mock provider:

- connected Socket.IO client to `http://127.0.0.1:39097/chat`
- emitted `send_message`
- received `new_message` from `char_tech`
- observed reply text: `Mock gateway reply: Need help with deployment plan`
- observed `/system/status.inferenceGateway.successfulRequests = 1`

## Remaining Follow-up

- remove the now-retained legacy sync helper in `realtime.rs` after the next cleanup slice
- continue routing richer social and group-content generation through the same gateway abstraction
