# FICSIT Live Map

Self-hosted Satisfactory world map that **watches a save folder**, parses only when the `.sav` actually changes, and **streams entity deltas** to the browser so a ~20 MB factory does not reload on every poll.

This is **not** a copy of [Satisfactory Calculator / SCIM](https://satisfactory-calculator.com/en/interactive-map). SCIM’s source and map tiles are proprietary. This app is an original viewer: MIT save parser, wiki in-game map (or schematic fallback), canvas overlay, and a live update loop you can run on your own server.

## What it does

- Parses Satisfactory 1.0–1.2 `.sav` files with [`@etothepii/satisfactory-file-parser`](https://www.npmjs.com/package/@etothepii/satisfactory-file-parser)
- Plots production, miners, belts/pipes, power, vehicles, and pioneers on MASSAGE-2(A-B)b
- Configurable poll interval (5s–10m)
- Skips unchanged saves by size, mtime, then SHA-256
- After the first snapshot, the UI applies added / updated / removed actors only
- Ships with a **Grass Fields demo factory** that grows on the same interval so you can see live deltas without a save
- Background: 1.0 in-game map from the [official wiki Map.jpg](https://satisfactory.wiki.gg/wiki/File:Map.jpg) (cached to `data/world-map.jpg`, not committed). Schematic biome grid if the download fails. Not SCIM tiles.

## Honest limit on “incremental parse”

A Satisfactory save is a **single compressed blob**. There is no public way to patch 20 MB of zlib chunks in place. The cheap path is:

1. **Hash the file** — if it did not change, do nothing
2. **Parse on change** — typically a few seconds for a 20 MB world
3. **Diff actors by instance id** — send kilobytes to the browser, not the whole save

That is what “live” means here: the dedicated server writes a new `.sav`, this process notices on the next tick, and the map updates without a full reload in the client.

Idle is cheap (stat + maybe a hash). On autosave expect a CPU spike for a few seconds and a RAM spike of about **0.5–2 GB** during parse, then GC. Keep ~2 GB free next to the dedicated server process.

## Closer to live

The map can only update when the dedicated server **writes a .sav**. Default is every **300 seconds**. This app now **watches the save folder**, so a write is picked up in about a second; the poll slider is a backup.

To actually get more frequent snapshots, shorten the DS autosave (Server Manager → Console):

```
FG.AutosaveInterval 60
```

That is seconds. **30–60s** is the practical band. Faster than ~30s hitch the dedicated server more often, and this sidecar still fully parses each changed ~20 MB blob (a few seconds). There is no public way to patch a save in place.

## Run locally

Needs **Node 20.9+**.

```bash
npm install
npm run dev
```

Open [http://localhost:43147](http://localhost:43147). The first visit creates the admin account; after that you sign in. Viewers can watch a world but cannot change the shared server catalog.

Production on this machine:

```bash
npm run build
npm start
```

`npm start` binds **0.0.0.0:43147** so other devices on the LAN can connect. Use `next start`, not `next dev`, on the game server.

Logs go to the console and `data/server.log` (`FICSIT_LOG=info` by default). On Windows: `Get-Content data\server.log -Wait -Tail 80`. Set `FICSIT_LOG=debug` for ticks, HTTP, and parse %.

## Windows dedicated server (sidecar)

Run this on the **same Windows box as the Satisfactory dedicated server**, as a sidecar — not instead of the DS, and not as `next dev`.

### 1. One-time install

On the game server (same account that runs the dedicated server):

```powershell
# Node 20 LTS: https://nodejs.org
git clone https://github.com/Alenux55/satisfactory-live-map.git
cd satisfactory-live-map

powershell -ExecutionPolicy Bypass -File .\scripts\windows\setup.ps1
```

`setup.ps1` runs `npm install`, `npm run build`, and writes `.env.local` pointing at:

`%LOCALAPPDATA%\FactoryGame\Saved\SaveGames\server`

Override the folder, poll, and extras in one shot:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\windows\setup.ps1 `
  -SavesDir "D:\SatisfactoryDedicatedServer\FactoryGame\Saved\SaveGames\server" `
  -PollSeconds 300 `
  -OpenFirewall `
  -InstallTask
```

`-OpenFirewall` needs an **elevated** prompt. It allows inbound TCP 43147 on Domain/Private only.

Copy `.env.example` to `.env.local` if you prefer to edit by hand. `%LOCALAPPDATA%` in that file is expanded by the app.

### 2. Start (foreground smoke test)

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\windows\run.ps1
```

Logs: console plus `data\server.log`. `run.ps1` defaults to `FICSIT_LOG=info`. If an older `.env.local` still has `FICSIT_LOG=debug`, change or delete that line.

On this PC: [http://127.0.0.1:43147](http://127.0.0.1:43147)

From your desk: `http://<server-lan-ip>:43147`

Confirm the sidebar **Server** list includes your dedicated-server save folder (setup writes one from `FICSIT_SAVES_DIR`). **Demo factory** is just another item in that list. Folder watch updates on each autosave; keep **Update period** as a slower backup (1–5 minutes). For more frequent writes, `FG.AutosaveInterval 60` on the dedicated server. Add more save locations with **Add save location** if you run several dedicated servers.

### 3. Keep it running (start / stop / rebuild / boot)

One script, no extra service manager. Same Windows account as the dedicated server:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\windows\service.ps1 Install
powershell -ExecutionPolicy Bypass -File .\scripts\windows\service.ps1 Status
powershell -ExecutionPolicy Bypass -File .\scripts\windows\service.ps1 Stop
powershell -ExecutionPolicy Bypass -File .\scripts\windows\service.ps1 Start
powershell -ExecutionPolicy Bypass -File .\scripts\windows\service.ps1 Restart
powershell -ExecutionPolicy Bypass -File .\scripts\windows\service.ps1 Rebuild
powershell -ExecutionPolicy Bypass -File .\scripts\windows\service.ps1 Rebuild -Pull
powershell -ExecutionPolicy Bypass -File .\scripts\windows\service.ps1 Uninstall
```

`Install` registers a Scheduled Task that starts **at boot** and **at logon**, restarts on crash, then starts the map. `Rebuild` stops it, runs `npm install` then `npm run build`, and starts it again. `-Pull` does `git pull` first.

`data\server.pid` is how Stop finds the Node process (Task Scheduler alone often leaves a grandchild `node` running).

Foreground smoke test is still `scripts\windows\run.ps1`.

**WinSW** — download [WinSW](https://github.com/winsw/winsw/releases), copy `WinSW.exe` into the repo root as `ficsit-live-map.exe`, copy `scripts\windows\ficsit-live-map.xml` next to it as `ficsit-live-map.xml`, then:

```powershell
.\ficsit-live-map.exe install
.\ficsit-live-map.exe start
```

Run the service as the dedicated-server account. `.env.local` in the repo root is still loaded by Next.

**NSSM** — if you already use NSSM for the DS:

```powershell
nssm install FicsitLiveMap "C:\Program Files\nodejs\node.exe" "C:\path\to\satisfactory-live-map\scripts\start.mjs"
nssm set FicsitLiveMap AppDirectory "C:\path\to\satisfactory-live-map"
nssm set FicsitLiveMap AppEnvironmentExtra NODE_ENV=production HOSTNAME=0.0.0.0 PORT=43147 FICSIT_LOG=info
nssm start FicsitLiveMap
```

### 4. Save path, locks, and Windows quirks

Typical DS folder:

`%LOCALAPPDATA%\FactoryGame\Saved\SaveGames\server`

SteamCMD / custom install is often:

`<install>\FactoryGame\Saved\SaveGames`

The watcher:

- Ignores `.sav.tmp` / `*.tmp.sav` / zero-byte files
- Waits until size and mtime stop changing
- **Copies** the `.sav` into `data/staging` then parses the copy, so Unreal can finish or overwrite the original
- Retries for ~10s on sharing-violation / `EBUSY` / `EPERM` while the DS has the file open
- Does not treat a failed parse as “done”; the next real write is parsed again

If the sidebar says the folder is missing, the map is running as a **different user** than the DS (SYSTEM vs your login). Point `FICSIT_SAVES_DIR` at the explicit path and run the sidecar as the DS account.

This process only **reads** saves. It never writes back into SaveGames.

### Env (optional)

| Variable | Meaning |
| --- | --- |
| `FICSIT_SAVES_DIR` | Seeds a watchable server in the catalog (UI can add more) |
| `FICSIT_SAVE_FILE` | Pin one `.sav` on that seeded server instead of newest in the folder |
| `FICSIT_MODE` | `watch` ensures a dedicated-server catalog entry exists; Demo is always in the list |
| `FICSIT_POLL_SECONDS` | Snapped to 5s–10m steps (use **300** on the game box) |
| `HOSTNAME` / `PORT` | Bind address (scripts use `0.0.0.0:43147`) |

Env is merged into `data/config.json` on process start. Extra servers you add in the UI are kept.

Which server you view, plus layers and terrain, is stored on your **account**. Admins can change the shared catalog; viewers cannot.

### Accounts

First visit opens **Create the admin account**. After that, `/login` is required.

- **Admin**: add/remove save locations, poll interval, upload, manage users
- **Viewer**: pick a server, layers, height slice, terrain — their own settings
- **Forgot password**: needs SMTP (Admin → Mail, or env vars) and an email on the account. Admins can also **Set password** on `/admin/users`
- Users live in `data/users.json` (gitignored). Session cookie is signed with `FICSIT_AUTH_SECRET` or `data/auth-secret.txt`
- SMTP from the UI is stored in `data/smtp.json` (gitignored) and applies without a restart. Env vars are the fallback.

| Variable | Meaning |
| --- | --- |
| `FICSIT_PUBLIC_URL` | Origin used in reset emails, e.g. `http://192.168.1.10:43147` |
| `FICSIT_SMTP_HOST` / `PORT` / `USER` / `PASS` / `FROM` | SMTP for reset mail (or set these in Admin → Mail) |
| `FICSIT_SMTP_SECURE` | `1` for implicit TLS (port 465) |
| `FICSIT_AUTH_SECRET` | Cookie HMAC key (generated on first boot if unset) |

## Point it at your world (without env)

1. Use **Add save location** (or pick an existing server) and set the SaveGames directory.
2. Leave **Demo factory** selected only when you want the built-in sample world.
3. Pick an update period that matches autosave.
4. Or **Upload .sav** to add a snapshot as its own server.

Typical client path (Windows):

`%LOCALAPPDATA%\FactoryGame\Saved\SaveGames\<steam-id>`

Only the newest complete `.sav` in the folder is used unless you upload or pin a specific file.

## Stack

- Next.js App Router, TypeScript, Tailwind, shadcn/ui
- Leaflet `CRS.Simple` + HTML canvas overlay
- Server-sent events for status and deltas

Satisfactory is © Coffee Stain Studios. This tool only reads saves you provide.
