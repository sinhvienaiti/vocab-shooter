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
import {
  loadVocabularyGrammarIndex,
  loadVocabularyGrammarModule,
  loadVocabularyIndex,
  loadVocabularyLevel,
  loadVocabularyPosCategory,
  loadVocabularyPosIndex,
  loadVocabularySourceSettings,
  loadVocabularyTopic,
  loadVocabularyTopicIndex,
  saveVocabularySourceSettings,
  type VocabularyGrammarIndex,
  type VocabularyIndex,
  type VocabularyPosIndex,
  type VocabularySourceMode,
  type VocabularyTopicIndex,
} from "./vocabulary/library";

const app = document.querySelector<HTMLDivElement>("#app");
if (app === null) throw new Error("#app not found");

function settingTitle(label: string, help: string): string {
  return `<span class="setting-title"><span>${label}</span><span class="setting-help" tabindex="0" role="note" aria-label="${help}" data-help="${help}">?</span></span>`;
}

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

    <div id="gameNotice" class="game-notice" role="status" aria-live="polite"></div>

    <main class="game-stage">
      <canvas id="gameCanvas" tabindex="0"></canvas>
      <div id="startOverlay" class="start-overlay" aria-live="polite">
        <strong id="startOverlayTitle">Ready when you are</strong>
        <span id="startOverlayText">Press Start to begin</span>
      </div>
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

      <div class="vocab-source">
        <div class="vocab-source-tabs">
          <button type="button" id="sourceClass">Class</button>
          <button type="button" id="sourceTopic">Topic</button>
          <button type="button" id="sourceWordType">Word type</button>
          <button type="button" id="sourceGrammar">Grammar</button>
          <button type="button" id="sourceCustom">Custom</button>
        </div>
        <div id="classSourcePanel" class="class-source-panel hidden">
          <label>
            <span>Level</span>
            <select id="classLevel"></select>
          </label>
          <span id="classLevelMeta" class="class-level-meta"></span>
          <button type="button" id="applyClassSource" class="primary">Use level</button>
        </div>
        <div id="topicSourcePanel" class="class-source-panel topic-source-panel hidden">
          <label>
            <span>Topic</span>
            <select id="topicSelect"></select>
          </label>
          <span id="topicMeta" class="class-level-meta"></span>
          <button type="button" id="applyTopicSource" class="primary">Use topic</button>
        </div>
        <div id="wordTypeSourcePanel" class="class-source-panel hidden">
          <label>
            <span>Word type</span>
            <select id="wordTypeSelect"></select>
          </label>
          <span id="wordTypeMeta" class="class-level-meta"></span>
          <button type="button" id="applyWordTypeSource" class="primary">Use word type</button>
        </div>
        <div id="grammarSourcePanel" class="class-source-panel hidden">
          <label>
            <span>Grammar</span>
            <select id="grammarSelect"></select>
          </label>
          <span id="grammarMeta" class="class-level-meta"></span>
          <button type="button" id="applyGrammarSource" class="primary">Use grammar</button>
        </div>
      </div>

      <div id="customSourcePanel">
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
        <label>${settingTitle("Pronunciation", "Play the English pronunciation at the learning event for the current mode.")}<select id="speechEnabled"><option value="true">Enabled</option><option value="false">Disabled</option></select></label>
        <label>${settingTitle("Accent", "Choose the English voice accent used by browser speech.")}<select id="accent"><option value="en-US">US</option><option value="en-GB">UK</option></select></label>
        <label>${settingTitle("Speech speed", "Adjust how quickly English pronunciation is spoken.")}<input id="speechRate" type="range" min="0.65" max="1.4" step="0.05" /><output id="speechRateValue"></output></label>
        <label>${settingTitle("Speech volume", "Adjust pronunciation volume.")}<input id="volume" type="range" min="0" max="1" step="0.05" /><output id="volumeValue"></output></label>
        <label>${settingTitle("Reveal duration", "Choose how long Vietnamese and IPA stay visible after a correct target.")}<input id="revealMs" type="range" min="700" max="5000" step="100" /><output id="revealMsValue"></output></label>
        <label>${settingTitle("Graphics", "Balance particles and visual detail against rendering performance.")}<select id="graphics"><option value="performance">Performance</option><option value="balanced">Balanced</option><option value="quality">Quality</option></select></label>
        <label>${settingTitle("Quick restart", "Reset to ready. Press another key, then the 3-second countdown starts.")}<select id="quickRestartKey"><option value="Escape">Escape</option><option value="Tab">Tab</option></select></label>
        <label>${settingTitle("Fallback music", "Use Shooter's procedural background music only when the shared portal music is not playing.")}<select id="musicEnabled"><option value="true">Enabled</option><option value="false">Disabled</option></select></label>
        <label>${settingTitle("Fallback music volume", "Adjust Shooter's procedural fallback music volume.")}<input id="musicVolume" type="range" min="0" max="1" step="0.05" /><output id="musicVolumeValue"></output></label>
        <label>${settingTitle("SFX volume", "Adjust game sound-effect volume.")}<input id="sfxVolume" type="range" min="0" max="1" step="0.05" /><output id="sfxVolumeValue"></output></label>
        <label>${settingTitle("Danger audio", "Enable warning audio when the current mode becomes dangerous.")}<select id="dangerAudioEnabled"><option value="true">Enabled</option><option value="false">Disabled</option></select></label>
      </div>

      <h3 class="settings-section-title">Classic Survival</h3>
      <div class="settings-grid mode-setting" data-setting-mode="classic">
        <label>${settingTitle("Lives", "Number of missed targets allowed before Classic Survival ends.")}<input id="classicLives" type="number" min="1" max="9" step="1" /></label>
        <label>${settingTitle("Spawn interval", "Time between new target spawns.")}<input id="classicSpawn" type="number" min="700" max="5000" step="100" /><small>milliseconds</small></label>
        <label>${settingTitle("Enemy speed", "How quickly Classic targets move toward the player.")}<input id="classicSpeed" type="number" min="15" max="120" step="1" /></label>
      </div>

      <h3 class="settings-section-title">Bounce / Relax</h3>
      <div class="settings-grid mode-setting" data-setting-mode="bounce">
        <label>${settingTitle("Maximum active words", "Maximum number of Bounce words allowed on screen.")}<input id="bounceMax" type="number" min="3" max="30" step="1" /></label>
        <label>${settingTitle("Spawn interval", "Time between new target spawns for this mode.")}<input id="bounceSpawn" type="number" min="700" max="10000" step="100" /><small>milliseconds</small></label>
        <label>${settingTitle("Movement speed", "Movement speed of Bounce targets.")}<input id="bounceSpeed" type="number" min="20" max="160" step="1" /></label>
      </div>

      <h3 class="settings-section-title">Time Attack</h3>
      <div class="settings-grid mode-setting" data-setting-mode="timeAttack">
        <label>${settingTitle("Duration", "Total length of a Time Attack run.")}<input id="timeDuration" type="number" min="15" max="600" step="5" /><small>seconds</small></label>
        <label>${settingTitle("Spawn interval", "Time between new target spawns for this mode.")}<input id="timeSpawn" type="number" min="600" max="5000" step="100" /><small>milliseconds</small></label>
        <label>${settingTitle("Enemy speed", "Movement speed of targets in this mode.")}<input id="timeSpeed" type="number" min="15" max="140" step="1" /></label>
      </div>

      <h3 class="settings-section-title">Target Rush</h3>
      <div class="settings-grid mode-setting" data-setting-mode="targetRush">
        <label>${settingTitle("Target count", "Number of targets included in one Target Rush run.")}<input id="rushCount" type="number" min="5" max="100" step="1" /></label>
        <label>${settingTitle("Spotlight time", "Time a Target Rush word stays in the safe spotlight phase.")}<input id="rushFocus" type="number" min="1.5" max="6" step="0.1" /><small>seconds</small></label>
        <label>${settingTitle("Dive time", "Time available to save a danger target before it reaches the player.")}<input id="rushImpact" type="number" min="1" max="4" step="0.1" /><small>seconds</small></label>
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

