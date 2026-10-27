import { invoke } from "@tauri-apps/api/core";
import { playCompletionSound } from "../audio";
import { AppSettings, SoundPreset } from "../types";

interface SettingsProps {
  settings: AppSettings;
  onUpdate: (patch: Partial<AppSettings>) => void;
  onClose: () => void;
}

export function Settings({ settings, onUpdate, onClose }: SettingsProps) {
  return (
    <section class="drawer-view">
      <div class="drawer-header">
        <button type="button" class="icon-circle-btn" onClick={onClose}>←</button>
        <h2 class="drawer-title">Settings</h2>
        <div style={{ width: "40px" }} />
      </div>

      <div class="settings-group-title">Timer</div>
      <div class="settings-group">
        <div class="setting-row">
          <span>Focus length (min)</span>
          <input type="number" min="1" max="180" class="stepper-input" value={settings.focusMinutes} onInput={(e) => onUpdate({ focusMinutes: Number((e.target as HTMLInputElement).value) })} />
        </div>
        <div class="setting-row">
          <span>Short break (min)</span>
          <input type="number" min="1" max="180" class="stepper-input" value={settings.shortBreakMinutes} onInput={(e) => onUpdate({ shortBreakMinutes: Number((e.target as HTMLInputElement).value) })} />
        </div>
        <div class="setting-row">
          <span>Long break (min)</span>
          <input type="number" min="1" max="180" class="stepper-input" value={settings.longBreakMinutes} onInput={(e) => onUpdate({ longBreakMinutes: Number((e.target as HTMLInputElement).value) })} />
        </div>
        <div class="setting-row">
          <span>Sessions until long break</span>
          <input type="number" min="2" max="10" class="stepper-input" value={settings.sessionsUntilLongBreak} onInput={(e) => onUpdate({ sessionsUntilLongBreak: Number((e.target as HTMLInputElement).value) })} />
        </div>
        <div class="setting-row">
          <span>Auto-start breaks</span>
          <button type="button" class={`toggle-switch ${settings.autoStartBreaks ? "on" : ""}`} onClick={() => onUpdate({ autoStartBreaks: !settings.autoStartBreaks })}><span class="toggle-knob" /></button>
        </div>
        <div class="setting-row">
          <span>Auto-start focus</span>
          <button type="button" class={`toggle-switch ${settings.autoStartFocus ? "on" : ""}`} onClick={() => onUpdate({ autoStartFocus: !settings.autoStartFocus })}><span class="toggle-knob" /></button>
        </div>
      </div>

      <div class="settings-group-title">Sound & Notifications</div>
      <div class="settings-group">
        <div class="setting-row">
          <span>Desktop notifications</span>
          <button type="button" class={`toggle-switch ${settings.desktopNotifications ? "on" : ""}`} onClick={() => onUpdate({ desktopNotifications: !settings.desktopNotifications })}><span class="toggle-knob" /></button>
        </div>
        <div class="setting-row">
          <span>Chime tone</span>
          <select class="select-pill" value={settings.soundPreset} onChange={(e) => {
            const preset = (e.target as HTMLSelectElement).value as SoundPreset;
            onUpdate({ soundPreset: preset });
            playCompletionSound(preset, settings.soundVolume);
          }}>
            <option value="bell">Soft Bell</option>
            <option value="marimba">Warm Marimba</option>
            <option value="chord">Ambient Chord</option>
          </select>
        </div>
      </div>

      <div class="settings-group-title">Data & Storage</div>
      <div class="settings-group">
        <div class="setting-row">
          <span>App Data Folder (%APPDATA%\RDORO)</span>
          <button type="button" class="pill-btn" onClick={() => invoke("open_data_folder")}>Open Folder</button>
        </div>
      </div>
    </section>
  );
}