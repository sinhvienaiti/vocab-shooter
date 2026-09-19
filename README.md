# Vocabulary Shooter

A local-first English–Vietnamese vocabulary typing arcade game.

## Modes

- **Classic Survival** - falling targets, configurable lives and gradually rising pressure.
- **Bounce / Relax** - words move continuously and reflect from the screen walls; the run ends when the configured active-word capacity would be exceeded.
- **Time Attack** - fixed-duration benchmark mode that counts correct words, misses, accuracy and WPM.
- **Target Rush** - a fixed-cadence spotlight mode with a configurable target pool, spotlight window and danger-dive window.

## Learning behavior

Classic, Bounce and Time Attack:

```text
English target
→ type the full word correctly
→ English pronunciation
→ Vietnamese + IPA reveal
→ hit / bubble burst
```

Target Rush intentionally works differently:

```text
spotlight activates
→ top Learning Panel shows Vietnamese + IPA
→ English pronunciation plays immediately
→ the highlighted board target remains English-only
→ type it before it reaches the player
```

The top Target Rush learning panel follows the newest spotlight target. Older danger targets remain typable but do not take over the panel.

## Features

- Canvas-based arcade rendering
- English → Vietnamese vocabulary with optional IPA
- Browser SpeechSynthesis pronunciation
- US/UK accent, speech speed and volume settings
- Tab/Escape configurable quick restart
- Offline procedural background audio, SFX and danger layer
- Performance / Balanced / Quality graphics budgets
- Bubble/water-style hit particles and expanding rings
- Shared results screen with mode-specific metrics
- Vocabulary editor and bulk import
- IndexedDB vocabulary storage
- JSON backup/restore
- DPR caps, particle caps and hidden-tab pause
- Vite development/build workflow

## Offline use

Core gameplay is designed to work offline after the project has been installed/built locally.

Vocabulary and settings are stored in the browser. Pronunciation uses the browser/system SpeechSynthesis voice. A system voice that has already been installed locally is preferred for reliable offline pronunciation.

## Commands

```bash
pnpm install
pnpm dev
pnpm build
```

Development server defaults to port `3001`.

This repository is designed to be used as a game submodule inside the `typing-game` local platform.
