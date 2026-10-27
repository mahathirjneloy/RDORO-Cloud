use chrono::{Datelike, Local, NaiveDate, Timelike};
use rusqlite::{params, Connection, Result as SqlResult};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

pub struct DbState {
    pub conn: Mutex<Connection>,
    pub db_dir: PathBuf,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionRecord {
    pub id: Option<i64>,
    pub mode: String,
    pub tag: Option<String>,
    pub planned_seconds: i64,
    pub actual_seconds: i64,
    pub completed: i64,
    pub started_at: String,
    pub ended_at: String,
    pub local_date: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActiveTimerRow {
    pub mode: String,
    pub is_running: bool,
    pub end_timestamp_ms: Option<i64>,
    pub remaining_ms: i64,
    pub planned_seconds: i64,
    pub elapsed_active_seconds: i64,
    pub cycle_count: i64,
    pub started_at: Option<String>,
    pub tag: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChartPoint {
    pub label: String,
    pub key: String,
    pub seconds: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HeatmapDay {
    pub date: String,
    pub seconds: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StatsResponse {
    pub total_focus_seconds: i64,
    pub sessions_completed: i64,
    pub daily_average_seconds: i64,
    pub longest_session_seconds: i64,
    pub best_day_date: Option<String>,
    pub best_day_seconds: i64,
    pub current_streak: i64,
    pub longest_streak: i64,
    pub today_focus_seconds: i64,
    pub chart_points: Vec<ChartPoint>,
    pub heatmap: Vec<HeatmapDay>,
    pub day_sessions: Vec<SessionRecord>,
    pub available_tags: Vec<String>,
}

pub fn init_db() -> SqlResult<DbState> {
    let app_data = std::env::var("APPDATA").unwrap_or_else(|_| ".".to_string());
    let db_dir = PathBuf::from(app_data).join("RDORO");
    fs::create_dir_all(&db_dir).ok();
    let db_path = db_dir.join("rdoro.db");

    let conn = Connection::open(db_path)?;
    conn.execute_batch(
        "PRAGMA journal_mode = WAL;
         PRAGMA synchronous = NORMAL;
         CREATE TABLE IF NOT EXISTS sessions (
             id INTEGER PRIMARY KEY AUTOINCREMENT,
             mode TEXT NOT NULL,
             tag TEXT,
             planned_seconds INTEGER NOT NULL,
             actual_seconds INTEGER NOT NULL,
             completed INTEGER NOT NULL,
             started_at TEXT NOT NULL,
             ended_at TEXT NOT NULL,
             local_date TEXT NOT NULL
         );
         CREATE INDEX IF NOT EXISTS idx_sessions_local_date ON sessions(local_date);
         CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
         CREATE TABLE IF NOT EXISTS active_timer (
             id INTEGER PRIMARY KEY CHECK(id = 1),
             mode TEXT NOT NULL,
             is_running INTEGER NOT NULL,
             end_timestamp_ms INTEGER,
             remaining_ms INTEGER NOT NULL,
             planned_seconds INTEGER NOT NULL,
             elapsed_active_seconds INTEGER NOT NULL,
             cycle_count INTEGER NOT NULL,
             started_at TEXT,
             tag TEXT
         );",
    )?;

    Ok(DbState { conn: Mutex::new(conn), db_dir })
}

#[tauri::command]
pub fn record_session(state: tauri::State<DbState>, session: SessionRecord) -> Result<i64, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO sessions (mode, tag, planned_seconds, actual_seconds, completed, started_at, ended_at, local_date)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![session.mode, session.tag, session.planned_seconds, session.actual_seconds, session.completed, session.started_at, session.ended_at, session.local_date],
    ).map_err(|e| e.to_string())?;
    Ok(conn.last_insert_rowid())
}

#[tauri::command]
pub fn delete_session(state: tauri::State<DbState>, id: i64) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM sessions WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn save_active_timer(state: tauri::State<DbState>, timer: Option<ActiveTimerRow>) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    match timer {
        Some(t) => {
            conn.execute(
                "INSERT INTO active_timer (id, mode, is_running, end_timestamp_ms, remaining_ms, planned_seconds, elapsed_active_seconds, cycle_count, started_at, tag)
                 VALUES (1, ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
                 ON CONFLICT(id) DO UPDATE SET mode=excluded.mode, is_running=excluded.is_running, end_timestamp_ms=excluded.end_timestamp_ms, remaining_ms=excluded.remaining_ms",
                params![t.mode, if t.is_running { 1 } else { 0 }, t.end_timestamp_ms, t.remaining_ms, t.planned_seconds, t.elapsed_active_seconds, t.cycle_count, t.started_at, t.tag],
            ).map_err(|e| e.to_string())?;
        }
        None => {
            conn.execute("DELETE FROM active_timer WHERE id = 1", []).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn save_settings_json(state: tauri::State<DbState>, json: String) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    conn.execute("INSERT INTO settings (key, value) VALUES ('app_settings', ?1) ON CONFLICT(key) DO UPDATE SET value = excluded.value", params![json]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn load_settings_json(state: tauri::State<DbState>) -> Result<Option<String>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT value FROM settings WHERE key = 'app_settings'").map_err(|e| e.to_string())?;
    let mut rows = stmt.query([]).map_err(|e| e.to_string())?;
    if let Some(row) = rows.next().map_err(|e| e.to_string())? {
        Ok(Some(row.get(0).map_err(|e| e.to_string())?))
    } else {
        Ok(None)
    }
}

#[tauri::command]
pub fn query_stats(
    state: tauri::State<DbState>,
    period: String,
    anchor_date: String,
    week_starts_monday: bool,
    include_breaks: bool,
    tag_filter: Option<String>,
) -> Result<StatsResponse, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let anchor = NaiveDate::parse_from_str(&anchor_date, "%Y-%m-%d").unwrap_or_else(|_| Local::now().date_naive());

    let (start_date, end_date, num_days) = match period.as_str() {
        "day" => (anchor, anchor, 1),
        "week" => {
            let weekday = anchor.weekday();
            let offset = if week_starts_monday { weekday.num_days_from_monday() } else { weekday.num_days_from_sunday() };
            let start = anchor - chrono::Duration::days(offset as i64);
            (start, start + chrono::Duration::days(6), 7)
        }
        "month" => {
            let start = NaiveDate::from_ymd_opt(anchor.year(), anchor.month(), 1).unwrap();
            let next_m = if anchor.month() == 12 {
                NaiveDate::from_ymd_opt(anchor.year() + 1, 1, 1).unwrap()
            } else {
                NaiveDate::from_ymd_opt(anchor.year(), anchor.month() + 1, 1).unwrap()
            };
            let end = next_m - chrono::Duration::days(1);
            (start, end, (end - start).num_days() + 1)
        }
        _ => {
            let start = NaiveDate::from_ymd_opt(anchor.year(), 1, 1).unwrap();
            let end = NaiveDate::from_ymd_opt(anchor.year(), 12, 31).unwrap();
            (start, end, (end - start).num_days() + 1)
        }
    };

    let mut stmt = conn.prepare(
        "SELECT id, mode, tag, planned_seconds, actual_seconds, completed, started_at, ended_at, local_date
         FROM sessions WHERE local_date >= ?1 AND local_date <= ?2 ORDER BY started_at ASC"
    ).map_err(|e| e.to_string())?;

    let rows = stmt.query_map(params![start_date.format("%Y-%m-%d").to_string(), end_date.format("%Y-%m-%d").to_string()], |row| {
        Ok(SessionRecord {
            id: Some(row.get(0)?), mode: row.get(1)?, tag: row.get(2)?, planned_seconds: row.get(3)?,
            actual_seconds: row.get(4)?, completed: row.get(5)?, started_at: row.get(6)?, ended_at: row.get(7)?, local_date: row.get(8)?,
        })
    }).map_err(|e| e.to_string())?;

    let tag_clean = tag_filter.filter(|t| !t.trim().is_empty());
    let mut period_sessions = Vec::new();
    for r in rows {
        let rec = r.map_err(|e| e.to_string())?;
        if let Some(ref tf) = tag_clean {
            if rec.tag.as_deref() != Some(tf.as_str()) { continue; }
        }
        period_sessions.push(rec);
    }

    let mut total_focus_seconds = 0i64;
    let mut sessions_completed = 0i64;
    let mut longest_session_seconds = 0i64;
    let mut by_day: std::collections::HashMap<String, i64> = std::collections::HashMap::new();

    for s in &period_sessions {
        if s.mode == "focus" || include_breaks {
            total_focus_seconds += s.actual_seconds;
            *by_day.entry(s.local_date.clone()).or_insert(0) += s.actual_seconds;
            if s.mode == "focus" && s.actual_seconds > longest_session_seconds {
                longest_session_seconds = s.actual_seconds;
            }
        }
        if s.mode == "focus" && s.completed == 1 {
            sessions_completed += 1;
        }
    }

    let mut chart_points = Vec::new();
    if period == "day" {
        let mut hours = [0i64; 24];
        for s in &period_sessions {
            if s.mode == "focus" || include_breaks {
                let h = chrono::DateTime::parse_from_rfc3339(&s.started_at).map(|dt| dt.time().hour() as usize).unwrap_or(0);
                if h < 24 { hours[h] += s.actual_seconds; }
            }
        }
        for h in 0..24 {
            chart_points.push(ChartPoint { label: format!("{:02}:00", h), key: format!("{:02}", h), seconds: hours[h] });
        }
    } else {
        for i in 0..num_days {
            let d = start_date + chrono::Duration::days(i);
            let ds = d.format("%Y-%m-%d").to_string();
            chart_points.push(ChartPoint { label: format!("{}", d.day()), key: ds.clone(), seconds: *by_day.get(&ds).unwrap_or(&0) });
        }
    }

    let today_str = Local::now().date_naive().format("%Y-%m-%d").to_string();
    let today_focus_seconds: i64 = conn.query_row(
        "SELECT COALESCE(SUM(actual_seconds), 0) FROM sessions WHERE mode = 'focus' AND local_date = ?1",
        params![today_str], |r| r.get(0)
    ).unwrap_or(0);

    let mut streak_stmt = conn.prepare("SELECT DISTINCT local_date FROM sessions WHERE mode = 'focus' AND completed = 1 ORDER BY local_date ASC").map_err(|e| e.to_string())?;
    let date_rows = streak_stmt.query_map([], |r| r.get::<_, String>(0)).map_err(|e| e.to_string())?;
    let mut completed_dates: Vec<NaiveDate> = Vec::new();
    let mut date_set: HashSet<NaiveDate> = HashSet::new();
    for dr in date_rows {
        if let Ok(s) = dr {
            if let Ok(nd) = NaiveDate::parse_from_str(&s, "%Y-%m-%d") {
                completed_dates.push(nd);
                date_set.insert(nd);
            }
        }
    }

    let mut longest_streak = 0i64;
    let mut running = 0i64;
    for i in 0..completed_dates.len() {
        running = if i == 0 || (completed_dates[i] - completed_dates[i - 1]).num_days() == 1 { running + 1 } else { 1 };
        if running > longest_streak { longest_streak = running; }
    }

    let today_nd = Local::now().date_naive();
    let mut current_streak = 0i64;
    let mut cursor = if date_set.contains(&today_nd) { today_nd } else { today_nd - chrono::Duration::days(1) };
    while date_set.contains(&cursor) {
        current_streak += 1;
        cursor -= chrono::Duration::days(1);
    }

    let mut day_stmt = conn.prepare(
        "SELECT id, mode, tag, planned_seconds, actual_seconds, completed, started_at, ended_at, local_date FROM sessions WHERE local_date = ?1 ORDER BY started_at DESC"
    ).map_err(|e| e.to_string())?;
    let day_iter = day_stmt.query_map(params![anchor_date], |row| {
        Ok(SessionRecord {
            id: Some(row.get(0)?), mode: row.get(1)?, tag: row.get(2)?, planned_seconds: row.get(3)?,
            actual_seconds: row.get(4)?, completed: row.get(5)?, started_at: row.get(6)?, ended_at: row.get(7)?, local_date: row.get(8)?,
        })
    }).map_err(|e| e.to_string())?;
    let mut day_sessions = Vec::new();
    for ds in day_iter { if let Ok(r) = ds { day_sessions.push(r); } }

    Ok(StatsResponse {
        total_focus_seconds,
        sessions_completed,
        daily_average_seconds: if num_days > 0 { total_focus_seconds / num_days } else { 0 },
        longest_session_seconds,
        best_day_date: None,
        best_day_seconds: 0,
        current_streak,
        longest_streak,
        today_focus_seconds,
        chart_points,
        heatmap: Vec::new(),
        day_sessions,
        available_tags: Vec::new(),
    })
}

#[tauri::command]
pub fn export_data(state: tauri::State<DbState>, format: String) -> Result<String, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT id, mode, tag, planned_seconds, actual_seconds, completed, started_at, ended_at, local_date FROM sessions ORDER BY started_at ASC").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| {
        Ok(SessionRecord {
            id: Some(row.get(0)?), mode: row.get(1)?, tag: row.get(2)?, planned_seconds: row.get(3)?,
            actual_seconds: row.get(4)?, completed: row.get(5)?, started_at: row.get(6)?, ended_at: row.get(7)?, local_date: row.get(8)?,
        })
    }).map_err(|e| e.to_string())?;
    let mut all = Vec::new();
    for r in rows { all.push(r.map_err(|e| e.to_string())?); }
    let ts = Local::now().format("%Y%m%d_%H%M%S").to_string();
    let file_path = state.db_dir.join(format!("rdoro_export_{}.{}", ts, format));
    let body = serde_json::to_string_pretty(&all).map_err(|e| e.to_string())?;
    fs::write(&file_path, body).map_err(|e| e.to_string())?;
    Ok(file_path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn open_data_folder(state: tauri::State<DbState>) -> Result<String, String> {
    let path_str = state.db_dir.to_string_lossy().to_string();
    #[cfg(target_os = "windows")]
    {
        let _ = std::process::Command::new("explorer").arg(&path_str).spawn();
    }
    Ok(path_str)
}