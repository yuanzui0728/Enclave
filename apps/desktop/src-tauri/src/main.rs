#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{
    fs::File,
    io::Write,
    path::PathBuf,
    sync::atomic::{AtomicBool, Ordering},
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use serde::{Deserialize, Serialize};
use tauri::{
    menu::{MenuBuilder, PredefinedMenuItem, Submenu, SubmenuBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, Window, WindowEvent,
};
use tauri_plugin_dialog::DialogExt;

const MAIN_WINDOW_LABEL: &str = "main";
const TRAY_ICON_ID: &str = "main-tray";
const TRAY_MENU_SHOW_ID: &str = "tray-show";
const TRAY_MENU_QUIT_ID: &str = "tray-quit";
const DEFAULT_DESKTOP_LOCALE: &str = "zh-CN";

#[derive(Clone, Copy)]
enum DesktopTextKey {
    AppTitle,
    TrayShow,
    TrayQuit,
    SaveAttachment,
    SaveCancelled,
    LocaleSaved,
    RemoteUnconfigured,
    RemoteResponded,
    RemoteUnreachable,
    RemoteOnlySummary,
    RemoteCanReach,
    RemoteCannotReach,
    RemoteDidNotRespond,
    RemoteStartNoop,
    RemoteStopNoop,
    RemoteRestartNoop,
    MenuEdit,
    MenuWindow,
    CloseDialogTitle,
    CloseDialogBody,
    CloseDialogHide,
    CloseDialogExit,
    UnsupportedLocaleError,
    MissingFileUrlError,
}

struct DesktopWindowState {
    allow_exit: AtomicBool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopRuntimeContext {
    app_data_dir: String,
    runtime_data_dir: String,
    database_path: String,
    core_api_port: u16,
    core_api_base_url: String,
    app_url: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopCoreApiStatus {
    configured_port: u16,
    base_url: String,
    running: bool,
    reachable: bool,
    pid: Option<u32>,
    database_path: String,
    message: String,
    command: String,
    command_source: String,
    managed_by_desktop_shell: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopOperationResult {
    success: bool,
    message: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopLocaleResult {
    locale: String,
    system_locale: Option<String>,
    source: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DesktopSetLocaleInput {
    locale: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DesktopSaveRemoteFileInput {
    url: String,
    file_name: String,
    dialog_title: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DesktopSaveTextFileInput {
    contents: String,
    file_name: String,
    dialog_title: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DesktopSaveBinaryFileInput {
    bytes: Vec<u8>,
    file_name: String,
    dialog_title: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopTextStoreReadResult {
    exists: bool,
    contents: Option<String>,
    message: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopFileSaveResult {
    success: bool,
    cancelled: bool,
    saved_path: Option<String>,
    message: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopRuntimeDiagnostics {
    platform: String,
    core_api_command: String,
    core_api_command_source: String,
    core_api_command_resolved: bool,
    core_api_reachable: bool,
    diagnostics_status: String,
    bundled_core_api_path: String,
    bundled_core_api_exists: bool,
    core_api_port_occupied: bool,
    managed_by_desktop_shell: bool,
    managed_child_pid: Option<u32>,
    desktop_log_path: String,
    last_core_api_error: Option<String>,
    linux_missing_packages: Vec<String>,
    summary: String,
}

struct RuntimePaths {
    app_data_dir: PathBuf,
    runtime_data_dir: PathBuf,
    database_path: PathBuf,
    logs_dir: PathBuf,
}

struct ResolvedDesktopLocale {
    locale: &'static str,
    system_locale: Option<String>,
    source: &'static str,
}

fn resolve_supported_locale(value: &str) -> Option<&'static str> {
    let normalized = value
        .trim()
        .replace('_', "-")
        .to_lowercase()
        .split(['.', '@'])
        .next()
        .unwrap_or_default()
        .to_string();

    match normalized.as_str() {
        "zh" | "zh-cn" | "zh-hans" | "zh-hans-cn" => Some("zh-CN"),
        "en" | "en-us" => Some("en-US"),
        "ja" | "ja-jp" => Some("ja-JP"),
        "ko" | "ko-kr" => Some("ko-KR"),
        value if value.starts_with("zh-") => Some("zh-CN"),
        value if value.starts_with("en-") => Some("en-US"),
        value if value.starts_with("ja-") => Some("ja-JP"),
        value if value.starts_with("ko-") => Some("ko-KR"),
        _ => None,
    }
}

fn resolve_desktop_locale(app: &tauri::AppHandle) -> ResolvedDesktopLocale {
    let system_locale = sys_locale::get_locale();

    if let Some(locale) = read_desktop_locale(app) {
        return ResolvedDesktopLocale {
            locale,
            system_locale,
            source: "storage",
        };
    }

    if let Some(locale) = system_locale.as_deref().and_then(resolve_supported_locale) {
        return ResolvedDesktopLocale {
            locale,
            system_locale,
            source: "system",
        };
    }

    ResolvedDesktopLocale {
        locale: DEFAULT_DESKTOP_LOCALE,
        system_locale,
        source: "default",
    }
}

fn read_desktop_locale(app: &tauri::AppHandle) -> Option<&'static str> {
    let target_file_path = resolve_runtime_paths(app)
        .ok()?
        .runtime_data_dir
        .join("desktop-locale.json");
    let contents = std::fs::read_to_string(target_file_path).ok()?;
    let parsed = serde_json::from_str::<serde_json::Value>(&contents).ok()?;
    parsed
        .get("locale")
        .and_then(serde_json::Value::as_str)
        .and_then(resolve_supported_locale)
}

fn write_desktop_locale(app: &tauri::AppHandle, locale: &str) -> Result<(), String> {
    let target_file_path = resolve_runtime_paths(app)?
        .runtime_data_dir
        .join("desktop-locale.json");
    ensure_parent_dir_exists(&target_file_path)?;
    let contents = serde_json::json!({ "locale": locale }).to_string();
    std::fs::write(target_file_path, contents).map_err(|error| error.to_string())
}

#[cfg(target_os = "windows")]
fn read_close_choice(app: &tauri::AppHandle) -> Option<&'static str> {
    let target_file_path = resolve_runtime_paths(app)
        .ok()?
        .runtime_data_dir
        .join("desktop-close-choice.json");
    let contents = std::fs::read_to_string(target_file_path).ok()?;
    let parsed = serde_json::from_str::<serde_json::Value>(&contents).ok()?;
    let value = parsed.get("choice").and_then(serde_json::Value::as_str)?;
    match value {
        "hide" => Some("hide"),
        "exit" => Some("exit"),
        _ => None,
    }
}

#[cfg(target_os = "windows")]
fn write_close_choice(app: &tauri::AppHandle, choice: &str) -> Result<(), String> {
    let target_file_path = resolve_runtime_paths(app)?
        .runtime_data_dir
        .join("desktop-close-choice.json");
    ensure_parent_dir_exists(&target_file_path)?;
    let contents = serde_json::json!({ "choice": choice }).to_string();
    std::fs::write(target_file_path, contents).map_err(|error| error.to_string())
}

fn apply_desktop_locale(app: &tauri::AppHandle, locale: &str) -> Result<(), String> {
    let locale = resolve_supported_locale(locale).unwrap_or(DEFAULT_DESKTOP_LOCALE);
    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        window
            .set_title(desktop_text(locale, DesktopTextKey::AppTitle))
            .map_err(|error| error.to_string())?;
    }

    if let Some(tray) = app.tray_by_id(TRAY_ICON_ID) {
        let tray_menu = MenuBuilder::new(app)
            .text(
                TRAY_MENU_SHOW_ID,
                desktop_text(locale, DesktopTextKey::TrayShow),
            )
            .separator()
            .text(
                TRAY_MENU_QUIT_ID,
                desktop_text(locale, DesktopTextKey::TrayQuit),
            )
            .build()
            .map_err(|error| error.to_string())?;
        tray.set_menu(Some(tray_menu))
            .map_err(|error| error.to_string())?;
        tray.set_tooltip(Some(desktop_text(locale, DesktopTextKey::AppTitle)))
            .map_err(|error| error.to_string())?;
    }

    Ok(())
}

fn desktop_text(locale: &str, key: DesktopTextKey) -> &'static str {
    let locale = resolve_supported_locale(locale).unwrap_or(DEFAULT_DESKTOP_LOCALE);

    match (locale, key) {
        ("en-US", DesktopTextKey::AppTitle) => "Yinjie",
        ("ja-JP", DesktopTextKey::AppTitle) => "Yinjie",
        ("ko-KR", DesktopTextKey::AppTitle) => "Yinjie",
        (_, DesktopTextKey::AppTitle) => "隐界",

        ("en-US", DesktopTextKey::TrayShow) => "Open Yinjie",
        ("ja-JP", DesktopTextKey::TrayShow) => "Yinjieを開く",
        ("ko-KR", DesktopTextKey::TrayShow) => "Yinjie 열기",
        (_, DesktopTextKey::TrayShow) => "打开隐界",

        ("en-US", DesktopTextKey::TrayQuit) => "Quit",
        ("ja-JP", DesktopTextKey::TrayQuit) => "終了",
        ("ko-KR", DesktopTextKey::TrayQuit) => "종료",
        (_, DesktopTextKey::TrayQuit) => "退出",

        ("en-US", DesktopTextKey::SaveAttachment) => "Save Attachment",
        ("ja-JP", DesktopTextKey::SaveAttachment) => "添付ファイルを保存",
        ("ko-KR", DesktopTextKey::SaveAttachment) => "첨부 파일 저장",
        (_, DesktopTextKey::SaveAttachment) => "保存附件",

        ("en-US", DesktopTextKey::SaveCancelled) => "Save cancelled.",
        ("ja-JP", DesktopTextKey::SaveCancelled) => "保存をキャンセルしました。",
        ("ko-KR", DesktopTextKey::SaveCancelled) => "저장을 취소했습니다.",
        (_, DesktopTextKey::SaveCancelled) => "已取消保存。",

        ("en-US", DesktopTextKey::LocaleSaved) => "Desktop language updated.",
        ("ja-JP", DesktopTextKey::LocaleSaved) => "デスクトップの言語を更新しました。",
        ("ko-KR", DesktopTextKey::LocaleSaved) => "데스크톱 언어가 업데이트되었습니다.",
        (_, DesktopTextKey::LocaleSaved) => "桌面语言已更新。",

        ("en-US", DesktopTextKey::RemoteUnconfigured) => {
            "Desktop shell is remote-only. Configure the server address inside the app."
        }
        ("ja-JP", DesktopTextKey::RemoteUnconfigured) => {
            "デスクトップシェルはリモート専用です。アプリ内でサーバーアドレスを設定してください。"
        }
        ("ko-KR", DesktopTextKey::RemoteUnconfigured) => {
            "데스크톱 셸은 원격 전용입니다. 앱 안에서 서버 주소를 설정하세요."
        }
        (_, DesktopTextKey::RemoteUnconfigured) => {
            "桌面壳仅连接远程世界，请在应用内配置服务器地址。"
        }

        ("en-US", DesktopTextKey::RemoteOnlySummary) => {
            "Desktop shell no longer starts a local Core API. Use the in-app remote setup flow."
        }
        ("ja-JP", DesktopTextKey::RemoteOnlySummary) => {
            "デスクトップシェルはローカル Core API を起動しません。アプリ内のリモート設定フローを使用してください。"
        }
        ("ko-KR", DesktopTextKey::RemoteOnlySummary) => {
            "데스크톱 셸은 더 이상 로컬 Core API를 시작하지 않습니다. 앱 안의 원격 설정 흐름을 사용하세요."
        }
        (_, DesktopTextKey::RemoteOnlySummary) => {
            "桌面壳不再启动本地 Core API，请使用应用内远程设置流程。"
        }

        ("en-US", DesktopTextKey::RemoteStartNoop) => {
            "Desktop shell no longer starts a local Core API. Configure a remote server in Setup."
        }
        ("ja-JP", DesktopTextKey::RemoteStartNoop) => {
            "デスクトップシェルはローカル Core API を起動しません。Setup でリモートサーバーを設定してください。"
        }
        ("ko-KR", DesktopTextKey::RemoteStartNoop) => {
            "데스크톱 셸은 더 이상 로컬 Core API를 시작하지 않습니다. Setup에서 원격 서버를 설정하세요."
        }
        (_, DesktopTextKey::RemoteStartNoop) => {
            "桌面壳不再启动本地 Core API，请在 Setup 中配置远程服务器。"
        }

        ("en-US", DesktopTextKey::RemoteStopNoop) => {
            "Desktop shell no longer manages a local Core API process."
        }
        ("ja-JP", DesktopTextKey::RemoteStopNoop) => {
            "デスクトップシェルはローカル Core API プロセスを管理しません。"
        }
        ("ko-KR", DesktopTextKey::RemoteStopNoop) => {
            "데스크톱 셸은 더 이상 로컬 Core API 프로세스를 관리하지 않습니다."
        }
        (_, DesktopTextKey::RemoteStopNoop) => {
            "桌面壳不再管理本地 Core API 进程。"
        }

        ("en-US", DesktopTextKey::RemoteRestartNoop) => {
            "Desktop shell no longer restarts a local Core API. Re-check the remote server instead."
        }
        ("ja-JP", DesktopTextKey::RemoteRestartNoop) => {
            "デスクトップシェルはローカル Core API を再起動しません。代わりにリモートサーバーを再確認してください。"
        }
        ("ko-KR", DesktopTextKey::RemoteRestartNoop) => {
            "데스크톱 셸은 더 이상 로컬 Core API를 재시작하지 않습니다. 원격 서버를 다시 확인하세요."
        }
        (_, DesktopTextKey::RemoteRestartNoop) => {
            "桌面壳不再重启本地 Core API，请改为重新检查远程服务器。"
        }

        ("en-US", DesktopTextKey::CloseDialogTitle) => "Close Yinjie",
        ("ja-JP", DesktopTextKey::CloseDialogTitle) => "Yinjie を閉じる",
        ("ko-KR", DesktopTextKey::CloseDialogTitle) => "Yinjie 닫기",
        (_, DesktopTextKey::CloseDialogTitle) => "关闭隐界",

        ("en-US", DesktopTextKey::CloseDialogBody) => {
            "When you click the X button…\n\n• Hide to system tray — keep running in the background.\n• Quit — end the process completely.\n\nYour choice will be remembered. Right-click the tray icon → Quit at any time to force exit."
        }
        ("ja-JP", DesktopTextKey::CloseDialogBody) => {
            "閉じるボタン (X) を押した時の動作を選択してください…\n\n• トレイに隠す — バックグラウンドで実行を継続。\n• 完全に終了 — プロセスを完全に終了。\n\n選択は記憶されます。トレイアイコンを右クリック → 終了でいつでも強制終了できます。"
        }
        ("ko-KR", DesktopTextKey::CloseDialogBody) => {
            "닫기 (X) 버튼을 누를 때의 동작을 선택하세요…\n\n• 트레이에 숨김 — 백그라운드에서 계속 실행합니다.\n• 완전히 종료 — 프로세스를 완전히 종료합니다.\n\n선택은 기억됩니다. 트레이 아이콘 오른쪽 클릭 → 종료로 언제든 강제 종료할 수 있습니다."
        }
        (_, DesktopTextKey::CloseDialogBody) => {
            "希望点击 X 时…\n\n• 隐藏到任务栏托盘 —— 继续在后台运行收消息。\n• 完全退出 —— 结束所有进程。\n\n本次选择会被记住。任意时候右键托盘图标 → 退出，可强制结束后台进程。"
        }

        ("en-US", DesktopTextKey::CloseDialogHide) => "Hide to Tray",
        ("ja-JP", DesktopTextKey::CloseDialogHide) => "トレイに隠す",
        ("ko-KR", DesktopTextKey::CloseDialogHide) => "트레이에 숨김",
        (_, DesktopTextKey::CloseDialogHide) => "隐藏到托盘",

        ("en-US", DesktopTextKey::CloseDialogExit) => "Quit",
        ("ja-JP", DesktopTextKey::CloseDialogExit) => "完全に終了",
        ("ko-KR", DesktopTextKey::CloseDialogExit) => "완전히 종료",
        (_, DesktopTextKey::CloseDialogExit) => "完全退出",

        ("en-US", DesktopTextKey::MenuEdit) => "Edit",
        ("ja-JP", DesktopTextKey::MenuEdit) => "編集",
        ("ko-KR", DesktopTextKey::MenuEdit) => "편집",
        (_, DesktopTextKey::MenuEdit) => "编辑",

        ("en-US", DesktopTextKey::MenuWindow) => "Window",
        ("ja-JP", DesktopTextKey::MenuWindow) => "ウインドウ",
        ("ko-KR", DesktopTextKey::MenuWindow) => "윈도우",
        (_, DesktopTextKey::MenuWindow) => "窗口",

        ("en-US", DesktopTextKey::UnsupportedLocaleError) => "Unsupported desktop locale.",
        ("ja-JP", DesktopTextKey::UnsupportedLocaleError) => "サポートされていないデスクトップ言語です。",
        ("ko-KR", DesktopTextKey::UnsupportedLocaleError) => "지원되지 않는 데스크톱 언어입니다.",
        (_, DesktopTextKey::UnsupportedLocaleError) => "暂不支持该桌面语言。",

        ("en-US", DesktopTextKey::MissingFileUrlError) => "Missing file URL.",
        ("ja-JP", DesktopTextKey::MissingFileUrlError) => "ファイル URL が指定されていません。",
        ("ko-KR", DesktopTextKey::MissingFileUrlError) => "파일 URL이 누락되었습니다.",
        (_, DesktopTextKey::MissingFileUrlError) => "缺少文件下载地址。",

        (_, DesktopTextKey::RemoteResponded)
        | (_, DesktopTextKey::RemoteUnreachable)
        | (_, DesktopTextKey::RemoteCanReach)
        | (_, DesktopTextKey::RemoteCannotReach)
        | (_, DesktopTextKey::RemoteDidNotRespond) => "",
    }
}

fn desktop_format_url(locale: &str, key: DesktopTextKey, url: &str) -> String {
    let locale = resolve_supported_locale(locale).unwrap_or(DEFAULT_DESKTOP_LOCALE);

    match (locale, key) {
        ("en-US", DesktopTextKey::RemoteResponded) => {
            format!("Remote Core API responded at {url}")
        }
        ("ja-JP", DesktopTextKey::RemoteResponded) => {
            format!("リモート Core API が {url} で応答しました")
        }
        ("ko-KR", DesktopTextKey::RemoteResponded) => {
            format!("원격 Core API가 {url}에서 응답했습니다")
        }
        (_, DesktopTextKey::RemoteResponded) => {
            format!("远程 Core API 已在 {url} 响应")
        }

        ("en-US", DesktopTextKey::RemoteUnreachable) => {
            format!("Remote Core API is configured but not reachable at {url}")
        }
        ("ja-JP", DesktopTextKey::RemoteUnreachable) => {
            format!("リモート Core API は設定済みですが {url} に接続できません")
        }
        ("ko-KR", DesktopTextKey::RemoteUnreachable) => {
            format!("원격 Core API가 설정되어 있지만 {url}에 연결할 수 없습니다")
        }
        (_, DesktopTextKey::RemoteUnreachable) => {
            format!("远程 Core API 已配置，但无法访问 {url}")
        }

        ("en-US", DesktopTextKey::RemoteCanReach) => {
            format!("Desktop shell is configured for remote mode and can reach {url}")
        }
        ("ja-JP", DesktopTextKey::RemoteCanReach) => {
            format!("デスクトップシェルはリモートモードで設定済みで、{url} に接続できます")
        }
        ("ko-KR", DesktopTextKey::RemoteCanReach) => {
            format!("데스크톱 셸이 원격 모드로 설정되어 있으며 {url}에 연결할 수 있습니다")
        }
        (_, DesktopTextKey::RemoteCanReach) => {
            format!("桌面壳已配置为远程模式，并可访问 {url}")
        }

        ("en-US", DesktopTextKey::RemoteCannotReach) => {
            format!("Desktop shell is configured for remote mode but cannot reach {url}")
        }
        ("ja-JP", DesktopTextKey::RemoteCannotReach) => {
            format!("デスクトップシェルはリモートモードで設定済みですが、{url} に接続できません")
        }
        ("ko-KR", DesktopTextKey::RemoteCannotReach) => {
            format!("데스크톱 셸이 원격 모드로 설정되어 있지만 {url}에 연결할 수 없습니다")
        }
        (_, DesktopTextKey::RemoteCannotReach) => {
            format!("桌面壳已配置为远程模式，但无法访问 {url}")
        }

        ("en-US", DesktopTextKey::RemoteDidNotRespond) => {
            format!("Remote Core API did not respond at {url}")
        }
        ("ja-JP", DesktopTextKey::RemoteDidNotRespond) => {
            format!("リモート Core API は {url} で応答しませんでした")
        }
        ("ko-KR", DesktopTextKey::RemoteDidNotRespond) => {
            format!("원격 Core API가 {url}에서 응답하지 않았습니다")
        }
        (_, DesktopTextKey::RemoteDidNotRespond) => {
            format!("远程 Core API 未在 {url} 响应")
        }

        _ => desktop_text(locale, key).to_string(),
    }
}

fn desktop_saved_file_message(locale: &str, target_file_path: &PathBuf) -> String {
    let path = target_file_path.display();
    let locale = resolve_supported_locale(locale).unwrap_or(DEFAULT_DESKTOP_LOCALE);

    match locale {
        "en-US" => format!("Saved to {path}"),
        "ja-JP" => format!("{path} に保存しました。"),
        "ko-KR" => format!("{path}에 저장했습니다."),
        _ => format!("已保存到 {path}"),
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(DesktopWindowState {
            allow_exit: AtomicBool::new(false),
        })
        .on_window_event(handle_window_event)
        .setup(|app| {
            let desktop_locale = resolve_desktop_locale(&app.handle());
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_title(desktop_text(
                    desktop_locale.locale,
                    DesktopTextKey::AppTitle,
                ));
            }

            setup_app_menu(app, desktop_locale.locale)?;
            setup_system_tray(app, desktop_locale.locale)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            desktop_runtime_context,
            desktop_core_api_status,
            desktop_runtime_diagnostics,
            desktop_window_close,
            desktop_window_drag,
            desktop_window_is_maximized,
            desktop_window_minimize,
            desktop_save_remote_file,
            desktop_save_text_file,
            desktop_save_binary_file,
            desktop_read_feedback_store,
            desktop_write_feedback_store,
            desktop_get_locale,
            desktop_set_locale,
            desktop_read_chat_image_viewer_sessions_store,
            desktop_write_chat_image_viewer_sessions_store,
            desktop_read_chat_message_actions_store,
            desktop_write_chat_message_actions_store,
            desktop_read_detailed_timestamp_mode_store,
            desktop_write_detailed_timestamp_mode_store,
            desktop_read_favorites_store,
            desktop_write_favorites_store,
            desktop_read_game_center_store,
            desktop_write_game_center_store,
            desktop_read_group_invite_store,
            desktop_write_group_invite_store,
            desktop_read_live_companion_store,
            desktop_write_live_companion_store,
            desktop_read_lock_store,
            desktop_write_lock_store,
            desktop_read_mini_programs_store,
            desktop_write_mini_programs_store,
            desktop_read_mobile_handoff_store,
            desktop_write_mobile_handoff_store,
            desktop_read_notes_store,
            desktop_write_notes_store,
            desktop_read_recent_stickers_store,
            desktop_write_recent_stickers_store,
            desktop_read_runtime_config_store,
            desktop_write_runtime_config_store,
            desktop_read_search_history_store,
            desktop_write_search_history_store,
            desktop_window_toggle_maximize,
            probe_core_api_health,
            start_core_api,
            stop_core_api,
            restart_core_api
        ])
        .run(tauri::generate_context!())
        .expect("error while running yinjie desktop");
}

fn setup_app_menu(app: &mut tauri::App, locale: &str) -> Result<(), Box<dyn std::error::Error>> {
    use tauri::menu::AboutMetadata;

    let app_title = desktop_text(locale, DesktopTextKey::AppTitle);

    let app_submenu: Submenu<tauri::Wry> = SubmenuBuilder::new(app, app_title)
        .item(&PredefinedMenuItem::about(
            app,
            None,
            Some(AboutMetadata::default()),
        )?)
        .separator()
        .item(&PredefinedMenuItem::services(app, None)?)
        .separator()
        .item(&PredefinedMenuItem::hide(app, None)?)
        .item(&PredefinedMenuItem::hide_others(app, None)?)
        .item(&PredefinedMenuItem::show_all(app, None)?)
        .separator()
        .item(&PredefinedMenuItem::quit(app, None)?)
        .build()?;

    let edit_submenu: Submenu<tauri::Wry> =
        SubmenuBuilder::new(app, desktop_text(locale, DesktopTextKey::MenuEdit))
            .item(&PredefinedMenuItem::undo(app, None)?)
            .item(&PredefinedMenuItem::redo(app, None)?)
            .separator()
            .item(&PredefinedMenuItem::cut(app, None)?)
            .item(&PredefinedMenuItem::copy(app, None)?)
            .item(&PredefinedMenuItem::paste(app, None)?)
            .item(&PredefinedMenuItem::select_all(app, None)?)
            .build()?;

    let window_submenu: Submenu<tauri::Wry> =
        SubmenuBuilder::new(app, desktop_text(locale, DesktopTextKey::MenuWindow))
            .item(&PredefinedMenuItem::minimize(app, None)?)
            .item(&PredefinedMenuItem::maximize(app, None)?)
            .item(&PredefinedMenuItem::fullscreen(app, None)?)
            .separator()
            .item(&PredefinedMenuItem::close_window(app, None)?)
            .build()?;

    let menu = MenuBuilder::new(app)
        .items(&[&app_submenu, &edit_submenu, &window_submenu])
        .build()?;

    app.set_menu(menu)?;
    Ok(())
}

fn setup_system_tray(app: &mut tauri::App, locale: &str) -> Result<(), Box<dyn std::error::Error>> {
    let tray_menu = MenuBuilder::new(app)
        .text(
            TRAY_MENU_SHOW_ID,
            desktop_text(locale, DesktopTextKey::TrayShow),
        )
        .separator()
        .text(
            TRAY_MENU_QUIT_ID,
            desktop_text(locale, DesktopTextKey::TrayQuit),
        )
        .build()?;
    let mut tray_builder = TrayIconBuilder::with_id(TRAY_ICON_ID)
        .menu(&tray_menu)
        .show_menu_on_left_click(false)
        .tooltip(desktop_text(locale, DesktopTextKey::AppTitle));

    if let Some(icon) = app.default_window_icon().cloned() {
        tray_builder = tray_builder.icon(icon);
    }

    tray_builder
        .on_menu_event(|app, event| match event.id.as_ref() {
            TRAY_MENU_SHOW_ID => {
                let _ = show_main_window(app);
            }
            TRAY_MENU_QUIT_ID => {
                if let Some(state) = app.try_state::<DesktopWindowState>() {
                    state.allow_exit.store(true, Ordering::SeqCst);
                }
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| match event {
            TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            }
            | TrayIconEvent::DoubleClick {
                button: MouseButton::Left,
                ..
            } => {
                let _ = show_main_window(&tray.app_handle());
            }
            _ => {}
        })
        .build(app)?;

    Ok(())
}

fn handle_window_event(window: &Window, event: &WindowEvent) {
    if window.label() != MAIN_WINDOW_LABEL {
        return;
    }

    if let WindowEvent::CloseRequested { api, .. } = event {
        let state = window.state::<DesktopWindowState>();
        if state.allow_exit.load(Ordering::SeqCst) {
            return;
        }

        api.prevent_close();
        let app_handle = window.app_handle();

        #[cfg(target_os = "windows")]
        {
            match read_close_choice(app_handle) {
                Some("exit") => {
                    state.allow_exit.store(true, Ordering::SeqCst);
                    app_handle.exit(0);
                }
                Some("hide") => {
                    let _ = hide_main_window(app_handle);
                }
                _ => {
                    show_close_choice_dialog(app_handle.clone());
                }
            }
            return;
        }

        #[cfg(not(target_os = "windows"))]
        {
            let _ = hide_main_window(app_handle);
        }
    }
}

#[cfg(target_os = "windows")]
fn show_close_choice_dialog(app: tauri::AppHandle) {
    use tauri_plugin_dialog::{MessageDialogButtons, MessageDialogKind};

    let locale = resolve_desktop_locale(&app).locale;
    let title = desktop_text(locale, DesktopTextKey::CloseDialogTitle).to_string();
    let body = desktop_text(locale, DesktopTextKey::CloseDialogBody).to_string();
    let hide_label = desktop_text(locale, DesktopTextKey::CloseDialogHide).to_string();
    let exit_label = desktop_text(locale, DesktopTextKey::CloseDialogExit).to_string();

    let app_for_callback = app.clone();
    app.dialog()
        .message(body)
        .title(title)
        .kind(MessageDialogKind::Info)
        .buttons(MessageDialogButtons::OkCancelCustom(hide_label, exit_label))
        .show(move |hide_chosen| {
            if hide_chosen {
                let _ = write_close_choice(&app_for_callback, "hide");
                let _ = hide_main_window(&app_for_callback);
            } else {
                let _ = write_close_choice(&app_for_callback, "exit");
                if let Some(state) = app_for_callback.try_state::<DesktopWindowState>() {
                    state.allow_exit.store(true, Ordering::SeqCst);
                }
                app_for_callback.exit(0);
            }
        });
}

fn hide_main_window(app: &AppHandle) -> tauri::Result<()> {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        window.set_skip_taskbar(true)?;
        window.hide()?;
    }

    Ok(())
}

fn show_main_window(app: &AppHandle) -> tauri::Result<()> {
    if let Some(state) = app.try_state::<DesktopWindowState>() {
        state.allow_exit.store(false, Ordering::SeqCst);
    }

    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        window.set_skip_taskbar(false)?;
        let _ = window.unminimize();
        window.show()?;
        window.set_focus()?;
    }

    Ok(())
}

#[tauri::command]
fn desktop_runtime_context(app: tauri::AppHandle) -> Result<DesktopRuntimeContext, String> {
    let paths = resolve_runtime_paths(&app)?;
    let configured_base_url = configured_remote_base_url();

    Ok(DesktopRuntimeContext {
        app_data_dir: paths.app_data_dir.display().to_string(),
        runtime_data_dir: paths.runtime_data_dir.display().to_string(),
        database_path: paths.database_path.display().to_string(),
        core_api_port: 0,
        core_api_base_url: configured_base_url,
        app_url: default_app_url(),
    })
}

#[tauri::command]
fn desktop_core_api_status(app: tauri::AppHandle) -> Result<DesktopCoreApiStatus, String> {
    let paths = resolve_runtime_paths(&app)?;
    let locale = resolve_desktop_locale(&app).locale;
    let configured_base_url = configured_remote_base_url();
    let reachable = probe_remote_health(&configured_base_url);

    Ok(DesktopCoreApiStatus {
        configured_port: 0,
        base_url: configured_base_url.clone(),
        running: false,
        reachable,
        pid: None,
        database_path: paths.database_path.display().to_string(),
        message: if configured_base_url.is_empty() {
            desktop_text(locale, DesktopTextKey::RemoteUnconfigured).to_string()
        } else if reachable {
            desktop_format_url(
                locale,
                DesktopTextKey::RemoteResponded,
                &configured_base_url,
            )
        } else {
            desktop_format_url(
                locale,
                DesktopTextKey::RemoteUnreachable,
                &configured_base_url,
            )
        },
        command: String::new(),
        command_source: "remote".to_string(),
        managed_by_desktop_shell: false,
    })
}

#[tauri::command]
fn desktop_runtime_diagnostics(app: tauri::AppHandle) -> Result<DesktopRuntimeDiagnostics, String> {
    let paths = resolve_runtime_paths(&app)?;
    let locale = resolve_desktop_locale(&app).locale;
    let configured_base_url = configured_remote_base_url();
    let reachable = probe_remote_health(&configured_base_url);
    let diagnostics_status = if configured_base_url.is_empty() {
        "remote-unconfigured"
    } else if reachable {
        "ready"
    } else {
        "remote-unreachable"
    };

    Ok(DesktopRuntimeDiagnostics {
        platform: std::env::consts::OS.to_string(),
        core_api_command: String::new(),
        core_api_command_source: "remote".to_string(),
        core_api_command_resolved: true,
        core_api_reachable: reachable,
        diagnostics_status: diagnostics_status.to_string(),
        bundled_core_api_path: String::new(),
        bundled_core_api_exists: false,
        core_api_port_occupied: false,
        managed_by_desktop_shell: false,
        managed_child_pid: None,
        desktop_log_path: paths.logs_dir.join("desktop.log").display().to_string(),
        last_core_api_error: None,
        linux_missing_packages: Vec::new(),
        summary: if configured_base_url.is_empty() {
            desktop_text(locale, DesktopTextKey::RemoteOnlySummary).to_string()
        } else if reachable {
            desktop_format_url(locale, DesktopTextKey::RemoteCanReach, &configured_base_url)
        } else {
            desktop_format_url(
                locale,
                DesktopTextKey::RemoteCannotReach,
                &configured_base_url,
            )
        },
    })
}

#[tauri::command]
fn probe_core_api_health(app: tauri::AppHandle) -> DesktopOperationResult {
    let locale = resolve_desktop_locale(&app).locale;
    let configured_base_url = configured_remote_base_url();
    let reachable = probe_remote_health(&configured_base_url);

    DesktopOperationResult {
        success: reachable,
        message: if configured_base_url.is_empty() {
            desktop_text(locale, DesktopTextKey::RemoteUnconfigured).to_string()
        } else if reachable {
            desktop_format_url(
                locale,
                DesktopTextKey::RemoteResponded,
                &configured_base_url,
            )
        } else {
            desktop_format_url(
                locale,
                DesktopTextKey::RemoteDidNotRespond,
                &configured_base_url,
            )
        },
    }
}

#[tauri::command]
fn start_core_api(app: tauri::AppHandle) -> DesktopOperationResult {
    let locale = resolve_desktop_locale(&app).locale;

    DesktopOperationResult {
        success: true,
        message: desktop_text(locale, DesktopTextKey::RemoteStartNoop).to_string(),
    }
}

#[tauri::command]
fn stop_core_api(app: tauri::AppHandle) -> DesktopOperationResult {
    let locale = resolve_desktop_locale(&app).locale;

    DesktopOperationResult {
        success: true,
        message: desktop_text(locale, DesktopTextKey::RemoteStopNoop).to_string(),
    }
}

#[tauri::command]
fn restart_core_api(app: tauri::AppHandle) -> DesktopOperationResult {
    let locale = resolve_desktop_locale(&app).locale;

    DesktopOperationResult {
        success: true,
        message: desktop_text(locale, DesktopTextKey::RemoteRestartNoop).to_string(),
    }
}

#[tauri::command]
fn desktop_get_locale(app: tauri::AppHandle) -> DesktopLocaleResult {
    let locale = resolve_desktop_locale(&app);

    DesktopLocaleResult {
        locale: locale.locale.to_string(),
        system_locale: locale.system_locale,
        source: locale.source.to_string(),
    }
}

#[tauri::command]
fn desktop_set_locale(
    app: tauri::AppHandle,
    input: DesktopSetLocaleInput,
) -> Result<DesktopOperationResult, String> {
    let current_locale = resolve_desktop_locale(&app).locale;
    let locale = resolve_supported_locale(&input.locale).ok_or_else(|| {
        desktop_text(current_locale, DesktopTextKey::UnsupportedLocaleError).to_string()
    })?;
    write_desktop_locale(&app, locale)?;
    apply_desktop_locale(&app, locale)?;

    Ok(DesktopOperationResult {
        success: true,
        message: desktop_text(locale, DesktopTextKey::LocaleSaved).to_string(),
    })
}

#[tauri::command]
fn desktop_window_close(window: Window) -> Result<(), String> {
    window.close().map_err(|error| error.to_string())
}

#[tauri::command]
fn desktop_window_drag(window: Window) -> Result<(), String> {
    window.start_dragging().map_err(|error| error.to_string())
}

#[tauri::command]
fn desktop_window_is_maximized(window: Window) -> Result<bool, String> {
    window.is_maximized().map_err(|error| error.to_string())
}

#[tauri::command]
fn desktop_window_minimize(window: Window) -> Result<(), String> {
    window.minimize().map_err(|error| error.to_string())
}

#[tauri::command]
async fn desktop_save_remote_file(
    app: tauri::AppHandle,
    input: DesktopSaveRemoteFileInput,
) -> Result<DesktopFileSaveResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let locale = resolve_desktop_locale(&app).locale;
        let url = input.url.trim().to_string();
        if url.is_empty() {
            return Err(desktop_text(locale, DesktopTextKey::MissingFileUrlError).to_string());
        }

        let Some(target_file_path) =
            prompt_save_file_path(&app, &input.file_name, input.dialog_title.as_deref())?
        else {
            return Ok(cancelled_file_save_result(locale));
        };
        ensure_parent_dir_exists(&target_file_path)?;

        let mut response = reqwest::blocking::Client::builder()
            .timeout(Duration::from_secs(120))
            .build()
            .map_err(|error| error.to_string())?
            .get(url)
            .send()
            .and_then(reqwest::blocking::Response::error_for_status)
            .map_err(|error| error.to_string())?;
        let mut output = File::create(&target_file_path).map_err(|error| error.to_string())?;

        response
            .copy_to(&mut output)
            .map_err(|error| error.to_string())?;
        output.flush().map_err(|error| error.to_string())?;

        Ok(saved_file_result(locale, &target_file_path))
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn desktop_save_text_file(
    app: tauri::AppHandle,
    input: DesktopSaveTextFileInput,
) -> Result<DesktopFileSaveResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let locale = resolve_desktop_locale(&app).locale;
        let Some(target_file_path) =
            prompt_save_file_path(&app, &input.file_name, input.dialog_title.as_deref())?
        else {
            return Ok(cancelled_file_save_result(locale));
        };
        ensure_parent_dir_exists(&target_file_path)?;
        std::fs::write(&target_file_path, input.contents).map_err(|error| error.to_string())?;
        Ok(saved_file_result(locale, &target_file_path))
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn desktop_save_binary_file(
    app: tauri::AppHandle,
    input: DesktopSaveBinaryFileInput,
) -> Result<DesktopFileSaveResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let locale = resolve_desktop_locale(&app).locale;
        let Some(target_file_path) =
            prompt_save_file_path(&app, &input.file_name, input.dialog_title.as_deref())?
        else {
            return Ok(cancelled_file_save_result(locale));
        };
        ensure_parent_dir_exists(&target_file_path)?;
        std::fs::write(&target_file_path, input.bytes).map_err(|error| error.to_string())?;
        Ok(saved_file_result(locale, &target_file_path))
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn desktop_read_feedback_store(
    app: tauri::AppHandle,
) -> Result<DesktopTextStoreReadResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let target_file_path = resolve_runtime_paths(&app)?
            .runtime_data_dir
            .join("desktop-feedback.json");

        match std::fs::read_to_string(&target_file_path) {
            Ok(contents) => Ok(DesktopTextStoreReadResult {
                exists: true,
                contents: Some(contents),
                message: format!(
                    "Read desktop feedback store from {}",
                    target_file_path.display()
                ),
            }),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                Ok(DesktopTextStoreReadResult {
                    exists: false,
                    contents: None,
                    message: "Desktop feedback store has not been created yet.".to_string(),
                })
            }
            Err(error) => Err(error.to_string()),
        }
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn desktop_write_feedback_store(
    app: tauri::AppHandle,
    contents: String,
) -> Result<DesktopOperationResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let target_file_path = resolve_runtime_paths(&app)?
            .runtime_data_dir
            .join("desktop-feedback.json");
        ensure_parent_dir_exists(&target_file_path)?;
        std::fs::write(&target_file_path, contents).map_err(|error| error.to_string())?;

        Ok(DesktopOperationResult {
            success: true,
            message: format!(
                "Saved desktop feedback store to {}",
                target_file_path.display()
            ),
        })
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn desktop_read_chat_image_viewer_sessions_store(
    app: tauri::AppHandle,
) -> Result<DesktopTextStoreReadResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let target_file_path = resolve_runtime_paths(&app)?
            .runtime_data_dir
            .join("desktop-chat-image-viewer-sessions.json");

        match std::fs::read_to_string(&target_file_path) {
            Ok(contents) => Ok(DesktopTextStoreReadResult {
                exists: true,
                contents: Some(contents),
                message: format!(
                    "Read desktop chat image viewer sessions store from {}",
                    target_file_path.display()
                ),
            }),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                Ok(DesktopTextStoreReadResult {
                    exists: false,
                    contents: None,
                    message: "Desktop chat image viewer sessions store has not been created yet."
                        .to_string(),
                })
            }
            Err(error) => Err(error.to_string()),
        }
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn desktop_write_chat_image_viewer_sessions_store(
    app: tauri::AppHandle,
    contents: String,
) -> Result<DesktopOperationResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let target_file_path = resolve_runtime_paths(&app)?
            .runtime_data_dir
            .join("desktop-chat-image-viewer-sessions.json");
        ensure_parent_dir_exists(&target_file_path)?;
        std::fs::write(&target_file_path, contents).map_err(|error| error.to_string())?;

        Ok(DesktopOperationResult {
            success: true,
            message: format!(
                "Saved desktop chat image viewer sessions store to {}",
                target_file_path.display()
            ),
        })
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn desktop_read_chat_message_actions_store(
    app: tauri::AppHandle,
) -> Result<DesktopTextStoreReadResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let target_file_path = resolve_runtime_paths(&app)?
            .runtime_data_dir
            .join("desktop-chat-message-actions.json");

        match std::fs::read_to_string(&target_file_path) {
            Ok(contents) => Ok(DesktopTextStoreReadResult {
                exists: true,
                contents: Some(contents),
                message: format!(
                    "Read desktop chat message actions store from {}",
                    target_file_path.display()
                ),
            }),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                Ok(DesktopTextStoreReadResult {
                    exists: false,
                    contents: None,
                    message: "Desktop chat message actions store has not been created yet."
                        .to_string(),
                })
            }
            Err(error) => Err(error.to_string()),
        }
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn desktop_write_chat_message_actions_store(
    app: tauri::AppHandle,
    contents: String,
) -> Result<DesktopOperationResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let target_file_path = resolve_runtime_paths(&app)?
            .runtime_data_dir
            .join("desktop-chat-message-actions.json");
        ensure_parent_dir_exists(&target_file_path)?;
        std::fs::write(&target_file_path, contents).map_err(|error| error.to_string())?;

        Ok(DesktopOperationResult {
            success: true,
            message: format!(
                "Saved desktop chat message actions store to {}",
                target_file_path.display()
            ),
        })
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn desktop_read_detailed_timestamp_mode_store(
    app: tauri::AppHandle,
) -> Result<DesktopTextStoreReadResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let target_file_path = resolve_runtime_paths(&app)?
            .runtime_data_dir
            .join("desktop-detailed-timestamp-mode.json");

        match std::fs::read_to_string(&target_file_path) {
            Ok(contents) => Ok(DesktopTextStoreReadResult {
                exists: true,
                contents: Some(contents),
                message: format!(
                    "Read desktop detailed timestamp mode store from {}",
                    target_file_path.display()
                ),
            }),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                Ok(DesktopTextStoreReadResult {
                    exists: false,
                    contents: None,
                    message: "Desktop detailed timestamp mode store has not been created yet."
                        .to_string(),
                })
            }
            Err(error) => Err(error.to_string()),
        }
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn desktop_write_detailed_timestamp_mode_store(
    app: tauri::AppHandle,
    contents: String,
) -> Result<DesktopOperationResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let target_file_path = resolve_runtime_paths(&app)?
            .runtime_data_dir
            .join("desktop-detailed-timestamp-mode.json");
        ensure_parent_dir_exists(&target_file_path)?;
        std::fs::write(&target_file_path, contents).map_err(|error| error.to_string())?;

        Ok(DesktopOperationResult {
            success: true,
            message: format!(
                "Saved desktop detailed timestamp mode store to {}",
                target_file_path.display()
            ),
        })
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn desktop_read_favorites_store(
    app: tauri::AppHandle,
) -> Result<DesktopTextStoreReadResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let target_file_path = resolve_runtime_paths(&app)?
            .runtime_data_dir
            .join("desktop-favorites.json");

        match std::fs::read_to_string(&target_file_path) {
            Ok(contents) => Ok(DesktopTextStoreReadResult {
                exists: true,
                contents: Some(contents),
                message: format!(
                    "Read desktop favorites store from {}",
                    target_file_path.display()
                ),
            }),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                Ok(DesktopTextStoreReadResult {
                    exists: false,
                    contents: None,
                    message: "Desktop favorites store has not been created yet.".to_string(),
                })
            }
            Err(error) => Err(error.to_string()),
        }
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn desktop_write_favorites_store(
    app: tauri::AppHandle,
    contents: String,
) -> Result<DesktopOperationResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let target_file_path = resolve_runtime_paths(&app)?
            .runtime_data_dir
            .join("desktop-favorites.json");
        ensure_parent_dir_exists(&target_file_path)?;
        std::fs::write(&target_file_path, contents).map_err(|error| error.to_string())?;

        Ok(DesktopOperationResult {
            success: true,
            message: format!(
                "Saved desktop favorites store to {}",
                target_file_path.display()
            ),
        })
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn desktop_read_game_center_store(
    app: tauri::AppHandle,
) -> Result<DesktopTextStoreReadResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let target_file_path = resolve_runtime_paths(&app)?
            .runtime_data_dir
            .join("desktop-game-center.json");

        match std::fs::read_to_string(&target_file_path) {
            Ok(contents) => Ok(DesktopTextStoreReadResult {
                exists: true,
                contents: Some(contents),
                message: format!(
                    "Read desktop game center store from {}",
                    target_file_path.display()
                ),
            }),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                Ok(DesktopTextStoreReadResult {
                    exists: false,
                    contents: None,
                    message: "Desktop game center store has not been created yet.".to_string(),
                })
            }
            Err(error) => Err(error.to_string()),
        }
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn desktop_write_game_center_store(
    app: tauri::AppHandle,
    contents: String,
) -> Result<DesktopOperationResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let target_file_path = resolve_runtime_paths(&app)?
            .runtime_data_dir
            .join("desktop-game-center.json");
        ensure_parent_dir_exists(&target_file_path)?;
        std::fs::write(&target_file_path, contents).map_err(|error| error.to_string())?;

        Ok(DesktopOperationResult {
            success: true,
            message: format!(
                "Saved desktop game center store to {}",
                target_file_path.display()
            ),
        })
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn desktop_read_group_invite_store(
    app: tauri::AppHandle,
) -> Result<DesktopTextStoreReadResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let target_file_path = resolve_runtime_paths(&app)?
            .runtime_data_dir
            .join("desktop-group-invite.json");

        match std::fs::read_to_string(&target_file_path) {
            Ok(contents) => Ok(DesktopTextStoreReadResult {
                exists: true,
                contents: Some(contents),
                message: format!(
                    "Read desktop group invite store from {}",
                    target_file_path.display()
                ),
            }),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                Ok(DesktopTextStoreReadResult {
                    exists: false,
                    contents: None,
                    message: "Desktop group invite store has not been created yet.".to_string(),
                })
            }
            Err(error) => Err(error.to_string()),
        }
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn desktop_write_group_invite_store(
    app: tauri::AppHandle,
    contents: String,
) -> Result<DesktopOperationResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let target_file_path = resolve_runtime_paths(&app)?
            .runtime_data_dir
            .join("desktop-group-invite.json");
        ensure_parent_dir_exists(&target_file_path)?;
        std::fs::write(&target_file_path, contents).map_err(|error| error.to_string())?;

        Ok(DesktopOperationResult {
            success: true,
            message: format!(
                "Saved desktop group invite store to {}",
                target_file_path.display()
            ),
        })
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn desktop_read_live_companion_store(
    app: tauri::AppHandle,
) -> Result<DesktopTextStoreReadResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let target_file_path = resolve_runtime_paths(&app)?
            .runtime_data_dir
            .join("desktop-live-companion.json");

        match std::fs::read_to_string(&target_file_path) {
            Ok(contents) => Ok(DesktopTextStoreReadResult {
                exists: true,
                contents: Some(contents),
                message: format!(
                    "Read desktop live companion store from {}",
                    target_file_path.display()
                ),
            }),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                Ok(DesktopTextStoreReadResult {
                    exists: false,
                    contents: None,
                    message: "Desktop live companion store has not been created yet.".to_string(),
                })
            }
            Err(error) => Err(error.to_string()),
        }
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn desktop_write_live_companion_store(
    app: tauri::AppHandle,
    contents: String,
) -> Result<DesktopOperationResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let target_file_path = resolve_runtime_paths(&app)?
            .runtime_data_dir
            .join("desktop-live-companion.json");
        ensure_parent_dir_exists(&target_file_path)?;
        std::fs::write(&target_file_path, contents).map_err(|error| error.to_string())?;

        Ok(DesktopOperationResult {
            success: true,
            message: format!(
                "Saved desktop live companion store to {}",
                target_file_path.display()
            ),
        })
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn desktop_read_lock_store(
    app: tauri::AppHandle,
) -> Result<DesktopTextStoreReadResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let target_file_path = resolve_runtime_paths(&app)?
            .runtime_data_dir
            .join("desktop-lock.json");

        match std::fs::read_to_string(&target_file_path) {
            Ok(contents) => Ok(DesktopTextStoreReadResult {
                exists: true,
                contents: Some(contents),
                message: format!(
                    "Read desktop lock store from {}",
                    target_file_path.display()
                ),
            }),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                Ok(DesktopTextStoreReadResult {
                    exists: false,
                    contents: None,
                    message: "Desktop lock store has not been created yet.".to_string(),
                })
            }
            Err(error) => Err(error.to_string()),
        }
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn desktop_write_lock_store(
    app: tauri::AppHandle,
    contents: String,
) -> Result<DesktopOperationResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let target_file_path = resolve_runtime_paths(&app)?
            .runtime_data_dir
            .join("desktop-lock.json");
        ensure_parent_dir_exists(&target_file_path)?;
        std::fs::write(&target_file_path, contents).map_err(|error| error.to_string())?;

        Ok(DesktopOperationResult {
            success: true,
            message: format!("Saved desktop lock store to {}", target_file_path.display()),
        })
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn desktop_read_mini_programs_store(
    app: tauri::AppHandle,
) -> Result<DesktopTextStoreReadResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let target_file_path = resolve_runtime_paths(&app)?
            .runtime_data_dir
            .join("desktop-mini-programs.json");

        match std::fs::read_to_string(&target_file_path) {
            Ok(contents) => Ok(DesktopTextStoreReadResult {
                exists: true,
                contents: Some(contents),
                message: format!(
                    "Read desktop mini programs store from {}",
                    target_file_path.display()
                ),
            }),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                Ok(DesktopTextStoreReadResult {
                    exists: false,
                    contents: None,
                    message: "Desktop mini programs store has not been created yet.".to_string(),
                })
            }
            Err(error) => Err(error.to_string()),
        }
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn desktop_write_mini_programs_store(
    app: tauri::AppHandle,
    contents: String,
) -> Result<DesktopOperationResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let target_file_path = resolve_runtime_paths(&app)?
            .runtime_data_dir
            .join("desktop-mini-programs.json");
        ensure_parent_dir_exists(&target_file_path)?;
        std::fs::write(&target_file_path, contents).map_err(|error| error.to_string())?;

        Ok(DesktopOperationResult {
            success: true,
            message: format!(
                "Saved desktop mini programs store to {}",
                target_file_path.display()
            ),
        })
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn desktop_read_mobile_handoff_store(
    app: tauri::AppHandle,
) -> Result<DesktopTextStoreReadResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let target_file_path = resolve_runtime_paths(&app)?
            .runtime_data_dir
            .join("desktop-mobile-handoff.json");

        match std::fs::read_to_string(&target_file_path) {
            Ok(contents) => Ok(DesktopTextStoreReadResult {
                exists: true,
                contents: Some(contents),
                message: format!(
                    "Read desktop mobile handoff store from {}",
                    target_file_path.display()
                ),
            }),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                Ok(DesktopTextStoreReadResult {
                    exists: false,
                    contents: None,
                    message: "Desktop mobile handoff store has not been created yet.".to_string(),
                })
            }
            Err(error) => Err(error.to_string()),
        }
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn desktop_write_mobile_handoff_store(
    app: tauri::AppHandle,
    contents: String,
) -> Result<DesktopOperationResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let target_file_path = resolve_runtime_paths(&app)?
            .runtime_data_dir
            .join("desktop-mobile-handoff.json");
        ensure_parent_dir_exists(&target_file_path)?;
        std::fs::write(&target_file_path, contents).map_err(|error| error.to_string())?;

        Ok(DesktopOperationResult {
            success: true,
            message: format!(
                "Saved desktop mobile handoff store to {}",
                target_file_path.display()
            ),
        })
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn desktop_read_notes_store(
    app: tauri::AppHandle,
) -> Result<DesktopTextStoreReadResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let target_file_path = resolve_runtime_paths(&app)?
            .runtime_data_dir
            .join("desktop-notes.json");

        match std::fs::read_to_string(&target_file_path) {
            Ok(contents) => Ok(DesktopTextStoreReadResult {
                exists: true,
                contents: Some(contents),
                message: format!(
                    "Read desktop notes store from {}",
                    target_file_path.display()
                ),
            }),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                Ok(DesktopTextStoreReadResult {
                    exists: false,
                    contents: None,
                    message: "Desktop notes store has not been created yet.".to_string(),
                })
            }
            Err(error) => Err(error.to_string()),
        }
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn desktop_write_notes_store(
    app: tauri::AppHandle,
    contents: String,
) -> Result<DesktopOperationResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let target_file_path = resolve_runtime_paths(&app)?
            .runtime_data_dir
            .join("desktop-notes.json");
        ensure_parent_dir_exists(&target_file_path)?;
        std::fs::write(&target_file_path, contents).map_err(|error| error.to_string())?;

        Ok(DesktopOperationResult {
            success: true,
            message: format!(
                "Saved desktop notes store to {}",
                target_file_path.display()
            ),
        })
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn desktop_read_recent_stickers_store(
    app: tauri::AppHandle,
) -> Result<DesktopTextStoreReadResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let target_file_path = resolve_runtime_paths(&app)?
            .runtime_data_dir
            .join("desktop-recent-stickers.json");

        match std::fs::read_to_string(&target_file_path) {
            Ok(contents) => Ok(DesktopTextStoreReadResult {
                exists: true,
                contents: Some(contents),
                message: format!(
                    "Read desktop recent stickers store from {}",
                    target_file_path.display()
                ),
            }),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                Ok(DesktopTextStoreReadResult {
                    exists: false,
                    contents: None,
                    message: "Desktop recent stickers store has not been created yet.".to_string(),
                })
            }
            Err(error) => Err(error.to_string()),
        }
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn desktop_write_recent_stickers_store(
    app: tauri::AppHandle,
    contents: String,
) -> Result<DesktopOperationResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let target_file_path = resolve_runtime_paths(&app)?
            .runtime_data_dir
            .join("desktop-recent-stickers.json");
        ensure_parent_dir_exists(&target_file_path)?;
        std::fs::write(&target_file_path, contents).map_err(|error| error.to_string())?;

        Ok(DesktopOperationResult {
            success: true,
            message: format!(
                "Saved desktop recent stickers store to {}",
                target_file_path.display()
            ),
        })
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn desktop_read_runtime_config_store(
    app: tauri::AppHandle,
) -> Result<DesktopTextStoreReadResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let target_file_path = resolve_runtime_paths(&app)?
            .runtime_data_dir
            .join("desktop-runtime-config.json");

        match std::fs::read_to_string(&target_file_path) {
            Ok(contents) => Ok(DesktopTextStoreReadResult {
                exists: true,
                contents: Some(contents),
                message: format!(
                    "Read desktop runtime config store from {}",
                    target_file_path.display()
                ),
            }),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                Ok(DesktopTextStoreReadResult {
                    exists: false,
                    contents: None,
                    message: "Desktop runtime config store has not been created yet.".to_string(),
                })
            }
            Err(error) => Err(error.to_string()),
        }
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn desktop_write_runtime_config_store(
    app: tauri::AppHandle,
    contents: String,
) -> Result<DesktopOperationResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let target_file_path = resolve_runtime_paths(&app)?
            .runtime_data_dir
            .join("desktop-runtime-config.json");
        ensure_parent_dir_exists(&target_file_path)?;
        std::fs::write(&target_file_path, contents).map_err(|error| error.to_string())?;

        Ok(DesktopOperationResult {
            success: true,
            message: format!(
                "Saved desktop runtime config store to {}",
                target_file_path.display()
            ),
        })
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn desktop_read_search_history_store(
    app: tauri::AppHandle,
) -> Result<DesktopTextStoreReadResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let target_file_path = resolve_runtime_paths(&app)?
            .runtime_data_dir
            .join("desktop-search-history.json");

        match std::fs::read_to_string(&target_file_path) {
            Ok(contents) => Ok(DesktopTextStoreReadResult {
                exists: true,
                contents: Some(contents),
                message: format!(
                    "Read desktop search history store from {}",
                    target_file_path.display()
                ),
            }),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                Ok(DesktopTextStoreReadResult {
                    exists: false,
                    contents: None,
                    message: "Desktop search history store has not been created yet.".to_string(),
                })
            }
            Err(error) => Err(error.to_string()),
        }
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn desktop_write_search_history_store(
    app: tauri::AppHandle,
    contents: String,
) -> Result<DesktopOperationResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let target_file_path = resolve_runtime_paths(&app)?
            .runtime_data_dir
            .join("desktop-search-history.json");
        ensure_parent_dir_exists(&target_file_path)?;
        std::fs::write(&target_file_path, contents).map_err(|error| error.to_string())?;

        Ok(DesktopOperationResult {
            success: true,
            message: format!(
                "Saved desktop search history store to {}",
                target_file_path.display()
            ),
        })
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
fn desktop_window_toggle_maximize(window: Window) -> Result<bool, String> {
    let is_maximized = window.is_maximized().map_err(|error| error.to_string())?;

    if is_maximized {
        window.unmaximize().map_err(|error| error.to_string())?;
        Ok(false)
    } else {
        window.maximize().map_err(|error| error.to_string())?;
        Ok(true)
    }
}

