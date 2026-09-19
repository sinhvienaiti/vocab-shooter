import { AudioManager } from "../audio/AudioManager";
import { speakEnglish, stopSpeech } from "../audio/speech";
import type { ShooterSettings, VocabularyEntry } from "../types";
import {
  classicDangerLevel,
  classicMaxTargets,
  classicSpawnInterval,
  classicSpeed,
} from "./modes/ClassicMode";
import { bounceDangerLevel, reflectTarget } from "./modes/BounceMode";
import { timeAttackDangerLevel } from "./modes/TimeAttackMode";
import {
  layoutRushTargets,
  rushDangerLevel,
  shuffledEntries,
} from "./modes/TargetRushMode";
import type { GameResult, HudState, Target } from "./mode-types";

type Star = {
  x: number;
  y: number;
  size: number;
  speed: number;
  alpha: number;
};

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  ring: boolean;
};

type Shot = {
  x: number;
  y: number;
  tx: number;
  ty: number;
  speed: number;
  targetId: string;
  lateSave: boolean;
};

type Reveal = {
  x: number;
  y: number;
  vi: string;
  ipa: string;
  life: number;
  maxLife: number;
};

type LearningPanelState = {
  visible: boolean;
  vi: string;
  ipa: string;
};

export class Game {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly onHud: (state: HudState) => void;
  private readonly onLearningPanel: (state: LearningPanelState) => void;
  private readonly onResult: (result: GameResult) => void;
  private readonly onQuickRestart: () => void;
  private settings: ShooterSettings;
  private vocabulary: VocabularyEntry[];
  private targets: Target[] = [];
  private stars: Star[] = [];
  private particles: Particle[] = [];
  private shots: Shot[] = [];
  private reveals: Reveal[] = [];
  private activeTargetId: string | null = null;
  private spotlightTargetId: string | null = null;
  private rushQueue: string[] = [];
  private animationId: number | null = null;
  private lastTime = 0;
  private spawnElapsed = 0;
  private modeElapsed = 0;
  private spotlightElapsed = 0;
  private score = 0;
  private lives = 3;
  private streak = 0;
  private maxStreak = 0;
  private correctWords = 0;
  private missedWords = 0;
  private wrongKeys = 0;
  private typedCharacters = 0;
  private correctCharacters = 0;
  private wordTimeTotal = 0;
  private activeWordStartedAt = 0;
  private lateSaves = 0;
  private maxActiveWordsSeen = 0;
  private failedWord = "";
  private failureReason = "";
  private running = false;
  private width = 1;
  private height = 1;
  private dpr = 1;
  private previousCountdownSecond = -1;
  private readonly audio: AudioManager;
  private readonly keyHandler = (event: KeyboardEvent) => this.onKey(event);
  private readonly visibilityHandler = () => this.onVisibilityChange();
  private readonly resizeObserver: ResizeObserver;

  constructor(
    canvas: HTMLCanvasElement,
    vocabulary: VocabularyEntry[],
    settings: ShooterSettings,
    onHud: (state: HudState) => void,
    onLearningPanel: (state: LearningPanelState) => void,
    onResult: (result: GameResult) => void,
    onQuickRestart: () => void,
  ) {
    const ctx = canvas.getContext("2d");
    if (ctx === null) throw new Error("Canvas 2D context is unavailable");
    this.canvas = canvas;
    this.ctx = ctx;
    this.vocabulary = vocabulary;
    this.settings = settings;
    this.onHud = onHud;
    this.onLearningPanel = onLearningPanel;
    this.onResult = onResult;
    this.onQuickRestart = onQuickRestart;
    this.audio = new AudioManager(settings);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    window.addEventListener("keydown", this.keyHandler, { passive: false });
    document.addEventListener("visibilitychange", this.visibilityHandler);
    this.resize();
    this.seedStars();
    this.emitHud();
    this.loop(performance.now());
  }

  destroy(): void {
    if (this.animationId !== null) cancelAnimationFrame(this.animationId);
    this.resizeObserver.disconnect();
    window.removeEventListener("keydown", this.keyHandler);
    document.removeEventListener("visibilitychange", this.visibilityHandler);
    stopSpeech();
    this.audio.stop();
  }

  updateSettings(settings: ShooterSettings): void {
    this.settings = settings;
    this.audio.updateSettings(settings);
    this.seedStars();
  }

