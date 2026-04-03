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

- this slice covers the HTTP compatibility surface
- realtime execution parity now continues in `phase-1/realtime-slice.md`
- direct-to-group upgrade logic and proactive delivery are still pending full parity migration

## Recommended Next Slice

1. scheduler execution parity
2. proactive messages
3. import / narrative support
