import "./styles.css";
import { Game, type GameResult, type HudState, type LearningPanelState } from "./game/Game";
import { getVocabulary, replaceVocabulary } from "./storage/db";
import {
  defaultSettings,
  loadSettings,
  normalizeSettings,
  saveSettings,
} from "./storage/settings";
import type { GameMode, ShooterSettings, VocabularyEntry } from "./types";
import { parseBulkVocabulary, vocabularyToBulk } from "./ui/vocabulary-editor";

const app = document.querySelector<HTMLDivElement>("#app");
if (app === null) throw new Error("#app not found");

app.innerHTML = `
  <div class="shooter-shell">
    <header class="hud-bar">
      <div class="title-block">
        <div class="title">Vocabulary Shooter</div>
        <div class="subtitle" id="modeSubtitle">Classic Survival</div>
      </div>

      <div class="stats">
        <div><span class="stat-label">SCORE</span><strong id="score">0</strong></div>
        <div><span class="stat-label">STREAK</span><strong id="streak">0</strong></div>
        <div><span class="stat-label" id="metricLabel">LIVES</span><strong id="metricValue">♥♥♥</strong></div>
      </div>

      <div class="actions">
        <button id="startButton" class="primary">Start / Restart</button>
        <button id="vocabularyButton">Vocabulary</button>
        <button id="settingsButton">Settings</button>
      </div>
    </header>

    <div class="mode-tabs" role="tablist" aria-label="Game mode">
      <button data-mode="classic">Classic</button>
      <button data-mode="bounce">Bounce</button>
      <button data-mode="timeAttack">Time Attack</button>
      <button data-mode="targetRush">Target Rush</button>
    </div>

    <section id="learningPanel" class="learning-panel hidden" aria-live="polite">
      <div class="learning-label">CURRENT TARGET</div>
      <div id="learningVi" class="learning-vi"></div>
      <div id="learningIpa" class="learning-ipa"></div>
    </section>

    <div class="active-strip">
      <span>LOCK</span>
      <strong id="activeTarget">waiting for target</strong>
      <small id="shortcutHelp"></small>
    </div>

    <main class="game-stage">
      <canvas id="gameCanvas" tabindex="0"></canvas>
      <div id="emptyVocabulary" class="empty-vocab hidden">Add at least one vocabulary entry before starting.</div>
    </main>
  </div>

  <dialog id="vocabularyDialog" class="panel-dialog">
    <form method="dialog" class="dialog-card vocab-card">
      <div class="dialog-header">
        <div>
          <h2>Vocabulary</h2>
          <p>Classic, Bounce and Time Attack reveal Vietnamese + IPA after a correct word. Target Rush shows VN + IPA in the top learning panel when the spotlight target activates.</p>
        </div>
        <button class="icon-button" value="cancel" aria-label="Close">×</button>
      </div>

      <div class="vocab-toolbar">
        <button type="button" id="addRow">+ Add word</button>
        <button type="button" id="toggleBulk">Bulk import</button>
        <button type="button" id="exportBackup">Export backup</button>
        <label class="file-button">Import backup<input id="importBackup" type="file" accept="application/json" /></label>
      </div>

      <div id="bulkArea" class="bulk-area hidden">
        <div class="field-label">One entry per line: English | Vietnamese | IPA</div>
        <textarea id="bulkInput" spellcheck="false"></textarea>
        <button type="button" id="applyBulk">Replace table from bulk text</button>
      </div>

      <div class="vocab-table-wrap">
        <table class="vocab-table">
          <thead><tr><th>English</th><th>Vietnamese</th><th>IPA / pronunciation</th><th></th></tr></thead>
          <tbody id="vocabRows"></tbody>
        </table>
      </div>

      <div class="dialog-footer">
        <span id="vocabCount"></span>
        <button type="button" id="saveVocabulary" class="primary">Save vocabulary</button>
      </div>
    </form>
  </dialog>

  <dialog id="settingsDialog" class="panel-dialog">
    <form method="dialog" class="dialog-card settings-card">
      <div class="dialog-header">
        <div><h2>Game settings</h2><p>Everything is stored locally. Mode-specific settings appear below.</p></div>
        <button class="icon-button" value="cancel">×</button>
      </div>

      <h3 class="settings-section-title">General</h3>
      <div class="settings-grid">
        <label><span>Pronunciation</span><select id="speechEnabled"><option value="true">Enabled</option><option value="false">Disabled</option></select></label>
        <label><span>Accent</span><select id="accent"><option value="en-US">US</option><option value="en-GB">UK</option></select></label>
        <label><span>Speech speed</span><input id="speechRate" type="range" min="0.65" max="1.4" step="0.05" /><output id="speechRateValue"></output></label>
        <label><span>Speech volume</span><input id="volume" type="range" min="0" max="1" step="0.05" /><output id="volumeValue"></output></label>
        <label><span>Reveal duration</span><input id="revealMs" type="range" min="700" max="5000" step="100" /><output id="revealMsValue"></output></label>
        <label><span>Graphics</span><select id="graphics"><option value="performance">Performance</option><option value="balanced">Balanced</option><option value="quality">Quality</option></select></label>
        <label><span>Quick restart</span><select id="quickRestartKey"><option value="Tab">Tab</option><option value="Escape">Escape</option></select></label>
        <label><span>Background music</span><select id="musicEnabled"><option value="true">Enabled</option><option value="false">Disabled</option></select></label>
        <label><span>Music volume</span><input id="musicVolume" type="range" min="0" max="1" step="0.05" /><output id="musicVolumeValue"></output></label>
        <label><span>SFX volume</span><input id="sfxVolume" type="range" min="0" max="1" step="0.05" /><output id="sfxVolumeValue"></output></label>
        <label><span>Danger audio</span><select id="dangerAudioEnabled"><option value="true">Enabled</option><option value="false">Disabled</option></select></label>
      </div>

      <h3 class="settings-section-title">Classic Survival</h3>
      <div class="settings-grid mode-setting" data-setting-mode="classic">
        <label><span>Lives</span><input id="classicLives" type="number" min="1" max="9" step="1" /></label>
        <label><span>Spawn interval</span><input id="classicSpawn" type="number" min="700" max="5000" step="100" /><small>milliseconds</small></label>
        <label><span>Enemy speed</span><input id="classicSpeed" type="number" min="15" max="120" step="1" /></label>
      </div>

      <h3 class="settings-section-title">Bounce / Relax</h3>
      <div class="settings-grid mode-setting" data-setting-mode="bounce">
        <label><span>Maximum active words</span><input id="bounceMax" type="number" min="3" max="30" step="1" /></label>
        <label><span>Spawn interval</span><input id="bounceSpawn" type="number" min="700" max="10000" step="100" /><small>milliseconds</small></label>
        <label><span>Movement speed</span><input id="bounceSpeed" type="number" min="20" max="160" step="1" /></label>
      </div>

      <h3 class="settings-section-title">Time Attack</h3>
      <div class="settings-grid mode-setting" data-setting-mode="timeAttack">
        <label><span>Duration</span><input id="timeDuration" type="number" min="15" max="600" step="5" /><small>seconds</small></label>
        <label><span>Spawn interval</span><input id="timeSpawn" type="number" min="600" max="5000" step="100" /><small>milliseconds</small></label>
        <label><span>Enemy speed</span><input id="timeSpeed" type="number" min="15" max="140" step="1" /></label>
      </div>

      <h3 class="settings-section-title">Target Rush</h3>
      <div class="settings-grid mode-setting" data-setting-mode="targetRush">
        <label><span>Target count</span><input id="rushCount" type="number" min="5" max="100" step="1" /></label>
        <label><span>Spotlight time</span><input id="rushFocus" type="number" min="1.5" max="6" step="0.1" /><small>seconds</small></label>
        <label><span>Dive time</span><input id="rushImpact" type="number" min="1" max="4" step="0.1" /><small>seconds</small></label>
      </div>

      <div class="dialog-footer">
        <button type="button" id="resetSettings">Defaults</button>
        <button type="button" id="saveSettings" class="primary">Save settings</button>
      </div>
    </form>
  </dialog>

  <dialog id="resultDialog" class="panel-dialog result-dialog">
    <div class="dialog-card result-card">
      <div class="dialog-header">
        <div><h2 id="resultTitle">Run complete</h2><p id="resultReason"></p></div>
        <button class="icon-button" id="closeResult" type="button">×</button>
      </div>
      <div id="resultGrid" class="result-grid"></div>
      <div class="dialog-footer">
        <span id="resultShortcut"></span>
        <button id="resultRestart" type="button" class="primary">Play again</button>
      </div>
    </div>
  </dialog>
`;

