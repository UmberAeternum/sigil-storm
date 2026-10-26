# SIGIL STORM — Devpost Submission Package

Everything below is ready to paste into the Devpost submission form.
**Deadline: Nov 18, 2026, 8:00 PM UTC (Nov 19, 1:30 AM GMT+5:30)** · submit by Nov 15 for safety.

- **Live build:** https://umberaeternum.github.io/sigil-storm/
- **Repo:** https://github.com/UmberAeternum/sigil-storm
- **Devpost:** Meta VR Start Developer Competition 2026

---

## 1. Form fields

- **Submission name:** SIGIL STORM
- **Track:** Gaming
- **Division:** New Experience (conceived and built Oct 4+, 2026 — inside the window that opened Sept 24, 2026; no prior prototype exists)
- **Team:** Premtej Reddy (UmberAeternum) — solo developer: design, code, audio, shaders
- **Target launch date:** already live (URL above)
- **Build access:** hosted WebXR — judges open the URL in the Meta Quest Browser, enable hand tracking, press ENTER VR. No install, no invite code. Works in any desktop browser too (preview mode).

### Tagline (≤140 chars — pick one)

1. `Draw runes in thin air, fling embers with your bare hands, and bend time with a fist — seated, controller-free, on any Quest browser.` (133)
2. `Hands-first arcade defense: throw embers, draw runes in the air, bend time with a fist. Nine drifting embers, one storm, zero controllers.` (137)
3. `Your hands are the controller. Pinch, throw, draw, squeeze — defend the last altar from the storm, and grow with every run.` (123)

---

## 2. Description (~430 words, suggested limit 500)

**Inspiration**

SIGIL STORM started with one question: what can VR give you that no flat screen ever could? Not a bigger viewport — your actual hands. Most VR games still hand you a controller-shaped interface: point, click, teleport. I built the opposite — a game where every single action is something your hand already knows: grab, throw, draw, squeeze.

The fantasy: you are a storm-priest at a floating altar. Wisps of the storm come for the core crystal. Your weapons are your hands — pinch embers off a drifting bubble-field and fling them with real throw physics, draw runes in the air (a line raises a barrier, a circle detonates a nova, a zigzag calls chain lightning), and close your fist to bend time while the world crawls.

**How it's built**

SIGIL STORM is web-native: TypeScript, Three.js and WebXR, running in the Meta Quest Browser. There is not a single external asset — every material, shader, sound and texture is generated procedurally in code, so the whole game is one ~680 KB bundle with a near-instant cold start.

Hands are tracked through WebXR's hand-tracking API. Pinch detection uses joint distances with hysteresis so grabs never flicker; thrown embers inherit your true wrist velocity through a spring model, so real throwing skill transfers one-to-one. Rune strokes are classified geometrically the instant you release the pinch — rotation and size invariant, no menus. A held fist bends time with haptic confirmation. Everything is tuned for a seated, two-foot interaction radius: nine ember bubbles float all around you (the spread adapts to portrait phones), enemies come to you, and there is no locomotion at all.

The environment is an instrument — the "Lumen" system: fog, sky, lights, bloom and music react to gameplay. Novas wash the room amber, barriers cool it blue, core hits flood it crimson, bullet time drowns it violet — and the base palette drifts from cold indigo to storm crimson as waves climb, so danger is something you feel before you think it. Every discrete moment runs on GSAP-eased motion: enemies materialize with overshoot and die in a squash-crunch, bubbles pop in elastically, the core crystal takes a visible punch on every hit.

Under the hood: XP and levels, an altar shop with biome themes that re-tint the whole atmosphere, a rank ladder, daily seeded challenges with streaks, achievements, a local leaderboard, and a Growth Report measuring rune accuracy, throw accuracy and reaction time every run. Adaptive difficulty raises or eases the storm to keep each player in flow, the core mends itself when you get a breath so a slow reaction costs time — not the run — and Calm Mode removes the fail state entirely for younger players.

**Future plans**

