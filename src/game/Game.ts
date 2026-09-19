import { playExplosion, playMiss, playShoot, unlockAudio } from "../audio/effects";
import { speakEnglish, stopSpeech } from "../audio/speech";
import type { ShooterSettings, VocabularyEntry } from "../types";

type Enemy = {
  id: string;
  entry: VocabularyEntry;
  x: number;
  y: number;
  speed: number;
  typed: number;
  width: number;
  pending: boolean;
  error: number;
};

type Star = { x: number; y: number; size: number; speed: number; alpha: number };
type Particle = { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; size: number };
type Shot = { x: number; y: number; tx: number; ty: number; speed: number; enemyId: string };
type Reveal = { x: number; y: number; vi: string; ipa: string; life: number; maxLife: number };

export type HudState = {
  score: number;
  lives: number;
  streak: number;
  active: string;
  running: boolean;
};

export class Game {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private settings: ShooterSettings;
  private vocabulary: VocabularyEntry[];
  private enemies: Enemy[] = [];
  private stars: Star[] = [];
  private particles: Particle[] = [];
  private shots: Shot[] = [];
  private reveals: Reveal[] = [];
  private activeEnemyId: string | null = null;
  private animationId: number | null = null;
  private lastTime = 0;
  private spawnElapsed = 0;
  private score = 0;
  private lives = 3;
  private streak = 0;
  private running = false;
  private width = 1;
  private height = 1;
  private dpr = 1;
  private readonly onHud: (state: HudState) => void;
  private readonly keyHandler = (event: KeyboardEvent) => this.onKey(event);
  private readonly visibilityHandler = () => this.onVisibilityChange();
  private readonly resizeObserver: ResizeObserver;

  constructor(
    canvas: HTMLCanvasElement,
    vocabulary: VocabularyEntry[],
    settings: ShooterSettings,
    onHud: (state: HudState) => void,
  ) {
    const ctx = canvas.getContext("2d");
    if (ctx === null) throw new Error("Canvas 2D context is unavailable");
    this.canvas = canvas;
    this.ctx = ctx;
    this.vocabulary = vocabulary;
    this.settings = settings;
    this.onHud = onHud;
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
  }

  updateSettings(settings: ShooterSettings): void {
    this.settings = settings;
    this.seedStars();
  }

  setVocabulary(entries: VocabularyEntry[]): void {
    this.vocabulary = entries;
  }

  start(): void {
    unlockAudio();
    this.enemies = [];
    this.particles = [];
    this.shots = [];
    this.reveals = [];
    this.activeEnemyId = null;
    this.score = 0;
    this.lives = 3;
    this.streak = 0;
    this.spawnElapsed = 900;
    this.running = true;
    this.lastTime = performance.now();
    stopSpeech();
    this.emitHud();
  }

  private onVisibilityChange(): void {
    if (document.hidden) {
      if (this.animationId !== null) cancelAnimationFrame(this.animationId);
      this.animationId = null;
      stopSpeech();
      return;
    }
    this.lastTime = performance.now();
    if (this.animationId === null) this.animationId = requestAnimationFrame((now) => this.loop(now));
  }

