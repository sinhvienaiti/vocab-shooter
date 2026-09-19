import "./styles.css";
import { Game, type HudState } from "./game/Game";
import { getVocabulary, replaceVocabulary } from "./storage/db";
import { defaultSettings, loadSettings, saveSettings } from "./storage/settings";
import type { ShooterSettings, VocabularyEntry } from "./types";
import { parseBulkVocabulary, vocabularyToBulk } from "./ui/vocabulary-editor";

const app = document.querySelector<HTMLDivElement>("#app");
if (app === null) throw new Error("#app not found");

app.innerHTML = \`
  <div class="shooter-shell">
    <header class="hud-bar">
      <div class="title-block">
        <div class="title">Vocabulary Shooter</div>
        <div class="subtitle">Type the English target correctly to reveal Vietnamese + IPA.</div>
      </div>
      <div class="stats">
        <div><span class="stat-label">SCORE</span><strong id="score">0</strong></div>
        <div><span class="stat-label">STREAK</span><strong id="streak">0</strong></div>
        <div><span class="stat-label">LIVES</span><strong id="lives">♥♥♥</strong></div>
      </div>
      <div class="actions">
        <button id="startButton" class="primary">Start / Restart</button>
        <button id="vocabularyButton">Vocabulary</button>
        <button id="settingsButton">Settings</button>
      </div>
    </header>
    <div class="active-strip"><span>LOCK</span><strong id="activeTarget">waiting for target</strong><small>Esc unlocks target · Backspace corrects input</small></div>
    <main class="game-stage">
      <canvas id="gameCanvas"></canvas>
      <div id="emptyVocabulary" class="empty-vocab hidden">Add at least one vocabulary entry before starting.</div>
    </main>
  </div>

  <dialog id="vocabularyDialog" class="panel-dialog">
    <form method="dialog" class="dialog-card vocab-card">
      <div class="dialog-header">
        <div><h2>Vocabulary</h2><p>English is shown in the game. Vietnamese + IPA are revealed only after the English target is typed correctly.</p></div>
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
      <div class="dialog-footer"><span id="vocabCount"></span><button type="button" id="saveVocabulary" class="primary">Save vocabulary</button></div>
    </form>
  </dialog>

  <dialog id="settingsDialog" class="panel-dialog">
    <form method="dialog" class="dialog-card settings-card">
      <div class="dialog-header"><div><h2>Game settings</h2><p>Settings are stored locally in this browser.</p></div><button class="icon-button" value="cancel">×</button></div>
      <div class="settings-grid">
        <label><span>Pronunciation</span><select id="speechEnabled"><option value="true">Enabled</option><option value="false">Disabled</option></select></label>
        <label><span>Accent</span><select id="accent"><option value="en-US">US</option><option value="en-GB">UK</option></select></label>
        <label><span>Speech speed</span><input id="speechRate" type="range" min="0.65" max="1.4" step="0.05" /><output id="speechRateValue"></output></label>
        <label><span>Volume</span><input id="volume" type="range" min="0" max="1" step="0.05" /><output id="volumeValue"></output></label>
        <label><span>Difficulty</span><select id="difficulty"><option value="1">Learning</option><option value="2">Normal</option><option value="3">Fast</option></select></label>
        <label><span>Reveal duration</span><input id="revealMs" type="range" min="700" max="5000" step="100" /><output id="revealMsValue"></output></label>
        <label><span>Graphics</span><select id="graphics"><option value="performance">Performance</option><option value="balanced">Balanced</option><option value="quality">Quality</option></select></label>
      </div>
      <div class="dialog-footer"><button type="button" id="resetSettings">Defaults</button><button type="button" id="saveSettings" class="primary">Save settings</button></div>
    </form>
  </dialog>
\`;

const canvas = document.querySelector<HTMLCanvasElement>("#gameCanvas");
const vocabularyDialog = document.querySelector<HTMLDialogElement>("#vocabularyDialog");
const settingsDialog = document.querySelector<HTMLDialogElement>("#settingsDialog");
if (canvas === null || vocabularyDialog === null || settingsDialog === null) throw new Error("Required UI is missing");

let vocabulary = await getVocabulary();
let settings = loadSettings();

function hud(state: HudState): void {
  const score = document.querySelector<HTMLElement>("#score");
  const streak = document.querySelector<HTMLElement>("#streak");
  const lives = document.querySelector<HTMLElement>("#lives");
  const active = document.querySelector<HTMLElement>("#activeTarget");
  if (score) score.textContent = String(state.score);
  if (streak) streak.textContent = String(state.streak);
  if (lives) lives.textContent = "♥".repeat(Math.max(0, state.lives)) + "♡".repeat(Math.max(0, 3 - state.lives));
  if (active) active.textContent = state.active || (state.running ? "type the first letter of a target" : "waiting for target");
}

const game = new Game(canvas, vocabulary, settings, hud);

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (el === null) throw new Error(\`#\${id} not found\`);
  return el as T;
}

byId<HTMLButtonElement>("startButton").addEventListener("click", () => {
  if (vocabulary.length === 0) {
    byId("emptyVocabulary").classList.remove("hidden");
    return;
  }
  byId("emptyVocabulary").classList.add("hidden");
  game.start();
  canvas.focus();
});

byId<HTMLButtonElement>("vocabularyButton").addEventListener("click", () => {
  renderVocabularyRows();
  byId<HTMLTextAreaElement>("bulkInput").value = vocabularyToBulk(vocabulary);
  vocabularyDialog.showModal();
});
byId<HTMLButtonElement>("settingsButton").addEventListener("click", () => { fillSettingsForm(settings); settingsDialog.showModal(); });

function renderVocabularyRows(): void {
  const body = byId<HTMLTableSectionElement>("vocabRows");
  body.replaceChildren();
  for (const entry of vocabulary) body.append(createVocabularyRow(entry));
  byId("vocabCount").textContent = \`\${vocabulary.length} entries\`;
}

function createVocabularyRow(entry: VocabularyEntry): HTMLTableRowElement {
  const tr = document.createElement("tr");
  tr.dataset["id"] = entry.id;
  for (const [field, value] of [["en", entry.en], ["vi", entry.vi], ["ipa", entry.ipa]] as const) {
    const td = document.createElement("td");
    const input = document.createElement("input");
    input.dataset["field"] = field;
    input.value = value;
    input.placeholder = field === "en" ? "dependency injection" : field === "vi" ? "tiêm phụ thuộc" : "/.../";
    td.append(input);
    tr.append(td);
  }
  const action = document.createElement("td");
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "remove-row";
  remove.textContent = "×";
  remove.addEventListener("click", () => { tr.remove(); updateTableCount(); });
  action.append(remove);
  tr.append(action);
  return tr;
}

function updateTableCount(): void {
  byId("vocabCount").textContent = \`\${document.querySelectorAll("#vocabRows tr").length} entries\`;
}

byId<HTMLButtonElement>("addRow").addEventListener("click", () => {
  byId<HTMLTableSectionElement>("vocabRows").append(createVocabularyRow({ id: crypto.randomUUID(), en: "", vi: "", ipa: "" }));
  updateTableCount();
});
byId<HTMLButtonElement>("toggleBulk").addEventListener("click", () => byId("bulkArea").classList.toggle("hidden"));
byId<HTMLButtonElement>("applyBulk").addEventListener("click", () => {
  const parsed = parseBulkVocabulary(byId<HTMLTextAreaElement>("bulkInput").value);
  vocabulary = parsed;
  renderVocabularyRows();
});

byId<HTMLButtonElement>("saveVocabulary").addEventListener("click", async () => {
  const entries: VocabularyEntry[] = [];
  for (const row of document.querySelectorAll<HTMLTableRowElement>("#vocabRows tr")) {
    const en = row.querySelector<HTMLInputElement>('input[data-field="en"]')?.value.trim() ?? "";
    const vi = row.querySelector<HTMLInputElement>('input[data-field="vi"]')?.value.trim() ?? "";
    const ipa = row.querySelector<HTMLInputElement>('input[data-field="ipa"]')?.value.trim() ?? "";
    if (en === "" || vi === "") continue;
    entries.push({ id: row.dataset["id"] ?? crypto.randomUUID(), en, vi, ipa });
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
  downloadJson("typing-game-vocab-shooter-backup.json", { version: 1, vocabulary, settings });
});
byId<HTMLInputElement>("importBackup").addEventListener("change", async (event) => {
  const file = (event.currentTarget as HTMLInputElement).files?.[0];
  if (file === undefined) return;
  try {
    const data = JSON.parse(await file.text()) as { vocabulary?: VocabularyEntry[]; settings?: ShooterSettings };
    if (Array.isArray(data.vocabulary)) {
      vocabulary = data.vocabulary.filter((entry) => typeof entry.en === "string" && typeof entry.vi === "string").map((entry) => ({ ...entry, id: entry.id || crypto.randomUUID(), ipa: entry.ipa ?? "" }));
      await replaceVocabulary(vocabulary);
      game.setVocabulary(vocabulary);
    }
    if (data.settings !== undefined) {
      settings = { ...settings, ...data.settings };
      saveSettings(settings);
      game.updateSettings(settings);
    }
    renderVocabularyRows();
    byId<HTMLTextAreaElement>("bulkInput").value = vocabularyToBulk(vocabulary);
  } catch {
    alert("Invalid backup file.");
  } finally {
    (event.currentTarget as HTMLInputElement).value = "";
  }
});

function fillSettingsForm(value: ShooterSettings): void {
  byId<HTMLSelectElement>("speechEnabled").value = String(value.speechEnabled);
  byId<HTMLSelectElement>("accent").value = value.accent;
  byId<HTMLInputElement>("speechRate").value = String(value.speechRate);
  byId<HTMLInputElement>("volume").value = String(value.volume);
  byId<HTMLSelectElement>("difficulty").value = String(value.difficulty);
  byId<HTMLInputElement>("revealMs").value = String(value.revealMs);
  byId<HTMLSelectElement>("graphics").value = value.graphics;
  updateSettingOutputs();
}
function updateSettingOutputs(): void {
  byId<HTMLOutputElement>("speechRateValue").value = \`\${Number(byId<HTMLInputElement>("speechRate").value).toFixed(2)}×\`;
  byId<HTMLOutputElement>("volumeValue").value = \`\${Math.round(Number(byId<HTMLInputElement>("volume").value) * 100)}%\`;
  byId<HTMLOutputElement>("revealMsValue").value = \`\${(Number(byId<HTMLInputElement>("revealMs").value) / 1000).toFixed(1)}s\`;
}
for (const id of ["speechRate", "volume", "revealMs"]) byId<HTMLInputElement>(id).addEventListener("input", updateSettingOutputs);
byId<HTMLButtonElement>("resetSettings").addEventListener("click", () => fillSettingsForm(defaultSettings));
byId<HTMLButtonElement>("saveSettings").addEventListener("click", () => {
  settings = {
    speechEnabled: byId<HTMLSelectElement>("speechEnabled").value === "true",
    accent: byId<HTMLSelectElement>("accent").value as ShooterSettings["accent"],
    speechRate: Number(byId<HTMLInputElement>("speechRate").value),
    volume: Number(byId<HTMLInputElement>("volume").value),
    difficulty: Number(byId<HTMLSelectElement>("difficulty").value) as 1 | 2 | 3,
    revealMs: Number(byId<HTMLInputElement>("revealMs").value),
    graphics: byId<HTMLSelectElement>("graphics").value as ShooterSettings["graphics"],
  };
  saveSettings(settings);
  game.updateSettings(settings);
  settingsDialog.close();
});

window.addEventListener("beforeunload", () => game.destroy());
