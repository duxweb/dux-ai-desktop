use futures_util::StreamExt;
use reqwest::multipart;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::OnceLock;
use std::path::Path;
use std::process::Command;
use std::sync::{Arc, Mutex};
use tauri::{
    AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
};
use tauri::window::{Effect, EffectState, EffectsBuilder};

#[cfg(target_os = "macos")]
use objc2_app_kit::{NSColor, NSWindow};

#[derive(Default)]
struct StreamState {
    handles: Arc<Mutex<HashMap<String, tauri::async_runtime::JoinHandle<()>>>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ApiRequest {
    server_url: String,
    token: String,
    path: String,
    method: Option<String>,
    body: Option<Value>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UploadFileRequest {
    server_url: String,
    token: String,
    model: String,
    file_path: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ChatStreamRequest {
    stream_id: String,
    window_label: Option<String>,
    server_url: String,
    token: String,
    model: String,
    session_id: Option<i64>,
    messages: Value,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CancelStreamRequest {
    stream_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OpenAppWindowRequest {
    kind: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OpenExternalRequest {
    url: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DownloadRemoteAssetRequest {
    url: String,
    save_path: String,
    token: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct StreamDataPayload {
    stream_id: String,
    data: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct StreamErrorPayload {
    stream_id: String,
    message: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct StreamEndPayload {
    stream_id: String,
}


#[derive(Debug, Clone, Deserialize)]
struct ChildWindowDefinition {
    label: String,
    title: String,
    width: f64,
    height: f64,
    resizable: bool,
}

fn child_window_definitions() -> &'static HashMap<String, ChildWindowDefinition> {
    static DEFINITIONS: OnceLock<HashMap<String, ChildWindowDefinition>> = OnceLock::new();
    DEFINITIONS.get_or_init(|| {
        serde_json::from_str(include_str!("../../shared/window-definitions.json"))
            .expect("invalid shared window definitions")
    })
}

fn child_window_definition(kind: &str) -> Option<&'static ChildWindowDefinition> {
    child_window_definitions().get(kind)
}

fn normalized_url(server_url: &str, path: &str) -> String {
    format!(
        "{}/{}",
        server_url.trim().trim_end_matches('/'),
        path.trim().trim_start_matches('/')
    )
}

fn extract_error_message(status: u16, text: &str) -> String {
    if let Ok(payload) = serde_json::from_str::<Value>(text) {
        if let Some(message) = payload
            .get("error")
            .and_then(|value| value.get("message"))
            .and_then(Value::as_str)
        {
            return message.to_string();
        }
        if let Some(message) = payload.get("message").and_then(Value::as_str) {
            return message.to_string();
        }
    }

    let fallback = text.trim();
    if fallback.is_empty() {
        format!("请求失败 ({status})")
    } else {
        fallback.to_string()
    }
}

async fn parse_json_response(response: reqwest::Response) -> Result<Value, String> {
    let status = response.status();
    let text = response.text().await.map_err(|error| error.to_string())?;

    if !status.is_success() {
        return Err(extract_error_message(status.as_u16(), &text));
    }

    serde_json::from_str::<Value>(&text).map_err(|error| error.to_string())
}

fn emit_stream_data(app: &AppHandle, window_label: &str, stream_id: &str, block: &str) {
    if let Some(window) = app.get_webview_window(window_label) {
        for line in block.lines() {
            let line = line.trim();
            if !line.starts_with("data:") {
                continue;
            }
            let payload = StreamDataPayload {
                stream_id: stream_id.to_string(),
                data: line.trim_start_matches("data:").trim().to_string(),
            };
            let _ = window.emit("chat-stream-data", payload);
        }
    }
}

fn emit_stream_error(app: &AppHandle, window_label: &str, stream_id: &str, message: &str) {
    if let Some(window) = app.get_webview_window(window_label) {
        let _ = window.emit(
            "chat-stream-error",
            StreamErrorPayload {
                stream_id: stream_id.to_string(),
                message: message.to_string(),
            },
        );
    }
}

fn emit_stream_end(app: &AppHandle, window_label: &str, stream_id: &str) {
    if let Some(window) = app.get_webview_window(window_label) {
        let _ = window.emit(
            "chat-stream-end",
            StreamEndPayload {
                stream_id: stream_id.to_string(),
            },
        );
    }
}

#[cfg(target_os = "macos")]
fn configure_macos_window(window: &WebviewWindow, clear_title: bool, movable_by_background: bool) -> tauri::Result<()> {
    window.set_decorations(true)?;
    if clear_title {
        window.set_title("")?;
    }
    window.set_effects(
        EffectsBuilder::new()
            .effect(Effect::UnderWindowBackground)
            .state(EffectState::Active)
            .build(),
    )?;
    window.with_webview(move |webview| unsafe {
        let ns_window: &NSWindow = &*webview.ns_window().cast();

        ns_window.setOpaque(false);
        let clear = NSColor::clearColor();
        ns_window.setBackgroundColor(Some(&clear));
        ns_window.setHasShadow(true);
        ns_window.setMovableByWindowBackground(movable_by_background);
    })?;

    Ok(())
}

#[cfg(target_os = "windows")]
fn apply_windows_mica(window: &WebviewWindow) -> tauri::Result<()> {
    window.set_effects(
        EffectsBuilder::new()
            .effect(Effect::Mica)
            .state(EffectState::Active)
            .build(),
    )?;
    Ok(())
}

fn configure_child_window(_window: &WebviewWindow) -> tauri::Result<()> {
    #[cfg(target_os = "macos")]
    {
        configure_macos_window(_window, false, false)?;
    }
    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    {
        _window.set_decorations(false)?;
    }
    Ok(())
}

#[tauri::command]
async fn open_app_window(app: AppHandle, request: OpenAppWindowRequest) -> Result<(), String> {
    let kind = request.kind.as_str();
    let definition = child_window_definition(kind)
        .ok_or_else(|| "不支持的窗口类型".to_string())?;
    let label = definition.label.as_str();

    if let Some(existing) = app.get_webview_window(label) {
        existing.show().map_err(|error| error.to_string())?;
        existing.set_focus().map_err(|error| error.to_string())?;
        return Ok(());
    }

    let parent = app
        .get_webview_window("main")
        .ok_or_else(|| "主窗口不存在".to_string())?;

    let mut builder = WebviewWindowBuilder::new(&app, label, WebviewUrl::App("index.html".into()))
        .parent(&parent)
        .map_err(|error| error.to_string())?
        .center()
        .shadow(true)
        .visible(true)
        .focused(true)
        .maximizable(false)
        .minimizable(false)
        .closable(true)
        .resizable(definition.resizable)
        .skip_taskbar(true);

    #[cfg(target_os = "windows")]
    {
        builder = builder.transparent(false).decorations(true);
    }

    #[cfg(not(target_os = "windows"))]
    {
        builder = builder.transparent(true).decorations(false);
    }

    builder = builder
        .title(&definition.title)
        .inner_size(definition.width, definition.height);

    let window = builder.build().map_err(|error| error.to_string())?;
    configure_child_window(&window).map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
async fn open_external(request: OpenExternalRequest) -> Result<(), String> {
    let url = request.url.trim();
    if url.is_empty() {
        return Err("链接不能为空".to_string());
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(url)
            .spawn()
            .map_err(|error| error.to_string())?;
        return Ok(());
    }

    #[cfg(target_os = "windows")]
    {
        Command::new("cmd")
            .args(["/C", "start", "", url])
            .spawn()
            .map_err(|error| error.to_string())?;
        return Ok(());
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        Command::new("xdg-open")
            .arg(url)
            .spawn()
            .map_err(|error| error.to_string())?;
        return Ok(());
    }
}

#[tauri::command]
async fn download_remote_asset(request: DownloadRemoteAssetRequest) -> Result<(), String> {
    let url = request.url.trim();
    if url.is_empty() {
        return Err("下载链接不能为空".to_string());
    }

    let save_path = Path::new(&request.save_path);
    if let Some(parent) = save_path.parent() {
        std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    let client = reqwest::Client::new();
    let mut builder = client.get(url);

    if let Some(token) = request.token.as_deref() {
        let token = token.trim();
        if !token.is_empty() {
            builder = builder.bearer_auth(token);
        }
    }

    let response = builder.send().await.map_err(|error| error.to_string())?;
    let status = response.status();

    if !status.is_success() {
        let text = response.text().await.unwrap_or_default();
        return Err(extract_error_message(status.as_u16(), &text));
    }

    let bytes = response.bytes().await.map_err(|error| error.to_string())?;
    std::fs::write(save_path, &bytes).map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
fn minimize_app_window(window: WebviewWindow) -> Result<(), String> {
    window.minimize().map_err(|error| error.to_string())
}

#[tauri::command]
fn toggle_maximize_app_window(window: WebviewWindow) -> Result<(), String> {
    if window.is_maximized().map_err(|error| error.to_string())? {
        window.unmaximize().map_err(|error| error.to_string())
    } else {
        window.maximize().map_err(|error| error.to_string())
    }
}

#[tauri::command]
fn close_app_window(window: WebviewWindow) -> Result<(), String> {
    window.close().map_err(|error| error.to_string())
}

#[tauri::command]
fn is_app_window_maximized(window: WebviewWindow) -> Result<bool, String> {
    window.is_maximized().map_err(|error| error.to_string())
}

#[tauri::command]
async fn api_request(request: ApiRequest) -> Result<Value, String> {
    let client = reqwest::Client::new();
    let method = request
        .method
        .as_deref()
        .unwrap_or("GET")
        .parse::<reqwest::Method>()
        .map_err(|error| error.to_string())?;

    let mut builder = client
        .request(method, normalized_url(&request.server_url, &request.path))
        .bearer_auth(request.token)
        .header("Accept", "application/json");

    if let Some(body) = request.body {
        builder = builder.json(&body);
    }

    let response = builder.send().await.map_err(|error| error.to_string())?;
    parse_json_response(response).await
}

#[tauri::command]
async fn upload_file(request: UploadFileRequest) -> Result<Value, String> {
    let file_path = Path::new(&request.file_path);
    let file_name = file_path
        .file_name()
        .and_then(|value| value.to_str())
        .map(str::to_string)
        .ok_or_else(|| "无法识别文件名".to_string())?;

    let bytes = std::fs::read(file_path).map_err(|error| error.to_string())?;
    let part = multipart::Part::bytes(bytes).file_name(file_name);
    let form = multipart::Form::new().part("file", part);

    let url = normalized_url(
        &request.server_url,
        &format!("/agent/v1/files?model={}", request.model),
    );

    let response = reqwest::Client::new()
        .post(url)
        .bearer_auth(request.token)
        .multipart(form)
        .send()
        .await
        .map_err(|error| error.to_string())?;

    parse_json_response(response).await
}

#[tauri::command]
async fn cancel_chat_stream(state: State<'_, StreamState>, request: CancelStreamRequest) -> Result<(), String> {
    if let Some(handle) = state
        .handles
        .lock()
        .map_err(|_| "无法获取流状态".to_string())?
        .remove(&request.stream_id)
    {
        handle.abort();
    }
    Ok(())
}

#[tauri::command]
async fn start_chat_stream(
    app: AppHandle,
    state: State<'_, StreamState>,
    request: ChatStreamRequest,
) -> Result<(), String> {
    let stream_id = request.stream_id.clone();
    let window_label = request.window_label.clone().unwrap_or_else(|| "main".to_string());

    if let Some(handle) = state
        .handles
        .lock()
        .map_err(|_| "无法获取流状态".to_string())?
        .remove(&stream_id)
    {
        handle.abort();
    }

    let handles = state.handles.clone();
    let task_stream_id = stream_id.clone();
    let task_window_label = window_label.clone();
    let task_app = app.clone();

    let handle = tauri::async_runtime::spawn(async move {
        let client = reqwest::Client::new();
        let response = client
            .post(normalized_url(&request.server_url, "/agent/v1/chat/completions"))
            .bearer_auth(request.token)
            .json(&json!({
                "model": request.model,
                "session_id": request.session_id,
                "stream": true,
                "messages": request.messages,
            }))
            .send()
            .await;

        let response = match response {
            Ok(response) => response,
            Err(error) => {
                emit_stream_error(&task_app, &task_window_label, &task_stream_id, &error.to_string());
                if let Ok(mut guard) = handles.lock() {
                    guard.remove(&task_stream_id);
                }
                return;
            }
        };

        if !response.status().is_success() {
            let status = response.status().as_u16();
            let text = response.text().await.unwrap_or_default();
            let message = extract_error_message(status, &text);
            emit_stream_error(&task_app, &task_window_label, &task_stream_id, &message);
            if let Ok(mut guard) = handles.lock() {
                guard.remove(&task_stream_id);
            }
            return;
        }

        let mut stream = response.bytes_stream();
        let mut buffer = String::new();

        while let Some(chunk) = stream.next().await {
            match chunk {
                Ok(bytes) => {
                    buffer.push_str(&String::from_utf8_lossy(&bytes));
                    while let Some(index) = buffer.find("\n\n") {
                        let block = buffer[..index].to_string();
                        buffer = buffer[index + 2..].to_string();
                        emit_stream_data(&task_app, &task_window_label, &task_stream_id, &block);
                    }
                }
                Err(error) => {
                    emit_stream_error(&task_app, &task_window_label, &task_stream_id, &error.to_string());
                    if let Ok(mut guard) = handles.lock() {
                        guard.remove(&task_stream_id);
                    }
                    return;
                }
            }
        }

        if !buffer.trim().is_empty() {
            emit_stream_data(&task_app, &task_window_label, &task_stream_id, &buffer);
        }

        emit_stream_end(&task_app, &task_window_label, &task_stream_id);
        if let Ok(mut guard) = handles.lock() {
            guard.remove(&task_stream_id);
        }
    });

    state
        .handles
        .lock()
        .map_err(|_| "无法获取流状态".to_string())?
        .insert(stream_id, handle);

    Ok(())
}

pub fn run() {
    tauri::Builder::default()
        .manage(StreamState::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .setup(|app| {
            #[cfg(target_os = "macos")]
            if let Some(window) = app.get_webview_window("main") {
                configure_macos_window(&window, true, false)?;
            }
            #[cfg(target_os = "windows")]
            if let Some(window) = app.get_webview_window("main") {
                window.set_decorations(false)?;
                apply_windows_mica(&window)?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            open_app_window,
            open_external,
            download_remote_asset,
            minimize_app_window,
            toggle_maximize_app_window,
            close_app_window,
            is_app_window_maximized,
            api_request,
            upload_file,
            start_chat_stream,
            cancel_chat_stream
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
