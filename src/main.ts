import "./styles.css";
import { Game } from "./game/Game";
import type { GameResult, HudState } from "./game/mode-types";
import { getVocabulary, replaceVocabulary } from "./storage/db";
import {
  defaultSettings,
  loadSettings,
  normalizeSettings,
  saveSettings,
} from "./storage/settings";
import type {
  GameMode,
  ShooterSettings,
  VocabularyEntry,
} from "./types";
import {
  parseBulkVocabulary,
  vocabularyToBulk,
} from "./ui/vocabulary-editor";

const app = document.querySelector<HTMLDivElement>("#app");
if (app === null) throw new Error("#app not found");

const modeInfo: Record<GameMode, { name: string; short: string }> = {
  classic: {
    name: "Classic Survival",
    short: "Falling words, lives and gradually rising pressure.",
  },
  bounce: {
    name: "Bounce / Relax",
    short: "Clear billiard-like words before the screen becomes too crowded.",
  },
  timeAttack: {
    name: "Time Attack",
    short: "Type as much as possible before the configured timer ends.",
  },
  targetRush: {
    name: "Target Rush",
    short: "Listen, read the top learning panel and clear each spotlight before impact.",
  },
};

app.innerHTML = `
  <div class="shooter-shell">
    <header class="hud-bar">
      <div class="title-block">
        <div class="title">Vocabulary Shooter</div>
        <div id="modeDescription" class="subtitle"></div>
      </div>

      <div class="stats">
        <div><span class="stat-label">SCORE</span><strong id="score">0</strong></div>
        <div><span class="stat-label">STREAK</span><strong id="streak">0</strong></div>
        <div><span id="metricLabel" class="stat-label">LIVES</span><strong id="metricValue">3/3</strong></div>
      </div>

      <div class="actions">
        <button id="startButton" class="primary">Start / Restart</button>
        <button id="vocabularyButton">Vocabulary</button>
        <button id="settingsButton">Settings</button>
      </div>
    </header>

    <div id="modeBar" class="mode-bar">
      <button data-mode="classic">Classic</button>
      <button data-mode="bounce">Bounce</button>
      <button data-mode="timeAttack">Time Attack</button>
      <button data-mode="targetRush">Target Rush</button>
    </div>

    <section id="learningPanel" class="learning-panel hidden" aria-live="polite">
      <div class="learning-kicker">LISTEN · READ · TYPE</div>
      <div id="learningVi" class="learning-vi">Vietnamese meaning</div>
      <div id="learningIpa" class="learning-ipa">/IPA/</div>
    </section>

    <div class="active-strip">
      <span>LOCK</span>
      <strong id="activeTarget">waiting for target</strong>
      <small id="keyboardHint"></small>
    </div>

    <main class="game-stage">
      <canvas id="gameCanvas" tabindex="0"></canvas>
      <div id="emptyVocabulary" class="empty-vocab hidden">
        Add at least one vocabulary entry before starting.
      </div>
    </main>
  </div>

  <dialog id="vocabularyDialog" class="panel-dialog">
    <form method="dialog" class="dialog-card vocab-card">
      <div class="dialog-header">
        <div>
          <h2>Vocabulary</h2>
          <p>
            Classic, Bounce and Time Attack reveal Vietnamese + IPA after a correct word.
            Target Rush shows Vietnamese + IPA in the top Learning Panel when the spotlight activates.
          </p>
        </div>
        <button class="icon-button" value="cancel" aria-label="Close">×</button>
      </div>

      <div class="vocab-toolbar">
        <button type="button" id="addRow">+ Add word</button>
        <button type="button" id="toggleBulk">Bulk import</button>
        <button type="button" id="exportBackup">Export backup</button>
        <label class="file-button">
          Import backup
          <input id="importBackup" type="file" accept="application/json" />
        </label>
      </div>

      <div id="bulkArea" class="bulk-area hidden">
        <div class="field-label">One entry per line: English | Vietnamese | IPA</div>
        <textarea id="bulkInput" spellcheck="false"></textarea>
        <button type="button" id="applyBulk">Replace table from bulk text</button>
      </div>

      <div class="vocab-table-wrap">
        <table class="vocab-table">
          <thead>
            <tr><th>English</th><th>Vietnamese</th><th>IPA / pronunciation</th><th></th></tr>
          </thead>
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
        <div>
          <h2>Game settings</h2>
          <p>Stored locally. Saving settings restarts the current mode so timing and physics stay consistent.</p>
        </div>
        <button class="icon-button" value="cancel">×</button>
      </div>

      <h3 class="settings-heading">General</h3>
      <div class="settings-grid">
        <label>
          <span>Pronunciation</span>
          <select id="speechEnabled">
            <option value="true">Enabled</option>
            <option value="false">Disabled</option>
          </select>
        </label>

        <label>
          <span>Accent</span>
          <select id="accent">
            <option value="en-US">US</option>
            <option value="en-GB">UK</option>
          </select>
        </label>

        <label>
          <span>Speech speed</span>
          <input id="speechRate" type="range" min="0.65" max="1.4" step="0.05" />
          <output id="speechRateValue"></output>
        </label>

        <label>
          <span>Pronunciation volume</span>
          <input id="volume" type="range" min="0" max="1" step="0.05" />
          <output id="volumeValue"></output>
        </label>

        <label>
          <span>Quick restart</span>
          <select id="quickRestartKey">
            <option value="Tab">Tab</option>
            <option value="Escape">Escape</option>
          </select>
        </label>

        <label>
          <span>Graphics</span>
          <select id="graphics">
            <option value="performance">Performance</option>
            <option value="balanced">Balanced</option>
            <option value="quality">Quality</option>
          </select>
        </label>

        <label>
          <span>Reveal duration</span>
          <input id="revealMs" type="range" min="700" max="5000" step="100" />
          <output id="revealMsValue"></output>
        </label>

        <label>
          <span>Background music</span>
          <select id="musicEnabled">
            <option value="true">Enabled</option>
            <option value="false">Disabled</option>
          </select>
        </label>

        <label>
          <span>Music volume</span>
          <input id="musicVolume" type="range" min="0" max="1" step="0.05" />
          <output id="musicVolumeValue"></output>
        </label>

        <label>
          <span>SFX volume</span>
          <input id="sfxVolume" type="range" min="0" max="1" step="0.05" />
          <output id="sfxVolumeValue"></output>
        </label>

        <label>
          <span>Danger audio</span>
          <select id="dangerAudioEnabled">
            <option value="true">Enabled</option>
            <option value="false">Disabled</option>
          </select>
        </label>
      </div>

      <section class="mode-settings" data-mode-settings="classic">
        <h3 class="settings-heading">Classic Survival</h3>
        <div class="settings-grid">
          <label><span>Lives</span><input id="classicLives" type="number" min="1" max="9" /></label>
          <label><span>Spawn interval (seconds)</span><input id="classicSpawn" type="number" min="0.7" max="5" step="0.1" /></label>
          <label><span>Enemy speed</span><input id="classicSpeed" type="number" min="15" max="120" step="1" /></label>
        </div>
      </section>

      <section class="mode-settings" data-mode-settings="bounce">
        <h3 class="settings-heading">Bounce / Relax</h3>
        <div class="settings-grid">
          <label><span>Maximum active words</span><input id="bounceMaxWords" type="number" min="3" max="30" /></label>
          <label><span>Spawn interval (seconds)</span><input id="bounceSpawn" type="number" min="0.7" max="10" step="0.1" /></label>
          <label><span>Movement speed</span><input id="bounceSpeed" type="number" min="20" max="160" step="1" /></label>
        </div>
      </section>

      <section class="mode-settings" data-mode-settings="timeAttack">
        <h3 class="settings-heading">Time Attack</h3>
        <div class="settings-grid">
          <label><span>Duration (seconds)</span><input id="timeDuration" type="number" min="15" max="600" /></label>
          <label><span>Spawn interval (seconds)</span><input id="timeSpawn" type="number" min="0.6" max="5" step="0.1" /></label>
          <label><span>Enemy speed</span><input id="timeSpeed" type="number" min="15" max="140" step="1" /></label>
        </div>
      </section>

      <section class="mode-settings" data-mode-settings="targetRush">
        <h3 class="settings-heading">Target Rush</h3>
        <div class="settings-grid">
          <label><span>Target count</span><input id="rushTargetCount" type="number" min="5" max="100" /></label>
          <label><span>Spotlight time (seconds)</span><input id="rushFocus" type="number" min="1.5" max="6" step="0.1" /></label>
          <label><span>Dive time (seconds)</span><input id="rushImpact" type="number" min="1" max="4" step="0.1" /></label>
        </div>
      </section>

      <div class="dialog-footer">
        <button type="button" id="resetSettings">Defaults</button>
        <button type="button" id="saveSettings" class="primary">Save & Restart</button>
      </div>
    </form>
  </dialog>

  <dialog id="resultDialog" class="panel-dialog result-dialog">
    <div class="dialog-card result-card">
      <div class="result-title">
        <span id="resultMode"></span>
        <h2 id="resultHeadline">Run complete</h2>
        <p id="resultReason"></p>
      </div>

      <div id="resultMetrics" class="result-metrics"></div>

      <div class="dialog-footer">
        <span id="resultRestartHint"></span>
        <button type="button" id="closeResult">Close</button>
        <button type="button" id="restartResult" class="primary">Play again</button>
      </div>
    </div>
  </dialog>
`;