let customVocabulary = await getVocabulary();
let sourceSettings = loadVocabularySourceSettings();
let vocabularySourceTab: VocabularySourceMode = sourceSettings.mode;
let libraryIndex: VocabularyIndex | null = null;
let topicIndex: VocabularyTopicIndex | null = null;
let posIndex: VocabularyPosIndex | null = null;
let grammarIndex: VocabularyGrammarIndex | null = null;
let vocabulary = customVocabulary;

try {
  libraryIndex = await loadVocabularyIndex();
  if (sourceSettings.mode === "class") {
    vocabulary = await loadVocabularyLevel(sourceSettings.level, libraryIndex);
  } else if (sourceSettings.mode === "topic") {
    topicIndex = await loadVocabularyTopicIndex();
    vocabulary = await loadVocabularyTopic(
      sourceSettings.topicId,
      topicIndex,
      libraryIndex,
    );
  } else if (sourceSettings.mode === "word-type") {
    posIndex = await loadVocabularyPosIndex();
    vocabulary = await loadVocabularyPosCategory(
      sourceSettings.posId,
      posIndex,
      libraryIndex,
    );
  } else if (sourceSettings.mode === "grammar") {
    [grammarIndex, topicIndex] = await Promise.all([
      loadVocabularyGrammarIndex(),
      loadVocabularyTopicIndex(),
    ]);
    vocabulary = await loadVocabularyGrammarModule(
      sourceSettings.grammarId,
      grammarIndex,
      topicIndex,
      libraryIndex,
    );
  }
} catch (error) {
  console.warn(error);
  sourceSettings = { ...sourceSettings, mode: "custom" };
  vocabulary = customVocabulary;
}

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
  byId("shortcutHelp").textContent = `${settings.quickRestartKey} ready restart · ${unlockKey} unlock · Backspace corrects`;
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
  byId("resultShortcut").textContent = `${settings.quickRestartKey} resets to ready`;

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

