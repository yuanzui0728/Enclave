use std::{
    future::Future,
    sync::{
        atomic::{AtomicUsize, Ordering},
        Mutex,
    },
};

use reqwest::header::{AUTHORIZATION, CONTENT_TYPE};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tokio::sync::{Semaphore, SemaphorePermit};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderConfig {
    pub endpoint: String,
    pub model: String,
    pub api_key: Option<String>,
    pub mode: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QueueMetrics {
    pub queue_depth: usize,
    pub max_concurrency: usize,
    pub in_flight_requests: usize,
    pub total_requests: usize,
    pub successful_requests: usize,
    pub failed_requests: usize,
    pub active_provider: Option<ProviderConfig>,
    pub last_success_at: Option<String>,
    pub last_error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderProbeResult {
    pub success: bool,
    pub message: String,
    pub normalized_endpoint: String,
    pub status_code: Option<u16>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatCompletionRequest {
    pub messages: Vec<ChatMessage>,
    pub model: Option<String>,
    pub temperature: Option<f32>,
    pub max_tokens: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TokenUsage {
    pub prompt_tokens: Option<u32>,
    pub completion_tokens: Option<u32>,
    pub total_tokens: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatCompletionResponse {
    pub request_id: Option<String>,
    pub model: String,
    pub content: String,
    pub finish_reason: Option<String>,
    pub usage: Option<TokenUsage>,
}

#[derive(Default)]
struct GatewayState {
    active_provider: Option<ProviderConfig>,
    last_success_at: Option<String>,
    last_error: Option<String>,
}

#[derive(Deserialize)]
struct ProviderChatResponse {
    id: Option<String>,
    model: Option<String>,
    choices: Vec<ProviderChatChoice>,
    usage: Option<ProviderUsage>,
}

#[derive(Deserialize)]
struct ProviderChatChoice {
    message: ProviderChatMessage,
    finish_reason: Option<String>,
}

#[derive(Deserialize)]
struct ProviderChatMessage {
    content: Option<Value>,
}

#[derive(Deserialize)]
struct ProviderUsage {
    prompt_tokens: Option<u32>,
    completion_tokens: Option<u32>,
    total_tokens: Option<u32>,
}

pub struct InferenceGateway {
    semaphore: Semaphore,
    max_concurrency: usize,
    queue_depth: AtomicUsize,
    in_flight_requests: AtomicUsize,
    total_requests: AtomicUsize,
    successful_requests: AtomicUsize,
    failed_requests: AtomicUsize,
    state: Mutex<GatewayState>,
    client: reqwest::Client,
}

impl InferenceGateway {
    pub fn new(max_concurrency: usize) -> Self {
        Self {
            semaphore: Semaphore::new(max_concurrency),
            max_concurrency,
            queue_depth: AtomicUsize::new(0),
            in_flight_requests: AtomicUsize::new(0),
            total_requests: AtomicUsize::new(0),
            successful_requests: AtomicUsize::new(0),
            failed_requests: AtomicUsize::new(0),
            state: Mutex::new(GatewayState::default()),
            client: reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(20))
                .build()
                .expect("failed to build inference gateway client"),
        }
    }

    pub fn configure_provider(&self, provider: ProviderConfig) {
        let mut state = self.state.lock().expect("inference gateway lock poisoned");
        state.active_provider = Some(normalize_provider(provider));
        state.last_error = None;
    }

    pub fn active_provider(&self) -> Option<ProviderConfig> {
        let state = self.state.lock().expect("inference gateway lock poisoned");
        state.active_provider.clone()
    }

    pub fn metrics(&self) -> QueueMetrics {
        let state = self.state.lock().expect("inference gateway lock poisoned");

        QueueMetrics {
            queue_depth: self.queue_depth.load(Ordering::Relaxed),
            max_concurrency: self.max_concurrency,
            in_flight_requests: self.in_flight_requests.load(Ordering::Relaxed),
            total_requests: self.total_requests.load(Ordering::Relaxed),
            successful_requests: self.successful_requests.load(Ordering::Relaxed),
            failed_requests: self.failed_requests.load(Ordering::Relaxed),
            active_provider: state.active_provider.clone(),
            last_success_at: state.last_success_at.clone(),
            last_error: state.last_error.clone(),
        }
    }

    pub async fn probe_provider(
        &self,
        provider: ProviderConfig,
    ) -> Result<ProviderProbeResult, String> {
        let provider = normalize_provider(provider);
        if provider.endpoint.is_empty() {
            return Err("Provider endpoint is required".into());
        }

        let result = self
            .run_tracked(
                self.run_probe(provider.clone()),
                if self.active_provider().is_none() {
                    Some(provider.clone())
                } else {
                    None
                },
            )
            .await;

        match result {
            Ok(probe) => Ok(probe),
            Err(message) => Err(message),
        }
    }

    pub async fn chat_completion(
        &self,
        request: ChatCompletionRequest,
    ) -> Result<ChatCompletionResponse, String> {
        let provider = self
            .active_provider()
            .ok_or_else(|| "Provider is not configured".to_string())?;
        let provider = normalize_provider(provider);

        if request.messages.is_empty() {
            return Err("At least one chat message is required".into());
        }

        self.run_tracked(self.run_chat_completion(provider, request), None)
            .await
    }

    async fn run_tracked<T, F>(
        &self,
        future: F,
        provider_to_set_on_success: Option<ProviderConfig>,
    ) -> Result<T, String>
    where
        F: Future<Output = Result<T, String>>,
    {
        let permit = self.acquire_request_slot().await?;
        let result = future.await;
        self.finish_request(permit);

        match &result {
            Ok(_) => {
                self.record_success(provider_to_set_on_success);
            }
            Err(message) => {
                self.record_failure(message);
            }
        }

        result
    }

    async fn acquire_request_slot(&self) -> Result<SemaphorePermit<'_>, String> {
        self.queue_depth.fetch_add(1, Ordering::Relaxed);
        let permit = self
            .semaphore
            .acquire()
            .await
            .map_err(|_| "Inference queue is shutting down".to_string())?;
        self.queue_depth.fetch_sub(1, Ordering::Relaxed);
        self.in_flight_requests.fetch_add(1, Ordering::Relaxed);
        self.total_requests.fetch_add(1, Ordering::Relaxed);
        Ok(permit)
    }

    fn finish_request(&self, permit: SemaphorePermit<'_>) {
        self.in_flight_requests.fetch_sub(1, Ordering::Relaxed);
        drop(permit);
    }

    fn record_success(&self, provider_to_set_on_success: Option<ProviderConfig>) {
        self.successful_requests.fetch_add(1, Ordering::Relaxed);
        let mut state = self.state.lock().expect("inference gateway lock poisoned");
        state.last_success_at = Some(now_token());
        state.last_error = None;
        if let Some(provider) = provider_to_set_on_success {
            state.active_provider = Some(provider);
        }
    }

    fn record_failure(&self, message: &str) {
        self.failed_requests.fetch_add(1, Ordering::Relaxed);
        let mut state = self.state.lock().expect("inference gateway lock poisoned");
        state.last_error = Some(message.to_string());
    }

    async fn run_probe(&self, provider: ProviderConfig) -> Result<ProviderProbeResult, String> {
        let request = self
            .client
            .get(&provider.endpoint)
            .header(CONTENT_TYPE, "application/json");

        let request = with_provider_auth(request, provider.api_key.as_deref());

        let response = request
            .send()
            .await
            .map_err(|error| format!("Failed to reach provider endpoint: {error}"))?;

        let status_code = response.status().as_u16();
        let success = response.status().is_success() || matches!(status_code, 401 | 403 | 404 | 405);

        if success {
            Ok(ProviderProbeResult {
                success: true,
                message: format!(
                    "Provider endpoint responded with status {} for model {}.",
                    status_code, provider.model
                ),
                normalized_endpoint: provider.endpoint,
                status_code: Some(status_code),
            })
        } else {
            Err(format!(
                "Provider endpoint returned non-compatible status {}.",
                status_code
            ))
        }
    }

    async fn run_chat_completion(
        &self,
        provider: ProviderConfig,
        request: ChatCompletionRequest,
    ) -> Result<ChatCompletionResponse, String> {
        let model = request
            .model
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or(provider.model.as_str())
            .to_string();
        let endpoint = build_chat_completions_url(&provider.endpoint);
        let body = build_chat_completion_body(&model, &request);
        let request = self
            .client
            .post(endpoint)
            .header(CONTENT_TYPE, "application/json")
            .json(&body);
        let request = with_provider_auth(request, provider.api_key.as_deref());

        let response = request
            .send()
            .await
            .map_err(|error| format!("Failed to execute chat completion: {error}"))?;
        let status_code = response.status();

        if !status_code.is_success() {
            let error_body = response.text().await.unwrap_or_default();
            let trimmed_error = error_body.trim();
            let detail = if trimmed_error.is_empty() {
                "Provider returned no error body".to_string()
            } else {
                trimmed_error.to_string()
            };

            return Err(format!(
                "Chat completion failed with status {}: {}",
                status_code.as_u16(),
                detail
            ));
        }

        let payload = response
            .json::<ProviderChatResponse>()
            .await
            .map_err(|error| format!("Failed to parse chat completion response: {error}"))?;
        let choice = payload
            .choices
            .first()
            .ok_or_else(|| "Provider returned no completion choices".to_string())?;
        let content = choice
            .message
            .content
            .as_ref()
            .and_then(extract_message_content)
            .ok_or_else(|| "Provider returned an empty completion message".to_string())?;

        Ok(ChatCompletionResponse {
            request_id: payload.id,
            model: payload.model.unwrap_or(model),
            content,
            finish_reason: choice.finish_reason.clone(),
            usage: payload.usage.map(|usage| TokenUsage {
                prompt_tokens: usage.prompt_tokens,
                completion_tokens: usage.completion_tokens,
                total_tokens: usage.total_tokens,
            }),
        })
    }
}

fn with_provider_auth(
    request: reqwest::RequestBuilder,
    api_key: Option<&str>,
) -> reqwest::RequestBuilder {
    if let Some(api_key) = api_key.filter(|value| !value.is_empty()) {
        request.header(AUTHORIZATION, format!("Bearer {api_key}"))
    } else {
        request
    }
}

fn build_chat_completion_body(model: &str, request: &ChatCompletionRequest) -> Value {
    let mut body = json!({
        "model": model,
        "messages": request
            .messages
            .iter()
            .map(|message| {
                json!({
                    "role": message.role,
                    "content": message.content,
                })
            })
            .collect::<Vec<_>>(),
    });

    if let Some(temperature) = request.temperature {
        body["temperature"] = json!(temperature);
    }

    if let Some(max_tokens) = request.max_tokens {
        body["max_tokens"] = json!(max_tokens);
    }

    body
}

fn build_chat_completions_url(endpoint: &str) -> String {
    let normalized = endpoint.trim().trim_end_matches('/');
    if normalized.ends_with("/chat/completions") {
        normalized.to_string()
    } else {
        format!("{normalized}/chat/completions")
    }
}

fn extract_message_content(value: &Value) -> Option<String> {
    match value {
        Value::String(content) => {
            let normalized = content.trim();
            if normalized.is_empty() {
                None
            } else {
                Some(normalized.to_string())
            }
        }
        Value::Array(items) => {
            let parts = items
                .iter()
                .filter_map(extract_content_part)
                .collect::<Vec<_>>();

            if parts.is_empty() {
                None
            } else {
                Some(parts.join("\n"))
            }
        }
        Value::Object(map) => map
            .get("text")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(|value| value.to_string()),
        _ => None,
    }
}

fn extract_content_part(value: &Value) -> Option<String> {
    match value {
        Value::String(content) => {
            let normalized = content.trim();
            if normalized.is_empty() {
                None
            } else {
                Some(normalized.to_string())
            }
        }
        Value::Object(map) => map
            .get("text")
            .and_then(Value::as_str)
            .or_else(|| map.get("content").and_then(Value::as_str))
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(|value| value.to_string()),
        _ => None,
    }
}

fn normalize_provider(mut provider: ProviderConfig) -> ProviderConfig {
    provider.endpoint = provider.endpoint.trim().trim_end_matches('/').to_string();
    provider.model = provider.model.trim().to_string();
    provider.mode = provider.mode.trim().to_string();
    provider.api_key = provider.api_key.and_then(|value| {
        let normalized = value.trim().to_string();
        if normalized.is_empty() {
            None
        } else {
            Some(normalized)
        }
    });
    provider
}

fn now_token() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};

    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_millis().to_string())
        .unwrap_or_else(|_| "0".into())
}
