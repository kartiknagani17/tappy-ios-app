---
name: type-2
description: Type 2 reel (one of several Tappy reel types). "Documentaries to watch if you're waking up" list reel - the user's character hook clip with a serif title, then 20 real documentary posters (official TMDB posters) cut one per beat, an optional Tappy promo in the middle (character + phone showing a real Tappy result) and a Tappy App Store end card. Copies a format that went ultra viral. Use when the user says "type 2", "/type-2", "documentary reel", gives a hook clip for a type 2 reel, or asks for a reel listing documentaries.
---

# Type 2 reel: "Documentaries to watch if you're waking up"

**Input from the user:** one character hook clip (that's the only thing they have to give). Optionally a theme ("Allergy Edition"), a tag ("Part 2"), whether this reel gets the middle promo, a separate pitch clip.
**Output:** `reel analyse/type 2/reels/<slug>/reel.mp4` - silent 1080x1920, 30 fps, ~19-25 s. The user adds the trending sound in Instagram.
**Reference:** `reel analyse/type 2/ANALYSIS.md` (frame-by-frame analysis of 7 reference reels; R5-R7 are the viral ones this copies).
**Kit:** `reel analyse/pipeline/type-2/` - posters.mjs (TMDB fetch), render.cjs (title, promo text, phone, end card), result.cjs (Tappy result still), build.sh (assembly + QA).

## The format (do not drift from it, it is what went viral)
| Section | Length | What |
|---|---|---|
| Hook | 3.0 s (90 frames) | The user's character clip, untouched (step back from the lens, serious stare). White serif title "Documentaries to watch / if you're waking up" in the upper third, soft shadow, no box. Optional tag line under it. |
| Posters | 20 x 0.667 s | One poster per beat (20 frames = one beat at 90 BPM). Hard cuts, no zoom, no transitions, no text on top. Each poster fits the full width, centred on a blurred, slightly darker copy of itself. Nothing is cropped. |
| Middle promo (some reels only) | 2.667 s (4 beats) | The character again + "You'll want to know what's in your food, trust me / I use the Tappy app to scan everything I buy"; 0.5 s in, a phone with a real Tappy result pops in bottom-left (no animation). Cut in on a beat, after poster N. |
| End pitch (optional) | 2.667 s | The same promo right before the end card (the viral reels did this). |
| End card | 3.1 s | Tappy App Store card in brand coral (#E04D2A): App Store badge, Tappy icon + name, "Scan food. / Know if it fits.", subline, and the phone with the result if one is given (else a centred layout). |

Total: 19.4 s (no promo) to ~25 s (both promos). Keep 20 posters unless the user says otherwise.

## Steps

### 0. Set up the reel folder
- `slug` = short kebab-case name, e.g. `2026-11-22-allergy-edition`. Folder: `reel analyse/type 2/reels/<slug>/`.
- Put the user's hook clip there as `hook.mp4` (look at it first: it should be the character, 9:16 ideally; it gets scaled to cover and centre-cropped). A separate pitch take, if given, goes in as `pitch.mp4`.
- Probe it: `ffprobe` size, fps, duration. The hook uses the first 3.0 s (`HOOK_START` / `HOOK_DUR` in reel.env to change).

### 1. Pick the 20 documentaries (`list.txt`)
- Real, existing documentaries/docuseries only, on topics Tappy's audience cares about: food, ingredients, additives, sugar, the food industry, chemicals in products, health. Lead with the strongest-looking, best-known posters (the first 3-4 posters decide whether people keep watching).
- Don't repeat the exact list of a previous reel: read `reel analyse/type 2/used.md` and vary at least half of the titles; append this reel's list there after the build.
- One per line, with the year (it disambiguates), and `| tv` for series:
  ```
  Food, Inc. (2008)
  Poisoned: The Dirty Truth About Your Food (2023)
  Rotten | tv
  ```
- Verified on TMDB (all have posters): Food, Inc. (2008) · Food, Inc. 2 (2024) · Poisoned: The Dirty Truth About Your Food (2023) · Fed Up (2014) · The Devil We Know (2018) · Rotten | tv · Seaspiracy (2021) · In Defense of Food (2015) · Food Chains (2014) · Super Size Me (2004) · Forks Over Knives (2011) · Sugar Coated (2015) · That Sugar Film (2014) · The Human Experiment (2015) · Stink! (2015) · Kiss the Ground (2020) · Toxic Beauty (2019) · Blood Sugar Rising (2020) · Merchants of Doubt (2014) · Hungry for Change (2012) · Not So Pretty | tv · Bad Surgeon: Love Under the Knife (2023) | tv. The reference reels also used: Cowspiracy, Dark Waters (drama, not a doc), The Bleeding Edge, The True Cost, Buy Now! The Shopping Conspiracy, The Plastic Detox, Plastic People, Unacceptable Levels, Tapped, A Plastic Ocean, Wasted!, Chemerical, Fresh, A Place at the Table, The Corporation, Before the Flood, Our Daily Bread, Jiro Dreams of Sushi, Sicko, Live to 100 | tv.

### 2. Fetch the real posters (free, ~1 min)
```
node "reel analyse/pipeline/type-2/posters.mjs" "reel analyse/type 2/reels/<slug>"
```
- Downloads the official TMDB posters to `posters/01.jpg ... 20.jpg` in list order, writes `posters.json`. The key is in `reel analyse/pipeline/type-2/.env` (git-ignored; never print it, never commit it).
- Lines flagged `<-- check` (title differs, year differs, not tagged documentary) and `MISSING` lines: fix the line in list.txt (add/adjust the year, `| tv`, exact title) and rerun. A year off by one is usually fine (festival vs release year).
- **Look at the posters before building**: one contact sheet, not 20 images (saves the user's limit):
  `ffmpeg -i "<dir>/posters/%02d.jpg" -vf "scale=180:270:force_original_aspect_ratio=decrease,pad=180:270:(ow-iw)/2:(oh-ih)/2,tile=10x2" -frames:v 1 <scratch>/posters.jpg`
  Replace any that are wrong (a different film), non-English, low-res, text-heavy and unreadable, or ugly. To swap one manually, drop another image in as the same `NN.jpg`.

### 3. Tappy result screen (only for reels with a promo, or if the end card should show the phone)
Start the preview servers `shots-proxy` and `shots-web` (preview_start; wait until http://localhost:8082 answers, Expo needs ~30-60 s), then:
```
WANT=bad PLAYWRIGHT_BROWSERS_PATH="D:/playwright-mcp/browsers" \
  node "reel analyse/pipeline/type-2/result.cjs" "<search query>" "reel analyse/type 2/reels/<slug>/result.png" [cardIndex]
```
- The profile is milk = severe, so pick a well-known product that contains milk (Hershey's Milk Chocolate is proven). `NAME="<exact card name>"` pins a card; `SCROLL=<px>` scrolls the sheet first.
- Look at result.png: right product photo, red verdict "Doesn't fit your profile". If the user sends their own screenshot instead, use that (any phone screenshot works).
- `BADGE` (optional) = a short red label sticking out of the phone, like the reference's "2/10". Only write what the result really shows (e.g. "Contains milk" for a milk product). Never invent a claim.

### 4. reel.env (only what differs from the defaults)
```
TAG="Allergy Edition"          # line under the title; empty = none (the viral reels had none)
TAG_AT=0                       # when the tag appears (s)
MID_PROMO=10                   # 0 = no middle promo (default); N = after poster N (10 = the middle)
END_PITCH=0                    # 1 = the promo again right before the end card
RESULT=result.png              # Tappy result screen for the phone; empty = promo text only, end card without phone
BADGE="Contains milk"          # optional red label on the phone
PROMO_CLIP=                    # default pitch.mp4 if present, else the hook clip
PROMO_START=                   # default: hook clip footage right after the hook if long enough, else its last 2.667 s
# TITLE="Documentaries to watch|if you're waking up"   (| = line break)
# PROMO_TEXT="You'll want to know what's in your food, trust me|I use the Tappy app to scan everything I buy"
# HEADLINE="Scan food.|Know if it fits."   SUBLINE="Scan any grocery product and see if it fits your allergies and diet."
# HOOK_START=0 HOOK_DUR=3.0 BEAT_FRAMES=20 PROMO_BEATS=4 PHONE_AT=0.5 END_CARD=1 END_DUR=3.1 MUSIC=
```
The middle promo is for some reels only (the user decides per reel/batch). If they don't say, ask once per batch; default is none.

### 5. Build (free, ~30-60 s)
```
bash "reel analyse/pipeline/type-2/build.sh" "reel analyse/type 2/reels/<slug>"
```
It prints the timeline (every section's start time) and writes `reel.mp4`, `qa.jpg` (48 frames across the whole reel) and `qa-cards.jpg` (hook with title, promo with phone, end card at full size).

### 6. QC (always, before showing the user)
Read `qa.jpg` and `qa-cards.jpg`. Check:
- Hook: the title is readable and doesn't sit on the face; the hook is the character, not an empty frame.
- Every poster is the right film, full width, sharp, no black bars (the blurred fill must cover top and bottom).
- Cuts: posters change every 0.667 s (two tiles per poster in qa.jpg is normal).
- Promo: the text is readable on that footage, the phone doesn't cover her face, the result screen shows the right product.
- End card: nothing cut off, the phone (if any) is fully visible.
- ffprobe reel.mp4: 1080x1920, 30 fps, no audio stream (unless MUSIC was set).
Fixes are free: edit list.txt / posters / reel.env and rerun build.sh.

### 7. Deliver
- Send `reel.mp4` with SendUserFile. Say: duration, which posters, whether the promo is in, and the caption suggestion.
- Caption suggestion in the same style as the references: a one-line hook + "Comment 'app' and I'll send you the link" (the viral funnel) or a direct "Tappy is on the App Store".
- Append the reel's titles to `reel analyse/type 2/used.md` (date, slug, titles).
- Remind once per batch: add the trending sound in Instagram (the video is silent on purpose).

## Notes
- Costs: no AI credits. TMDB is free; everything else is local ffmpeg/Playwright. To keep the user's Claude limit low, look at contact sheets, never at posters one by one.
- The posters are the studios' official artwork (same as the reference creator). TMDB's free key is for non-commercial use; a copyright claim on a reel is possible but rare. Don't generate fake posters with AI: they come out with wrong art and garbled titles.
- Tappy brand: coral #E04D2A (end card), cream #FFF6F1, ink #1F1513; app icon from `assets/icon.png`. To use Apple's official badge, put it at `reel analyse/pipeline/type-2/assets/appstore-badge.png` and render.cjs uses it automatically.
- Batches: for several reels, one folder per reel; the hook clip can be the same file in each (the viral reels reused one hook for every reel).
