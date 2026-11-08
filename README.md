# Anatomy Cards

Private flashcard app for first-semester anatomy: Latin names of muscles and joint ligaments, scheduled with FSRS. Works on iPhone (add to Home Screen) and laptop browsers.

**Status: prototype** — 10 upper-limb muscles and 6 shoulder/elbow ligaments. Not the full curriculum.

Live site (once GitHub Pages is switched on): https://mhollmen72.github.io/anatomy-cards/

> Educational study tool only — not a substitute for formal teaching, qualified anatomical instruction or clinical judgement.

## How the cards work

- One card = one structure × one category.
  - Muscles: **P** parts · **N** innervation · **U** origin · **A** insertion · **S** tendons and related structures · **F** functions · **R** notable facts
  - Ligaments: **W** blends with · **L** attachments of the ends · **F** functions
- Tap **Reveal answer**, then grade yourself: **I didn't know this** (comes back 3–5 cards later) or **I knew this** (FSRS schedules it days ahead).
- A card answered **I knew this** 7 times in total is **mastered** and no longer shown. The bar at the top shows mastered cards out of all cards. Mastered cards can be brought back via **Menu → Study mastered cards again**.
- Encouragement appears every 50 new cards learned, every 25 cards mastered, and when the whole deck is mastered.
- Keyboard: Space = reveal, 1 = didn't know, 2 = knew.
- Progress is stored only on the device. Use **Menu → Export progress** for backups.

## Correcting a fact (no coding needed)

1. Open the structure's file in `data/` on GitHub, e.g. `data/muscles/upper-limb/deltoideus.yaml`.
2. Click the pencil icon, edit the line, click **Commit changes**.
3. The site rebuilds automatically. If a rule is broken (e.g. a fact cites only one source but is marked `cross-checked`), the build stops and the old version stays live; the error is shown in the **Actions** tab.

Every fact has a `status` and `cite` list. Only cards whose facts are **all** `cross-checked` (two different sources in `data/sources.yaml`) are shown. Others are listed in the build report as held back.

## Images

Listed in `data/images.yaml`. The **Import images** workflow fetches them from Wikimedia/Wikipedia, checks each licence (public domain, CC0, CC BY, CC BY-SA only), and records author and licence in `images/commons-meta.json`. Problems are written to `images/import-report.txt`.

## For developers

```
pip install pyyaml==6.0.3
npm install
npm test            # data validator tests + unit tests
npm run build       # validates data, compiles, writes dist/
npm run test:e2e    # browser tests at iPhone and laptop sizes (needs: npx playwright install chromium)
npm run serve       # serves dist/ at http://localhost:8080/
```

- `src/` — app (TypeScript, no framework). `src/core/` holds the scheduling/session logic.
- `src/vendor/ts-fsrs/` — FSRS scheduler (ts-fsrs v5.4.2, MIT), vendored.
- `data/` — anatomy data (YAML). `scripts/build_data.py` validates and compiles it.
- `tests/` — unit tests (`node --test`) and browser tests (Playwright).
- No environment variables or API keys are used.