Three directions: mixed-reality passthrough so the altar materializes on your real desk; async ghost-runs where you defend against the storm pattern of a friend's best run; and a rune-grammar expansion — two-stroke compound sigils that unlock utility spells. The long-term goal is a platform for hands-native spellcraft: interfaces you draw, not menus you point at.

---

## 3. Hand Interactions section (optional field — submit it)

Hands are the only input. On the menu you pinch floating orbs to open pages and pinch the green orb to start — no laser pointers anywhere. In combat: pinch an ember to grab it (it springs to your fingers with haptic tick), flick your wrist and release to throw — the orb inherits your real hand velocity through a spring model, so better physical throws literally score more. Pinch empty air and drag to draw a stroke; on release a geometric classifier matches it to a rune — line = barrier, circle = nova, zigzag = chain lightning — and it casts instantly. Hold a closed fist for half a second to bend time. Every interaction works seated, inside a two-foot radius. What excites me about the future of VR: hands turn an interface from a skill you learn into an instinct you already have — SIGIL STORM is my first step toward games that are drawn and thrown, never pointed.

---

## 4. Demo video script (2:30 — judges stop at 3:00; lead with the best material)

Record on the Quest (Sharing → Record) or XR Simulator. 1280×720 crop, cuts every 3–5 s.

| Time | Shot | Voiceover |
|---|---|---|
| 0:00–0:15 | Cold open: pinch an ember, slow flick, wisp shatters in hit-stop, score pop | "Your hands are the controller." |
| 0:15–0:40 | Throwing montage: wrist flicks, combo ×5 callout, bubble field drifting around the player | "Embers drift around you like soap bubbles. Pinch one — the throw inherits your real wrist speed." |
| 0:40–1:10 | Runes: draw a LINE — barrier blocks a wave; CIRCLE — nova slams a mandala + pillar of light; ZIGZAG — chain lightning crackles across three wisps | "Pinch the air and draw. Line. Circle. Zigzag. Cast the moment you let go." |
| 1:10–1:30 | FIST hold: world drowns violet, wisps crawl, player weaves throws through slow motion | "Close your fist and time bends." |
| 1:30–1:50 | Colossus wave: portal surges crimson, weak-point bonus, core takes a hit — crystal punches and springs back | "Every third wave, a Colossus stirs." |
| 1:50–2:10 | Run end: Growth Report (accuracy, reaction ms), altar shop re-tints the world to a new biome | "Every run measures how you're growing — and pays you for it." |
| 2:10–2:30 | Daily Sigil, rank ladder, logo + live URL on screen | "SIGIL STORM — pinch the green orb. Link in the description." |

---

## 5. Pre-submission checklist

**Quest hardware (do first — gates the video):**
- [ ] Hand tracking on; pinch-to-start works controller-free
- [ ] Ember grab → spring-follow → fling feel (tune `orbThrowBoost` if needed)
- [ ] Line / circle / zigzag recognition reliable at seated arm length
- [ ] Fist hold triggers time bend; no false triggers while throwing
- [ ] Comfort: fully seated, no camera motion — airplane-seat test
- [ ] 72/90 Hz holds in wave 5+ with particles
- [ ] Pause/resume: headset off → re-enter resumes cleanly
- [ ] Cold start to first satisfying moment under 10 s

**Submission mechanics:**
- [ ] Upload latest `github-pages-upload/` to the `gh-pages` branch (see its README.txt)
- [ ] Record demo video from Quest/Simulator per script; upload to YouTube (public), paste link
- [ ] Fill the form with the fields above; add 3–5 screenshots (menu, combat, rune cast, shop)
- [ ] Submit by **Nov 15**; confirm the live URL still serves the game
- [ ] After the entry period opens: freeze — no changes through judging

**Award angles to hit in the video/description:** Best Reason to Come Back (dailies, streaks, ranks, adaptive difficulty), Best First Five Minutes (30-second loop, guided tutorial), Boldest Original Concept (zero-asset procedural), Accessibility Forward (Calm Mode, colorAssist, seated-only, one-handed possible).