let countdownTimer: number | null = null;
let noticeTimer: number | null = null;
let countdownActive = false;
let readyForKey = false;

function clearCountdown(): void {
  if (countdownTimer === null) return;
  window.clearTimeout(countdownTimer);
  countdownTimer = null;
}

function setStartOverlay(title: string, text: string): void {
  byId("startOverlayTitle").textContent = title;
  byId("startOverlayText").textContent = text;
  byId("startOverlay").classList.remove("hidden");
}

function hideStartOverlay(): void {
  byId("startOverlay").classList.add("hidden");
}

function showGameNotice(message: string): void {
  if (noticeTimer !== null) window.clearTimeout(noticeTimer);
  const notice = byId("gameNotice");
  notice.textContent = message;
  notice.classList.add("visible");
  noticeTimer = window.setTimeout(() => {
    notice.classList.remove("visible");
    noticeTimer = null;
  }, 2600);
}

const game = new Game(
  canvas,
  vocabulary,
  settings,
  hud,
  learningPanel,
  showResult,
);

window.addEventListener("message", (event: MessageEvent<unknown>) => {
  if (event.source !== window.parent) return;
  if (event.data === null || typeof event.data !== "object") return;
  const data = event.data as Record<string, unknown>;
  if (data["type"] !== "typing-game:shared-music") return;
  if (typeof data["playing"] !== "boolean") return;
  game.setSharedMusicPlaying(data["playing"]);
});

function prepareRestart(): void {
  clearCountdown();
  countdownActive = false;
  readyForKey = true;
  if (resultDialog.open) resultDialog.close();
  byId("emptyVocabulary").classList.add("hidden");
  game.prepare();
  setStartOverlay("Ready when you are", "Press any key to start");
  canvas.focus();
}

