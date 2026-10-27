export type TimerMode = "focus" | "short" | "long";
export type SoundPreset = "bell" | "marimba" | "chord";

export interface AppSettings {
  focusMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  sessionsUntilLongBreak: number;
  autoStartBreaks: boolean;
  autoStartFocus: boolean;
  countPartialSessions: boolean;
  dailyGoalMinutes: number;
  desktopNotifications: boolean;
  soundEnabled: boolean;
  soundVolume: number;
  soundPreset: SoundPreset;
  tickSound: boolean;
  alwaysOnTop: boolean;
  closeToTray: boolean;
  startWithWindows: boolean;
  startMinimized: boolean;
  globalShortcut: string;
  weekStartsMonday: boolean;
  use24HourTime: boolean;
  rethemeByMode: boolean;
  reduceMotion: boolean;
  uiScale: 90 | 100 | 110 | 125;
}

export const DEFAULT_SETTINGS: AppSettings = {
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  sessionsUntilLongBreak: 4,
  autoStartBreaks: false,
  autoStartFocus: false,
  countPartialSessions: true,
  dailyGoalMinutes: 120,
  desktopNotifications: true,
  soundEnabled: true,
  soundVolume: 75,
  soundPreset: "bell",
  tickSound: false,
  alwaysOnTop: false,
  closeToTray: true,
  startWithWindows: false,
  startMinimized: false,
  globalShortcut: "Ctrl+Alt+P",
  weekStartsMonday: true,
  use24HourTime: true,
  rethemeByMode: true,
  reduceMotion: false,
  uiScale: 100,
};

export interface SessionRecord {
  id?: number;
  mode: TimerMode;
  tag: string | null;
  planned_seconds: number;
  actual_seconds: number;
  completed: 0 | 1;
  started_at: string;
  ended_at: string;
  local_date: string;
}

export interface ActiveTimerPersistence {
  mode: TimerMode;
  is_running: boolean;
  end_timestamp_ms: number | null;
  remaining_ms: number;
  planned_seconds: number;
  elapsed_active_seconds: number;
  cycle_count: number;
  started_at: string | null;
  tag: string | null;
}

export interface ChartPoint {
  label: string;
  key: string;
  seconds: number;
}

export interface HeatmapDay {
  date: string;
  seconds: number;
}

export interface StatsResponse {
  total_focus_seconds: number;
  sessions_completed: number;
  daily_average_seconds: number;
  longest_session_seconds: number;
  best_day_date: string | null;
  best_day_seconds: number;
  current_streak: number;
  longest_streak: number;
  today_focus_seconds: number;
  chart_points: ChartPoint[];
  heatmap: HeatmapDay[];
  day_sessions: SessionRecord[];
  available_tags: string[];
}