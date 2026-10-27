import { formatMinutesSeconds } from "../timerEngine";
import { TimerMode } from "../types";
import { TitleBar } from "./TitleBar";

interface MiniModeProps {
  mode: TimerMode;
  remainingMs: number;
  totalMs: number;
  isRunning: boolean;
  onToggleStart: () => void;
  onSkip: () => void;
  onExitMini: () => void;
}

export function MiniMode({ mode, remainingMs, totalMs, isRunning, onToggleStart, onSkip, onExitMini }: MiniModeProps) {
  const { mm, ss } = formatMinutesSeconds(remainingMs);
  const progressPct = totalMs > 0 ? Math.min(100, Math.max(0, ((totalMs - remainingMs) / totalMs) * 100)) : 0;
  const modeLabel = mode === "focus" ? "Focus" : mode === "short" ? "Short Break" : "Long Break";

  return (
    <div class="mini-shell">
      <TitleBar titleText={`RDORO • ${modeLabel}`} isMini={true} onToggleMini={onExitMini} />
      <div class="mini-main">
        <div>
          <div style={{ fontSize: "12px", color: "var(--accent)", fontWeight: 600 }}>{modeLabel}</div>
          <div class="mini-time">{mm} : {ss}</div>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button type="button" class="icon-circle-btn" style={{ backgroundColor: "var(--accent)", color: "var(--on-accent)" }} onClick={onToggleStart}>
            {isRunning ? "||" : "▶"}
          </button>
          <button type="button" class="icon-circle-btn" onClick={onSkip}>⏭</button>
        </div>
      </div>
      <div class="mini-progress-track">
        <div class="mini-progress-bar" style={{ width: `${progressPct}%` }} />
      </div>
    </div>
  );
}