function beginCountdown(): void {
  if (vocabulary.length === 0) {
    byId("emptyVocabulary").classList.remove("hidden");
    return;
  }

  clearCountdown();
  countdownActive = true;
  readyForKey = false;
  if (resultDialog.open) resultDialog.close();
  byId("emptyVocabulary").classList.add("hidden");
  game.prepare();
  canvas.focus();

  let remaining = 3;
  const tick = (): void => {
    setStartOverlay(String(remaining), "Get ready");
    if (remaining === 1) {
      countdownTimer = window.setTimeout(() => {
        countdownTimer = null;
        countdownActive = false;
        hideStartOverlay();
        game.start();
        canvas.focus();
      }, 1000);
      return;
    }
    remaining--;
    countdownTimer = window.setTimeout(tick, 1000);
  };
  tick();
}

byId<HTMLButtonElement>("startButton").addEventListener("click", beginCountdown);
byId<HTMLButtonElement>("resultRestart").addEventListener("click", beginCountdown);
byId<HTMLButtonElement>("closeResult").addEventListener("click", () => resultDialog.close());

for (const button of document.querySelectorAll<HTMLButtonElement>(".mode-tabs button")) {
  button.addEventListener("click", () => {
    const mode = button.dataset["mode"] as GameMode | undefined;
    if (mode === undefined || mode === settings.mode) return;
    settings = { ...settings, mode };
    saveSettings(settings);
    game.updateSettings(settings);
    updateModeUi();
    prepareRestart();
  });
}

async function ensureVocabularyIndex(): Promise<VocabularyIndex> {
  if (libraryIndex !== null) return libraryIndex;
  libraryIndex = await loadVocabularyIndex();
  return libraryIndex;
}

async function ensureTopicIndex(): Promise<VocabularyTopicIndex> {
  if (topicIndex !== null) return topicIndex;
  topicIndex = await loadVocabularyTopicIndex();
  return topicIndex;
}

async function ensurePosIndex(): Promise<VocabularyPosIndex> {
  if (posIndex !== null) return posIndex;
  posIndex = await loadVocabularyPosIndex();
  return posIndex;
}

async function ensureGrammarIndex(): Promise<VocabularyGrammarIndex> {
  if (grammarIndex !== null) return grammarIndex;
  grammarIndex = await loadVocabularyGrammarIndex();
  return grammarIndex;
}

function curriculumLabel(id: string): string {
  return id
    .split("-")
    .map((part) => part.length === 0 ? part : part[0]!.toUpperCase() + part.slice(1))
    .join(" ");
}

function renderVocabularySourceUi(): void {
  byId<HTMLButtonElement>("sourceClass").classList.toggle(
    "active",
    vocabularySourceTab === "class",
  );
  byId<HTMLButtonElement>("sourceTopic").classList.toggle(
    "active",
    vocabularySourceTab === "topic",
  );
  byId<HTMLButtonElement>("sourceWordType").classList.toggle(
    "active",
    vocabularySourceTab === "word-type",
  );
  byId<HTMLButtonElement>("sourceGrammar").classList.toggle(
    "active",
    vocabularySourceTab === "grammar",
  );
  byId<HTMLButtonElement>("sourceCustom").classList.toggle(
    "active",
    vocabularySourceTab === "custom",
  );
  byId("classSourcePanel").classList.toggle(
    "hidden",
    vocabularySourceTab !== "class",
  );
  byId("topicSourcePanel").classList.toggle(
    "hidden",
    vocabularySourceTab !== "topic",
  );
  byId("wordTypeSourcePanel").classList.toggle(
    "hidden",
    vocabularySourceTab !== "word-type",
  );
  byId("grammarSourcePanel").classList.toggle(
    "hidden",
    vocabularySourceTab !== "grammar",
  );
  byId("customSourcePanel").classList.toggle(
    "hidden",
    vocabularySourceTab !== "custom",
  );

  if (vocabularySourceTab === "custom") {
    renderVocabularyRows();
    byId<HTMLTextAreaElement>("bulkInput").value =
      vocabularyToBulk(customVocabulary);
  }
}