const canvas = byId<HTMLCanvasElement>("gameCanvas");
const vocabularyDialog = byId<HTMLDialogElement>("vocabularyDialog");
const settingsDialog = byId<HTMLDialogElement>("settingsDialog");
const resultDialog = byId<HTMLDialogElement>("resultDialog");

let vocabulary = await getVocabulary();
let settings = loadSettings();

function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (element === null) throw new Error(`#${id} not found`);
  return element as T;
}

function renderLearning(entry: VocabularyEntry | null): void {
  const panel = byId("learningPanel");
  const visible = settings.mode === "targetRush";
  panel.classList.toggle("hidden", !visible);
  if (!visible) return;

  byId("learningVi").textContent = entry?.vi || "Watch for the highlighted English target";
  byId("learningIpa").textContent = entry?.ipa || "Vietnamese + IPA will appear here";
  panel.classList.remove("learning-pulse");
  void panel.offsetWidth;
  if (entry !== null) panel.classList.add("learning-pulse");
}

function renderHud(state: HudState): void {
  byId("score").textContent = String(state.score);
  byId("streak").textContent = String(state.streak);
  byId("metricLabel").textContent = state.metricLabel;
  byId("metricValue").textContent = state.metricValue;
  byId("activeTarget").textContent =
    state.active || (state.running ? "type the first letter of a target" : "waiting for target");

  const unlock = settings.quickRestartKey === "Tab" ? "Esc" : "Tab";
  byId("keyboardHint").textContent =
    `${unlock} unlocks · ${settings.quickRestartKey} restarts · Backspace corrects`;

  document.documentElement.style.setProperty(
    "--danger-blur",
    `${Math.round(34 * state.dangerLevel)}px`,
  );
  document.documentElement.style.setProperty(
    "--danger-alpha",
    (0.18 * state.dangerLevel).toFixed(3),
  );
}