  setVocabulary(entries: VocabularyEntry[]): void {
    this.vocabulary = entries;
  }


  private resetState(): void {
    this.targets = [];
    this.particles = [];
    this.shots = [];
    this.reveals = [];
    this.activeTargetId = null;
    this.spotlightTargetId = null;
    this.rushQueue = [];
    this.score = 0;
    this.streak = 0;
    this.maxStreak = 0;
    this.correctWords = 0;
    this.missedWords = 0;
    this.wrongKeys = 0;
    this.typedCharacters = 0;
    this.correctCharacters = 0;
    this.wordTimeTotal = 0;
    this.activeWordStartedAt = 0;
    this.lateSaves = 0;
    this.maxActiveWordsSeen = 0;
    this.failedWord = "";
    this.failureReason = "";
    this.spawnElapsed = 0;
    this.modeElapsed = 0;
    this.spotlightElapsed = 0;
    this.previousCountdownSecond = -1;
    this.lives = this.settings.classic.lives;
    this.running = false;
    stopSpeech();
    this.audio.setDanger(0);
    this.onLearningPanel({ visible: false, vi: "", ipa: "" });
  }

  prepare(): void {
    this.resetState();
    this.emitHud(0);
  }

  start(): void {
    if (this.vocabulary.length === 0) return;
    this.resetState();
    this.audio.unlock();
    this.running = true;
    this.lastTime = performance.now();

    if (this.settings.mode === "targetRush") {
      this.prepareTargetRush();
    } else {
      this.spawnElapsed = this.currentSpawnInterval();
    }

    this.emitHud();
  }

  private prepareTargetRush(): void {
    const entries = shuffledEntries(this.vocabulary, this.settings.targetRush.targetCount);
    this.targets = entries.map((entry) => this.makeTarget(entry, "dormant"));
    this.rushQueue = this.targets.map((target) => target.id);
    layoutRushTargets(this.targets, this.width, this.height);
    this.maxActiveWordsSeen = this.targets.length;
    this.activateNextSpotlight();
  }

  private makeTarget(entry: VocabularyEntry, state: Target["state"]): Target {
    const width = Math.max(110, Math.min(340, 52 + entry.en.length * 10));
    return {
      id: crypto.randomUUID(),
      entry,
      x: this.width / 2,
      y: 40,
      vx: 0,
      vy: 0,
      speed: 0,
      typed: 0,
      width,
      pending: false,
      error: 0,
      state,
      dangerRemaining: 0,
      lateSave: false,
    };
  }

  private onVisibilityChange(): void {
    if (document.hidden) {
      if (this.animationId !== null) cancelAnimationFrame(this.animationId);
      this.animationId = null;
      stopSpeech();
      this.audio.suspend();
      return;
    }
    this.audio.unlock();
    this.lastTime = performance.now();
    if (this.animationId === null) {
      this.animationId = requestAnimationFrame((now) => this.loop(now));
    }
  }

