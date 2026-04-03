# Phase 1 Slice: Inference Preview Execution

## Scope

This slice extends the new inference runtime beyond provider config and probe support:

- real `chat/completions` execution through the gateway queue
- system-level preview route for runtime validation
- admin preview panel for control-plane diagnostics

## What Landed

### 1. Completion execution in the gateway

`crates/inference-gateway/src/lib.rs` now supports:

- `ChatCompletionRequest`
- `ChatMessage`
- `ChatCompletionResponse`
- token usage extraction
- queued `chat/completions` execution against the active provider

The gateway now reuses the same queue and counter surface for both:

- provider probe requests
- completion preview requests

### 2. Core API preview route

The new system route:

- `POST /system/inference/preview`

accepts a prompt and optional system prompt, forwards the request through the active provider profile, and returns:

- success state
- output text
- resolved model
- finish reason
- token usage
- error message when execution fails

This route is intentionally system-scoped so we can validate the inference runtime without changing any business logic.

### 3. Shared contract and admin wiring

`packages/contracts` now includes:

- `InferencePreviewRequest`
- `InferencePreviewResponse`
- `InferenceUsage`
- `runInferencePreview()`

`apps/admin/src/routes/dashboard-page.tsx` now includes an inference preview panel that can:

- submit a preview prompt
- show the returned output
- show model / finish reason / token usage
- reuse the active provider profile from the provider runtime card

## Validation Notes

This slice was verified locally with:

- `cargo check` in `crates/inference-gateway`
- `cargo check` in `crates/core-api`
- `pnpm typecheck`
- `pnpm build`

Runtime validation used a local mock OpenAI-compatible provider on `127.0.0.1:39114`, then:

- `PUT /system/provider`
- `POST /system/provider/test`
- `POST /system/inference/preview`
- `GET /system/status`

Observed results during verification:

- provider probe returned `200`
- preview returned `Mock hello from inference gateway.`
- token usage surfaced as `prompt=12`, `completion=7`, `total=19`
- `/system/status` showed `totalRequests=2`, `successfulRequests=2`, `failedRequests=0`

## Current Behavior Notes

- this slice is still a system-level validation surface, not business routing
- scheduler, moments, feed, and chat business generation are not yet calling the gateway
- provider retry and circuit-breaker policy are still minimal

## Recommended Next Slice

1. route scheduler-driven generation through the gateway
2. add timeout / retry / circuit-breaker policy controls
3. move provider secrets out of snapshot config into keyring-backed storage
