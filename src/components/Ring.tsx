import { formatMinutesSeconds } from "../timerEngine";

interface RingProps {
  remainingMs: number;
  totalMs: number;
  isRunning: boolean;
  cycleCount: number;
  sessionsUntilLongBreak: number;
  tag: string;
  recentTags: string[];
  onChangeTag: (tag: string) => void;
}

export function Ring({
  remainingMs, totalMs, isRunning, cycleCount, sessionsUntilLongBreak, tag, recentTags, onChangeTag
}: RingProps) {
  const { mm, ss } = formatMinutesSeconds(remainingMs);
  const ratio = totalMs > 0 ? Math.min(1, Math.max(0, remainingMs / totalMs)) : 1;
  const size = 280;
  const strokeWidth = 8.5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - ratio);
  const dots = Array.from({ length: sessionsUntilLongBreak }, (_, i) => i < cycleCount);

  return (
    <div class="ring-stage">
      <div class={`ring-wrapper ${isRunning ? "running" : ""}`}>
        <svg class="ring-svg" viewBox={`0 0 ${size} ${size}`}>
          <circle class="ring-track" cx={size / 2} cy={size / 2} r={radius} stroke-width={strokeWidth} />
          <circle class="ring-progress" cx={size / 2} cy={size / 2} r={radius} stroke-width={strokeWidth} stroke-dasharray={circumference} stroke-dashoffset={dashOffset} />
        </svg>
        <div class="ring-center-content">
          <div class="time-readout">
            <span>{mm}</span>
            <span class={`time-colon ${isRunning ? "blink" : ""}`}>:</span>
            <span>{ss}</span>
          </div>
          <div class="session-dots">
            {dots.map((filled, idx) => (
              <span key={idx} class={`session-dot ${filled ? "filled" : ""}`} />
            ))}
          </div>
        </div>
      </div>
      <div class="tag-pill-bar">
        <input
          type="text"
          class="tag-input"
          list="recent-tags-list"
          placeholder="Add subject tag..."
          value={tag}
          onInput={(e) => onChangeTag((e.target as HTMLInputElement).value)}
        />
        <datalist id="recent-tags-list">
          {recentTags.map((t) => <option key={t} value={t} />)}
        </datalist>
      </div>
    </div>
  );
}