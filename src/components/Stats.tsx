import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "preact/hooks";
import { formatDurationHuman, toLocalIsoWithOffset } from "../timerEngine";
import { AppSettings, SessionRecord, StatsResponse } from "../types";

interface StatsProps {
  settings: AppSettings;
  onClose: () => void;
}

type PeriodType = "day" | "week" | "month" | "year";

export function Stats({ settings, onClose }: StatsProps) {
  const [period, setPeriod] = useState<PeriodType>("day");
  const [anchorDate, setAnchorDate] = useState<string>(() => toLocalIsoWithOffset(new Date()).localDate);
  const [includeBreaks, setIncludeBreaks] = useState(false);
  const [tagFilter, setTagFilter] = useState("ALL");
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [manualMinutes, setManualMinutes] = useState(25);
  const [manualTag, setManualTag] = useState("");

  const fetchStats = async () => {
    try {
      const res = await invoke<StatsResponse>("query_stats", {
        period, anchorDate, weekStartsMonday: settings.weekStartsMonday, includeBreaks,
        tagFilter: tagFilter === "ALL" ? null : tagFilter,
      });
      setStats(res);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => { fetchStats(); }, [period, anchorDate, includeBreaks, tagFilter, settings.weekStartsMonday]);

  const shiftDate = (dir: -1 | 1) => {
    const d = new Date(anchorDate + "T12:00:00");
    if (period === "day") d.setDate(d.getDate() + dir);
    else if (period === "week") d.setDate(d.getDate() + dir * 7);
    else if (period === "month") d.setMonth(d.getMonth() + dir);
    else d.setFullYear(d.getFullYear() + dir);
    setAnchorDate(toLocalIsoWithOffset(d).localDate);
  };

  const handleManualAdd = async () => {
    const secs = Math.max(1, manualMinutes) * 60;
    const { iso } = toLocalIsoWithOffset(new Date());
    const rec: SessionRecord = {
      mode: "focus", tag: manualTag.trim() || null, planned_seconds: secs, actual_seconds: secs,
      completed: 1, started_at: iso, ended_at: iso, local_date: anchorDate,
    };
    await invoke("record_session", { session: rec });
    setShowAddModal(false);
    setManualTag("");
    fetchStats();
  };

  const maxChartSec = stats ? Math.max(60, ...stats.chart_points.map((p) => p.seconds)) : 60;
  const goalSeconds = settings.dailyGoalMinutes * 60;
  const goalPct = stats && goalSeconds > 0 ? Math.min(100, Math.round((stats.today_focus_seconds / goalSeconds) * 100)) : 0;

  return (
    <section class="drawer-view">
      <div class="drawer-header">
        <button type="button" class="icon-circle-btn" onClick={onClose}>←</button>
        <h2 class="drawer-title">Study Tracker</h2>
        <button type="button" class="pill-btn" onClick={() => setAnchorDate(toLocalIsoWithOffset(new Date()).localDate)}>Today</button>
      </div>

      <div class="mode-tabs" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
        <div class="mode-pill-slider" style={{ width: "calc((100% - 12px) / 4)", transform: `translateX(${["day", "week", "month", "year"].indexOf(period) * 100}%)` }} />
        {(["day", "week", "month", "year"] as PeriodType[]).map((p) => (
          <button key={p} type="button" class={`mode-tab-btn ${period === p ? "active" : ""}`} onClick={() => setPeriod(p)}>
            {p[0].toUpperCase() + p.slice(1)}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "10px", gap: "8px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <button type="button" class="pill-btn" onClick={() => shiftDate(-1)}>Prev</button>
          <span style={{ fontSize: "13px", fontWeight: 600 }}>{anchorDate}</span>
          <button type="button" class="pill-btn" onClick={() => shiftDate(1)}>Next</button>
        </div>
        <div style={{ display: "flex", gap: "6px" }}>
          <select class="select-pill" value={tagFilter} onChange={(e) => setTagFilter((e.target as HTMLSelectElement).value)}>
            <option value="ALL">All tags</option>
            {stats?.available_tags.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <button type="button" class={`pill-btn ${includeBreaks ? "accent" : ""}`} onClick={() => setIncludeBreaks(!includeBreaks)}>+Breaks</button>
        </div>
      </div>

      {stats && (
        <>
          <div class="stats-grid">
            <div class="summary-card"><span class="summary-label">Total Focus Time</span><span class="summary-value">{formatDurationHuman(stats.total_focus_seconds)}</span></div>
            <div class="summary-card"><span class="summary-label">Sessions Completed</span><span class="summary-value">{stats.sessions_completed}</span></div>
            <div class="summary-card"><span class="summary-label">Daily Average</span><span class="summary-value">{formatDurationHuman(stats.daily_average_seconds)}</span></div>
            <div class="summary-card"><span class="summary-label">Longest Session</span><span class="summary-value">{formatDurationHuman(stats.longest_session_seconds)}</span></div>
            <div class="summary-card"><span class="summary-label">Current / Best Streak</span><span class="summary-value">{stats.current_streak}d / {stats.longest_streak}d</span></div>
            <div class="summary-card"><span class="summary-label">Today Goal ({settings.dailyGoalMinutes}m)</span><span class="summary-value">{goalPct}%</span></div>
          </div>

          <div class="chart-card">
            <svg width="100%" height="140" viewBox="0 0 380 140">
              {stats.chart_points.map((pt, idx) => {
                const count = stats.chart_points.length;
                const slotW = 380 / count;
                const barW = Math.max(4, Math.min(18, slotW * 0.65));
                const x = idx * slotW + (slotW - barW) / 2;
                const h = Math.max(2, (pt.seconds / maxChartSec) * 110);
                return (
                  <g key={pt.key}>
                    <rect x={x} y={120 - h} width={barW} height={h} rx={Math.min(4, barW / 2)} fill="var(--accent)" opacity={pt.seconds > 0 ? 0.92 : 0.18}>
                      <title>{`${pt.label}: ${formatDurationHuman(pt.seconds)}`}</title>
                    </rect>
                  </g>
                );
              })}
            </svg>
          </div>

          <div class="chart-card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
              <span style={{ fontSize: "13px", fontWeight: 600 }}>Sessions on {anchorDate}</span>
              <button type="button" class="pill-btn accent" onClick={() => setShowAddModal(true)}>+ Add Session</button>
            </div>
            {stats.day_sessions.length === 0 ? (
              <div style={{ fontSize: "13px", color: "var(--text-muted)", padding: "14px 0", textAlign: "center" }}>
                No focus sessions yet - start your first one
              </div>
            ) : (
              stats.day_sessions.map((s) => (
                <div key={s.id} class="setting-row">
                  <div>
                    <div style={{ fontWeight: 600, fontSize: "13px" }}>{s.mode.toUpperCase()} {s.tag ? `• ${s.tag}` : ""}</div>
                    <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>{s.started_at.slice(11, 16)} • {formatDurationHuman(s.actual_seconds)}</div>
                  </div>
                  <button type="button" class="pill-btn" onClick={async () => { await invoke("delete_session", { id: s.id }); fetchStats(); }}>Delete</button>
                </div>
              ))
            )}
          </div>

          <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
            <button type="button" class="pill-btn" onClick={async () => setStatusMsg("Exported: " + await invoke<string>("export_data", { format: "csv" }))}>Export CSV</button>
            <button type="button" class="pill-btn" onClick={async () => setStatusMsg("Exported: " + await invoke<string>("export_data", { format: "json" }))}>Export JSON</button>
          </div>
          {statusMsg && <div style={{ fontSize: "12px", color: "var(--accent)", marginTop: "8px" }}>{statusMsg}</div>}
        </>
      )}

      {showAddModal && (
        <div class="modal-backdrop">
          <div class="modal-card">
            <h3 style={{ fontSize: "16px" }}>Log Manual Focus Session</h3>
            <div class="setting-row">
              <span>Duration (minutes)</span>
              <input type="number" class="stepper-input" value={manualMinutes} onInput={(e) => setManualMinutes(Number((e.target as HTMLInputElement).value))} />
            </div>
            <div class="setting-row">
              <span>Subject Tag</span>
              <input type="text" class="stepper-input" value={manualTag} onInput={(e) => setManualTag((e.target as HTMLInputElement).value)} />
            </div>
            <div class="modal-actions">
              <button type="button" class="pill-btn" onClick={() => setShowAddModal(false)}>Cancel</button>
              <button type="button" class="pill-btn accent" onClick={handleManualAdd}>Save</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}