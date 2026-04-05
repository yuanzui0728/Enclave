use std::time::{SystemTime, UNIX_EPOCH};

use axum::{
    extract::{Path, Query, State},
    http::HeaderMap,
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};

use crate::{
    app_state::{AppState, RuntimeState},
    auth_support::require_session_user,
    error::{ApiError, ApiResult},
    models::{
        CreateFeedCommentPayload, CreateFeedPostPayload, FeedCommentRecord, FeedListResponse,
        FeedPostRecord, FeedPostWithCommentsRecord, FeedQuery, LikeFeedPostPayload,
    },
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(get_feed).post(create_post))
        .route("/:id", get(get_post))
        .route("/:id/comment", post(add_comment))
        .route("/:id/like", post(like_post))
}

async fn get_feed(
    State(state): State<AppState>,
    Query(query): Query<FeedQuery>,
) -> Json<FeedListResponse> {
    let runtime = state.runtime.read().expect("runtime lock poisoned");
    let page = query.page.unwrap_or(1).max(1);
    let limit = query.limit.unwrap_or(20).max(1);
    let start = (page - 1) * limit;

    let mut posts = runtime.feed_posts.values().cloned().collect::<Vec<_>>();
    posts.sort_by(|left, right| {
        parse_timestamp(&right.created_at).cmp(&parse_timestamp(&left.created_at))
    });
    let total = posts.len();
    let paged = posts
        .into_iter()
        .skip(start)
        .take(limit)
        .collect::<Vec<_>>();

    Json(FeedListResponse {
        posts: paged,
        total,
    })
}

async fn get_post(
    Path(id): Path<String>,
    State(state): State<AppState>,
) -> Json<Option<FeedPostWithCommentsRecord>> {
    let runtime = state.runtime.read().expect("runtime lock poisoned");
    Json(
        runtime
            .feed_posts
            .get(&id)
            .map(|post| enrich_feed_post(post, &runtime)),
    )
}

async fn create_post(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<CreateFeedPostPayload>,
) -> ApiResult<Json<FeedPostRecord>> {
    require_session_user(&headers, &state, &payload.author_id)?;
    let mut runtime = state.runtime.write().expect("runtime lock poisoned");
    let post = FeedPostRecord {
        id: format!("feed_{}", now_token()),
        author_id: payload.author_id,
        author_name: payload.author_name,
        author_avatar: payload.author_avatar,
        author_type: "user".into(),
        text: payload.text,
        media_url: None,
        media_type: "text".into(),
        like_count: 0,
        comment_count: 0,
        ai_reacted: false,
        created_at: now_token(),
    };

    runtime.feed_posts.insert(post.id.clone(), post.clone());
    runtime.feed_comments.entry(post.id.clone()).or_default();
    runtime
        .feed_interactions
        .entry(post.id.clone())
        .or_default();
    drop(runtime);
    state.request_persist("feed-create-post");

    Ok(Json(post))
}

async fn add_comment(
    Path(id): Path<String>,
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<CreateFeedCommentPayload>,
) -> ApiResult<Json<FeedCommentRecord>> {
    require_session_user(&headers, &state, &payload.author_id)?;
    let mut runtime = state.runtime.write().expect("runtime lock poisoned");
    if !runtime.feed_posts.contains_key(&id) {
        return Err(ApiError::not_found(format!("Feed post {} not found", id)));
    }

    let comment = FeedCommentRecord {
        id: format!("feed_comment_{}", now_token()),
        post_id: id.clone(),
        author_id: payload.author_id,
        author_name: payload.author_name,
        author_avatar: payload.author_avatar,
        author_type: "user".into(),
        text: payload.text,
        created_at: now_token(),
    };

    let comment_count = {
        let comments = runtime.feed_comments.entry(id.clone()).or_default();
        comments.push(comment.clone());
        comments.len()
    };

    if let Some(post) = runtime.feed_posts.get_mut(&id) {
        post.comment_count = comment_count;
    }
    drop(runtime);
    state.request_persist("feed-add-comment");

    Ok(Json(comment))
}

async fn like_post(
    Path(id): Path<String>,
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<LikeFeedPostPayload>,
) -> ApiResult<StatusCode> {
    require_session_user(&headers, &state, &payload.user_id)?;
    let mut runtime = state.runtime.write().expect("runtime lock poisoned");
    if !runtime.feed_posts.contains_key(&id) {
        return Err(ApiError::not_found(format!("Feed post {} not found", id)));
    }

    let like_count = {
        let interactions = runtime.feed_interactions.entry(id.clone()).or_default();
        if interactions.iter().any(|interaction| {
            interaction.user_id == payload.user_id && interaction.r#type == "like"
        }) {
            interactions.len()
        } else {
            interactions.push(crate::models::FeedInteractionRecord {
                id: format!("feed_like_{}", now_token()),
                user_id: payload.user_id,
                post_id: id.clone(),
                r#type: "like".into(),
                created_at: now_token(),
            });
            interactions.len()
        }
    };

    if let Some(post) = runtime.feed_posts.get_mut(&id) {
        post.like_count = like_count;
    }
    drop(runtime);
    state.request_persist("feed-like-post");

    Ok(StatusCode::OK)
}

fn enrich_feed_post(post: &FeedPostRecord, runtime: &RuntimeState) -> FeedPostWithCommentsRecord {
    let mut comments = runtime
        .feed_comments
        .get(&post.id)
        .cloned()
        .unwrap_or_default();
    comments.sort_by(|left, right| {
        parse_timestamp(&left.created_at).cmp(&parse_timestamp(&right.created_at))
    });

    FeedPostWithCommentsRecord {
        id: post.id.clone(),
        author_id: post.author_id.clone(),
        author_name: post.author_name.clone(),
        author_avatar: post.author_avatar.clone(),
        author_type: post.author_type.clone(),
        text: post.text.clone(),
        media_url: post.media_url.clone(),
        media_type: post.media_type.clone(),
        like_count: post.like_count,
        comment_count: post.comment_count,
        ai_reacted: post.ai_reacted,
        created_at: post.created_at.clone(),
        comments,
    }
}

fn parse_timestamp(value: &str) -> u128 {
    value.parse::<u128>().unwrap_or_default()
}

fn now_token() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_millis().to_string())
        .unwrap_or_else(|_| "0".into())
}