function updateClassLevelMeta(): void {
  if (libraryIndex === null) return;
  const level = Number(byId<HTMLSelectElement>("classLevel").value);
  const metadata = libraryIndex.levels.find((item) => item.level === level);
  byId("classLevelMeta").textContent =
    metadata === undefined
      ? ""
      : `${metadata.count} entries · ${metadata.label}`;
}

async function populateClassLevels(): Promise<void> {
  const index = await ensureVocabularyIndex();
  const select = byId<HTMLSelectElement>("classLevel");
  select.replaceChildren();

  for (const level of index.levels) {
    const option = document.createElement("option");
    option.value = String(level.level);
    option.textContent =
      `Level ${String(level.level).padStart(3, "0")} · ${level.label}`;
    select.append(option);
  }

  select.value = String(
    index.levels.some((item) => item.level === sourceSettings.level)
      ? sourceSettings.level
      : (index.levels[0]?.level ?? 1),
  );
  updateClassLevelMeta();
}

function updateTopicMeta(): void {
  if (topicIndex === null) return;
  const topicId = byId<HTMLSelectElement>("topicSelect").value;
  const metadata = topicIndex.topics.find((item) => item.id === topicId);
  byId("topicMeta").textContent =
    metadata === undefined
      ? ""
      : `${metadata.count} entries · ${metadata.levels.join(" / ")}`;
}

async function populateTopics(): Promise<void> {
  const index = await ensureTopicIndex();
  const select = byId<HTMLSelectElement>("topicSelect");
  select.replaceChildren();

  const groups = new Map<string, HTMLOptGroupElement>();
  for (const topic of index.topics) {
    let group = groups.get(topic.group);
    if (group === undefined) {
      group = document.createElement("optgroup");
      group.label = topic.groupLabel ?? topic.group;
      groups.set(topic.group, group);
      select.append(group);
    }

    const option = document.createElement("option");
    option.value = topic.id;
    option.textContent = `${topic.label} · ${topic.count}`;
    group.append(option);
  }

  select.value = index.topics.some((item) => item.id === sourceSettings.topicId)
    ? sourceSettings.topicId
    : (index.topics[0]?.id ?? "");
  updateTopicMeta();
}

function updateWordTypeMeta(): void {
  if (posIndex === null) return;
  const id = byId<HTMLSelectElement>("wordTypeSelect").value;
  const category = posIndex.categories.find((item) => item.id === id);
  byId("wordTypeMeta").textContent =
    category === undefined
      ? ""
      : `${category.entries.length} available · ${category.missing.length} coverage gaps`;
}

async function populateWordTypes(): Promise<void> {
  const index = await ensurePosIndex();
  const select = byId<HTMLSelectElement>("wordTypeSelect");
  select.replaceChildren();

  for (const category of index.categories) {
    const option = document.createElement("option");
    option.value = category.id;
    option.textContent =
      `${curriculumLabel(category.id)} · ${category.entries.length}`;
    option.disabled = category.entries.length === 0;
    select.append(option);
  }

  const preferred = index.categories.find(
    (item) => item.id === sourceSettings.posId && item.entries.length > 0,
  );
  const fallback = index.categories.find((item) => item.entries.length > 0);
  select.value = preferred?.id ?? fallback?.id ?? "";
  updateWordTypeMeta();
}

function updateGrammarMeta(): void {
  if (grammarIndex === null) return;
  const id = byId<HTMLSelectElement>("grammarSelect").value;
  const module = grammarIndex.modules.find((item) => item.id === id);
  byId("grammarMeta").textContent =
    module === undefined
      ? ""
      : `${module.focus.join(" · ")} · ${module.signalEntries.length} signal words`;
}

