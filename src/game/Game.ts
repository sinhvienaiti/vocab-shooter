import { AudioManager } from "../audio/AudioManager";
import { speakEnglish, stopSpeech } from "../audio/speech";
import type { ShooterSettings, VocabularyEntry } from "../types";
import type { GameResult, HudState, Target } from "./mode-types";
import { bounceDangerLevel, reflectTarget } from "./modes/BounceMode";
import {
  classicDangerLevel,
  classicMaxTargets,
  classicSpawnInterval,
  classicSpeed,
} from "./modes/ClassicMode";
import {
  layoutRushTargets,
  rushDangerLevel,
  shuffledEntries,
} from "./modes/TargetRushMode";
import { timeAttackDangerLevel } from "./modes/TimeAttackMode";

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
};

type BurstRing = {
  x: number;
  y: number;
  radius: number;
  speed: number;
  life: number;
  maxLife: number;
};

type Shot = {
  x: number;
  y: number;
  tx: number;
  ty: number;
  speed: number;
  targetId: string;
  strong: boolean;
};

type Reveal = {
  x: number;
  y: number;
  vi: string;
  ipa: string;
  life: number;
  maxLife: number;
};

export class Game {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly onHud: (state: HudState) => void;
  private readonly onLearning: (entry: VocabularyEntry | null) => void;
  private readonly onResult: (result: GameResult) => void;
  private readonly resizeObserver: ResizeObserver;
  private readonly keyHandler = (event: KeyboardEvent) => this.onKey(event);
  private readonly visibilityHandler = () => this.onVisibilityChange();

  private settings: ShooterSettings;
  private vocabulary: VocabularyEntry[];
  private readonly audio: AudioManager;

  private targets: Target[] = [];
  private stars: Star[] = [];
  private particles: Particle[] = [];
  private rings: BurstRing[] = [];
  private shots: Shot[] = [];
  private reveals: Reveal[] = [];

  private activeTargetId: string | null = null;
  private animationId: number | null = null;
  private lastTime = 0;
  private spawnElapsed = 0;
  private elapsedSec = 0;
  private running = false;
  private width = 1;
  private height = 1;
  private dpr = 1;

  private score = 0;
  private streak = 0;
  private maxStreak = 0;
  private lives = 3;
  private correctWords = 0;
  private missedWords = 0;
  private wrongKeys = 0;
  private correctCharacters = 0;
  private totalWordTime = 0;
  private lateSaves = 0;
  private maxActiveWords = 0;
  private lastCountdownSecond = -1;

  private rushOrder: string[] = [];
  private rushNextIndex = 0;
  private rushSpotlightId: string | null = null;
  private rushFocusRemaining = 0;

  constructor(
    canvas: HTMLCanvasElement,
    vocabulary: VocabularyEntry[],
    settings: ShooterSettings,
    onHud: (state: HudState) => void,
    onLearning: (entry: VocabularyEntry | null) => void,
    onResult: (result: GameResult) => void,
  ) {
    const ctx = canvas.getContext("2d");
    if (ctx === null) throw new Error("Canvas 2D context is unavailable");

    this.canvas = canvas;
    this.ctx = ctx;
    this.vocabulary = vocabulary;
    this.settings = settings;
    this.onHud = onHud;
    this.onLearning = onLearning;
    this.onResult = onResult;
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
    if (settings.mode !== "targetRush") this.onLearning(null);
  }

  setVocabulary(entries: VocabularyEntry[]): void {
    this.vocabulary = entries;
  }

