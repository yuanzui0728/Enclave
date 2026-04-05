use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

pub fn runtime_root(database_path: &Path) -> PathBuf {
    database_path
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_else(|| PathBuf::from("."))
}

pub fn logs_dir(database_path: &Path) -> PathBuf {
    runtime_root(database_path).join("logs")
}

pub fn core_api_log_path(database_path: &Path) -> PathBuf {
    logs_dir(database_path).join("core-api.log")
}

pub fn diagnostics_dir(database_path: &Path) -> PathBuf {
    runtime_root(database_path).join("diagnostics")
}

pub fn evals_dir(database_path: &Path) -> PathBuf {
    runtime_root(database_path).join("evals")
}

pub fn eval_runs_dir(database_path: &Path) -> PathBuf {
    evals_dir(database_path).join("runs")
}

pub fn eval_traces_dir(database_path: &Path) -> PathBuf {
    evals_dir(database_path).join("traces")
}

pub fn append_core_api_log(database_path: &Path, level: &str, message: &str) {
    let log_path = core_api_log_path(database_path);

    if let Some(parent) = log_path.parent() {
        let _ = fs::create_dir_all(parent);
    }

    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(&log_path) {
        let _ = writeln!(file, "{} [{}] {}", now_token(), level, message);
    }
}

fn now_token() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_millis().to_string())
        .unwrap_or_else(|_| "0".into())
}