async function populateGrammar(): Promise<void> {
  const index = await ensureGrammarIndex();
  const select = byId<HTMLSelectElement>("grammarSelect");
  select.replaceChildren();

  const timeGroup = document.createElement("optgroup");
  timeGroup.label = "Past / Present / Future";
  for (const id of index.primaryTimeGroups) {
    const module = index.modules.find((item) => item.id === id);
    if (module === undefined) continue;
    const option = document.createElement("option");
    option.value = module.id;
    option.textContent = module.label;
    timeGroup.append(option);
  }
  if (timeGroup.childElementCount > 0) select.append(timeGroup);

  const practicalGroup = document.createElement("optgroup");
  practicalGroup.label = "Practical grammar";
  for (const module of index.modules) {
    if (index.primaryTimeGroups.includes(module.id)) continue;
    const option = document.createElement("option");
    option.value = module.id;
    option.textContent = module.label;
    practicalGroup.append(option);
  }
  if (practicalGroup.childElementCount > 0) select.append(practicalGroup);

  select.value = index.modules.some((item) => item.id === sourceSettings.grammarId)
    ? sourceSettings.grammarId
    : (index.primaryTimeGroups[0] ?? index.modules[0]?.id ?? "");
  updateGrammarMeta();
}

async function useClassSource(level: number): Promise<void> {
  const applyButton = byId<HTMLButtonElement>("applyClassSource");
  applyButton.disabled = true;
  applyButton.textContent = "Applying…";

  try {
    const index = await ensureVocabularyIndex();
    const metadata = index.levels.find((item) => item.level === level);
    const entries = await loadVocabularyLevel(level, index);
    sourceSettings = { ...sourceSettings, mode: "class", level };
    vocabularySourceTab = "class";
    saveVocabularySourceSettings(sourceSettings);
    vocabulary = entries;
    game.setVocabulary(vocabulary);
    vocabularyDialog.close();
    prepareRestart();
    showGameNotice(
      metadata === undefined
        ? `Level ${String(level).padStart(3, "0")} applied`
        : `Level ${String(level).padStart(3, "0")} applied · ${metadata.count} entries`,
    );
  } catch (error) {
    alert(
      error instanceof Error
        ? error.message
        : "Unable to load the selected vocabulary level.",
    );
  } finally {
    applyButton.disabled = false;
    applyButton.textContent = "Use level";
  }
}

async function useTopicSource(topicId: string): Promise<void> {
  const applyButton = byId<HTMLButtonElement>("applyTopicSource");
  applyButton.disabled = true;
  applyButton.textContent = "Applying…";

  try {
    const [topics, levels] = await Promise.all([
      ensureTopicIndex(),
      ensureVocabularyIndex(),
    ]);
    const metadata = topics.topics.find((item) => item.id === topicId);
    const entries = await loadVocabularyTopic(topicId, topics, levels);
    sourceSettings = { ...sourceSettings, mode: "topic", topicId };
    vocabularySourceTab = "topic";
    saveVocabularySourceSettings(sourceSettings);
    vocabulary = entries;
    game.setVocabulary(vocabulary);
    vocabularyDialog.close();
    prepareRestart();
    showGameNotice(
      metadata === undefined
        ? `Topic applied · ${entries.length} entries`
        : `${metadata.label} applied · ${entries.length} entries`,
    );
  } catch (error) {
    alert(
      error instanceof Error
        ? error.message
        : "Unable to load the selected vocabulary topic.",
    );
  } finally {
    applyButton.disabled = false;
    applyButton.textContent = "Use topic";
  }
}

