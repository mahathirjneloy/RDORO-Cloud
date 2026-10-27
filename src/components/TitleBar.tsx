import { getCurrentWindow } from "@tauri-apps/api/window";

interface TitleBarProps {
  titleText: string;
  isMini: boolean;
  onToggleMini: () => void;
}

export function TitleBar({ titleText, isMini, onToggleMini }: TitleBarProps) {
  const appWindow = getCurrentWindow();
  return (
    <header class="titlebar">
      <div class="titlebar-drag" onMouseDown={(e) => { if (e.button === 0) appWindow.startDragging(); }}>
        <span>{titleText}</span>
      </div>
      <div class="titlebar-controls">
        <button type="button" class="titlebar-btn" onClick={onToggleMini} title="Mini Mode (Ctrl+M)">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
            {isMini ? <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" /> : <rect x="4" y="8" width="16" height="10" rx="2" />}
          </svg>
        </button>
        <button type="button" class="titlebar-btn" onClick={() => appWindow.minimize()}>
          <svg width="12" height="12" viewBox="0 0 12 12" stroke="currentColor" stroke-width="1.5"><line x1="2" y1="6" x2="10" y2="6" /></svg>
        </button>
        <button type="button" class="titlebar-btn close" onClick={() => appWindow.close()}>
          <svg width="12" height="12" viewBox="0 0 12 12" stroke="currentColor" stroke-width="1.5">
            <line x1="2.5" y1="2.5" x2="9.5" y2="9.5" /><line x1="9.5" y1="2.5" x2="2.5" y2="9.5" />
          </svg>
        </button>
      </div>
    </header>
  );
}