const canvas = byQuery<HTMLCanvasElement>("#gameCanvas");
const vocabularyDialog = byQuery<HTMLDialogElement>("#vocabularyDialog");
const settingsDialog = byQuery<HTMLDialogElement>("#settingsDialog");
const resultDialog = byQuery<HTMLDialogElement>("#resultDialog");

let vocabulary = await getVocabulary();
let settings = loadSettings();

function byQuery<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (element === null) throw new Error(`${selector} not found`);
  return element;
}

function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (element === null) throw new Error(`#${id} not found`);
  return element as T;
}

function modeName(mode: GameMode): string {
  if (mode === "classic") return "Classic Survival";
  if (mode === "bounce") return "Bounce / Relax";
  if (mode === "timeAttack") return "Time Attack";
  return "Target Rush";
}

function updateModeUi(): void {
  byId("modeSubtitle").textContent = modeName(settings.mode);
  for (const button of document.querySelectorAll<HTMLButtonElement>(".mode-tabs button")) {
    button.classList.toggle("active", button.dataset["mode"] === settings.mode);
  }
  const unlockKey = settings.quickRestartKey === "Tab" ? "Esc" : "Tab";
  byId("shortcutHelp").textContent = `${settings.quickRestartKey} restart · ${unlockKey} unlock · Backspace corrects`;
}