async function useWordTypeSource(posId: string): Promise<void> {
  const applyButton = byId<HTMLButtonElement>("applyWordTypeSource");
  applyButton.disabled = true;
  applyButton.textContent = "Applying…";

  try {
    const [wordTypes, levels] = await Promise.all([
      ensurePosIndex(),
      ensureVocabularyIndex(),
    ]);
    const category = wordTypes.categories.find((item) => item.id === posId);
    const entries = await loadVocabularyPosCategory(posId, wordTypes, levels);
    sourceSettings = { ...sourceSettings, mode: "word-type", posId };
    vocabularySourceTab = "word-type";
    saveVocabularySourceSettings(sourceSettings);
    vocabulary = entries;
    game.setVocabulary(vocabulary);
    vocabularyDialog.close();
    prepareRestart();
    showGameNotice(
      category === undefined
        ? `Word type applied · ${entries.length} entries`
        : `${curriculumLabel(category.id)} applied · ${entries.length} entries`,
    );
  } catch (error) {
    alert(error instanceof Error ? error.message : "Unable to load the selected word type.");
  } finally {
    applyButton.disabled = false;
    applyButton.textContent = "Use word type";
  }
}

async function useGrammarSource(grammarId: string): Promise<void> {
  const applyButton = byId<HTMLButtonElement>("applyGrammarSource");
  applyButton.disabled = true;
  applyButton.textContent = "Applying…";

  try {
    const [grammar, topics, levels] = await Promise.all([
      ensureGrammarIndex(),
      ensureTopicIndex(),
      ensureVocabularyIndex(),
    ]);
    const module = grammar.modules.find((item) => item.id === grammarId);
    const entries = await loadVocabularyGrammarModule(
      grammarId,
      grammar,
      topics,
      levels,
    );
    sourceSettings = { ...sourceSettings, mode: "grammar", grammarId };
    vocabularySourceTab = "grammar";
    saveVocabularySourceSettings(sourceSettings);
    vocabulary = entries;
    game.setVocabulary(vocabulary);
    vocabularyDialog.close();
    prepareRestart();
    showGameNotice(
      module === undefined
        ? `Grammar practice applied · ${entries.length} entries`
        : `${module.label} applied · ${entries.length} entries`,
    );
  } catch (error) {
    alert(error instanceof Error ? error.message : "Unable to load the selected grammar module.");
  } finally {
    applyButton.disabled = false;
    applyButton.textContent = "Use grammar";
  }
}

byId<HTMLButtonElement>("vocabularyButton").addEventListener("click", async () => {
  vocabularySourceTab = sourceSettings.mode;
  try {
    await Promise.all([
      populateClassLevels(),
      populateTopics(),
      populateWordTypes(),
      populateGrammar(),
    ]);
  } catch (error) {
    console.warn(error);
  }
  renderVocabularySourceUi();
  vocabularyDialog.showModal();
});

byId<HTMLButtonElement>("sourceClass").addEventListener("click", async () => {
  vocabularySourceTab = "class";
  renderVocabularySourceUi();
  try {
    await populateClassLevels();
  } catch (error) {
    alert(
      error instanceof Error ? error.message : "Unable to load vocabulary levels.",
    );
  }
});

byId<HTMLButtonElement>("sourceTopic").addEventListener("click", async () => {
  vocabularySourceTab = "topic";
  renderVocabularySourceUi();
  try {
    await populateTopics();
  } catch (error) {
    alert(
      error instanceof Error ? error.message : "Unable to load vocabulary topics.",
    );
  }
});

byId<HTMLButtonElement>("sourceWordType").addEventListener("click", async () => {
  vocabularySourceTab = "word-type";
  renderVocabularySourceUi();
  try {
    await populateWordTypes();
  } catch (error) {
    alert(error instanceof Error ? error.message : "Unable to load vocabulary word types.");
  }
});

byId<HTMLButtonElement>("sourceGrammar").addEventListener("click", async () => {
  vocabularySourceTab = "grammar";
  renderVocabularySourceUi();
  try {
    await populateGrammar();
  } catch (error) {
    alert(error instanceof Error ? error.message : "Unable to load vocabulary grammar.");
  }
});

