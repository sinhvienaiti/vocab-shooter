# Vocabulary Shooter

A local-first English–Vietnamese vocabulary typing shooter.

## Learning rule

Targets show English only. Vietnamese meaning, IPA, and English pronunciation are revealed only after the English target is typed correctly.

## Features

- Canvas-based typing shooter
- English → Vietnamese vocabulary with optional IPA
- Browser SpeechSynthesis pronunciation
- US/UK accent, speech speed and volume settings
- Vocabulary editor and bulk import
- IndexedDB vocabulary storage
- JSON backup/restore
- Performance-oriented rendering with DPR caps, particle limits and visibility pause
- Vite development/build workflow

## Commands

```bash
pnpm install
pnpm dev
pnpm build
```

Development server defaults to port `3001`.

This repository is designed to be used as a game submodule inside the `typing-game` local platform.
