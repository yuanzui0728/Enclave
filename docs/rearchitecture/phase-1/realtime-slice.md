# Phase 1 Slice: Chat Realtime Runtime

## Scope

This slice moves the direct chat realtime runtime from naming-only parity to executable Socket.IO behavior:

- Socket.IO namespace bootstrap
- room join tracking
- direct conversation send-message flow
- typing start / stop events
- new message broadcast
- group conversation update broadcast
- realtime operational visibility

## What Landed

### 1. Runtime module

`crates/core-api/src/realtime.rs` now installs a live Socket.IO namespace:

- namespace: `/chat`
- socket path: `/socket.io`

It handles:

- connection / disconnection tracking
- `join_conversation`
- `send_message`
- room membership accounting
- recent realtime event history

### 2. Message turn execution

The new runtime now performs a real direct-message turn:

- ensures the conversation exists before sending
- auto-joins the caller to the conversation room when needed
- emits `typing_start`
- persists the user message into the in-memory runtime store
- generates deterministic character replies from the seeded character profile
- emits `typing_stop`
- broadcasts both the user message and character reply through `new_message`

Busy / sleeping compatibility also landed in scaffold form:

- `sleeping` emits a system message and stops
- `working` / `commuting` emits a system hint, waits, then continues the turn

### 3. System visibility

The Core API now exposes:

- `GET /system/realtime`

This includes:

- connected client count
- active room count
- tracked room subscribers
- supported realtime event names
- recent realtime event history
- last event timestamp
- last message timestamp

### 4. Admin observability

The admin dashboard now surfaces:

- realtime client and room counts
- socket path visibility
- active room cards
- recent realtime event history

## Validation Notes

This slice was verified locally by:

- compiling the Core API with `cargo check`
- connecting with `socket.io-client`
- joining a conversation room
- sending a direct message
- observing `typing_start`
- observing `typing_stop`
- observing `new_message`
- checking `/system/realtime` for connection and room event traces

## Current Behavior Notes

- direct chat realtime is now executable, but replies are still scaffolded deterministic text rather than model output
- group chat UI remains REST-driven for message send/read in the legacy frontend
- proactive message pushes are not yet wired into the new realtime runtime
- automatic direct-to-group upgrade logic from the old NestJS chat service is still pending

## Recommended Next Slice

1. scheduler execution parity
2. proactive message delivery
3. import / narrative / analytics migration
