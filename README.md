# SIGIL STORM

A hands-first WebXR arcade defense game for Meta Quest — and any desktop browser.
Seated at a floating altar, you defend a core crystal from storm wisps by **pinch-flinging
embers** with real hand physics, **drawing runes in the air** (line = barrier, circle = nova,
zigzag = chain lightning) and **closing a fist** to bend time. No controllers, no teleporting,
no roomscale — the entire game lives inside a two-foot radius.

Built with Three.js + WebXR. Zero assets: every material, shader, sound and texture is
procedural, so cold start is instant.

## The look: the "Lumen" ambient system

The environment is an instrument. Lights, fog, sky gradient, bloom and reflections react to
gameplay in real time:

- **Novas** wash the world amber; **barriers** cool it to blue; **chain lightning** cracks it white.
- A **core hit** floods everything crimson with an alarm pulse.
- **Bullet time** drowns the scene in violet while enemies crawl.
- The base palette drifts from cold indigo → storm crimson as waves climb — you can *feel* danger rising.
- PBR materials with a custom-matched environment map, fresnel energy shells, halo billboards
  (Quest-safe fake bloom), soft glow particles, ember trails and a swirling portal shader.
  True bloom post-processing runs in flat preview; XR uses the halo pipeline at full frame rate.

## Run locally

```bash
npm install
npm run dev        # http://localhost:5175
npm run build      # typecheck + production bundle in dist/
npm run preview    # serve the production build
```

Open it on desktop for preview mode (mouse = pinch/throw, draw strokes with drag,
keys `1/2/3` = barrier/nova/chain, `Shift`/`F` = time bend, `Enter` = start/restart).
On a Quest, open the hosted URL in the Meta Quest Browser and press **ENTER VR**.

## Play on Quest

1. Deploy `dist/` (see below) and open the URL in the Quest Browser.
2. Enable hand tracking: Quest settings → Movement Tracking / Hands (or double-tap the side
   of the headset to toggle).
3. Press **ENTER VR**, then **pinch the green orb** to begin.
4. Sit down. Rack orbs float within arm's reach. Pinch one, flick your wrist, let go.
5. Pinch empty air and *draw* — a stroke is matched the moment you release the pinch.
6. Close a fist and hold it for half a second to bend time (12 s cooldown).

## Deploy (competition submission path)

The build is a static bundle with relative paths — it works on any static host:

- **GitHub Pages**: push `dist/` to a `gh-pages` branch (or use `npx gh-pages -d dist`).
- **Vercel / Netlify**: point the project at the repo, build command `npm run build`,
  output directory `dist`.

## Quest test checklist (before recording the demo video)

- [ ] Hand tracking on; hands render; pinch start works without controllers anywhere
- [ ] Ember grab → spring-follow → fling: velocity feels right (tune `orbThrowBoost`)
- [ ] Air-drawing: line / circle / zigzag recognized reliably at seated arm length
- [ ] Fist hold triggers time bend; no accidental triggers while throwing
- [ ] Comfort: fully seated, no camera motion, no acceleration — airplane-seat test
- [ ] Frame rate holds 72/90 Hz in wave 5+ with particles
- [ ] Pause/resume: headset take-off → session end → re-enter resumes cleanly
- [ ] Cold start to first satisfying moment under 10 s

## Design notes (why it fits the brief)

- **Hands-first end-to-end**: every interaction — menu, combat, restart — is a pinch, throw,
  stroke or fist. A controller is never required.
- **Seated-optimized**: the rack sits at 0.9 m within ~0.42 m; enemies come to you; the
  airplane-seat test passes by construction.
- **One bus stop test**: a full wave arc takes ~90 s; the core loop is satisfying in the
  first 30 seconds.
- **Take-it-away test**: no third-party service exists to remove — engine, art, audio and
  AI-free design are all original and local.

## The meta game (why players come back)

- **XP & levels** — every run pays XP and ✦ Embers; level-ups bonus +50 ✦.
- **Altar Shop** — unlockable biomes (Ember Vault / Frost Sanctum / Verdant Grove) that re-tint
  the entire Lumen atmosphere, plus ember-trail styles. Equipping re-themes lights, sky, runes.
- **Rank ladder** — Novice → Adept → Magus → Archmagus → Stormlord, driven by your personal best.
- **Daily Sigil** — a date-seeded challenge with streaks ("Bend time 3 times in one run", …).
- **Medals** — 10 achievements with live toasts (Trinity Break, Rune Master, Sharpshot…).
- **Hall of Storms** — local top-5 leaderboard.
- **Adaptive difficulty** — perfect waves raise the storm (+8%), rough waves ease it (−10%),
  so players always sit in their flow zone. Calm Mode removes fail state for younger players.
- **Guided tutorial** — five hands-on steps (grab → throw → line → circle → fist) with auto-advance.
- **Game feel** — hit-stop on kills, floating score pops, combo callouts, adaptive music pulse,
  Colossus weak-point bonus.

## The Growth Report (games that make you better)

Every run measures the player: **rune-drawing accuracy**, **throw accuracy**, **average reaction
time** (measured from the moment a wisp crosses the threat ring), **best combo**, **perfect
waves** and total **focus time**. The report appears after every run and accumulates lifetime
trends in the menu — real, quantified cognitive/motor training data, not a marketing sticker.
Adaptive difficulty is the engine that turns those measurements into growth.