function hud(state: HudState): void {
  byId("score").textContent = String(state.score);
  byId("streak").textContent = String(state.streak);
  byId("metricLabel").textContent = state.metricLabel;
  byId("metricValue").textContent = state.metricValue;
  byId("activeTarget").textContent =
    state.active || (state.running ? "type the first letter of a target" : "waiting for target");
  document.documentElement.style.setProperty("--danger-level", state.dangerLevel.toFixed(3));
}

function learningPanel(state: LearningPanelState): void {
  const panel = byId("learningPanel");
  panel.classList.toggle("hidden", !state.visible);
  if (!state.visible) return;
  byId("learningVi").textContent = state.vi;
  byId("learningIpa").textContent = state.ipa;
  panel.classList.remove("learning-pop");
  void panel.offsetWidth;
  panel.classList.add("learning-pop");
}

function showResult(result: GameResult): void {
  byId("resultTitle").textContent = `${modeName(result.mode)} complete`;
  byId("resultReason").textContent = result.failureReason;
  byId("resultShortcut").textContent = `${settings.quickRestartKey} restarts instantly`;

  const items: Array<[string, string]> = [
    ["Score", String(result.score)],
    ["Correct words", String(result.correctWords)],
    ["Missed words", String(result.missedWords)],
    ["Wrong keys", String(result.wrongKeys)],
    ["Accuracy", `${result.accuracy.toFixed(1)}%`],
    ["WPM", result.wpm.toFixed(1)],
    ["Characters", String(result.characters)],
    ["Max streak", String(result.maxStreak)],
    ["Elapsed", `${result.elapsedSec.toFixed(1)}s`],
    ["Avg word", `${result.averageWordSec.toFixed(2)}s`],
  ];

  if (result.mode === "bounce") {
    items.push(["Max words on screen", String(result.maxActiveWords)]);
  }
  if (result.mode === "targetRush") {
    items.push(["Late saves", String(result.lateSaves)]);
  }
  if (result.failedWord !== "") {
    items.push(["Failed word", result.failedWord]);
  }

  const grid = byId("resultGrid");
  grid.replaceChildren();
  for (const [label, value] of items) {
    const item = document.createElement("div");
    const key = document.createElement("span");
    const strong = document.createElement("strong");
    key.textContent = label;
    strong.textContent = value;
    item.append(key, strong);
    grid.append(item);
  }
  resultDialog.showModal();
}

