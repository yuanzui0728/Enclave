# Gateway Group Upgrade Slice

## Goal

Restore the old direct-chat escalation behavior where a character can upgrade a conversation into a temporary group consultation when the user's question exceeds that character's expertise.

## What Changed

- Added group-intent classification in `crates/core-api/src/generation.rs`
- Added gateway-backed coordinator text generation for the character who initiates the group upgrade
- Realtime direct conversations now:
  - classify whether the user message needs group help
  - look for already-known characters whose expert domains match the required domains
  - upgrade the conversation to `group`
  - emit a coordinator reply
  - emit a system join message for invited characters
  - emit invited character replies through the same gateway-backed chat generation path
- Updated persistence so upgraded conversations store:
  - `type = group`
  - expanded `participants`
  - upgraded `title`

## Validation

Validated on April 4, 2026 with:

- `cargo check`
- `cargo build`

Runtime validation passed against a temporary local OpenAI-compatible mock provider:

- created an existing direct conversation with `char_lawyer`
- sent Socket.IO `/chat` message to `char_tech` about a contract dispute
- observed `conversation_updated` with:
  - `type = group`
  - participants including `char_lawyer`
- observed `new_message` sequence:
  - user message
  - coordinator reply from `char_tech`
  - system join message
  - invited reply from `char_lawyer`
- confirmed stored conversation type is `group`
- `/system/status.inferenceGateway.successfulRequests` reached `3`
- `/system/status.inferenceGateway.lastError` remained `null`