function renderResult(result: GameResult): void {
  byId("resultMode").textContent = modeInfo[result.mode].name;
  byId("resultHeadline").textContent =
    result.failureReason === "Target set complete" || result.failureReason === "Time complete"
      ? "Run complete"
      : "Run ended";
  byId("resultReason").textContent =
    result.failedWord === ""
      ? result.failureReason
      : `${result.failureReason}: ${result.failedWord}`;

  const metrics: Array<[string, string]> = [
    ["Score", String(result.score)],
    ["Correct", String(result.correctWords)],
    ["Missed", String(result.missedWords)],
    ["Accuracy", `${result.accuracy.toFixed(1)}%`],
    ["WPM", result.wpm.toFixed(1)],
    ["Wrong keys", String(result.wrongKeys)],
    ["Max streak", String(result.maxStreak)],
    ["Time", `${result.elapsedSec.toFixed(1)}s`],
    ["Avg word", `${result.averageWordSec.toFixed(2)}s`],
  ];

  if (result.mode === "bounce") {
    metrics.push(["Max words", String(result.maxActiveWords)]);
  }
  if (result.mode === "targetRush") {
    metrics.push(["Late saves", String(result.lateSaves)]);
  }

  const container = byId("resultMetrics");
  container.replaceChildren();

  for (const [label, value] of metrics) {
    const item = document.createElement("div");
    const title = document.createElement("span");
    const strong = document.createElement("strong");
    title.textContent = label;
    strong.textContent = value;
    item.append(title, strong);
    container.append(item);
  }

  byId("resultRestartHint").textContent =
    `Press ${settings.quickRestartKey} to play again`;

  if (!resultDialog.open) resultDialog.showModal();
}