const game = new Game(canvas, vocabulary, settings, hud, learningPanel, showResult);

function startGame(): void {
  if (vocabulary.length === 0) {
    byId("emptyVocabulary").classList.remove("hidden");
    return;
  }
  if (resultDialog.open) resultDialog.close();
  byId("emptyVocabulary").classList.add("hidden");
  game.start();
  canvas.focus();
}

byId<HTMLButtonElement>("startButton").addEventListener("click", startGame);
byId<HTMLButtonElement>("resultRestart").addEventListener("click", startGame);
byId<HTMLButtonElement>("closeResult").addEventListener("click", () => resultDialog.close());

for (const button of document.querySelectorAll<HTMLButtonElement>(".mode-tabs button")) {
  button.addEventListener("click", () => {
    const mode = button.dataset["mode"] as GameMode | undefined;
    if (mode === undefined || mode === settings.mode) return;
    settings = { ...settings, mode };
    saveSettings(settings);
    game.updateSettings(settings);
    updateModeUi();
    startGame();
  });
}

byId<HTMLButtonElement>("vocabularyButton").addEventListener("click", () => {
  renderVocabularyRows();
  byId<HTMLTextAreaElement>("bulkInput").value = vocabularyToBulk(vocabulary);
  vocabularyDialog.showModal();
});

byId<HTMLButtonElement>("settingsButton").addEventListener("click", () => {
  fillSettingsForm(settings);
  settingsDialog.showModal();
});

function renderVocabularyRows(): void {
  const body = byId<HTMLTableSectionElement>("vocabRows");
  body.replaceChildren();
  for (const entry of vocabulary) body.append(createVocabularyRow(entry));
  byId("vocabCount").textContent = `${vocabulary.length} entries`;
}

function createVocabularyRow(entry: VocabularyEntry): HTMLTableRowElement {
  const row = document.createElement("tr");
  row.dataset["id"] = entry.id;

  for (const [field, value] of [
    ["en", entry.en],
    ["vi", entry.vi],
    ["ipa", entry.ipa],
  ] as const) {
    const cell = document.createElement("td");
    const input = document.createElement("input");
    input.dataset["field"] = field;
    input.value = value;
    input.placeholder =
      field === "en" ? "dependency injection" : field === "vi" ? "tiêm phụ thuộc" : "/.../";
    cell.append(input);
    row.append(cell);
  }

  const action = document.createElement("td");
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "remove-row";
  remove.textContent = "×";
  remove.addEventListener("click", () => {
    row.remove();
    updateTableCount();
  });
  action.append(remove);
  row.append(action);
  return row;
}

function updateTableCount(): void {
  byId("vocabCount").textContent = `${document.querySelectorAll("#vocabRows tr").length} entries`;
}

byId<HTMLButtonElement>("addRow").addEventListener("click", () => {
  byId<HTMLTableSectionElement>("vocabRows").append(
    createVocabularyRow({ id: crypto.randomUUID(), en: "", vi: "", ipa: "" }),
  );
  updateTableCount();
});

byId<HTMLButtonElement>("toggleBulk").addEventListener("click", () => {
  byId("bulkArea").classList.toggle("hidden");
});

byId<HTMLButtonElement>("applyBulk").addEventListener("click", () => {
  vocabulary = parseBulkVocabulary(byId<HTMLTextAreaElement>("bulkInput").value);
  renderVocabularyRows();
});

