interface ControlsProps {
  isRunning: boolean;
  isPausedMidSession: boolean;
  onToggleStart: () => void;
  onReset: () => void;
  onSkip: () => void;
}

export function Controls({ isRunning, isPausedMidSession, onToggleStart, onReset, onSkip }: ControlsProps) {
  const primaryLabel = isRunning ? "PAUSE" : isPausedMidSession ? "RESUME" : "START";
  return (
    <div class="controls-row">
      <button type="button" class="round-action-btn" onClick={onReset} title="Reset (R)">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
        </svg>
      </button>
      <button type="button" class="primary-start-btn" onClick={onToggleStart}>{primaryLabel}</button>
      <button type="button" class="round-action-btn" onClick={onSkip} title="Skip (S)">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="5 4 15 12 5 20 5 4" /><line x1="19" y1="5" x2="19" y2="19" />
        </svg>
      </button>
    </div>
  );
}