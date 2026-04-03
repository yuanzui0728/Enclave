# Phase 1 Slice: Chat / Groups Compatibility

## Scope

This slice moves the HTTP-based chat surface into the new runtime scaffold:

- conversations list
- get or create direct conversation
- conversation messages
- mark conversation read
- group create / read
- group members
- group message history
- send group message

## What Landed

### 1. Shared contracts

`packages/contracts` now includes `chat` shapes for:

- `Conversation`
- `ConversationListItem`
- `Message`
- `Group`
- `GroupMember`
- `GroupMessage`
- group and conversation request payloads

### 2. Rust Core API compatibility routes

The new runtime now exposes:

- `GET /api/conversations`
- `POST /api/conversations`
- `GET /api/conversations/:id/messages`
- `POST /api/conversations/:id/read`
- `POST /api/groups`
- `GET /api/groups/:id`
- `GET /api/groups/:id/members`
- `POST /api/groups/:id/members`
- `GET /api/groups/:id/messages`
- `POST /api/groups/:id/messages`

### 3. Event compatibility baseline

WebSocket naming compatibility remains frozen in the shared contract layer:

- `/chat`
- `join_conversation`
- `send_message`
- `new_message`
- `typing_start`
- `typing_stop`
- `conversation_updated`

## Current Behavior Notes

- this slice currently covers the HTTP compatibility surface and event naming parity
- the Rust runtime does not yet execute the full real-time gateway behavior from NestJS
- direct message generation and group AI replies are still pending full parity migration

## Recommended Next Slice

1. WebSocket runtime parity
2. `moments`
3. `feed`
