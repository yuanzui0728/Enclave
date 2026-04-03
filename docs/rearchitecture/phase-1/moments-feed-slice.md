# Phase 1 Slice: Moments / Feed Compatibility

## Scope

This slice moves the social content surfaces into the new runtime scaffold:

- moments feed list and author filter
- create user moment
- moment detail
- character moment generation
- moment comments and like toggle
- feed list paging
- feed post detail with comments
- create feed post
- feed comments and like action

## What Landed

### 1. Shared contracts

`packages/contracts` now includes typed shapes for:

- `Moment`
- `MomentComment`
- `MomentLike`
- `MomentInteraction`
- `FeedPost`
- `FeedComment`
- `FeedPostWithComments`
- moments and feed request payloads

The typed client now exposes:

- `getMoments`
- `getMoment`
- `createUserMoment`
- `addMomentComment`
- `toggleMomentLike`
- `generateMoment`
- `generateAllMoments`
- `getFeed`
- `getFeedPost`
- `createFeedPost`
- `addFeedComment`
- `likeFeedPost`

### 2. Rust Core API compatibility routes

The new runtime now exposes:

- `GET /api/moments`
- `POST /api/moments/user-post`
- `GET /api/moments/:id`
- `POST /api/moments/generate/:characterId`
- `POST /api/moments/generate-all`
- `POST /api/moments/:id/comment`
- `POST /api/moments/:id/like`
- `GET /api/feed`
- `GET /api/feed/:id`
- `POST /api/feed`
- `POST /api/feed/:id/comment`
- `POST /api/feed/:id/like`

### 3. Seeded content baseline

The Rust runtime now boots with:

- seeded moments posts, comments, and likes
- seeded feed posts, comments, and interactions
- content counters that stay in sync after comment/like mutations

This keeps the new admin surface useful before the full scheduler-driven AI generation path is ported.

### 4. Admin observability

The new admin dashboard now surfaces:

- moments post count and preview cards
- feed post count and preview cards
- migrated module visibility updated to include `moments` and `feed`

## Current Behavior Notes

- this slice keeps the legacy HTTP surface compatible, but does not yet replicate the old async AI reaction scheduler
- generated character moments currently use deterministic runtime text instead of model output
- feed like semantics remain one-way like tracking, matching the old controller/service behavior
- feed post detail includes comments; feed list remains paged summary data

## Recommended Next Slice

1. WebSocket runtime parity for `/chat`
2. scheduler execution parity for moments/feed generation
3. import and narrative support modules