fn configured_remote_base_url() -> String {
    std::env::var("YINJIE_DESKTOP_REMOTE_API_BASE_URL")
        .map(|value| value.trim().trim_end_matches('/').to_string())
        .unwrap_or_default()
}

fn resolve_runtime_paths(app: &tauri::AppHandle) -> Result<RuntimePaths, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    let runtime_data_dir = app_data_dir.join("runtime-data");
    let database_path = runtime_data_dir.join("yinjie.sqlite");
    let logs_dir = runtime_data_dir.join("logs");

    std::fs::create_dir_all(&runtime_data_dir).map_err(|error| error.to_string())?;
    std::fs::create_dir_all(&logs_dir).map_err(|error| error.to_string())?;

    Ok(RuntimePaths {
        app_data_dir,
        runtime_data_dir,
        database_path,
        logs_dir,
    })
}

fn default_app_url() -> String {
    if cfg!(debug_assertions) {
        "http://127.0.0.1:5180".to_string()
    } else {
        "app://index.html".to_string()
    }
}

fn probe_remote_health(base_url: &str) -> bool {
    if base_url.trim().is_empty() {
        return false;
    }

    let client = match reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(2))
        .build()
    {
        Ok(client) => client,
        Err(_) => return false,
    };

    client
        .get(format!("{base_url}/health"))
        .send()
        .map(|response| response.status().is_success())
        .unwrap_or(false)
}

