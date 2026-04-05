use std::time::{SystemTime, UNIX_EPOCH};

use axum::{
    extract::{Path, Query, State},
    http::HeaderMap,
    routing::{get, post},
    Json, Router,
};
use serde_json::json;

use crate::{
    app_state::{AppState, RuntimeState},
    auth_support::require_session_user,
    error::{ApiError, ApiResult},
    generation,
    models::{
        CreateMomentCommentPayload, CreateUserMomentPayload, MomentCommentRecord,
        MomentInteractionRecord, MomentLikeRecord, MomentPostRecord, MomentRecord, MomentsQuery,
        ToggleMomentLikePayload, ToggleMomentLikeResult,
    },
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(get_feed))
        .route("/user-post", post(create_user_moment))
        .route("/generate-all", post(generate_all_moments))
        .route("/generate/:characterId", post(generate_for_character))
        .route("/:id", get(get_post))
        .route("/:id/comment", post(add_comment))
        .route("/:id/like", post(toggle_like))
}

async fn get_feed(
    State(state): State<AppState>,
    Query(query): Query<MomentsQuery>,
) -> Json<Vec<MomentRecord>> {
    let runtime = state.runtime.read().expect("runtime lock poisoned");
    let mut posts = runtime
        .moment_posts
        .values()
        .filter(|post| {
            query
                .author_id
                .as_ref()
                .map(|author_id| &post.author_id == author_id)
                .unwrap_or(true)
        })
        .cloned()
        .collect::<Vec<_>>();

    posts.sort_by(|left, right| {
        parse_timestamp(&right.posted_at).cmp(&parse_timestamp(&left.posted_at))
    });

    Json(
        posts
            .iter()
            .map(|post| enrich_moment(post, &runtime))
            .collect::<Vec<_>>(),
    )
}

async fn create_user_moment(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<CreateUserMomentPayload>,
) -> ApiResult<Json<MomentRecord>> {
    require_session_user(&headers, &state, &payload.user_id)?;
    let mut runtime = state.runtime.write().expect("runtime lock poisoned");
    let post = MomentPostRecord {
        id: format!("moment_{}", now_token()),
        author_id: payload.user_id,
        author_name: payload.author_name,
        author_avatar: payload.author_avatar,
        author_type: "user".into(),
        text: payload.text,
        location: None,
        posted_at: now_token(),
        like_count: 0,
        comment_count: 0,
    };

    runtime.moment_posts.insert(post.id.clone(), post.clone());
    runtime.moment_comments.entry(post.id.clone()).or_default();
    runtime.moment_likes.entry(post.id.clone()).or_default();
    let response = enrich_moment(&post, &runtime);
    drop(runtime);
    state.request_persist("moments-create-user-post");

    Ok(Json(response))
}

async fn get_post(
    Path(id): Path<String>,
    State(state): State<AppState>,
) -> Json<Option<MomentRecord>> {
    let runtime = state.runtime.read().expect("runtime lock poisoned");
    Json(
        runtime
            .moment_posts
            .get(&id)
            .map(|post| enrich_moment(post, &runtime)),
    )
}

async fn generate_for_character(
    Path(character_id): Path<String>,
    State(state): State<AppState>,
) -> Json<Option<MomentRecord>> {
    let Some(character) = ({
        let runtime = state.runtime.read().expect("runtime lock poisoned");
        runtime.characters.get(&character_id).cloned()
    }) else {
        return Json(None);
    };

    let generated_text = generation::generate_moment_text(&state, &character).await;
    let post = build_generated_moment_post_with_text(&character, generated_text);
    let mut runtime = state.runtime.write().expect("runtime lock poisoned");
    runtime.moment_posts.insert(post.id.clone(), post.clone());
    runtime.moment_comments.entry(post.id.clone()).or_default();
    runtime.moment_likes.entry(post.id.clone()).or_default();
    let response = enrich_moment(&post, &runtime);
    drop(runtime);
    state.request_persist("moments-generate-single");
    state.append_behavior_log(
        character.id.clone(),
        "moment_post",
        Some(post.id.clone()),
        Some("manual-moment-generation".into()),
        Some(json!({
            "characterName": character.name,
            "location": post.location,
        })),
    );

    Json(Some(response))
}

async fn generate_all_moments(State(state): State<AppState>) -> Json<Vec<MomentRecord>> {
    let characters = {
        let runtime = state.runtime.read().expect("runtime lock poisoned");
        runtime.characters.values().cloned().collect::<Vec<_>>()
    };
    let mut posts = Vec::with_capacity(characters.len());

    for character in characters {
        let generated_text = generation::generate_moment_text(&state, &character).await;
        posts.push(build_generated_moment_post_with_text(&character, generated_text));
    }

    let mut runtime = state.runtime.write().expect("runtime lock poisoned");
    let mut generated = Vec::with_capacity(posts.len());

    for post in posts {
        runtime.moment_posts.insert(post.id.clone(), post.clone());
        runtime.moment_comments.entry(post.id.clone()).or_default();
        runtime.moment_likes.entry(post.id.clone()).or_default();
        generated.push(enrich_moment(&post, &runtime));
    }
    drop(runtime);
    state.request_persist("moments-generate-all");

    for post in &generated {
        if post.author_type == "character" {
            state.append_behavior_log(
                post.author_id.clone(),
                "moment_post",
                Some(post.id.clone()),
                Some("bulk-moment-generation".into()),
                Some(json!({
                    "characterName": post.author_name,
                    "location": post.location,
                })),
            );
        }
    }

    Json(generated)
}

