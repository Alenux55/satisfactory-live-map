# FICSIT Live Map

Self-hosted Satisfactory world map that **watches a save folder**, parses only when the `.sav` actually changes, and **streams entity deltas** to the browser so a ~20 MB factory does not reload on every poll.

This is **not** a copy of [Satisfactory Calculator / SCIM](https://satisfactory-calculator.com/en/interactive-map). SCIM’s source and map tiles are proprietary. This app is an original viewer: MIT save parser, schematic biome grid from public wiki coordinates, canvas overlay, and a live update loop you can run on your own server.

## What it does

- Parses Satisfactory 1.0–1.2 `.sav` files with [`@etothepii/satisfactory-file-parser`](https://www.npmjs.com/package/@etothepii/satisfactory-file-parser)
- Plots production, miners, belts/pipes, power, vehicles, and pioneers on MASSAGE-2(A-B)b
- Configurable poll interval (5s–10m)
- Skips unchanged saves by size, mtime, then SHA-256
- After the first snapshot, the UI applies added / updated / removed actors only
- Ships with a **Grass Fields demo factory** that grows on the same interval so you can see live deltas without a save

## Honest limit on “incremental parse”

A Satisfactory save is a **single compressed blob**. There is no public way to patch 20 MB of zlib chunks in place. The cheap path is:

1. **Hash the file** — if it did not change, do nothing
2. **Parse on change** — typically a few seconds for a 20 MB world
3. **Diff actors by instance id** — send kilobytes to the browser, not the whole save

That is what “live” means here: the dedicated server (or a sync of `SaveGames`) writes a new `.sav`, this process notices on the next tick, and the map updates without a full reload in the client.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:43147](http://localhost:43147).

Production:

```bash
npm run build
npm start
```

## Point it at your world

1. Copy or sync saves into `data/saves`, **or** set **Save folder** in the sidebar to the game’s SaveGames directory.
2. Switch **Demo factory** off.
3. Pick an update period that matches how often the session autosaves (often 5 minutes in-game; 15–30s is fine if you copy the file more often).
4. Or **Upload .sav** once to inspect a snapshot.

Typical dedicated-server path:

`FactoryGame/Saved/SaveGames`

Typical client path (Windows):

`%LOCALAPPDATA%\FactoryGame\Saved\SaveGames\<steam-id>`

Only the newest `.sav` in the folder is used unless you upload a specific file.

## Stack

- Next.js App Router, TypeScript, Tailwind, shadcn/ui
- Leaflet `CRS.Simple` + HTML canvas overlay
- Server-sent events for status and deltas

Satisfactory is © Coffee Stain Studios. This tool only reads saves you provide.