byId<HTMLButtonElement>("sourceCustom").addEventListener("click", () => {
  vocabularySourceTab = "custom";
  renderVocabularySourceUi();
});

byId<HTMLSelectElement>("classLevel").addEventListener(
  "change",
  updateClassLevelMeta,
);
byId<HTMLSelectElement>("topicSelect").addEventListener(
  "change",
  updateTopicMeta,
);
byId<HTMLSelectElement>("wordTypeSelect").addEventListener(
  "change",
  updateWordTypeMeta,
);
byId<HTMLSelectElement>("grammarSelect").addEventListener(
  "change",
  updateGrammarMeta,
);

byId<HTMLButtonElement>("applyClassSource").addEventListener("click", () => {
  void useClassSource(Number(byId<HTMLSelectElement>("classLevel").value));
});
byId<HTMLButtonElement>("applyTopicSource").addEventListener("click", () => {
  void useTopicSource(byId<HTMLSelectElement>("topicSelect").value);
});
byId<HTMLButtonElement>("applyWordTypeSource").addEventListener("click", () => {
  void useWordTypeSource(byId<HTMLSelectElement>("wordTypeSelect").value);
});
byId<HTMLButtonElement>("applyGrammarSource").addEventListener("click", () => {
  void useGrammarSource(byId<HTMLSelectElement>("grammarSelect").value);
});

byId<HTMLButtonElement>("settingsButton").addEventListener("click", () => {
  fillSettingsForm(settings);
  settingsDialog.showModal();
});

function renderVocabularyRows(): void {
  const body = byId<HTMLTableSectionElement>("vocabRows");
  body.replaceChildren();
  for (const entry of customVocabulary) body.append(createVocabularyRow(entry));
  byId("vocabCount").textContent = `${customVocabulary.length} entries`;
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
  customVocabulary = parseBulkVocabulary(
    byId<HTMLTextAreaElement>("bulkInput").value,
  );
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
  customVocabulary = entries;
  await replaceVocabulary(customVocabulary);
  sourceSettings = { ...sourceSettings, mode: "custom" };
  vocabularySourceTab = "custom";
  saveVocabularySourceSettings(sourceSettings);
  vocabulary = customVocabulary;
  game.setVocabulary(vocabulary);
  vocabularyDialog.close();
  prepareRestart();
  showGameNotice(`Custom vocabulary saved · ${customVocabulary.length} entries`);
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
    vocabulary: customVocabulary,
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
      customVocabulary = data.vocabulary
        .filter((entry) => typeof entry.en === "string" && typeof entry.vi === "string")
        .map((entry) => ({
          ...entry,
          id: entry.id || crypto.randomUUID(),
          ipa: entry.ipa ?? "",
        }));
      await replaceVocabulary(customVocabulary);
      if (sourceSettings.mode === "custom") {
        vocabulary = customVocabulary;
        game.setVocabulary(vocabulary);
      }
    }

    if (data.settings !== undefined) {
      settings = normalizeSettings(data.settings);
      saveSettings(settings);
      game.updateSettings(settings);
      updateModeUi();
    }

    renderVocabularyRows();
    byId<HTMLTextAreaElement>("bulkInput").value =
      vocabularyToBulk(customVocabulary);
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

window.addEventListener("keydown", (event) => {
  if (vocabularyDialog.open || settingsDialog.open) return;

  if (event.key === settings.quickRestartKey) {
    event.preventDefault();
    prepareRestart();
    return;
  }

  if (resultDialog.open || !readyForKey || countdownActive) return;
  if (event.metaKey || event.ctrlKey || event.altKey) return;

  event.preventDefault();
  beginCountdown();
});

updateModeUi();
window.addEventListener("beforeunload", () => {
  clearCountdown();
  if (noticeTimer !== null) window.clearTimeout(noticeTimer);
  game.destroy();
});