  private resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const qualityCap =
      this.settings.graphics === "quality"
        ? 2
        : this.settings.graphics === "balanced"
          ? 1.6
          : 1;
    this.dpr = Math.min(window.devicePixelRatio || 1, qualityCap);
    this.width = Math.max(1, rect.width);
    this.height = Math.max(1, rect.height);
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.seedStars();
    if (this.settings.mode === "targetRush") {
      layoutRushTargets(this.targets, this.width, this.height);
    }
  }

  private seedStars(): void {
    const count =
      this.settings.graphics === "performance"
        ? 55
        : this.settings.graphics === "quality"
          ? 130
          : 90;
    this.stars = Array.from({ length: count }, () => ({
      x: Math.random() * this.width,
      y: Math.random() * this.height,
      size: Math.random() * 1.4 + 0.35,
      speed: Math.random() * 20 + 10,
      alpha: Math.random() * 0.55 + 0.2,
    }));
  }

  private loop(now: number): void {
    const delta = Math.min(0.033, Math.max(0, (now - this.lastTime) / 1000 || 0));
    this.lastTime = now;
    this.update(delta);
    this.draw();
    this.animationId = requestAnimationFrame((next) => this.loop(next));
  }

  private update(delta: number): void {
    this.updateStars(delta);
    this.updateParticles(delta);
    this.updateShots(delta);
    this.updateReveals(delta);

    if (!this.running || this.vocabulary.length === 0) {
      this.audio.setDanger(0);
      return;
    }

    this.modeElapsed += delta;

    if (this.settings.mode === "targetRush") {
      this.updateTargetRush(delta);
    } else {
      this.updateSpawnedModes(delta);
    }

    const danger = this.getDangerLevel();
    this.audio.setDanger(danger);
    this.emitHud(danger);
  }

  private updateStars(delta: number): void {
    for (const star of this.stars) {
      star.y += star.speed * delta;
      if (star.y > this.height) {
        star.y = -2;
        star.x = Math.random() * this.width;
      }
    }
  }

  private updateSpawnedModes(delta: number): void {
    if (this.settings.mode === "timeAttack") {
      const remaining = Math.max(0, this.settings.timeAttack.durationSec - this.modeElapsed);
      const second = Math.ceil(remaining);
      if (second <= 5 && second !== this.previousCountdownSecond && second > 0) {
        this.audio.playCountdown();
        this.previousCountdownSecond = second;
      }
      if (remaining <= 0) {
        this.finishRun("Time complete");
        return;
      }
    }

    this.spawnElapsed += delta * 1000;
    const maxTargets = this.currentMaxTargets();
    if (
      this.spawnElapsed >= this.currentSpawnInterval() &&
      this.targets.filter((target) => !target.pending).length < maxTargets
    ) {
      this.spawnTarget();
      this.spawnElapsed = 0;
    }

    for (const target of [...this.targets]) {
      target.error = Math.max(0, target.error - delta);
      if (target.pending) continue;

      if (this.settings.mode === "bounce") {
        target.x += target.vx * delta;
        target.y += target.vy * delta;
        reflectTarget(target, this.width, this.height);
        continue;
      }

      target.y += target.speed * delta;
      if (target.y > this.height - 92) {
        if (this.settings.mode === "classic") {
          this.classicTargetEscaped(target);
        } else {
          this.timeAttackTargetMissed(target);
        }
      }
    }

    const live = this.targets.filter((target) => !target.pending).length;
    this.maxActiveWordsSeen = Math.max(this.maxActiveWordsSeen, live);

    if (this.settings.mode === "bounce" && live > this.settings.bounce.maxActiveWords) {
      this.failedWord = "";
      this.finishRun("Word limit exceeded");
    }
  }

  private updateTargetRush(delta: number): void {
    this.spotlightElapsed += delta;

    const spotlight = this.targetById(this.spotlightTargetId);
    if (
      spotlight !== null &&
      !spotlight.pending &&
      spotlight.state === "spotlight" &&
      this.spotlightElapsed >= this.settings.targetRush.focusWindowSec
    ) {
      spotlight.state = "danger";
      spotlight.dangerRemaining = this.settings.targetRush.impactWindowSec;
      spotlight.lateSave = true;
      this.spotlightTargetId = null;
      this.spotlightElapsed = 0;
      if (this.activeTargetId === spotlight.id && spotlight.typed === 0) {
        this.activeTargetId = null;
      }
      this.activateNextSpotlight();
    } else if (
      spotlight === null &&
      this.rushQueue.length > 0 &&
      this.spotlightElapsed >= this.settings.targetRush.focusWindowSec
    ) {
      this.spotlightElapsed = 0;
      this.activateNextSpotlight();
    }

    for (const target of [...this.targets]) {
      target.error = Math.max(0, target.error - delta);
      if (target.pending || target.state !== "danger") continue;
      target.dangerRemaining -= delta;
      const remaining = Math.max(0.001, target.dangerRemaining);
      const playerX = this.width / 2;
      const playerY = this.height - 58;
      target.x += ((playerX - target.x) / remaining) * delta;
      target.y += ((playerY - target.y) / remaining) * delta;

      if (target.dangerRemaining <= 0 || Math.hypot(playerX - target.x, playerY - target.y) < 22) {
        this.failedWord = target.entry.en;
        this.audio.playImpact();
        this.addExplosion(playerX, playerY, true);
        this.finishRun("Target hit the player");
        return;
      }
    }

    // Successful completion is finalized after the last projectile lands,
    // so the player sees the hit effect before the results dialog.
  }

  private activateNextSpotlight(): void {
    while (this.rushQueue.length > 0) {
      const id = this.rushQueue.shift();
      const target = this.targetById(id ?? null);
      if (target === null || target.pending) continue;
      target.state = "spotlight";
      target.typed = 0;
      this.spotlightTargetId = target.id;
      this.spotlightElapsed = 0;
      this.onLearningPanel({
        visible: true,
        vi: target.entry.vi,
        ipa: target.entry.ipa,
      });
      speakEnglish(target.entry.en, this.settings);
      return;
    }

    this.spotlightTargetId = null;
    this.onLearningPanel({ visible: false, vi: "", ipa: "" });
  }

  private currentSpawnInterval(): number {
    if (this.settings.mode === "classic") {
      return classicSpawnInterval(this.settings, this.score);
    }
    if (this.settings.mode === "bounce") return this.settings.bounce.spawnIntervalMs;
    if (this.settings.mode === "timeAttack") return this.settings.timeAttack.spawnIntervalMs;
    return 1000;
  }

  private currentMaxTargets(): number {
    if (this.settings.mode === "classic") return classicMaxTargets(this.score);
    if (this.settings.mode === "bounce") return this.settings.bounce.maxActiveWords + 1;
    if (this.settings.mode === "timeAttack") return 7;
    return 0;
  }

  private spawnTarget(): void {
    const entry = this.vocabulary[Math.floor(Math.random() * this.vocabulary.length)];
    if (entry === undefined) return;
    const target = this.makeTarget(entry, "normal");
    const margin = target.width / 2 + 18;
    target.x = margin + Math.random() * Math.max(1, this.width - margin * 2);

    if (this.settings.mode === "bounce") {
      const angle = Math.PI * 0.18 + Math.random() * Math.PI * 1.64;
      target.y = 46 + Math.random() * Math.max(1, this.height - 150);
      target.vx = Math.cos(angle) * this.settings.bounce.speed;
      target.vy = Math.sin(angle) * this.settings.bounce.speed;
      if (Math.abs(target.vx) < 18) target.vx = target.vx < 0 ? -18 : 18;
      if (Math.abs(target.vy) < 18) target.vy = target.vy < 0 ? -18 : 18;
    } else {
      target.y = 38;
      target.speed =
        this.settings.mode === "classic"
          ? classicSpeed(this.settings, this.score)
          : this.settings.timeAttack.speed;
    }

    this.targets.push(target);
  }

  private onKey(event: KeyboardEvent): void {
    if (event.metaKey || event.ctrlKey || event.altKey) return;

    const eventTarget = event.target;
    if (
      eventTarget instanceof HTMLInputElement ||
      eventTarget instanceof HTMLTextAreaElement ||
      eventTarget instanceof HTMLSelectElement ||
      document.querySelector("dialog[open]") !== null
    ) {
      return;
    }

    if (event.key === this.settings.quickRestartKey) {
      event.preventDefault();
      this.onQuickRestart();
      return;
    }

    const unlockKey = this.settings.quickRestartKey === "Tab" ? "Escape" : "Tab";
    if (event.key === unlockKey) {
      event.preventDefault();
      this.activeTargetId = null;
      this.activeWordStartedAt = 0;
      this.emitHud();
      return;
    }

    if (!this.running) return;

    const active = this.activeTarget();
    if (event.key === "Backspace") {
      if (active !== null && active.typed > 0) {
        active.typed--;
        event.preventDefault();
        this.emitHud();
      }
      return;
    }

    if (event.key.length !== 1) return;
    event.preventDefault();
    this.typedCharacters++;
    const key = event.key.toLocaleLowerCase("en-US");

    let target = active;
    if (target === null) {
      const candidates = this.typableTargets(key);
      target = candidates[0] ?? null;
      if (target === null) {
        this.wrongKeys++;
        this.streak = 0;
        this.audio.playMiss();
        this.emitHud();
        return;
      }
      this.activeTargetId = target.id;
      this.activeWordStartedAt = performance.now();
    }

    const expected = target.entry.en[target.typed]?.toLocaleLowerCase("en-US");
    if (expected !== key) {
      target.error = 0.18;
      this.wrongKeys++;
      this.streak = 0;
      this.audio.playMiss();
      this.emitHud();
      return;
    }

    this.correctCharacters++;
    target.typed++;
    if (target.typed >= target.entry.en.length) {
      this.completeTarget(target);
    }
    this.emitHud();
  }

  private typableTargets(key: string): Target[] {
    const firstMatches = this.targets.filter((target) => {
      if (target.pending) return false;
      if (target.entry.en[0]?.toLocaleLowerCase("en-US") !== key) return false;
      if (this.settings.mode !== "targetRush") return true;
      return target.state === "spotlight" || target.state === "danger";
    });

    if (this.settings.mode === "targetRush") {
      return firstMatches.sort((a, b) => {
        const aDanger = a.state === "danger";
        const bDanger = b.state === "danger";
        if (aDanger !== bDanger) return aDanger ? -1 : 1;
        if (aDanger && bDanger) return a.dangerRemaining - b.dangerRemaining;
        return a.id === this.spotlightTargetId ? -1 : 1;
      });
    }

    return firstMatches.sort((a, b) => b.y - a.y);
  }

  private activeTarget(): Target | null {
    return this.targetById(this.activeTargetId);
  }

  private targetById(id: string | null): Target | null {
    if (id === null) return null;
    return this.targets.find((target) => target.id === id) ?? null;
  }

  private completeTarget(target: Target): void {
    target.pending = true;
    target.state = "pending";
    this.activeTargetId = null;
    const elapsed =
      this.activeWordStartedAt > 0 ? Math.max(0, (performance.now() - this.activeWordStartedAt) / 1000) : 0;
    this.wordTimeTotal += elapsed;
    this.activeWordStartedAt = 0;
    this.correctWords++;
    this.score += 10 + Math.min(25, this.streak * 2);
    this.streak++;
    this.maxStreak = Math.max(this.maxStreak, this.streak);

    const isRush = this.settings.mode === "targetRush";
    const lateSave = isRush && target.lateSave;
    if (lateSave) {
      this.lateSaves++;
      this.audio.playLateSave();
    }
    this.audio.playShoot();

    if (!isRush) {
      speakEnglish(target.entry.en, this.settings);
    }

    this.shots.push({
      x: this.width / 2,
      y: this.height - 62,
      tx: target.x,
      ty: target.y,
      speed: 1050,
      targetId: target.id,
      lateSave,
    });

    if (target.id === this.spotlightTargetId) {
      this.spotlightTargetId = null;
    }
  }

  private classicTargetEscaped(target: Target): void {
    this.removeTarget(target.id);
    this.missedWords++;
    this.lives--;
    this.streak = 0;
    if (this.activeTargetId === target.id) this.activeTargetId = null;
    if (this.lives <= 0) {
      this.failedWord = target.entry.en;
      this.finishRun("No lives remaining");
    }
  }

  private timeAttackTargetMissed(target: Target): void {
    this.removeTarget(target.id);
    this.missedWords++;
    this.streak = 0;
    if (this.activeTargetId === target.id) this.activeTargetId = null;
  }

  private updateShots(delta: number): void {
    const remaining: Shot[] = [];
    for (const shot of this.shots) {
      const dx = shot.tx - shot.x;
      const dy = shot.ty - shot.y;
      const distance = Math.hypot(dx, dy);
      const step = shot.speed * delta;
      if (distance <= step || distance < 8) {
        this.hitTarget(shot);
        continue;
      }
      shot.x += (dx / distance) * step;
      shot.y += (dy / distance) * step;
      remaining.push(shot);
    }
    this.shots = remaining;
  }

  private hitTarget(shot: Shot): void {
    const target = this.targetById(shot.targetId);
    if (target === null) return;
    const { x, y } = target;
    this.audio.playExplosion(shot.lateSave);
    this.addExplosion(x, y, shot.lateSave);

    if (this.settings.mode !== "targetRush") {
      this.reveals.push({
        x,
        y,
        vi: target.entry.vi,
        ipa: target.entry.ipa,
        life: this.settings.revealMs / 1000,
        maxLife: this.settings.revealMs / 1000,
      });
    }

    this.removeTarget(target.id);

    if (
      this.settings.mode === "targetRush" &&
      this.running &&
      this.rushQueue.length === 0 &&
      this.spotlightTargetId === null &&
      this.targets.length === 0
    ) {
      this.finishRun("Target set complete");
    }
  }

  private removeTarget(id: string): void {
    this.targets = this.targets.filter((target) => target.id !== id);
    if (this.activeTargetId === id) this.activeTargetId = null;
    if (this.spotlightTargetId === id) this.spotlightTargetId = null;
  }

  private addExplosion(x: number, y: number, strong = false): void {
    const count =
      this.settings.graphics === "performance"
        ? strong
          ? 12
          : 9
        : this.settings.graphics === "quality"
          ? strong
            ? 32
            : 26
          : strong
            ? 22
            : 17;

    this.particles.push({
      x,
      y,
      vx: 0,
      vy: 0,
      life: 0.42,
      maxLife: 0.42,
      size: strong ? 18 : 14,
      ring: true,
    });

    for (let index = 0; index < count && this.particles.length < 260; index++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * (strong ? 185 : 145) + 35;
      const life = Math.random() * 0.42 + 0.28;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life,
        maxLife: life,
        size: Math.random() * 3.2 + 1.4,
        ring: false,
      });
    }
  }

  private updateParticles(delta: number): void {
    for (let index = this.particles.length - 1; index >= 0; index--) {
      const particle = this.particles[index];
      if (particle === undefined) continue;
      particle.life -= delta;
      if (!particle.ring) {
        particle.x += particle.vx * delta;
        particle.y += particle.vy * delta;
        particle.vx *= 0.984;
        particle.vy *= 0.984;
      }
      if (particle.life <= 0) this.particles.splice(index, 1);
    }
  }

  private updateReveals(delta: number): void {
    for (let index = this.reveals.length - 1; index >= 0; index--) {
      const reveal = this.reveals[index];
      if (reveal === undefined) continue;
      reveal.life -= delta;
      reveal.y -= 12 * delta;
      if (reveal.life <= 0) this.reveals.splice(index, 1);
    }
  }

  private getDangerLevel(): number {
    if (this.settings.mode === "classic") {
      return classicDangerLevel(this.targets, this.height, this.lives, this.settings.classic.lives);
    }
    if (this.settings.mode === "bounce") {
      return bounceDangerLevel(this.targets, this.settings);
    }
    if (this.settings.mode === "timeAttack") {
      const remaining = Math.max(0, this.settings.timeAttack.durationSec - this.modeElapsed);
      return timeAttackDangerLevel(remaining, this.settings);
    }
    return rushDangerLevel(this.targets, this.settings.targetRush.impactWindowSec);
  }

  private finishRun(reason: string): void {
    if (!this.running) return;
    this.running = false;
    this.failureReason = reason;
    this.activeTargetId = null;
    stopSpeech();
    this.audio.setDanger(0);
    this.onLearningPanel({ visible: false, vi: "", ipa: "" });
    this.emitHud(0);
    this.onResult(this.makeResult());
  }

  private makeResult(): GameResult {
    const elapsed =
      this.settings.mode === "timeAttack"
        ? this.settings.timeAttack.durationSec
        : this.modeElapsed;
    const minutes = Math.max(elapsed / 60, 1 / 60);
    const accuracy =
      this.typedCharacters === 0
        ? 100
        : (this.correctCharacters / this.typedCharacters) * 100;
    return {
      mode: this.settings.mode,
      score: this.score,
      correctWords: this.correctWords,
      missedWords: this.missedWords,
      wrongKeys: this.wrongKeys,
      accuracy,
      wpm: this.correctCharacters / 5 / minutes,
      characters: this.correctCharacters,
      maxStreak: this.maxStreak,
      elapsedSec: elapsed,
      averageWordSec: this.correctWords === 0 ? 0 : this.wordTimeTotal / this.correctWords,
      lateSaves: this.lateSaves,
      maxActiveWords: this.maxActiveWordsSeen,
      failedWord: this.failedWord,
      failureReason: this.failureReason,
    };
  }

  private emitHud(dangerLevel = this.getDangerLevel()): void {
    const active = this.activeTarget();
    const metric = this.currentMetric();
    this.onHud({
      score: this.score,
      streak: this.streak,
      metricLabel: metric.label,
      metricValue: metric.value,
      active: active?.entry.en ?? "",
      running: this.running,
      mode: this.settings.mode,
      dangerLevel,
    });
  }

  private currentMetric(): { label: string; value: string } {
    if (this.settings.mode === "classic") {
      return {
        label: "LIVES",
        value: "♥".repeat(Math.max(0, this.lives)) + "♡".repeat(Math.max(0, this.settings.classic.lives - this.lives)),
      };
    }
    if (this.settings.mode === "bounce") {
      const live = this.targets.filter((target) => !target.pending).length;
      return { label: "WORDS", value: `${live}/${this.settings.bounce.maxActiveWords}` };
    }
    if (this.settings.mode === "timeAttack") {
      const remaining = Math.max(0, this.settings.timeAttack.durationSec - this.modeElapsed);
      return { label: "TIME", value: `${remaining.toFixed(1)}s` };
    }
    const remaining = this.rushQueue.length + (this.spotlightTargetId === null ? 0 : 1);
    return { label: "QUEUE", value: String(remaining) };
  }

  private draw(): void {
    const ctx = this.ctx;
    const gradient = ctx.createLinearGradient(0, 0, 0, this.height);
    gradient.addColorStop(0, "#050914");
    gradient.addColorStop(0.55, "#080f22");
    gradient.addColorStop(1, "#050912");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, this.width, this.height);

    for (const star of this.stars) {
      ctx.globalAlpha = star.alpha;
      ctx.fillStyle = "#d8efff";
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    if (this.settings.mode === "targetRush") {
      for (const target of this.targets) {
        if (target.state === "dormant") this.drawTarget(target);
      }
      for (const target of this.targets) {
        if (target.state !== "dormant") this.drawTarget(target);
      }
    } else {
      for (const target of this.targets) this.drawTarget(target);
    }

    for (const shot of this.shots) this.drawShot(shot);
    for (const particle of this.particles) this.drawParticle(particle);
    for (const reveal of this.reveals) this.drawReveal(reveal);
    this.drawPlayer();

    if (!this.running) this.drawIdleOverlay();
  }

  private drawTarget(target: Target): void {
    const ctx = this.ctx;
    const active = target.id === this.activeTargetId;
    const spotlight = target.state === "spotlight";
    const danger = target.state === "danger";
    const dormant = target.state === "dormant";
    const rush = this.settings.mode === "targetRush";

    const baseFontSize = rush
      ? Math.max(
          8,
          Math.min(
            dormant ? 12 : 14,
            (Math.max(42, target.width) - 8) /
              Math.max(1, target.entry.en.length * 0.62),
          ),
        )
      : 16;

    ctx.save();
    if (target.error > 0) {
      ctx.translate(Math.sin(target.error * 120) * 4, 0);
    }

    ctx.globalAlpha = dormant ? 0.42 : 1;
    ctx.font = `700 ${baseFontSize}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";

    const prefix = target.entry.en.slice(0, target.typed);
    const suffix = target.entry.en.slice(target.typed);
    const total = ctx.measureText(target.entry.en).width;
    let textX = target.x - total / 2;

    const glowColor = target.error > 0
      ? "rgba(255,96,122,.95)"
      : danger
        ? "rgba(255,86,116,.95)"
        : spotlight
          ? "rgba(255,224,102,.95)"
          : "rgba(105,221,255,.92)";

    if (spotlight || danger || active || target.error > 0) {
      ctx.shadowColor = glowColor;
      ctx.shadowBlur = danger || spotlight ? 18 : 12;
    }

    if (rush && dormant) {
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#77869d";
      ctx.fillText(target.entry.en, textX, target.y + 1, Math.max(20, target.width - 6));
      ctx.restore();
      return;
    }

    if (prefix !== "") {
      ctx.fillStyle = danger
        ? "#ff9aab"
        : spotlight
          ? "#fff09a"
          : "#8be8ff";
      ctx.fillText(prefix, textX, target.y + 1);
      textX += ctx.measureText(prefix).width;
    }

    if (prefix === "" && (spotlight || danger)) {
      ctx.fillStyle = danger ? "#ff9aab" : "#fff09a";
    } else {
      ctx.shadowBlur = prefix === "" && active ? 10 : 0;
      ctx.fillStyle = active ? "#e8f8ff" : "#c6d2e4";
    }
    ctx.fillText(suffix, textX, target.y + 1);

    ctx.restore();
  }

  private drawShot(shot: Shot): void {
    const ctx = this.ctx;
    ctx.strokeStyle = shot.lateSave ? "rgba(255,232,117,.7)" : "rgba(107,225,255,.55)";
    ctx.lineWidth = shot.lateSave ? 2.8 : 2;
    ctx.beginPath();
    ctx.moveTo(shot.x, shot.y + 10);
    ctx.lineTo(shot.x, shot.y - 12);
    ctx.stroke();
    ctx.fillStyle = shot.lateSave ? "#fff5a9" : "#dffbff";
    ctx.beginPath();
    ctx.arc(shot.x, shot.y, shot.lateSave ? 4 : 3.2, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawParticle(particle: Particle): void {
    const alpha = Math.max(0, particle.life / particle.maxLife);
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = alpha;
    if (particle.ring) {
      const progress = 1 - alpha;
      ctx.strokeStyle = "rgba(120,232,255,.9)";
      ctx.lineWidth = 2.2 * alpha + 0.5;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size + progress * 42, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.fillStyle = alpha > 0.45 ? "#8cecff" : "#8b7cff";
      ctx.beginPath();
      ctx.ellipse(
        particle.x,
        particle.y,
        particle.size * 1.35,
        particle.size,
        Math.atan2(particle.vy, particle.vx),
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
    ctx.restore();
  }

  private drawReveal(reveal: Reveal): void {
    const ctx = this.ctx;
    const progress = reveal.life / reveal.maxLife;
    const alpha = Math.min(1, progress * 4);
    const viSize = 17;
    const ipaSize = 12;
    ctx.font = `800 ${viSize}px ui-sans-serif, system-ui`;
    const viWidth = ctx.measureText(reveal.vi).width;
    ctx.font = `600 ${ipaSize}px ui-sans-serif, system-ui`;
    const ipaWidth = ctx.measureText(reveal.ipa || " ").width;
    const width = Math.min(this.width - 24, Math.max(150, Math.max(viWidth, ipaWidth) + 32));
    const height = reveal.ipa.trim() === "" ? 45 : 61;
    const x = Math.min(this.width - width - 10, Math.max(10, reveal.x - width / 2));
    const y = Math.max(12, reveal.y - height / 2);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "rgba(10,18,35,.82)";
    ctx.strokeStyle = "rgba(113,215,255,.48)";
    ctx.lineWidth = 1;
    this.roundRect(ctx, x, y, width, height, 15);
    ctx.fill();
    ctx.stroke();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `800 ${viSize}px ui-sans-serif, system-ui`;
    ctx.fillStyle = "#f5f9ff";
    ctx.fillText(
      reveal.vi,
      x + width / 2,
      y + (reveal.ipa.trim() === "" ? 23 : 21),
      width - 24,
    );
    if (reveal.ipa.trim() !== "") {
      ctx.font = `600 ${ipaSize}px ui-sans-serif, system-ui`;
      ctx.fillStyle = "#91a7c7";
      ctx.fillText(reveal.ipa, x + width / 2, y + 43, width - 24);
    }
    ctx.restore();
  }

  private drawPlayer(): void {
    const ctx = this.ctx;
    const x = this.width / 2;
    const y = this.height - 46;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = "#77ddff";
    ctx.beginPath();
    ctx.moveTo(0, -22);
    ctx.lineTo(16, 16);
    ctx.lineTo(5, 11);
    ctx.lineTo(0, 20);
    ctx.lineTo(-5, 11);
    ctx.lineTo(-16, 16);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#8e7dff";
    ctx.beginPath();
    ctx.moveTo(-5, 17);
    ctx.lineTo(0, 32 + Math.random() * 4);
    ctx.lineTo(5, 17);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  private drawIdleOverlay(): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = "rgba(3,7,16,.35)";
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#eaf4ff";
    ctx.font = "800 25px ui-sans-serif, system-ui";
    ctx.fillText("Ready when you are", this.width / 2, this.height / 2 - 12);
    ctx.fillStyle = "#8394ad";
    ctx.font = "500 13px ui-sans-serif, system-ui";
    ctx.fillText(
      `Press Start or ${this.settings.quickRestartKey} to begin`,
      this.width / 2,
      this.height / 2 + 20,
    );
    ctx.restore();
  }

  private roundRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
  ): void {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
  }
}

export type { GameResult, HudState, LearningPanelState };