fn prompt_save_file_path(
    app: &tauri::AppHandle,
    file_name: &str,
    dialog_title: Option<&str>,
) -> Result<Option<PathBuf>, String> {
    let locale = resolve_desktop_locale(app).locale;
    let normalized_file_name = sanitize_download_file_name(file_name);
    let normalized_dialog_title = dialog_title
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| desktop_text(locale, DesktopTextKey::SaveAttachment));
    let Some(target_file_path) = app
        .dialog()
        .file()
        .set_title(normalized_dialog_title)
        .set_file_name(normalized_file_name)
        .blocking_save_file()
    else {
        return Ok(None);
    };

    target_file_path
        .into_path()
        .map(Some)
        .map_err(|error| error.to_string())
}

fn ensure_parent_dir_exists(target_file_path: &PathBuf) -> Result<(), String> {
    if let Some(parent_dir) = target_file_path.parent() {
        std::fs::create_dir_all(parent_dir).map_err(|error| error.to_string())?;
    }

    Ok(())
}

fn cancelled_file_save_result(locale: &str) -> DesktopFileSaveResult {
    DesktopFileSaveResult {
        success: false,
        cancelled: true,
        saved_path: None,
        message: desktop_text(locale, DesktopTextKey::SaveCancelled).to_string(),
    }
}

fn saved_file_result(locale: &str, target_file_path: &PathBuf) -> DesktopFileSaveResult {
    DesktopFileSaveResult {
        success: true,
        cancelled: false,
        saved_path: Some(target_file_path.display().to_string()),
        message: desktop_saved_file_message(locale, target_file_path),
    }
}

fn sanitize_download_file_name(value: &str) -> String {
    let sanitized = value
        .trim()
        .trim_matches('.')
        .chars()
        .map(|ch| match ch {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => '_',
            control if control.is_control() => '_',
            other => other,
        })
        .collect::<String>();
    let sanitized = sanitized.trim().trim_matches('.').to_string();

    if sanitized.is_empty() {
        "download".to_string()
    } else {
        sanitized
    }
}

#[allow(dead_code)]
fn now_token() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_millis().to_string())
        .unwrap_or_else(|_| "0".into())
}