byId<HTMLButtonElement>("saveVocabulary").addEventListener("click", async () => {
  const entries: VocabularyEntry[] = [];
  for (const row of document.querySelectorAll<HTMLTableRowElement>("#vocabRows tr")) {
    const en = row.querySelector<HTMLInputElement>('input[data-field="en"]')?.value.trim() ?? "";
    const vi = row.querySelector<HTMLInputElement>('input[data-field="vi"]')?.value.trim() ?? "";
    const ipa = row.querySelector<HTMLInputElement>('input[data-field="ipa"]')?.value.trim() ?? "";
    if (en === "" || vi === "") continue;
    entries.push({
      id: row.dataset["id"] ?? crypto.randomUUID(),
      en,
      vi,
      ipa,
    });
  }
  vocabulary = entries;
  await replaceVocabulary(vocabulary);
  game.setVocabulary(vocabulary);
  vocabularyDialog.close();
});

function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

byId<HTMLButtonElement>("exportBackup").addEventListener("click", () => {
  downloadJson("typing-game-vocab-shooter-backup.json", {
    version: 2,
    vocabulary,
    settings,
  });
});

byId<HTMLInputElement>("importBackup").addEventListener("change", async (event) => {
  const input = event.currentTarget as HTMLInputElement;
  const file = input.files?.[0];
  if (file === undefined) return;

  try {
    const data = JSON.parse(await file.text()) as {
      vocabulary?: VocabularyEntry[];
      settings?: unknown;
    };

    if (Array.isArray(data.vocabulary)) {
      vocabulary = data.vocabulary
        .filter((entry) => typeof entry.en === "string" && typeof entry.vi === "string")
        .map((entry) => ({
          ...entry,
          id: entry.id || crypto.randomUUID(),
          ipa: entry.ipa ?? "",
        }));
      await replaceVocabulary(vocabulary);
      game.setVocabulary(vocabulary);
    }

    if (data.settings !== undefined) {
      settings = normalizeSettings(data.settings);
      saveSettings(settings);
      game.updateSettings(settings);
      updateModeUi();
    }

    renderVocabularyRows();
    byId<HTMLTextAreaElement>("bulkInput").value = vocabularyToBulk(vocabulary);
  } catch {
    alert("Invalid backup file.");
  } finally {
    input.value = "";
  }
});

function fillSettingsForm(value: ShooterSettings): void {
  byId<HTMLSelectElement>("speechEnabled").value = String(value.speechEnabled);
  byId<HTMLSelectElement>("accent").value = value.accent;
  byId<HTMLInputElement>("speechRate").value = String(value.speechRate);
  byId<HTMLInputElement>("volume").value = String(value.volume);
  byId<HTMLInputElement>("revealMs").value = String(value.revealMs);
  byId<HTMLSelectElement>("graphics").value = value.graphics;
  byId<HTMLSelectElement>("quickRestartKey").value = value.quickRestartKey;
  byId<HTMLSelectElement>("musicEnabled").value = String(value.musicEnabled);
  byId<HTMLInputElement>("musicVolume").value = String(value.musicVolume);
  byId<HTMLInputElement>("sfxVolume").value = String(value.sfxVolume);
  byId<HTMLSelectElement>("dangerAudioEnabled").value = String(value.dangerAudioEnabled);
  byId<HTMLInputElement>("classicLives").value = String(value.classic.lives);
  byId<HTMLInputElement>("classicSpawn").value = String(value.classic.spawnIntervalMs);
  byId<HTMLInputElement>("classicSpeed").value = String(value.classic.speed);
  byId<HTMLInputElement>("bounceMax").value = String(value.bounce.maxActiveWords);
  byId<HTMLInputElement>("bounceSpawn").value = String(value.bounce.spawnIntervalMs);
  byId<HTMLInputElement>("bounceSpeed").value = String(value.bounce.speed);
  byId<HTMLInputElement>("timeDuration").value = String(value.timeAttack.durationSec);
  byId<HTMLInputElement>("timeSpawn").value = String(value.timeAttack.spawnIntervalMs);
  byId<HTMLInputElement>("timeSpeed").value = String(value.timeAttack.speed);
  byId<HTMLInputElement>("rushCount").value = String(value.targetRush.targetCount);
  byId<HTMLInputElement>("rushFocus").value = String(value.targetRush.focusWindowSec);
  byId<HTMLInputElement>("rushImpact").value = String(value.targetRush.impactWindowSec);
  updateSettingOutputs();
}

