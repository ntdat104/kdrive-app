//! Streams downloads straight to disk. The page sees these commands as `showSaveFilePicker()`
//! (see `src/platform/desktop.ts`), so the web app's download code runs unchanged. The path
//! always comes from the native save dialog, never from the page.

use std::{
    collections::HashMap,
    fs::{self, File},
    io::{BufWriter, Write},
    path::PathBuf,
    sync::{
        atomic::{AtomicU32, Ordering},
        Arc, Mutex,
    },
};

use tauri::{
    ipc::{InvokeBody, Request},
    AppHandle, State,
};
use tauri_plugin_dialog::DialogExt;

struct OpenSave {
    path: PathBuf,
    file: Mutex<BufWriter<File>>,
}

#[derive(Default)]
pub struct Saves {
    next_id: AtomicU32,
    open: Mutex<HashMap<u32, Arc<OpenSave>>>,
}

impl Saves {
    fn get(&self, id: u32) -> Result<Arc<OpenSave>, String> {
        self.open.lock().unwrap().get(&id).cloned().ok_or_else(|| "This download is no longer open".into())
    }

    fn take(&self, id: u32) -> Option<Arc<OpenSave>> {
        self.open.lock().unwrap().remove(&id)
    }
}

/// Asks where to save, then creates the file. `None` means the user cancelled.
#[tauri::command]
pub async fn save_begin(app: AppHandle, saves: State<'_, Saves>, name: String) -> Result<Option<u32>, String> {
    let Some(picked) = app.dialog().file().set_file_name(&name).blocking_save_file() else {
        return Ok(None);
    };
    let path = picked.into_path().map_err(|e| e.to_string())?;
    let file = File::create(&path).map_err(|e| e.to_string())?;
    let id = saves.next_id.fetch_add(1, Ordering::Relaxed) + 1;
    let save = OpenSave { path, file: Mutex::new(BufWriter::with_capacity(1 << 20, file)) };
    saves.open.lock().unwrap().insert(id, Arc::new(save));
    Ok(Some(id))
}

/// Appends the raw request body; the save id travels in the `x-save-id` header.
#[tauri::command]
pub async fn save_write(saves: State<'_, Saves>, request: Request<'_>) -> Result<(), String> {
    let id = request
        .headers()
        .get("x-save-id")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.parse::<u32>().ok())
        .ok_or("Missing x-save-id header")?;
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("Expected raw bytes".into());
    };
    let save = saves.get(id)?;
    let mut file = save.file.lock().unwrap();
    file.write_all(bytes).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn save_close(saves: State<'_, Saves>, id: u32) -> Result<(), String> {
    let save = saves.take(id).ok_or("This download is no longer open")?;
    let mut file = save.file.lock().unwrap();
    file.flush().map_err(|e| e.to_string())?;
    file.get_ref().sync_all().map_err(|e| e.to_string())
}

/// Closes and deletes a partially written file.
#[tauri::command]
pub async fn save_abort(saves: State<'_, Saves>, id: u32) -> Result<(), String> {
    if let Some(save) = saves.take(id) {
        let path = save.path.clone();
        drop(save); // closes the handle (Windows cannot delete open files)
        let _ = fs::remove_file(path);
    }
    Ok(())
}
