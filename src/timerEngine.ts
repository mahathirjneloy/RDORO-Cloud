import { AppSettings, TimerMode } from "./types";

export function getModeDurationSeconds(mode: TimerMode, settings: AppSettings): number {
  switch (mode) {
    case "focus": return Math.max(1, Math.min(180, settings.focusMinutes)) * 60;
    case "short": return Math.max(1, Math.min(180, settings.shortBreakMinutes)) * 60;
    case "long": return Math.max(1, Math.min(180, settings.longBreakMinutes)) * 60;
  }
}

export function computeRemainingMs(endTimestampMs: number, nowMs: number): number {
  return Math.max(0, endTimestampMs - nowMs);
}

export function computeNextPhase(
  currentMode: TimerMode,
  currentCycleCount: number,
  wasCompleted: boolean,
  settings: AppSettings
) {
  const targetCycles = Math.max(2, Math.min(10, settings.sessionsUntilLongBreak));
  if (currentMode === "focus") {
    const updatedCount = wasCompleted ? currentCycleCount + 1 : currentCycleCount;
    if (updatedCount >= targetCycles) {
      return { nextMode: "long" as TimerMode, nextCycleCount: updatedCount, shouldAutoStart: settings.autoStartBreaks };
    }
    return { nextMode: "short" as TimerMode, nextCycleCount: updatedCount, shouldAutoStart: settings.autoStartBreaks };
  }
  const resetCount = currentMode === "long" ? 0 : currentCycleCount;
  return { nextMode: "focus" as TimerMode, nextCycleCount: resetCount, shouldAutoStart: settings.autoStartFocus };
}

export function formatMinutesSeconds(ms: number): { mm: string; ss: string } {
  const totalSeconds = Math.ceil(ms / 1000);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return { mm: String(mins).padStart(2, "0"), ss: String(secs).padStart(2, "0") };
}

export function formatDurationHuman(totalSeconds: number): string {
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  return hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
}

export function toLocalIsoWithOffset(date: Date): { iso: string; localDate: string } {
  const pad = (n: number) => String(Math.floor(Math.abs(n))).padStart(2, "0");
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const mins = pad(date.getMinutes());
  const secs = pad(date.getSeconds());
  const tzOffsetMin = -date.getTimezoneOffset();
  const sign = tzOffsetMin >= 0 ? "+" : "-";
  const offH = pad(Math.floor(Math.abs(tzOffsetMin) / 60));
  const offM = pad(Math.abs(tzOffsetMin) % 60);
  return {
    iso: `${year}-${month}-${day}T${hours}:${mins}:${secs}${sign}${offH}:${offM}`,
    localDate: `${year}-${month}-${day}`,
  };
}