function updateSettingOutputs(): void {
  byId<HTMLOutputElement>("speechRateValue").value =
    `${Number(byId<HTMLInputElement>("speechRate").value).toFixed(2)}×`;
  byId<HTMLOutputElement>("volumeValue").value =
    `${Math.round(Number(byId<HTMLInputElement>("volume").value) * 100)}%`;
  byId<HTMLOutputElement>("revealMsValue").value =
    `${(Number(byId<HTMLInputElement>("revealMs").value) / 1000).toFixed(1)}s`;
  byId<HTMLOutputElement>("musicVolumeValue").value =
    `${Math.round(Number(byId<HTMLInputElement>("musicVolume").value) * 100)}%`;
  byId<HTMLOutputElement>("sfxVolumeValue").value =
    `${Math.round(Number(byId<HTMLInputElement>("sfxVolume").value) * 100)}%`;
}

for (const id of ["speechRate", "volume", "revealMs", "musicVolume", "sfxVolume"]) {
  byId<HTMLInputElement>(id).addEventListener("input", updateSettingOutputs);
}

byId<HTMLButtonElement>("resetSettings").addEventListener("click", () => {
  fillSettingsForm(structuredClone(defaultSettings));
});

byId<HTMLButtonElement>("saveSettings").addEventListener("click", () => {
  settings = normalizeSettings({
    ...settings,
    speechEnabled: byId<HTMLSelectElement>("speechEnabled").value === "true",
    accent: byId<HTMLSelectElement>("accent").value,
    speechRate: Number(byId<HTMLInputElement>("speechRate").value),
    volume: Number(byId<HTMLInputElement>("volume").value),
    revealMs: Number(byId<HTMLInputElement>("revealMs").value),
    graphics: byId<HTMLSelectElement>("graphics").value,
    quickRestartKey: byId<HTMLSelectElement>("quickRestartKey").value,
    musicEnabled: byId<HTMLSelectElement>("musicEnabled").value === "true",
    musicVolume: Number(byId<HTMLInputElement>("musicVolume").value),
    sfxVolume: Number(byId<HTMLInputElement>("sfxVolume").value),
    dangerAudioEnabled: byId<HTMLSelectElement>("dangerAudioEnabled").value === "true",
    classic: {
      lives: Number(byId<HTMLInputElement>("classicLives").value),
      spawnIntervalMs: Number(byId<HTMLInputElement>("classicSpawn").value),
      speed: Number(byId<HTMLInputElement>("classicSpeed").value),
    },
    bounce: {
      maxActiveWords: Number(byId<HTMLInputElement>("bounceMax").value),
      spawnIntervalMs: Number(byId<HTMLInputElement>("bounceSpawn").value),
      speed: Number(byId<HTMLInputElement>("bounceSpeed").value),
    },
    timeAttack: {
      durationSec: Number(byId<HTMLInputElement>("timeDuration").value),
      spawnIntervalMs: Number(byId<HTMLInputElement>("timeSpawn").value),
      speed: Number(byId<HTMLInputElement>("timeSpeed").value),
    },
    targetRush: {
      targetCount: Number(byId<HTMLInputElement>("rushCount").value),
      focusWindowSec: Number(byId<HTMLInputElement>("rushFocus").value),
      impactWindowSec: Number(byId<HTMLInputElement>("rushImpact").value),
    },
  });

  saveSettings(settings);
  game.updateSettings(settings);
  updateModeUi();
  settingsDialog.close();
});

updateModeUi();
window.addEventListener("beforeunload", () => game.destroy());
