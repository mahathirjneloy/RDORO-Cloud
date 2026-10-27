interface SessionLog {
  id: string;
  course: string;
  mode: "focus" | "shortBreak" | "longBreak";
  startedAt: number;
  endedAt: number;
  durationSeconds: number;
  completed: boolean;
}

class SoundEngine {
  private ctx: AudioContext | null = null;
  public enabled = true;

  private initCtx() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    }
    if (this.ctx.state === "suspended") {
      this.ctx.resume();
    }
  }

  playBeep(freq = 600, duration = 0.08) {
    if (!this.enabled) return;
    try {
      this.initCtx();
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
      gain.gain.setValueAtTime(0.12, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    } catch { /* AudioContext safeguard */ }
  }

  playCompletionFanfare() {
    if (!this.enabled) return;
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
    notes.forEach((freq, idx) => {
      setTimeout(() => this.playBeep(freq, 0.22), idx * 130);
    });
  }
}

class RdoroApp {
  private mode: "focus" | "shortBreak" | "longBreak" = "focus";
  private running = false;
  private currentSubject = "EEE";
  private durations = { focus: 25 * 60, shortBreak: 5 * 60, longBreak: 15 * 60 };
  private remainingSeconds = 25 * 60;
  private timerStartTimestamp = 0;
  private initialTargetSeconds = 25 * 60;
  private timerInterval: number | null = null;
  private sessionCount = 1;

  private sound = new SoundEngine();
  private logs: SessionLog[] = [];

  constructor() {
    this.loadLogs();
    this.bindEvents();
    this.updateDisplay();
    this.renderQuickStatus();
  }

  private loadLogs() {
    try {
      const stored = localStorage.getItem("rdoro_logs");
      if (stored) this.logs = JSON.parse(stored);
    } catch {
      this.logs = [];
    }
  }

  private saveLogs() {
    localStorage.setItem("rdoro_logs", JSON.stringify(this.logs));
    this.renderQuickStatus();
  }

