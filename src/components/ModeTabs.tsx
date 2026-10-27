import { TimerMode } from "../types";

interface ModeTabsProps {
  mode: TimerMode;
  onSelectMode: (mode: TimerMode) => void;
}

const MODES: { id: TimerMode; label: string }[] = [
  { id: "focus", label: "Focus" },
  { id: "short", label: "Short" },
  { id: "long", label: "Long" },
];

export function ModeTabs({ mode, onSelectMode }: ModeTabsProps) {
  const activeIndex = MODES.findIndex((m) => m.id === mode);
  return (
    <nav class="mode-tabs" role="tablist">
      <div class="mode-pill-slider" style={{ transform: `translateX(${activeIndex * 100}%)` }} />
      {MODES.map((m) => (
        <button key={m.id} type="button" class={`mode-tab-btn ${mode === m.id ? "active" : ""}`} onClick={() => onSelectMode(m.id)}>
          {m.label}
        </button>
      ))}
    </nav>
  );
}