async fn add_comment(
    Path(id): Path<String>,
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<CreateMomentCommentPayload>,
) -> ApiResult<Json<MomentCommentRecord>> {
    require_session_user(&headers, &state, &payload.author_id)?;
    let mut runtime = state.runtime.write().expect("runtime lock poisoned");
    if !runtime.moment_posts.contains_key(&id) {
        return Err(ApiError::not_found(format!("Moment {} not found", id)));
    }

    let comment = MomentCommentRecord {
        id: format!("moment_comment_{}", now_token()),
        post_id: id.clone(),
        author_id: payload.author_id,
        author_name: payload.author_name,
        author_avatar: payload.author_avatar,
        author_type: "user".into(),
        text: payload.text,
        created_at: now_token(),
    };

    let comment_count = {
        let comments = runtime.moment_comments.entry(id.clone()).or_default();
        comments.push(comment.clone());
        comments.len()
    };

    if let Some(post) = runtime.moment_posts.get_mut(&id) {
        post.comment_count = comment_count;
    }
    drop(runtime);
    state.request_persist("moments-add-comment");

    Ok(Json(comment))
}

async fn toggle_like(
    Path(id): Path<String>,
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<ToggleMomentLikePayload>,
) -> ApiResult<Json<ToggleMomentLikeResult>> {
    require_session_user(&headers, &state, &payload.author_id)?;
    let mut runtime = state.runtime.write().expect("runtime lock poisoned");
    if !runtime.moment_posts.contains_key(&id) {
        return Err(ApiError::not_found(format!("Moment {} not found", id)));
    }

    let (liked, like_count) = {
        let likes = runtime.moment_likes.entry(id.clone()).or_default();

        if let Some(existing_index) = likes
            .iter()
            .position(|like| like.author_id == payload.author_id)
        {
            likes.remove(existing_index);
            (false, likes.len())
        } else {
            likes.push(MomentLikeRecord {
                id: format!("moment_like_{}", now_token()),
                post_id: id.clone(),
                author_id: payload.author_id,
                author_name: payload.author_name,
                author_avatar: payload.author_avatar,
                author_type: "user".into(),
                created_at: now_token(),
            });
            (true, likes.len())
        }
    };

    if let Some(post) = runtime.moment_posts.get_mut(&id) {
        post.like_count = like_count;
    }
    drop(runtime);
    state.request_persist("moments-toggle-like");

    Ok(Json(ToggleMomentLikeResult { liked }))
}

fn enrich_moment(post: &MomentPostRecord, runtime: &RuntimeState) -> MomentRecord {
    let mut likes = runtime
        .moment_likes
        .get(&post.id)
        .cloned()
        .unwrap_or_default();
    likes.sort_by(|left, right| {
        parse_timestamp(&left.created_at).cmp(&parse_timestamp(&right.created_at))
    });

    let mut comments = runtime
        .moment_comments
        .get(&post.id)
        .cloned()
        .unwrap_or_default();
    comments.sort_by(|left, right| {
        parse_timestamp(&left.created_at).cmp(&parse_timestamp(&right.created_at))
    });

    let mut interactions = likes
        .iter()
        .map(|like| MomentInteractionRecord {
            character_id: like.author_id.clone(),
            character_name: like.author_name.clone(),
            r#type: "like".into(),
            comment_text: None,
            created_at: like.created_at.clone(),
        })
        .collect::<Vec<_>>();

    interactions.extend(comments.iter().map(|comment| MomentInteractionRecord {
        character_id: comment.author_id.clone(),
        character_name: comment.author_name.clone(),
        r#type: "comment".into(),
        comment_text: Some(comment.text.clone()),
        created_at: comment.created_at.clone(),
    }));

    MomentRecord {
        id: post.id.clone(),
        author_id: post.author_id.clone(),
        author_name: post.author_name.clone(),
        author_avatar: post.author_avatar.clone(),
        author_type: post.author_type.clone(),
        text: post.text.clone(),
        location: post.location.clone(),
        posted_at: post.posted_at.clone(),
        like_count: post.like_count,
        comment_count: post.comment_count,
        likes,
        comments,
        interactions,
    }
}

fn build_generated_moment_post(character: &crate::models::CharacterRecord) -> MomentPostRecord {
    let posted_at = now_token();
    let scene = character
        .trigger_scenes
        .as_ref()
        .and_then(|items| items.first())
        .cloned();

    MomentPostRecord {
        id: format!("moment_generated_{}_{}", character.id, posted_at),
        author_id: character.id.clone(),
        author_name: character.name.clone(),
        author_avatar: character.avatar.clone(),
        author_type: "character".into(),
        text: format!(
            "{} 刚结束一段 {} 的状态切换，顺手记下此刻最想分享的一件小事。",
            character.name,
            character.current_activity.as_deref().unwrap_or("日常")
        ),
        location: scene,
        posted_at,
        like_count: 0,
        comment_count: 0,
    }
}

fn build_generated_moment_post_with_text(
    character: &crate::models::CharacterRecord,
    text: String,
) -> MomentPostRecord {
    let mut post = build_generated_moment_post(character);
    post.text = text;
    post
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