  private resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const qualityCap = this.settings.graphics === "quality" ? 2 : this.settings.graphics === "balanced" ? 1.6 : 1;
    this.dpr = Math.min(window.devicePixelRatio || 1, qualityCap);
    this.width = Math.max(1, rect.width);
    this.height = Math.max(1, rect.height);
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.seedStars();
  }

  private seedStars(): void {
    const count = this.settings.graphics === "performance" ? 55 : this.settings.graphics === "quality" ? 130 : 90;
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
    for (const star of this.stars) {
      star.y += star.speed * delta;
      if (star.y > this.height) {
        star.y = -2;
        star.x = Math.random() * this.width;
      }
    }

    this.updateParticles(delta);
    this.updateShots(delta);
    this.updateReveals(delta);

    if (!this.running || this.vocabulary.length === 0) return;

    this.spawnElapsed += delta * 1000;
    const interval = [0, 2450, 1950, 1500][this.settings.difficulty] ?? 2300;
    const maxEnemies = [0, 4, 5, 6][this.settings.difficulty] ?? 4;
    if (this.spawnElapsed >= interval && this.enemies.filter((enemy) => !enemy.pending).length < maxEnemies) {
      this.spawnEnemy();
      this.spawnElapsed = 0;
    }

    for (const enemy of [...this.enemies]) {
      enemy.error = Math.max(0, enemy.error - delta);
      if (enemy.pending) continue;
      enemy.y += enemy.speed * delta;
      if (enemy.y > this.height - 92) this.enemyEscaped(enemy);
    }
  }

  private spawnEnemy(): void {
    if (this.vocabulary.length === 0) return;
    const entry = this.vocabulary[Math.floor(Math.random() * this.vocabulary.length)];
    if (entry === undefined) return;
    const width = Math.max(115, Math.min(340, 54 + entry.en.length * 11));
    const margin = width / 2 + 20;
    let x = margin + Math.random() * Math.max(1, this.width - margin * 2);
    for (let attempt = 0; attempt < 7; attempt++) {
      const tooClose = this.enemies.some((enemy) => Math.abs(enemy.x - x) < (enemy.width + width) * 0.48 && enemy.y < 150);
      if (!tooClose) break;
      x = margin + Math.random() * Math.max(1, this.width - margin * 2);
    }
    const baseSpeed = [0, 28, 38, 50][this.settings.difficulty] ?? 30;
    this.enemies.push({
      id: crypto.randomUUID(),
      entry,
      x,
      y: 38,
      speed: baseSpeed + Math.min(24, this.score * 0.18) + Math.random() * 8,
      typed: 0,
      width,
      pending: false,
      error: 0,
    });
  }

  private onKey(event: KeyboardEvent): void {
    if (!this.running || event.metaKey || event.ctrlKey || event.altKey) return;
    const eventTarget = event.target;
    if (
      eventTarget instanceof HTMLInputElement ||
      eventTarget instanceof HTMLTextAreaElement ||
      eventTarget instanceof HTMLSelectElement ||
      document.querySelector("dialog[open]") !== null
    ) {
      return;
    }
    if (event.key === "Escape") {
      this.activeEnemyId = null;
      this.emitHud();
      return;
    }

    const active = this.activeEnemy();
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
      const candidates = this.enemies
        .filter((enemy) => !enemy.pending && enemy.entry.en[0]?.toLocaleLowerCase("en-US") === key)
        .sort((a, b) => b.y - a.y);
      target = candidates[0] ?? null;
      if (target === null) {
        this.streak = 0;
        this.emitHud();
        return;
      }
      this.activeEnemyId = target.id;
    }

    const expected = target.entry.en[target.typed]?.toLocaleLowerCase("en-US");
    if (expected !== key) {
      target.error = 0.18;
      playMiss();
      this.streak = 0;
      this.emitHud();
      return;
    }

    target.typed++;
    if (target.typed >= target.entry.en.length) {
      this.completeEnemy(target);
    }
    this.emitHud();
  }

  private activeEnemy(): Enemy | null {
    if (this.activeEnemyId === null) return null;
    return this.enemies.find((enemy) => enemy.id === this.activeEnemyId) ?? null;
  }

  private completeEnemy(enemy: Enemy): void {
    enemy.pending = true;
    this.activeEnemyId = null;
    this.score += 10 + Math.min(25, this.streak * 2);
    this.streak++;
    playShoot();
    speakEnglish(enemy.entry.en, this.settings);
    this.shots.push({
      x: this.width / 2,
      y: this.height - 62,
      tx: enemy.x,
      ty: enemy.y,
      speed: 1050,
      enemyId: enemy.id,
    });
  }

  private enemyEscaped(enemy: Enemy): void {
    this.enemies = this.enemies.filter((item) => item.id !== enemy.id);
    if (this.activeEnemyId === enemy.id) this.activeEnemyId = null;
    this.lives--;
    this.streak = 0;
    if (this.lives <= 0) {
      this.running = false;
      stopSpeech();
    }
    this.emitHud();
  }

  private updateShots(delta: number): void {
    const remaining: Shot[] = [];
    for (const shot of this.shots) {
      const dx = shot.tx - shot.x;
      const dy = shot.ty - shot.y;
      const distance = Math.hypot(dx, dy);
      const step = shot.speed * delta;
      if (distance <= step || distance < 8) {
        this.hitEnemy(shot.enemyId, shot.tx, shot.ty);
        continue;
      }
      shot.x += (dx / distance) * step;
      shot.y += (dy / distance) * step;
      remaining.push(shot);
    }
    this.shots = remaining;
  }

  private hitEnemy(enemyId: string, x: number, y: number): void {
    const enemy = this.enemies.find((item) => item.id === enemyId);
    if (enemy === undefined) return;
    this.enemies = this.enemies.filter((item) => item.id !== enemyId);
    playExplosion();
    this.addExplosion(x, y);
    this.reveals.push({
      x,
      y,
      vi: enemy.entry.vi,
      ipa: enemy.entry.ipa,
      life: this.settings.revealMs / 1000,
      maxLife: this.settings.revealMs / 1000,
    });
  }

  private addExplosion(x: number, y: number): void {
    const count = this.settings.graphics === "performance" ? 14 : this.settings.graphics === "quality" ? 34 : 24;
    for (let i = 0; i < count && this.particles.length < 300; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 135 + 40;
      const life = Math.random() * 0.45 + 0.35;
      this.particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life, maxLife: life, size: Math.random() * 2.6 + 1.2 });
    }
  }

  private updateParticles(delta: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const particle = this.particles[i];
      if (particle === undefined) continue;
      particle.life -= delta;
      particle.x += particle.vx * delta;
      particle.y += particle.vy * delta;
      particle.vx *= 0.985;
      particle.vy *= 0.985;
      if (particle.life <= 0) this.particles.splice(i, 1);
    }
  }

  private updateReveals(delta: number): void {
    for (let i = this.reveals.length - 1; i >= 0; i--) {
      const reveal = this.reveals[i];
      if (reveal === undefined) continue;
      reveal.life -= delta;
      reveal.y -= 12 * delta;
      if (reveal.life <= 0) this.reveals.splice(i, 1);
    }
  }

  private emitHud(): void {
    const active = this.activeEnemy();
    this.onHud({
      score: this.score,
      lives: this.lives,
      streak: this.streak,
      active: active?.entry.en ?? "",
      running: this.running,
    });
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

    for (const enemy of this.enemies) this.drawEnemy(enemy);
    for (const shot of this.shots) this.drawShot(shot);
    for (const particle of this.particles) this.drawParticle(particle);
    for (const reveal of this.reveals) this.drawReveal(reveal);
    this.drawPlayer();

    if (!this.running) this.drawIdleOverlay();
  }

  private drawEnemy(enemy: Enemy): void {
    const ctx = this.ctx;
    const active = enemy.id === this.activeEnemyId;
    const h = 42;
    const x = enemy.x - enemy.width / 2;
    const y = enemy.y - h / 2;
    ctx.save();
    if (enemy.error > 0) ctx.translate(Math.sin(enemy.error * 120) * 4, 0);

    ctx.fillStyle = active ? "rgba(12,33,54,.96)" : "rgba(10,18,35,.90)";
    ctx.strokeStyle = enemy.error > 0 ? "rgba(255,103,121,.95)" : active ? "rgba(113,215,255,.9)" : "rgba(140,164,204,.28)";
    ctx.lineWidth = active ? 1.7 : 1;
    this.roundRect(ctx, x, y, enemy.width, h, 12);
    ctx.fill();
    ctx.stroke();

    if (active) {
      ctx.strokeStyle = "rgba(113,215,255,.22)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(enemy.x, enemy.y, Math.max(enemy.width * 0.58, 76), 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.font = "700 16px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.textBaseline = "middle";
    const prefix = enemy.entry.en.slice(0, enemy.typed);
    const suffix = enemy.entry.en.slice(enemy.typed);
    const total = ctx.measureText(enemy.entry.en).width;
    let textX = enemy.x - total / 2;
    ctx.fillStyle = active ? "#74dcff" : "#dce7f7";
    ctx.fillText(prefix, textX, enemy.y + 1);
    textX += ctx.measureText(prefix).width;
    ctx.fillStyle = "#dce7f7";
    ctx.fillText(suffix, textX, enemy.y + 1);
    ctx.restore();
  }

  private drawShot(shot: Shot): void {
    const ctx = this.ctx;
    ctx.strokeStyle = "rgba(107,225,255,.55)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(shot.x, shot.y + 10);
    ctx.lineTo(shot.x, shot.y - 12);
    ctx.stroke();
    ctx.fillStyle = "#dffbff";
    ctx.beginPath();
    ctx.arc(shot.x, shot.y, 3.2, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawParticle(particle: Particle): void {
    const alpha = Math.max(0, particle.life / particle.maxLife);
    this.ctx.globalAlpha = alpha;
    this.ctx.fillStyle = alpha > 0.45 ? "#8cecff" : "#8b7cff";
    this.ctx.beginPath();
    this.ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.globalAlpha = 1;
  }

  private drawReveal(reveal: Reveal): void {
    const ctx = this.ctx;
    const progress = reveal.life / reveal.maxLife;
    const alpha = Math.min(1, progress * 4);
    const viSize = 17;
    const ipaSize = 12;
    ctx.font = \`800 \${viSize}px ui-sans-serif, system-ui\`;
    const viWidth = ctx.measureText(reveal.vi).width;
    ctx.font = \`600 \${ipaSize}px ui-sans-serif, system-ui\`;
    const ipaWidth = ctx.measureText(reveal.ipa || " ").width;
    const width = Math.min(this.width - 24, Math.max(150, Math.max(viWidth, ipaWidth) + 32));
    const height = reveal.ipa.trim() === "" ? 45 : 61;
    const x = Math.min(this.width - width - 10, Math.max(10, reveal.x - width / 2));
    const y = Math.max(12, reveal.y - height / 2);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "rgba(10,18,35,.78)";
    ctx.strokeStyle = "rgba(113,215,255,.48)";
    ctx.lineWidth = 1;
    this.roundRect(ctx, x, y, width, height, 15);
    ctx.fill();
    ctx.stroke();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = \`800 \${viSize}px ui-sans-serif, system-ui\`;
    ctx.fillStyle = "#f5f9ff";
    ctx.fillText(
      reveal.vi,
      x + width / 2,
      y + (reveal.ipa.trim() === "" ? 23 : 21),
      width - 24,
    );
    if (reveal.ipa.trim() !== "") {
      ctx.font = \`600 \${ipaSize}px ui-sans-serif, system-ui\`;
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
    ctx.fillStyle = "rgba(3,7,16,.35)";
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#eaf4ff";
    ctx.font = "800 25px ui-sans-serif, system-ui";
    ctx.fillText(this.lives <= 0 ? "Mission failed" : "Ready when you are", this.width / 2, this.height / 2 - 12);
    ctx.fillStyle = "#8394ad";
    ctx.font = "500 13px ui-sans-serif, system-ui";
    ctx.fillText("Press Start / Restart to begin", this.width / 2, this.height / 2 + 20);
  }

  private roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number): void {
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