  private bindEvents() {
    // Mode tabs
    document.querySelectorAll<HTMLButtonElement>(".mode-tab").forEach(tab => {
      tab.addEventListener("click", () => {
        const mode = tab.dataset.mode as "focus" | "shortBreak" | "longBreak";
        this.switchMode(mode);
      });
    });

    // Subject chips
    document.querySelectorAll<HTMLButtonElement>(".chip").forEach(chip => {
      chip.addEventListener("click", () => {
        document.querySelectorAll(".chip").forEach(c => c.classList.remove("active"));
        chip.classList.add("active");
        this.currentSubject = chip.dataset.subject || "EEE";
        (document.getElementById("custom-subject") as HTMLInputElement).value = "";
        this.updateBadge();
        this.sound.playBeep(880, 0.05);
      });
    });

    // Custom subject
    const customSubInput = document.getElementById("custom-subject") as HTMLInputElement;
    customSubInput.addEventListener("input", (e) => {
      const val = (e.target as HTMLInputElement).value.trim();
      if (val) {
        document.querySelectorAll(".chip").forEach(c => c.classList.remove("active"));
        this.currentSubject = val;
        this.updateBadge();
      }
    });

    // Timer controls
    document.getElementById("btn-toggle")?.addEventListener("click", () => this.toggleTimer());
    document.getElementById("btn-stop-log")?.addEventListener("click", () => this.stopAndLogPartial());
    document.getElementById("btn-reset")?.addEventListener("click", () => this.resetTimer());
    document.getElementById("btn-skip")?.addEventListener("click", () => this.skipTimer());

    // Sound toggle
    document.getElementById("btn-sound-toggle")?.addEventListener("click", () => {
      this.sound.enabled = !this.sound.enabled;
      const btn = document.getElementById("btn-sound-toggle");
      if (btn) btn.style.opacity = this.sound.enabled ? "1" : "0.4";
      if (this.sound.enabled) this.sound.playBeep(700, 0.06);
    });

    // Analytics Modal open/close
    const modal = document.getElementById("analytics-modal");
    document.getElementById("btn-open-analytics")?.addEventListener("click", () => {
      modal?.classList.remove("hidden");
      this.renderAnalytics("day");
    });
    document.getElementById("btn-close-analytics")?.addEventListener("click", () => {
      modal?.classList.add("hidden");
    });

    // Modal Nav tabs
    document.querySelectorAll<HTMLButtonElement>(".nav-tab").forEach(tab => {
      tab.addEventListener("click", () => {
        document.querySelectorAll(".nav-tab").forEach(t => t.classList.remove("active"));
        tab.classList.add("active");
        const view = tab.dataset.view || "day";
        this.renderAnalytics(view);
      });
    });

    // Export / Data actions
    document.getElementById("btn-export-csv")?.addEventListener("click", () => this.exportCsv());
    document.getElementById("btn-export-json")?.addEventListener("click", () => this.exportJson());
    document.getElementById("btn-load-demo")?.addEventListener("click", () => this.loadDemoData());
    document.getElementById("btn-clear-logs")?.addEventListener("click", () => {
      if (confirm("Clear all tracked study records?")) {
        this.logs = [];
        this.saveLogs();
        this.renderAnalytics("history");
      }
    });

    // Keyboard shortcuts: Space = Toggle, A = Analytics, M = Mute
    window.addEventListener("keydown", (e) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.code === "Space") {
        e.preventDefault();
        this.toggleTimer();
      } else if (e.code === "KeyA") {
        modal?.classList.toggle("hidden");
        if (!modal?.classList.contains("hidden")) this.renderAnalytics("day");
      } else if (e.code === "KeyM") {
        this.sound.enabled = !this.sound.enabled;
        const btn = document.getElementById("btn-sound-toggle");
        if (btn) btn.style.opacity = this.sound.enabled ? "1" : "0.4";
      }
    });
  }

  private switchMode(mode: "focus" | "shortBreak" | "longBreak") {
    if (this.running) this.stopAndLogPartial(false);
    this.mode = mode;
    this.remainingSeconds = this.durations[mode];
    this.initialTargetSeconds = this.remainingSeconds;

    document.querySelectorAll(".mode-tab").forEach(tab => {
      tab.classList.toggle("active", (tab as HTMLElement).dataset.mode === mode);
    });

    this.updateDisplay();
    this.sound.playBeep(440, 0.05);
  }

  private toggleTimer() {
    if (this.running) {
      this.pauseTimer();
    } else {
      this.startTimer();
    }
  }

  private startTimer() {
    this.running = true;
    this.timerStartTimestamp = Date.now() - ((this.initialTargetSeconds - this.remainingSeconds) * 1000);
    const btn = document.getElementById("btn-toggle");
    if (btn) {
      btn.innerText = "Pause";
      btn.style.background = "#eab308";
    }

    if (this.timerInterval) clearInterval(this.timerInterval);
    this.timerInterval = window.setInterval(() => this.tick(), 250);
    this.sound.playBeep(520, 0.07);
  }

  private pauseTimer() {
    this.running = false;
    if (this.timerInterval) clearInterval(this.timerInterval);
    const btn = document.getElementById("btn-toggle");
    if (btn) {
      btn.innerText = "Start";
      btn.style.background = "";
    }
    this.sound.playBeep(380, 0.06);
  }

  private tick() {
    const elapsedSeconds = Math.floor((Date.now() - this.timerStartTimestamp) / 1000);
    this.remainingSeconds = Math.max(0, this.initialTargetSeconds - elapsedSeconds);
    this.updateDisplay();

    if (this.remainingSeconds <= 0) {
      this.completeSession();
    }
  }

  private completeSession() {
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.running = false;

    // Log complete session
    const log: SessionLog = {
      id: "log_" + Date.now(),
      course: this.currentSubject,
      mode: this.mode,
      startedAt: this.timerStartTimestamp,
      endedAt: Date.now(),
      durationSeconds: this.initialTargetSeconds,
      completed: true
    };
    this.logs.unshift(log);
    this.saveLogs();

    this.sound.playCompletionFanfare();
    alert(`RDORO: ${this.mode === "focus" ? "Focus session finished!" : "Break complete! Ready for next sprint."}`);

    if (this.mode === "focus") {
      this.sessionCount++;
      const counter = document.getElementById("session-counter-text");
      if (counter) counter.innerText = `Session #${this.sessionCount}`;
      this.switchMode(this.sessionCount % 4 === 0 ? "longBreak" : "shortBreak");
    } else {
      this.switchMode("focus");
    }
  }

  private stopAndLogPartial(alertUser = true) {
    if (!this.running && this.remainingSeconds === this.initialTargetSeconds) return;

    const elapsed = this.initialTargetSeconds - this.remainingSeconds;
    this.pauseTimer();

    if (elapsed > 10) {
      const log: SessionLog = {
        id: "log_" + Date.now(),
        course: this.currentSubject,
        mode: this.mode,
        startedAt: this.timerStartTimestamp,
        endedAt: Date.now(),
        durationSeconds: elapsed,
        completed: false
      };
      this.logs.unshift(log);
      this.saveLogs();
      if (alertUser) alert(`Saved partial session: ${Math.floor(elapsed / 60)}m ${elapsed % 60}s logged to ${this.currentSubject}.`);
    }

    this.remainingSeconds = this.durations[this.mode];
    this.initialTargetSeconds = this.remainingSeconds;
    this.updateDisplay();
  }

  private resetTimer() {
    this.pauseTimer();
    this.remainingSeconds = this.durations[this.mode];
    this.initialTargetSeconds = this.remainingSeconds;
    this.updateDisplay();
  }

  private skipTimer() {
    this.pauseTimer();
    if (this.mode === "focus") {
      this.switchMode("shortBreak");
    } else {
      this.switchMode("focus");
    }
  }

  private updateDisplay() {
    const mins = Math.floor(this.remainingSeconds / 60);
    const secs = this.remainingSeconds % 60;
    const str = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;

    const display = document.getElementById("timer-display");
    if (display) display.innerText = str;
    document.title = `${str} • ${this.currentSubject} - RDORO`;

    // Circular gauge
    const circle = document.getElementById("dial-progress") as SVGCircleElement | null;
    if (circle) {
      const totalLen = 880;
      const ratio = this.remainingSeconds / this.initialTargetSeconds;
      circle.style.strokeDashoffset = String(totalLen * (1 - ratio));
    }
  }

  private updateBadge() {
    const badge = document.getElementById("current-course-badge");
    if (badge) badge.innerText = this.currentSubject;
  }

  private renderQuickStatus() {
    const todayLogs = this.getLogsForDay(new Date());
    const totalSecs = todayLogs.reduce((acc, l) => acc + l.durationSeconds, 0);
    const h = Math.floor(totalSecs / 3600);
    const m = Math.floor((totalSecs % 3600) / 60);

    const quickToday = document.getElementById("quick-today-time");
    if (quickToday) quickToday.innerText = `${h}h ${String(m).padStart(2, "0")}m`;

    const streak = this.calculateStreak();
    const quickStreak = document.getElementById("quick-streak");
    if (quickStreak) quickStreak.innerText = `${streak} ${streak === 1 ? "day" : "days"}`;
  }

  private getLogsForDay(date: Date) {
    const y = date.getFullYear();
    const m = date.getMonth();
    const d = date.getDate();
    return this.logs.filter(l => {
      const dt = new Date(l.startedAt);
      return dt.getFullYear() === y && dt.getMonth() === m && dt.getDate() === d;
    });
  }

  private calculateStreak(): number {
    if (this.logs.length === 0) return 0;
    let streak = 0;
    const checkDate = new Date();
    while (true) {
      const dayLogs = this.getLogsForDay(checkDate);
      if (dayLogs.length > 0) {
        streak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        // If today has 0, but yesterday had focus, don't break streak immediately
        if (streak === 0) {
          checkDate.setDate(checkDate.getDate() - 1);
          const yesterdayLogs = this.getLogsForDay(checkDate);
          if (yesterdayLogs.length > 0) {
            streak++;
            checkDate.setDate(checkDate.getDate() - 1);
            continue;
          }
        }
        break;
      }
    }
    return streak;
  }

  private renderAnalytics(view: string) {
    document.querySelectorAll(".view-panel").forEach(p => p.classList.remove("active"));
    const activePanel = document.getElementById(`view-${view}`);
    if (activePanel) activePanel.classList.add("active");

    if (view === "day") this.renderDayView();
    if (view === "week") this.renderWeekView();
    if (view === "month") this.renderMonthView();
    if (view === "year") this.renderYearView();
    if (view === "history") this.renderHistoryTable();
  }

  private renderDayView() {
    const dayLogs = this.getLogsForDay(new Date());
    const totalSecs = dayLogs.reduce((acc, l) => acc + l.durationSeconds, 0);
    const completedCount = dayLogs.filter(l => l.completed).length;

    const totalEl = document.getElementById("kpi-day-total");
    const countEl = document.getElementById("kpi-day-count");
    const ratioEl = document.getElementById("kpi-day-ratio");

    if (totalEl) totalEl.innerText = `${Math.floor(totalSecs / 3600)}h ${Math.floor((totalSecs % 3600) / 60)}m ${totalSecs % 60}s`;
    if (countEl) countEl.innerText = String(dayLogs.length);
    if (ratioEl) ratioEl.innerText = dayLogs.length ? `${Math.round((completedCount / dayLogs.length) * 100)}%` : "0%";

    // Breakdown
    const byCourse: Record<string, number> = {};
    dayLogs.forEach(l => {
      byCourse[l.course] = (byCourse[l.course] || 0) + l.durationSeconds;
    });

    const breakdownEl = document.getElementById("day-course-breakdown");
    if (breakdownEl) {
      breakdownEl.innerHTML = "";
      Object.entries(byCourse).forEach(([course, secs]) => {
        const pct = totalSecs > 0 ? Math.round((secs / totalSecs) * 100) : 0;
        const row = document.createElement("div");
        row.className = "breakdown-row";
        row.innerHTML = `
          <div class="breakdown-info">
            <span>${course}</span>
            <span>${Math.floor(secs / 60)} mins (${pct}%)</span>
          </div>
          <div class="bar-track">
            <div class="bar-val" style="width: ${pct}%"></div>
          </div>
        `;
        breakdownEl.appendChild(row);
      });
      if (Object.keys(byCourse).length === 0) {
        breakdownEl.innerHTML = `<span style="font-size:0.85rem; color:var(--text-muted);">No study logs logged yet today.</span>`;
      }
    }
  }

  private renderWeekView() {
    const chart = document.getElementById("week-chart");
    if (!chart) return;
    chart.innerHTML = "";

    let weekSecs = 0;
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const now = new Date();

    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(now.getDate() - i);
      const logs = this.getLogsForDay(d);
      const daySec = logs.reduce((acc, l) => acc + l.durationSeconds, 0);
      weekSecs += daySec;
      const mins = Math.round(daySec / 60);

      const col = document.createElement("div");
      col.className = "chart-col";
      const heightPct = Math.min(100, Math.round((mins / 180) * 100)); // normalized to 3 hrs
      col.innerHTML = `
        <div class="chart-val-hint">${mins > 0 ? mins : ""}</div>
        <div class="chart-bar" style="height: ${Math.max(4, heightPct)}%"></div>
        <div class="chart-label">${days[d.getDay()]}</div>
      `;
      chart.appendChild(col);
    }

    const totalEl = document.getElementById("kpi-week-total");
    const avgEl = document.getElementById("kpi-week-avg");
    if (totalEl) totalEl.innerText = `${(weekSecs / 3600).toFixed(1)} hrs`;
    if (avgEl) avgEl.innerText = `${(weekSecs / 7 / 3600).toFixed(1)} hrs/day`;
  }

  private renderMonthView() {
    const grid = document.getElementById("month-heatmap-grid");
    if (!grid) return;
    grid.innerHTML = "";

    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    let monthSecs = 0;
    let activeDays = 0;

    for (let d = 1; d <= daysInMonth; d++) {
      const targetDate = new Date(now.getFullYear(), now.getMonth(), d);
      const logs = this.getLogsForDay(targetDate);
      const secs = logs.reduce((acc, l) => acc + l.durationSeconds, 0);
      const mins = Math.round(secs / 60);
      monthSecs += secs;
      if (mins > 0) activeDays++;

      let lvlClass = "";
      if (mins > 90) lvlClass = "lvl-3";
      else if (mins > 40) lvlClass = "lvl-2";
      else if (mins > 0) lvlClass = "lvl-1";

      const cell = document.createElement("div");
      cell.className = `cal-cell ${lvlClass}`;
      cell.innerHTML = `
        <span class="cal-date">${d}</span>
        <span class="cal-time">${mins > 0 ? mins + "m" : "-"}</span>
      `;
      grid.appendChild(cell);
    }

    const totalEl = document.getElementById("kpi-month-total");
    const activeEl = document.getElementById("kpi-month-days");
    if (totalEl) totalEl.innerText = `${(monthSecs / 3600).toFixed(1)} hrs`;
    if (activeEl) activeEl.innerText = `${activeDays} / ${daysInMonth} days`;
  }

  private renderYearView() {
    const grid = document.getElementById("year-months-grid");
    if (!grid) return;
    grid.innerHTML = "";

    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const now = new Date();
    let yearSecs = 0;

    months.forEach((name, idx) => {
      const monthLogs = this.logs.filter(l => {
        const d = new Date(l.startedAt);
        return d.getFullYear() === now.getFullYear() && d.getMonth() === idx;
      });
      const secs = monthLogs.reduce((acc, l) => acc + l.durationSeconds, 0);
      yearSecs += secs;

      const box = document.createElement("div");
      box.className = "month-box";
      box.innerHTML = `
        <div class="month-name">${name}</div>
        <div class="month-time">${(secs / 3600).toFixed(1)}h</div>
      `;
      grid.appendChild(box);
    });

    const totalEl = document.getElementById("kpi-year-total");
    const streakEl = document.getElementById("kpi-year-streak");
    if (totalEl) totalEl.innerText = `${(yearSecs / 3600).toFixed(1)} hrs`;
    if (streakEl) streakEl.innerText = `${this.calculateStreak()} days`;
  }

  private renderHistoryTable() {
    const tbody = document.getElementById("logs-tbody");
    if (!tbody) return;
    tbody.innerHTML = "";

    this.logs.forEach(l => {
      const d = new Date(l.startedAt);
      const dateStr = `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      const mins = Math.floor(l.durationSeconds / 60);
      const secs = l.durationSeconds % 60;

      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${dateStr}</td>
        <td><strong>${l.course}</strong></td>
        <td>${l.mode}</td>
        <td>${mins}m ${secs}s</td>
        <td style="color:${l.completed ? 'var(--accent)' : 'var(--text-muted)'}">${l.completed ? 'Completed' : 'Partial'}</td>
      `;
      tbody.appendChild(row);
    });
  }

  private exportCsv() {
    if (this.logs.length === 0) return alert("No logs to export!");
    let csv = "ID,Course,Mode,StartedAt,EndedAt,DurationSeconds,Completed\n";
    this.logs.forEach(l => {
      csv += `"${l.id}","${l.course}","${l.mode}","${new Date(l.startedAt).toISOString()}","${new Date(l.endedAt).toISOString()}",${l.durationSeconds},${l.completed}\n`;
    });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rdoro-study-records-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  private exportJson() {
    if (this.logs.length === 0) return alert("No logs to export!");
    const blob = new Blob([JSON.stringify(this.logs, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rdoro-backup-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  private loadDemoData() {
    const demoSubjects = ["EEE", "MAT", "CSE", "CHE 101"];
    const demoLogs: SessionLog[] = [];
    const now = Date.now();

    for (let dayOffset = 25; dayOffset >= 0; dayOffset--) {
      const dayBase = now - dayOffset * 86400000;
      const sessionsToday = Math.floor(Math.random() * 4) + 1;
      for (let s = 0; s < sessionsToday; s++) {
        const start = dayBase + s * 3600000;
        const dur = (Math.floor(Math.random() * 20) + 15) * 60; // 15 to 35 mins
        demoLogs.push({
          id: "demo_" + Math.random().toString(36).substr(2, 9),
          course: demoSubjects[Math.floor(Math.random() * demoSubjects.length)],
          mode: "focus",
          startedAt: start,
          endedAt: start + dur * 1000,
          durationSeconds: dur,
          completed: Math.random() > 0.2
        });
      }
    }
    this.logs = demoLogs;
    this.saveLogs();
    this.renderAnalytics("day");
    alert("Loaded 25 days of realistic study sessions across EEE, MAT, CSE, and CHE 101!");
  }
}

// Bootstrap
window.addEventListener("DOMContentLoaded", () => {
  new RdoroApp();
});