const game = new Game(
  canvas,
  vocabulary,
  settings,
  renderHud,
  renderLearning,
  renderResult,
);

function startGame(): void {
  if (vocabulary.length === 0) {
    byId("emptyVocabulary").classList.remove("hidden");
    return;
  }

  byId("emptyVocabulary").classList.add("hidden");
  if (resultDialog.open) resultDialog.close();
  game.start();
  canvas.focus();
}

function renderModeUi(): void {
  byId("modeDescription").textContent = modeInfo[settings.mode].short;

  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-mode]")) {
    button.classList.toggle("active", button.dataset["mode"] === settings.mode);
  }

  for (const section of document.querySelectorAll<HTMLElement>("[data-mode-settings]")) {
    section.classList.toggle(
      "hidden",
      section.dataset["modeSettings"] !== settings.mode,
    );
  }

  renderLearning(null);
  renderHud({
    score: 0,
    streak: 0,
    metricLabel:
      settings.mode === "classic"
        ? "LIVES"
        : settings.mode === "bounce"
          ? "WORDS"
          : settings.mode === "timeAttack"
            ? "TIME"
            : "TARGET",
    metricValue:
      settings.mode === "classic"
        ? `${settings.classic.lives}/${settings.classic.lives}`
        : settings.mode === "bounce"
          ? `0/${settings.bounce.maxActiveWords}`
          : settings.mode === "timeAttack"
            ? `${settings.timeAttack.durationSec}s`
            : `0/${settings.targetRush.targetCount}`,
    active: "",
    running: false,
    mode: settings.mode,
    dangerLevel: 0,
  });
}

for (const button of document.querySelectorAll<HTMLButtonElement>("[data-mode]")) {
  button.addEventListener("click", () => {
    const mode = button.dataset["mode"] as GameMode | undefined;
    if (mode === undefined || mode === settings.mode) return;
    settings = { ...settings, mode };
    saveSettings(settings);
    game.updateSettings(settings);
    renderModeUi();
    startGame();
  });
}

byId<HTMLButtonElement>("startButton").addEventListener("click", startGame);

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
  updateTableCount();
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
      field === "en"
        ? "dependency injection"
        : field === "vi"
          ? "tiêm phụ thuộc"
          : "/.../";
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
  byId("vocabCount").textContent =
    `${document.querySelectorAll("#vocabRows tr").length} entries`;
}