  start(): void {
    if (this.vocabulary.length === 0) return;

    this.audio.stop();
    this.audio.unlock();
    stopSpeech();

    this.targets = [];
    this.particles = [];
    this.rings = [];
    this.shots = [];
    this.reveals = [];
    this.activeTargetId = null;
    this.rushOrder = [];
    this.rushNextIndex = 0;
    this.rushSpotlightId = null;
    this.rushFocusRemaining = 0;

    this.score = 0;
    this.streak = 0;
    this.maxStreak = 0;
    this.lives = this.settings.classic.lives;
    this.correctWords = 0;
    this.missedWords = 0;
    this.wrongKeys = 0;
    this.correctCharacters = 0;
    this.totalWordTime = 0;
    this.lateSaves = 0;
    this.maxActiveWords = 0;
    this.elapsedSec = 0;
    this.spawnElapsed = 0;
    this.lastCountdownSecond = -1;
    this.running = true;
    this.lastTime = performance.now();

    if (this.settings.mode === "targetRush") {
      this.setupTargetRush();
    } else {
      this.onLearning(null);
      this.spawnTarget();
    }

    this.emitHud();
  }

  private onVisibilityChange(): void {
    if (document.hidden) {
      if (this.animationId !== null) cancelAnimationFrame(this.animationId);
      this.animationId = null;
      stopSpeech();
      this.audio.stop();
      return;
    }

    this.lastTime = performance.now();
    if (this.running) this.audio.unlock();
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

    if (this.settings.mode === "targetRush") {
      layoutRushTargets(this.targets, this.width, this.height);
    }
    this.seedStars();
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
    this.updateRings(delta);
    this.updateShots(delta);
    this.updateReveals(delta);

    for (const target of this.targets) {
      target.error = Math.max(0, target.error - delta);
    }

    if (!this.running || this.vocabulary.length === 0) return;

    this.elapsedSec += delta;

    switch (this.settings.mode) {
      case "classic":
        this.updateClassic(delta);
        break;
      case "bounce":
        this.updateBounce(delta);
        break;
      case "timeAttack":
        this.updateTimeAttack(delta);
        break;
      case "targetRush":
        this.updateTargetRush(delta);
        break;
    }

    if (!this.running) return;

    this.maxActiveWords = Math.max(
      this.maxActiveWords,
      this.targets.filter((target) => !target.pending).length,
    );

    const danger = this.dangerLevel();
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

  private updateClassic(delta: number): void {
    this.spawnElapsed += delta * 1000;
    const interval = classicSpawnInterval(this.settings, this.score);
    const activeCount = this.targets.filter((target) => !target.pending).length;

    if (
      this.spawnElapsed >= interval &&
      activeCount < classicMaxTargets(this.score)
    ) {
      this.spawnTarget();
      this.spawnElapsed = 0;
    }

    for (const target of [...this.targets]) {
      if (target.pending) continue;
      target.y += target.speed * delta;
      if (target.y > this.height - 86) {
        this.removeTarget(target.id);
        this.missedWords++;
        this.streak = 0;
        this.lives--;
        this.audio.playImpact();

        if (this.lives <= 0) {
          this.finishRun("Out of lives", target.entry.en);
          return;
        }
      }
    }
  }

  private updateBounce(delta: number): void {
    this.spawnElapsed += delta * 1000;

    if (this.spawnElapsed >= this.settings.bounce.spawnIntervalMs) {
      const activeCount = this.targets.filter((target) => !target.pending).length;
      if (activeCount >= this.settings.bounce.maxActiveWords) {
        this.finishRun("Too many words on screen");
        return;
      }
      this.spawnTarget();
      this.spawnElapsed = 0;
    }

    for (const target of this.targets) {
      if (target.pending) continue;
      target.x += target.vx * delta;
      target.y += target.vy * delta;
      reflectTarget(target, this.width, this.height);
    }
  }

  private updateTimeAttack(delta: number): void {
    const remaining = this.settings.timeAttack.durationSec - this.elapsedSec;
    if (remaining <= 0) {
      this.finishRun("Time complete");
      return;
    }

    const second = Math.ceil(remaining);
    if (second <= 5 && second !== this.lastCountdownSecond) {
      this.lastCountdownSecond = second;
      this.audio.playCountdown();
    }

    this.spawnElapsed += delta * 1000;
    if (
      this.spawnElapsed >= this.settings.timeAttack.spawnIntervalMs &&
      this.targets.filter((target) => !target.pending).length < 7
    ) {
      this.spawnTarget();
      this.spawnElapsed = 0;
    }

    for (const target of [...this.targets]) {
      if (target.pending) continue;
      target.y += target.speed * delta;
      if (target.y > this.height - 86) {
        this.removeTarget(target.id);
        this.missedWords++;
        this.streak = 0;
      }
    }
  }

  private updateTargetRush(delta: number): void {
    for (const target of this.targets) {
      if (target.state !== "danger" || target.pending) continue;

      const remaining = Math.max(0.001, target.dangerRemaining);
      const playerX = this.width / 2;
      const playerY = this.height - 48;
      const fraction = Math.min(1, delta / remaining);
      target.x += (playerX - target.x) * fraction;
      target.y += (playerY - target.y) * fraction;
      target.dangerRemaining -= delta;

      if (target.dangerRemaining <= 0) {
        this.audio.playImpact();
        this.addExplosion(playerX, playerY, true);
        this.finishRun("Target hit the player", target.entry.en);
        return;
      }
    }

    if (this.rushSpotlightId !== null) {
      this.rushFocusRemaining -= delta;
      if (this.rushFocusRemaining <= 0) {
        const spotlight = this.spotlightTarget();
        if (spotlight !== null && !spotlight.pending) {
          spotlight.state = "danger";
          spotlight.dangerRemaining = this.settings.targetRush.impactWindowSec;
          spotlight.lateSave = true;
        }

        this.rushSpotlightId = null;
        this.activateNextRushTarget();
      }
    }

    if (this.rushNextIndex >= this.rushOrder.length && this.targets.length === 0) {
      this.finishRun("Target set complete");
    }
  }

  private setupTargetRush(): void {
    const entries = shuffledEntries(
      this.vocabulary,
      this.settings.targetRush.targetCount,
    );

    this.targets = entries.map((entry) => this.createTarget(entry, "dormant"));
    this.rushOrder = this.targets.map((target) => target.id);
    layoutRushTargets(this.targets, this.width, this.height);
    this.maxActiveWords = this.targets.length;
    this.activateNextRushTarget();
  }

  private activateNextRushTarget(): void {
    while (this.rushNextIndex < this.rushOrder.length) {
      const id = this.rushOrder[this.rushNextIndex];
      this.rushNextIndex++;
      if (id === undefined) continue;

      const target = this.targets.find((item) => item.id === id);
      if (target === undefined || target.pending) continue;

      target.state = "spotlight";
      target.typed = 0;
      target.startedAt = this.elapsedSec;
      this.rushSpotlightId = target.id;
      this.rushFocusRemaining = this.settings.targetRush.focusWindowSec;
      this.onLearning(target.entry);
      speakEnglish(target.entry.en, this.settings);
      return;
    }

    this.rushSpotlightId = null;
    this.rushFocusRemaining = 0;
  }

  private spawnTarget(): void {
    const entry = this.randomEntry();
    if (entry === null) return;

    const target = this.createTarget(entry, "normal");

    if (this.settings.mode === "bounce") {
      const margin = target.width / 2 + 16;
      target.x = margin + Math.random() * Math.max(1, this.width - margin * 2);
      target.y = 52 + Math.random() * Math.max(1, this.height - 160);

      let angle = Math.random() * Math.PI * 2;
      for (let attempt = 0; attempt < 8; attempt++) {
        if (Math.abs(Math.cos(angle)) > 0.28 && Math.abs(Math.sin(angle)) > 0.28) break;
        angle = Math.random() * Math.PI * 2;
      }

      target.vx = Math.cos(angle) * this.settings.bounce.speed;
      target.vy = Math.sin(angle) * this.settings.bounce.speed;
    } else {
      const margin = target.width / 2 + 20;
      target.x = margin + Math.random() * Math.max(1, this.width - margin * 2);
      target.y = 38;
      target.speed =
        this.settings.mode === "classic"
          ? classicSpeed(this.settings, this.score)
          : this.settings.timeAttack.speed;
    }

    this.targets.push(target);
  }

  private createTarget(entry: VocabularyEntry, state: Target["state"]): Target {
    return {
      id: crypto.randomUUID(),
      entry,
      x: this.width / 2,
      y: 40,
      vx: 0,
      vy: 0,
      speed: 0,
      typed: 0,
      width: Math.max(115, Math.min(340, 54 + entry.en.length * 11)),
      pending: false,
      error: 0,
      state,
      dangerRemaining: 0,
      lateSave: false,
      startedAt: this.elapsedSec,
    };
  }

  private randomEntry(): VocabularyEntry | null {
    if (this.vocabulary.length === 0) return null;
    return this.vocabulary[Math.floor(Math.random() * this.vocabulary.length)] ?? null;
  }

  private onKey(event: KeyboardEvent): void {
    if (event.metaKey || event.ctrlKey || event.altKey || this.isFormInteraction(event.target)) {
      return;
    }

    if (event.key === this.settings.quickRestartKey) {
      event.preventDefault();
      this.start();
      return;
    }

    const unlockKey = this.settings.quickRestartKey === "Tab" ? "Escape" : "Tab";
    if (event.key === unlockKey && this.running) {
      event.preventDefault();
      this.activeTargetId = null;
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

    const key = event.key.toLocaleLowerCase("en-US");
    let target = active;

    if (target === null) {
      target = this.findTargetForKey(key);
      if (target === null) {
        this.wrongKeys++;
        this.streak = 0;
        this.audio.playMiss();
        this.emitHud();
        return;
      }
      this.activeTargetId = target.id;
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

    target.typed++;
    this.correctCharacters++;

    if (target.typed >= target.entry.en.length) {
      this.completeTarget(target);
    }

    this.emitHud();
  }

  private isFormInteraction(target: EventTarget | null): boolean {
    return (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement ||
      document.querySelector("dialog[open]") !== null
    );
  }

  private findTargetForKey(key: string): Target | null {
    const firstLetterMatches = this.targets.filter(
      (target) =>
        !target.pending &&
        target.entry.en[0]?.toLocaleLowerCase("en-US") === key,
    );

    if (this.settings.mode === "targetRush") {
      return (
        firstLetterMatches
          .filter((target) => target.state === "danger" || target.state === "spotlight")
          .sort((a, b) => {
            if (a.state === "danger" && b.state !== "danger") return -1;
            if (b.state === "danger" && a.state !== "danger") return 1;
            return a.dangerRemaining - b.dangerRemaining;
          })[0] ?? null
      );
    }

    if (this.settings.mode === "bounce") {
      return firstLetterMatches[0] ?? null;
    }

    return firstLetterMatches.sort((a, b) => b.y - a.y)[0] ?? null;
  }

  private activeTarget(): Target | null {
    if (this.activeTargetId === null) return null;
    const target = this.targets.find((item) => item.id === this.activeTargetId) ?? null;

    if (
      target !== null &&
      this.settings.mode === "targetRush" &&
      target.state !== "spotlight" &&
      target.state !== "danger"
    ) {
      this.activeTargetId = null;
      return null;
    }

    return target;
  }

  private spotlightTarget(): Target | null {
    if (this.rushSpotlightId === null) return null;
    return this.targets.find((target) => target.id === this.rushSpotlightId) ?? null;
  }

  private completeTarget(target: Target): void {
    target.pending = true;
    target.state = "pending";
    if (this.activeTargetId === target.id) this.activeTargetId = null;

    this.correctWords++;
    this.score += 10 + Math.min(30, this.streak * 2);
    this.streak++;
    this.maxStreak = Math.max(this.maxStreak, this.streak);
    this.totalWordTime += Math.max(0, this.elapsedSec - target.startedAt);

    const strong = target.lateSave;
    if (strong) {
      this.lateSaves++;
      this.audio.playLateSave();
    }

    this.audio.playShoot();

    if (this.settings.mode !== "targetRush") {
      speakEnglish(target.entry.en, this.settings);
    }

    this.shots.push({
      x: this.width / 2,
      y: this.height - 58,
      tx: target.x,
      ty: target.y,
      speed: strong ? 1320 : 1080,
      targetId: target.id,
      strong,
    });
  }

  private updateShots(delta: number): void {
    const remaining: Shot[] = [];

    for (const shot of this.shots) {
      const dx = shot.tx - shot.x;
      const dy = shot.ty - shot.y;
      const distance = Math.hypot(dx, dy);
      const step = shot.speed * delta;

      if (distance <= step || distance < 8) {
        this.hitTarget(shot.targetId, shot.tx, shot.ty, shot.strong);
        continue;
      }

      shot.x += (dx / distance) * step;
      shot.y += (dy / distance) * step;
      remaining.push(shot);
    }

    this.shots = remaining;
  }

  private hitTarget(targetId: string, x: number, y: number, strong: boolean): void {
    const target = this.targets.find((item) => item.id === targetId);
    if (target === undefined) return;

    this.removeTarget(targetId);
    this.audio.playExplosion(strong);
    this.addExplosion(x, y, strong);

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

    if (this.settings.mode === "targetRush" && this.targets.length === 0) {
      this.finishRun("Target set complete");
    }
  }

  private removeTarget(id: string): void {
    this.targets = this.targets.filter((target) => target.id !== id);
    if (this.activeTargetId === id) this.activeTargetId = null;
  }

  private addExplosion(x: number, y: number, strong: boolean): void {
    const baseCount =
      this.settings.graphics === "performance"
        ? 10
        : this.settings.graphics === "quality"
          ? 30
          : 20;

    const count = strong ? Math.round(baseCount * 1.25) : baseCount;

    for (let index = 0; index < count && this.particles.length < 280; index++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * (strong ? 190 : 145) + 45;
      const life = Math.random() * 0.46 + 0.32;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life,
        maxLife: life,
        size: Math.random() * (strong ? 4.2 : 3.2) + 1.4,
      });
    }

    this.rings.push({
      x,
      y,
      radius: 5,
      speed: strong ? 260 : 190,
      life: strong ? 0.46 : 0.36,
      maxLife: strong ? 0.46 : 0.36,
    });
  }

  private updateParticles(delta: number): void {
    for (let index = this.particles.length - 1; index >= 0; index--) {
      const particle = this.particles[index];
      if (particle === undefined) continue;

      particle.life -= delta;
      particle.x += particle.vx * delta;
      particle.y += particle.vy * delta;
      particle.vx *= 0.985;
      particle.vy *= 0.985;
      particle.vy += 18 * delta;

      if (particle.life <= 0) this.particles.splice(index, 1);
    }
  }

  private updateRings(delta: number): void {
    for (let index = this.rings.length - 1; index >= 0; index--) {
      const ring = this.rings[index];
      if (ring === undefined) continue;
      ring.life -= delta;
      ring.radius += ring.speed * delta;
      if (ring.life <= 0) this.rings.splice(index, 1);
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

  private dangerLevel(): number {
    switch (this.settings.mode) {
      case "classic":
        return classicDangerLevel(
          this.targets,
          this.height,
          this.lives,
          this.settings.classic.lives,
        );
      case "bounce":
        return bounceDangerLevel(this.targets, this.settings);
      case "timeAttack":
        return timeAttackDangerLevel(
          Math.max(0, this.settings.timeAttack.durationSec - this.elapsedSec),
          this.settings,
        );
      case "targetRush":
        return rushDangerLevel(
          this.targets,
          this.settings.targetRush.impactWindowSec,
        );
    }
  }

  private metric(): { label: string; value: string } {
    switch (this.settings.mode) {
      case "classic":
        return {
          label: "LIVES",
          value: `${this.lives}/${this.settings.classic.lives}`,
        };
      case "bounce":
        return {
          label: "WORDS",
          value: `${this.targets.filter((target) => !target.pending).length}/${this.settings.bounce.maxActiveWords}`,
        };
      case "timeAttack":
        return {
          label: "TIME",
          value: `${Math.max(0, Math.ceil(this.settings.timeAttack.durationSec - this.elapsedSec))}s`,
        };
      case "targetRush":
        return {
          label: "TARGET",
          value: `${Math.min(this.rushNextIndex, this.rushOrder.length)}/${this.rushOrder.length}`,
        };
    }
  }

  private emitHud(dangerLevel = this.dangerLevel()): void {
    const metric = this.metric();
    const active = this.activeTarget();
    const spotlight = this.spotlightTarget();

    this.onHud({
      score: this.score,
      streak: this.streak,
      metricLabel: metric.label,
      metricValue: metric.value,
      active:
        active?.entry.en ??
        spotlight?.entry.en ??
        "",
      running: this.running,
      mode: this.settings.mode,
      dangerLevel,
    });
  }

  private finishRun(failureReason: string, failedWord = ""): void {
    if (!this.running) return;

    this.running = false;
    this.activeTargetId = null;
    stopSpeech();
    this.audio.setDanger(0);
    this.audio.stop();

    const attempts = this.correctCharacters + this.wrongKeys;
    const elapsed = Math.max(0.001, this.elapsedSec);

    this.onResult({
      mode: this.settings.mode,
      score: this.score,
      correctWords: this.correctWords,
      missedWords: this.missedWords,
      wrongKeys: this.wrongKeys,
      accuracy: attempts === 0 ? 100 : (this.correctCharacters / attempts) * 100,
      wpm: (this.correctCharacters / 5) / (elapsed / 60),
      characters: this.correctCharacters,
      maxStreak: this.maxStreak,
      elapsedSec: this.elapsedSec,
      averageWordSec: this.correctWords === 0 ? 0 : this.totalWordTime / this.correctWords,
      lateSaves: this.lateSaves,
      maxActiveWords: this.maxActiveWords,
      failedWord,
      failureReason,
    });

    this.emitHud(0);
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

    for (const target of this.targets) this.drawTarget(target);
    for (const shot of this.shots) this.drawShot(shot);
    for (const ring of this.rings) this.drawRing(ring);
    for (const particle of this.particles) this.drawParticle(particle);
    for (const reveal of this.reveals) this.drawReveal(reveal);

    this.drawPlayer();

    if (!this.running) this.drawIdleOverlay();
  }

  private drawTarget(target: Target): void {
    const ctx = this.ctx;
    const locked = target.id === this.activeTargetId;
    const rush = this.settings.mode === "targetRush";
    const height = rush ? 30 : 42;
    const x = target.x - target.width / 2;
    const y = target.y - height / 2;

    ctx.save();

    if (target.error > 0) {
      ctx.translate(Math.sin(target.error * 120) * 4, 0);
    }

    if (target.state === "danger") {
      ctx.fillStyle = "rgba(72,14,24,.94)";
      ctx.strokeStyle = "rgba(255,95,112,.95)";
    } else if (target.state === "spotlight") {
      ctx.fillStyle = "rgba(72,53,7,.96)";
      ctx.strokeStyle = "rgba(255,211,93,.98)";
    } else if (locked) {
      ctx.fillStyle = "rgba(12,33,54,.96)";
      ctx.strokeStyle = "rgba(113,215,255,.9)";
    } else {
      ctx.fillStyle = rush ? "rgba(10,18,35,.55)" : "rgba(10,18,35,.90)";
      ctx.strokeStyle = rush ? "rgba(140,164,204,.13)" : "rgba(140,164,204,.28)";
    }

    if (target.pending) ctx.globalAlpha = 0.5;
    if (target.state === "dormant") ctx.globalAlpha = 0.48;

    ctx.lineWidth = target.state === "spotlight" || target.state === "danger" || locked ? 1.7 : 1;
    this.roundRect(ctx, x, y, target.width, height, rush ? 9 : 12);
    ctx.fill();
    ctx.stroke();

    if (target.state === "spotlight") {
      ctx.strokeStyle = "rgba(255,211,93,.22)";
      ctx.beginPath();
      ctx.arc(target.x, target.y, Math.max(target.width * 0.58, 54), 0, Math.PI * 2);
      ctx.stroke();
    }

    if (target.state === "danger") {
      const ratio = Math.max(
        0,
        Math.min(1, target.dangerRemaining / this.settings.targetRush.impactWindowSec),
      );
      ctx.fillStyle = "rgba(255,95,112,.72)";
      ctx.fillRect(x + 6, y + height - 4, (target.width - 12) * ratio, 2);
    }

    if (rush) {
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "700 12px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.fillStyle =
        target.state === "spotlight"
          ? "#ffe79a"
          : target.state === "danger"
            ? "#ffd3d8"
            : "#cbd7e8";
      ctx.fillText(target.entry.en, target.x, target.y, target.width - 12);

      if (target.typed > 0) {
        const progress = target.typed / Math.max(1, target.entry.en.length);
        ctx.fillStyle = "#71d7ff";
        ctx.fillRect(x + 6, y + height - 4, (target.width - 12) * progress, 2);
      }
    } else {
      ctx.font = "700 16px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      const prefix = target.entry.en.slice(0, target.typed);
      const suffix = target.entry.en.slice(target.typed);
      const total = ctx.measureText(target.entry.en).width;
      let textX = target.x - total / 2;

      ctx.fillStyle = locked ? "#74dcff" : "#dce7f7";
      ctx.fillText(prefix, textX, target.y + 1);
      textX += ctx.measureText(prefix).width;
      ctx.fillStyle = "#dce7f7";
      ctx.fillText(suffix, textX, target.y + 1);
    }

    ctx.restore();
  }

  private drawShot(shot: Shot): void {
    const ctx = this.ctx;
    ctx.strokeStyle = shot.strong
      ? "rgba(255,224,127,.78)"
      : "rgba(107,225,255,.55)";
    ctx.lineWidth = shot.strong ? 3 : 2;
    ctx.beginPath();
    ctx.moveTo(shot.x, shot.y + 10);
    ctx.lineTo(shot.x, shot.y - 12);
    ctx.stroke();

    ctx.fillStyle = shot.strong ? "#fff3bd" : "#dffbff";
    ctx.beginPath();
    ctx.arc(shot.x, shot.y, shot.strong ? 4 : 3.2, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawParticle(particle: Particle): void {
    const alpha = Math.max(0, particle.life / particle.maxLife);
    this.ctx.save();
    this.ctx.globalAlpha = alpha;
    this.ctx.fillStyle = "rgba(126,226,255,.58)";
    this.ctx.strokeStyle = "rgba(220,249,255,.82)";
    this.ctx.lineWidth = 0.8;
    this.ctx.beginPath();
    this.ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.stroke();
    this.ctx.restore();
  }

  private drawRing(ring: BurstRing): void {
    const alpha = Math.max(0, ring.life / ring.maxLife);
    this.ctx.save();
    this.ctx.globalAlpha = alpha * 0.75;
    this.ctx.strokeStyle = "rgba(126,226,255,.9)";
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.arc(ring.x, ring.y, ring.radius, 0, Math.PI * 2);
    this.ctx.stroke();
    this.ctx.restore();
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

    const width = Math.min(
      this.width - 24,
      Math.max(150, Math.max(viWidth, ipaWidth) + 32),
    );
    const height = reveal.ipa.trim() === "" ? 45 : 61;
    const x = Math.min(this.width - width - 10, Math.max(10, reveal.x - width / 2));
    const y = Math.max(12, reveal.y - height / 2);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "rgba(10,18,35,.82)";
    ctx.strokeStyle = "rgba(113,215,255,.5)";
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
    ctx.lineTo(0, 30 + Math.random() * 4);
    ctx.lineTo(5, 17);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  private drawIdleOverlay(): void {
    const ctx = this.ctx;
    ctx.save();

    ctx.fillStyle = "rgba(3,7,16,.34)";
    ctx.fillRect(0, 0, this.width, this.height);

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#eaf4ff";
    ctx.font = "800 25px ui-sans-serif, system-ui";
    ctx.fillText("Ready when you are", this.width / 2, this.height / 2 - 12);

    ctx.fillStyle = "#8394ad";
    ctx.font = "500 13px ui-sans-serif, system-ui";
    ctx.fillText(
      `Press Start / Restart or ${this.settings.quickRestartKey}`,
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
