use std::{
    fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use serde::{Deserialize, Serialize};
use tokio::{spawn, sync::mpsc, time::Duration};
use tracing::{info, warn};

use crate::{
    app_state::{AppState, PersistenceCommand, RuntimeState, SchedulerState},
    runtime_paths,
};

#[derive(Serialize, Deserialize)]
struct PersistedAppState {
    version: u32,
    saved_at: String,
    runtime: RuntimeState,
    scheduler: SchedulerState,
}

pub fn install(state: AppState, mut receiver: mpsc::UnboundedReceiver<PersistenceCommand>) {
    spawn(async move {
        while let Some(command) = receiver.recv().await {
            let mut latest_reason = command.reason;

            tokio::time::sleep(Duration::from_millis(120)).await;

            while let Ok(command) = receiver.try_recv() {
                latest_reason = command.reason;
            }

            if let Err(error) = save_snapshot(&state, &latest_reason) {
                warn!("failed to persist runtime snapshot: {}", error);
            }
        }
    });
}

pub fn load_persisted_state(
    database_path: &Path,
) -> Result<Option<(RuntimeState, SchedulerState)>, String> {
    let snapshot_path = snapshot_path(database_path);

    if !snapshot_path.exists() {
        return Ok(None);
    }

    let content = fs::read_to_string(&snapshot_path)
        .map_err(|error| format!("read {}: {error}", snapshot_path.display()))?;
    let snapshot: PersistedAppState = serde_json::from_str(&content)
        .map_err(|error| format!("parse {}: {error}", snapshot_path.display()))?;

    Ok(Some((snapshot.runtime, snapshot.scheduler)))
}

pub fn snapshot_path(database_path: &Path) -> PathBuf {
    database_path.with_extension("runtime.json")
}

pub fn backup_dir(database_path: &Path) -> PathBuf {
    snapshot_path(database_path)
        .parent()
        .unwrap_or_else(|| Path::new("."))
        .join("backups")
}

pub fn flush_now(state: &AppState, reason: &str) -> Result<PathBuf, String> {
    save_snapshot(state, reason)?;
    Ok(snapshot_path(&state.database_path))
}

pub fn create_backup(state: &AppState) -> Result<PathBuf, String> {
    let snapshot_path = flush_now(state, "backup-create")?;
    let backup_dir = backup_dir(&state.database_path);
    fs::create_dir_all(&backup_dir)
        .map_err(|error| format!("create {}: {error}", backup_dir.display()))?;

    let backup_path = backup_dir.join(format!("runtime-backup-{}.json", now_token()));
    fs::copy(&snapshot_path, &backup_path).map_err(|error| {
        format!(
            "copy {} -> {}: {error}",
            snapshot_path.display(),
            backup_path.display()
        )
    })?;

    Ok(backup_path)
}

pub fn restore_latest_backup(state: &AppState) -> Result<PathBuf, String> {
    let backup_dir = backup_dir(&state.database_path);
    let latest_backup = latest_backup_path(&backup_dir)?;
    let content = fs::read_to_string(&latest_backup)
        .map_err(|error| format!("read {}: {error}", latest_backup.display()))?;
    let snapshot: PersistedAppState = serde_json::from_str(&content)
        .map_err(|error| format!("parse {}: {error}", latest_backup.display()))?;

    {
        let mut runtime = state.runtime.write().expect("runtime lock poisoned");
        *runtime = snapshot.runtime;
    }
    {
        let mut scheduler = state.scheduler.write().expect("scheduler lock poisoned");
        *scheduler = snapshot.scheduler;
    }

    let active_snapshot_path = snapshot_path(&state.database_path);
    if let Some(parent) = active_snapshot_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("create {}: {error}", parent.display()))?;
    }

    fs::copy(&latest_backup, &active_snapshot_path).map_err(|error| {
        format!(
            "copy {} -> {}: {error}",
            latest_backup.display(),
            active_snapshot_path.display()
        )
    })?;

    Ok(latest_backup)
}

fn latest_backup_path(backup_dir: &Path) -> Result<PathBuf, String> {
    let mut entries = fs::read_dir(backup_dir)
        .map_err(|error| format!("read {}: {error}", backup_dir.display()))?
        .filter_map(|entry| entry.ok().map(|item| item.path()))
        .filter(|path| {
            path.extension()
                .is_some_and(|extension| extension == "json")
        })
        .collect::<Vec<_>>();

    entries.sort();
    entries
        .pop()
        .ok_or_else(|| format!("no backup files found in {}", backup_dir.display()))
}

fn save_snapshot(state: &AppState, reason: &str) -> Result<(), String> {
    let snapshot_path = snapshot_path(&state.database_path);
    let temp_path = snapshot_path.with_extension("runtime.json.tmp");

    if let Some(parent) = snapshot_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("create {}: {error}", parent.display()))?;
    }

    let runtime = state.runtime.read().expect("runtime lock poisoned").clone();
    let scheduler = state
        .scheduler
        .read()
        .expect("scheduler lock poisoned")
        .clone();

    let snapshot = PersistedAppState {
        version: 1,
        saved_at: now_token(),
        runtime,
        scheduler,
    };

    let serialized = serde_json::to_vec_pretty(&snapshot)
        .map_err(|error| format!("serialize runtime snapshot: {error}"))?;

    fs::write(&temp_path, serialized)
        .map_err(|error| format!("write {}: {error}", temp_path.display()))?;

    if snapshot_path.exists() {
        fs::remove_file(&snapshot_path)
            .map_err(|error| format!("replace {}: {error}", snapshot_path.display()))?;
    }

    fs::rename(&temp_path, &snapshot_path)
        .map_err(|error| format!("rename {}: {error}", snapshot_path.display()))?;

    info!(
        "persisted runtime snapshot to {} ({})",
        snapshot_path.display(),
        reason
    );
    runtime_paths::append_core_api_log(
        &state.database_path,
        "INFO",
        &format!(
            "persisted runtime snapshot to {} ({})",
            snapshot_path.display(),
            reason
        ),
    );

    Ok(())
}

fn now_token() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_millis().to_string())
        .unwrap_or_else(|_| "0".into())
}