byId<HTMLButtonElement>("addRow").addEventListener("click", () => {
  byId<HTMLTableSectionElement>("vocabRows").append(
    createVocabularyRow({
      id: crypto.randomUUID(),
      en: "",
      vi: "",
      ipa: "",
    }),
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
    const en =
      row.querySelector<HTMLInputElement>('input[data-field="en"]')?.value.trim() ?? "";
    const vi =
      row.querySelector<HTMLInputElement>('input[data-field="vi"]')?.value.trim() ?? "";
    const ipa =
      row.querySelector<HTMLInputElement>('input[data-field="ipa"]')?.value.trim() ?? "";

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
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
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
        .filter(
          (entry) =>
            typeof entry.en === "string" &&
            typeof entry.vi === "string",
        )
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
      renderModeUi();
    }

    renderVocabularyRows();
    byId<HTMLTextAreaElement>("bulkInput").value =
      vocabularyToBulk(vocabulary);
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
  byId<HTMLSelectElement>("quickRestartKey").value = value.quickRestartKey;
  byId<HTMLSelectElement>("graphics").value = value.graphics;
  byId<HTMLInputElement>("revealMs").value = String(value.revealMs);
  byId<HTMLSelectElement>("musicEnabled").value = String(value.musicEnabled);
  byId<HTMLInputElement>("musicVolume").value = String(value.musicVolume);
  byId<HTMLInputElement>("sfxVolume").value = String(value.sfxVolume);
  byId<HTMLSelectElement>("dangerAudioEnabled").value =
    String(value.dangerAudioEnabled);

  byId<HTMLInputElement>("classicLives").value = String(value.classic.lives);
  byId<HTMLInputElement>("classicSpawn").value =
    String(value.classic.spawnIntervalMs / 1000);
  byId<HTMLInputElement>("classicSpeed").value = String(value.classic.speed);

  byId<HTMLInputElement>("bounceMaxWords").value =
    String(value.bounce.maxActiveWords);
  byId<HTMLInputElement>("bounceSpawn").value =
    String(value.bounce.spawnIntervalMs / 1000);
  byId<HTMLInputElement>("bounceSpeed").value = String(value.bounce.speed);

  byId<HTMLInputElement>("timeDuration").value =
    String(value.timeAttack.durationSec);
  byId<HTMLInputElement>("timeSpawn").value =
    String(value.timeAttack.spawnIntervalMs / 1000);
  byId<HTMLInputElement>("timeSpeed").value = String(value.timeAttack.speed);

  byId<HTMLInputElement>("rushTargetCount").value =
    String(value.targetRush.targetCount);
  byId<HTMLInputElement>("rushFocus").value =
    String(value.targetRush.focusWindowSec);
  byId<HTMLInputElement>("rushImpact").value =
    String(value.targetRush.impactWindowSec);

  updateSettingOutputs();

  for (const section of document.querySelectorAll<HTMLElement>("[data-mode-settings]")) {
    section.classList.toggle(
      "hidden",
      section.dataset["modeSettings"] !== value.mode,
    );
  }
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

for (const id of [
  "speechRate",
  "volume",
  "revealMs",
  "musicVolume",
  "sfxVolume",
]) {
  byId<HTMLInputElement>(id).addEventListener("input", updateSettingOutputs);
}

byId<HTMLButtonElement>("resetSettings").addEventListener("click", () => {
  fillSettingsForm({ ...structuredClone(defaultSettings), mode: settings.mode });
});

byId<HTMLButtonElement>("saveSettings").addEventListener("click", () => {
  settings = normalizeSettings({
    version: 2,
    mode: settings.mode,
    speechEnabled: byId<HTMLSelectElement>("speechEnabled").value === "true",
    accent: byId<HTMLSelectElement>("accent").value,
    speechRate: byId<HTMLInputElement>("speechRate").value,
    volume: byId<HTMLInputElement>("volume").value,
    quickRestartKey: byId<HTMLSelectElement>("quickRestartKey").value,
    graphics: byId<HTMLSelectElement>("graphics").value,
    revealMs: byId<HTMLInputElement>("revealMs").value,
    musicEnabled: byId<HTMLSelectElement>("musicEnabled").value === "true",
    musicVolume: byId<HTMLInputElement>("musicVolume").value,
    sfxVolume: byId<HTMLInputElement>("sfxVolume").value,
    dangerAudioEnabled:
      byId<HTMLSelectElement>("dangerAudioEnabled").value === "true",
    classic: {
      lives: byId<HTMLInputElement>("classicLives").value,
      spawnIntervalMs:
        Number(byId<HTMLInputElement>("classicSpawn").value) * 1000,
      speed: byId<HTMLInputElement>("classicSpeed").value,
    },
    bounce: {
      maxActiveWords: byId<HTMLInputElement>("bounceMaxWords").value,
      spawnIntervalMs:
        Number(byId<HTMLInputElement>("bounceSpawn").value) * 1000,
      speed: byId<HTMLInputElement>("bounceSpeed").value,
    },
    timeAttack: {
      durationSec: byId<HTMLInputElement>("timeDuration").value,
      spawnIntervalMs:
        Number(byId<HTMLInputElement>("timeSpawn").value) * 1000,
      speed: byId<HTMLInputElement>("timeSpeed").value,
    },
    targetRush: {
      targetCount: byId<HTMLInputElement>("rushTargetCount").value,
      focusWindowSec: byId<HTMLInputElement>("rushFocus").value,
      impactWindowSec: byId<HTMLInputElement>("rushImpact").value,
    },
  });

  saveSettings(settings);
  game.updateSettings(settings);
  settingsDialog.close();
  renderModeUi();
  startGame();
});

byId<HTMLButtonElement>("closeResult").addEventListener("click", () => {
  resultDialog.close();
  canvas.focus();
});

byId<HTMLButtonElement>("restartResult").addEventListener("click", startGame);

window.addEventListener("keydown", (event) => {
  if (!resultDialog.open || event.key !== settings.quickRestartKey) return;
  event.preventDefault();
  startGame();
});

window.addEventListener("beforeunload", () => game.destroy());

renderModeUi();
