import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { LogicalSize, getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useRef, useState } from "preact/hooks";
import { playCompletionSound, playSoftTick } from "./audio";
import { Controls } from "./components/Controls";
import { Header } from "./components/Header";
import { MiniMode } from "./components/MiniMode";
import { ModeTabs } from "./components/ModeTabs";
import { Ring } from "./components/Ring";
import { Settings } from "./components/Settings";
import { Stats } from "./components/Stats";
import { TitleBar } from "./components/TitleBar";
import { computeNextPhase, computeRemainingMs, formatMinutesSeconds, getModeDurationSeconds, toLocalIsoWithOffset } from "./timerEngine";
import { ActiveTimerPersistence, AppSettings, DEFAULT_SETTINGS, SessionRecord, TimerMode } from "./types";

export function App() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [mode, setMode] = useState<TimerMode>("focus");
  const [isRunning, setIsRunning] = useState(false);
  const [remainingMs, setRemainingMs] = useState(25 * 60 * 1000);
  const [plannedSeconds, setPlannedSeconds] = useState(25 * 60);
  const [cycleCount, setCycleCount] = useState(0);
  const [tag, setTag] = useState("");
  const [recentTags, setRecentTags] = useState<string[]>([]);
  const [activeView, setActiveView] = useState<"timer" | "stats" | "settings">("timer");
  const [isMini, setIsMini] = useState(false);

  const endTimestampRef = useRef<number | null>(null);
  const startedAtIsoRef = useRef<string | null>(null);
  const startedLocalDateRef = useRef<string | null>(null);
  const accumulatedActiveSecRef = useRef<number>(0);
  const lastResumeMsRef = useRef<number | null>(null);
  const lastWholeSecondRef = useRef<number>(-1);

  useEffect(() => {
    document.documentElement.setAttribute("data-mode", settings.rethemeByMode ? mode : "focus");
  }, [mode, settings.rethemeByMode]);

  useEffect(() => {
    (async () => {
      const savedJson = await invoke<string | null>("load_settings_json");
      if (savedJson) {
        try {
          const parsed = { ...DEFAULT_SETTINGS, ...JSON.parse(savedJson) };
          setSettings(parsed);
          const secs = getModeDurationSeconds("focus", parsed);
          setPlannedSeconds(secs);
          setRemainingMs(secs * 1000);
        } catch {}
      }
    })();
  }, []);

  const logSessionIfEligible = async (completed: 0 | 1) => {
    let totalActive = accumulatedActiveSecRef.current;
    if (lastResumeMsRef.current !== null) {
      totalActive += Math.round((Date.now() - lastResumeMsRef.current) / 1000);
      lastResumeMsRef.current = null;
    }
    const actualSec = completed === 1 ? plannedSeconds : Math.min(plannedSeconds, totalActive);
    if (completed === 0 && (!settings.countPartialSessions || actualSec < 60)) return;
    const { iso, localDate } = toLocalIsoWithOffset(new Date());
    const rec: SessionRecord = {
      mode, tag: tag.trim() || null, planned_seconds: plannedSeconds, actual_seconds: actualSec,
      completed, started_at: startedAtIsoRef.current || iso, ended_at: iso,
      local_date: startedLocalDateRef.current || localDate,
    };
    await invoke("record_session", { session: rec });
    if (tag.trim() && !recentTags.includes(tag.trim())) {
      setRecentTags((prev) => [tag.trim(), ...prev].slice(0, 10));
    }
  };

  const completePhase = async (wasCompleted: boolean) => {
    setIsRunning(false);
    endTimestampRef.current = null;
    await invoke("set_rust_watchdog", { endTimestampMs: null });
    await logSessionIfEligible(wasCompleted ? 1 : 0);

    if (wasCompleted) {
      if (settings.soundEnabled) playCompletionSound(settings.soundPreset, settings.soundVolume);
      await invoke("notify_phase_complete", {
        title: mode === "focus" ? "Focus complete" : "Break complete",
        body: mode === "focus" ? "Great work! Time for a break." : "Ready for your next focus session.",
        enableToast: settings.desktopNotifications,
      });
    }

    const { nextMode, nextCycleCount, shouldAutoStart } = computeNextPhase(mode, cycleCount, wasCompleted, settings);
    const nextSecs = getModeDurationSeconds(nextMode, settings);
    setMode(nextMode);
    setCycleCount(nextCycleCount);
    setPlannedSeconds(nextSecs);
    setRemainingMs(nextSecs * 1000);
    accumulatedActiveSecRef.current = 0;
    startedAtIsoRef.current = null;
    startedLocalDateRef.current = null;

    if (shouldAutoStart) {
      startCountdown(nextMode, nextSecs * 1000, nextSecs, nextCycleCount);
    } else {
      await invoke("save_active_timer", { timer: null });
      await invoke("sync_taskbar_progress", { running: false, progressPercent: null });
    }
  };

  const startCountdown = (targetMode = mode, remMs = remainingMs, planSec = plannedSeconds, cycles = cycleCount) => {
    const now = Date.now();
    const targetEnd = now + remMs;
    endTimestampRef.current = targetEnd;
    lastResumeMsRef.current = now;
    if (!startedAtIsoRef.current) {
      const { iso, localDate } = toLocalIsoWithOffset(new Date());
      startedAtIsoRef.current = iso;
      startedLocalDateRef.current = localDate;
    }
    setIsRunning(true);
    invoke("set_rust_watchdog", { endTimestampMs: targetEnd });
    invoke("save_active_timer", {
      timer: {
        mode: targetMode, is_running: true, end_timestamp_ms: targetEnd, remaining_ms: remMs,
        planned_seconds: planSec, elapsed_active_seconds: accumulatedActiveSecRef.current,
        cycle_count: cycles, started_at: startedAtIsoRef.current, tag: tag || null,
      } satisfies ActiveTimerPersistence,
    });
  };

  const pauseCountdown = () => {
    if (!isRunning || !endTimestampRef.current) return;
    const now = Date.now();
    const rem = computeRemainingMs(endTimestampRef.current, now);
    if (lastResumeMsRef.current !== null) {
      accumulatedActiveSecRef.current += Math.round((now - lastResumeMsRef.current) / 1000);
      lastResumeMsRef.current = null;
    }
    endTimestampRef.current = null;
    setIsRunning(false);
    setRemainingMs(rem);
    invoke("set_rust_watchdog", { endTimestampMs: null });
  };

  const handleToggleStart = () => (isRunning ? pauseCountdown() : startCountdown());

  const handleReset = () => {
    setIsRunning(false);
    endTimestampRef.current = null;
    lastResumeMsRef.current = null;
    accumulatedActiveSecRef.current = 0;
    const fullSecs = getModeDurationSeconds(mode, settings);
    setPlannedSeconds(fullSecs);
    setRemainingMs(fullSecs * 1000);
    invoke("set_rust_watchdog", { endTimestampMs: null });
    invoke("sync_taskbar_progress", { running: false, progressPercent: null });
  };

  const selectMode = (target: TimerMode) => {
    if (target === mode) return;
    setIsRunning(false);
    endTimestampRef.current = null;
    const nextSecs = getModeDurationSeconds(target, settings);
    setMode(target);
    setPlannedSeconds(nextSecs);
    setRemainingMs(nextSecs * 1000);
  };

  useEffect(() => {
    if (!isRunning) return;
    const id = window.setInterval(() => {
      if (!endTimestampRef.current) return;
      const rem = computeRemainingMs(endTimestampRef.current, Date.now());
      setRemainingMs(rem);
      const wholeSec = Math.ceil(rem / 1000);
      if (wholeSec !== lastWholeSecondRef.current) {
        lastWholeSecondRef.current = wholeSec;
        if (settings.tickSound && wholeSec > 0) playSoftTick(settings.soundVolume);
        const { mm, ss } = formatMinutesSeconds(rem);
        getCurrentWindow().setTitle(`${mm}:${ss} - ${mode.toUpperCase()}`);
        const pct = Math.round(((plannedSeconds * 1000 - rem) / (plannedSeconds * 1000)) * 100);
        invoke("sync_taskbar_progress", { running: true, progressPercent: pct });
      }
      if (rem <= 0) completePhase(true);
    }, 250);
    return () => clearInterval(id);
  }, [isRunning, mode, plannedSeconds, settings]);

  useEffect(() => {
    const u1 = listen("global-shortcut-toggle", () => handleToggleStart());
    const u2 = listen("rust-timer-expired", () => { if (isRunning) completePhase(true); });
    const u3 = listen<string>("tray-action", (ev) => {
      if (ev.payload === "toggle") handleToggleStart();
      else if (ev.payload === "skip") completePhase(false);
      else if (ev.payload === "mode:focus") selectMode("focus");
      else if (ev.payload === "mode:short") selectMode("short");
      else if (ev.payload === "mode:long") selectMode("long");
    });
    return () => { u1.then((f) => f()); u2.then((f) => f()); u3.then((f) => f()); };
  });

  const toggleMiniMode = async () => {
    const win = getCurrentWindow();
    const next = !isMini;
    setIsMini(next);
    if (next) {
      await win.setMinSize(new LogicalSize(280, 140));
      await win.setSize(new LogicalSize(300, 150));
      await win.setAlwaysOnTop(true);
    } else {
      await win.setMinSize(new LogicalSize(380, 640));
      await win.setSize(new LogicalSize(460, 780));
      await win.setAlwaysOnTop(settings.alwaysOnTop);
    }
  };

  const handleUpdateSettings = async (patch: Partial<AppSettings>) => {
    const updated = { ...settings, ...patch };
    setSettings(updated);
    await invoke("save_settings_json", { json: JSON.stringify(updated) });
    if (!isRunning && remainingMs === plannedSeconds * 1000) {
      const nextSecs = getModeDurationSeconds(mode, updated);
      setPlannedSeconds(nextSecs);
      setRemainingMs(nextSecs * 1000);
    }
  };

  if (isMini) {
    return (
      <MiniMode mode={mode} remainingMs={remainingMs} totalMs={plannedSeconds * 1000} isRunning={isRunning}
        onToggleStart={handleToggleStart} onSkip={() => completePhase(false)} onExitMini={toggleMiniMode} />
    );
  }

  const { mm, ss } = formatMinutesSeconds(remainingMs);
  return (
    <div class="app-shell">
      <TitleBar titleText={isRunning ? `${mm}:${ss} • ${mode.toUpperCase()}` : "RDORO"} isMini={false} onToggleMini={toggleMiniMode} />
      <main class="main-stage">
        <Header onOpenStats={() => setActiveView("stats")} onOpenSettings={() => setActiveView("settings")} />
        <ModeTabs mode={mode} onSelectMode={selectMode} />
        <Ring remainingMs={remainingMs} totalMs={plannedSeconds * 1000} isRunning={isRunning} cycleCount={cycleCount}
          sessionsUntilLongBreak={settings.sessionsUntilLongBreak} tag={tag} recentTags={recentTags} onChangeTag={setTag} />
        <Controls isRunning={isRunning} isPausedMidSession={!isRunning && remainingMs < plannedSeconds * 1000}
          onToggleStart={handleToggleStart} onReset={handleReset} onSkip={() => completePhase(false)} />
      </main>
      {activeView === "stats" && <Stats settings={settings} onClose={() => setActiveView("timer")} />}
      {activeView === "settings" && <Settings settings={settings} onUpdate={handleUpdateSettings} onClose={() => setActiveView("timer")} />}
    </div>
  );
}