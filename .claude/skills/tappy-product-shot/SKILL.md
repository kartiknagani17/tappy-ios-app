---
name: tappy-product-shot
description: Make a Tappy reel product shot from just a product name - candid POV pick-up of the pack in a US store (Google Flow, Veo 3.1 Lite), quick wrist-led flip, barcode slides into Tappy's fixed scan frame, green lock + beep + soft flash, then the real Tappy verdict. Use when the user gives a product (e.g. "/tappy-product-shot Takis Fuego") or asks for a product shot / product video for a reel.
---

# Tappy product shot

**Input:** a product name (and optionally "good" or "bad" verdict, a reel number, a caption).
**Output:** `reel analyse/products/<slug>/shot.mp4` (scan ~5 s + real verdict ~7 s) and `scan-only.mp4`.
**Reference (approved look):** `reel analyse/products/cool-ranch-doritos/` and `reel analyse/tappy-clips/pov-messy-cool-ranch-v5.mp4`.
**Kit:** `reel analyse/pipeline/product-shot/` (build.sh, labels.cjs, record.cjs, sheet.sh, grid.sh, proxy.mjs, assets/).

## Non-negotiable look (the user rejected every version that broke one of these)
- Candid, off-angle, messy shelf. Never straight-on or staged.
- Real handheld camera: small step toward the shelf, bob, drift. Never locked.
- **No blur.** Never write "blur", "soft focus" or "out of focus" in any prompt. Always use Flow's 1080p download.
- The pack turns right after the pick-up. Don't linger on the front (handled in the edit).
- The flip is wrist-led, with the hand turning with the pack. Fast 0.3 s flips look AI, so the prompt asks for a slow 2 s turn and the edit speeds it up.
- Tappy's fixed scan frame is on screen the whole time. No "Center the barcode" hint. The barcode moves into the frame, the frame turns green, and the flash is soft.

## Steps

### 0. Set up
- `slug` = kebab-case product name. Create `reel analyse/products/<slug>/` with a `verdict/` subfolder.
- Read `reel analyse/products/angles.md`. Choose this product's angle so it differs from the last one: rotated **left/right**, rotation 15–25°, tilt 5–9°, shelf height, product position. Append a row.
- Decide the pack details: colour, pack type (bag / box / can / bottle), aisle type (chips / cereal / cookies / candy / dairy...).

### 1. Record the real verdict (free)
1. Start the preview servers `shots-proxy` and `shots-web` (from `.claude/launch.json`) with preview_start.
2. Find the exact card name. `record.cjs` matches `"<NAME>. <status>"`. If unsure, run once without NAME and read the printed `card:` line.
3. Record with Bash:
   ```
   BG=green WANT=bad NAME="<card name>" PLAYWRIGHT_BROWSERS_PATH="D:/playwright-mcp/browsers" \
     node "reel analyse/pipeline/product-shot/record.cjs" "<search query>" "reel analyse/products/<slug>/verdict" [cardIndex]
   ```
   `WANT=good` is for a product that fits the profile. The profile is seeded with milk = severe.
4. Check a frame. It should show the right product photo, the right verdict, and the highlighted ingredients. Tappy has had wrong photos and odd duplicates, so pick another card if needed.

### 2. Start image (Google Flow, Nano Banana 2.1, 9:16, x4, 0 credits)
Flow URL: https://labs.google/fx/tools/flow. Use the user's existing project or a new one, **Image** mode.
```
Candid, unposed smartphone photo, vertical 9:16, from someone standing at arm's length in front of a crowded US supermarket [AISLE TYPE] shelf, mostly facing it, holding the phone casually at chest height. The shelf fills most of the frame, but the shot is imperfect: the phone is rotated about [15-25] degrees to the [LEFT/RIGHT] of straight-on and tilted about [5-9] degrees, so the shelf edges are slightly diagonal and the [LEFT/RIGHT] side of the shelf is a bit closer than the other. Several [PRODUCT, colour + pack type] on the [top/middle/lower-middle] shelf, a little [left/right] of centre, not perfectly framed. Real store mess: gaps, one [pack] tipped over, crooked price tags, uneven fluorescent light. Sharp and in focus like a modern phone photo. No hand, no phone, no people, no text.
```
Pick the best of the 4. Reject it if it shows a long view down the aisle (too far from the shelf), a perfect straight-on shelf, wrong packaging, or blur.

### 3. End image (edit of the chosen start image, 0 credits)
Open the start image and type this in "What do you want to change?":
```
A few seconds later, same spot and same messy shelf behind, still at a slight angle. The person's right hand in a black sleeve holds one [PRODUCT] close to the camera, turned so the BACK of the [pack] with its barcode faces the lens. The [pack] is slightly tilted, not perfectly flat, fingers gripping it naturally. The barcode is sharp and readable, near the centre of the frame, slightly below the middle, about 40 percent of the image width. Candid phone photo, uneven store light, sharp, no text.
```
Cans and bottles: "rotated sideways so the barcode faces the lens". Boxes: "back panel facing the lens". If the barcode is small or off-centre, edit again ("bring it closer, barcode centred").
**Flow gotcha:** an edit replaces the image's current version. In the history panel, hover the end version, open ⋮ and choose **Save to projects**. Then click the start version in the history so the stack shows the start again. Now both exist as separate assets.

### 4. Video (Flow, Video > Frames, 9:16, **Veo 3.1 - Lite, x1 = 10 credits**, 8 s fixed)
Start = start image, End = end image. Check it says **x1 / 10 credits** before generating, because the menu sometimes jumps to x4 or Ingredients.
Prompt v5 (default since 2026-11-21, approved on Hershey's): the hand is in view from the first moment, and the turn is spelled out stage by stage so Veo animates a real roll instead of popping front -> back.
```
Handheld smartphone POV video, filmed casually by the person holding the phone in their left hand, not stabilized, one continuous shot with no cuts. From the very first moment their right hand in a black sleeve is already coming into view at the lower right corner, reaching toward the shelf. 0-2s: the person takes a small step toward the [AISLE TYPE] shelf, so the camera moves forward and gets closer to the shelf, bobbing up and down with the step, swaying slightly side to side and tilted off-level, while the hand keeps reaching in. 2-3s: the right hand alone grabs one [PRODUCT] from the [shelf height] shelf, [GRIP], and the camera dips down a little with the grab and comes back up. 3-5.5s: [TURN] The rotation is steady and continuous the whole way, about two and a half seconds; the [pack] stays one rigid [pack], the thumb and fingers never let go or slide, and the packaging never changes, warps or swaps. Only one hand ever touches the [pack], the other hand is holding the phone and is never seen. 5.5-8s: they hold the back of the [pack] with the barcode close to the camera while the phone keeps gently bobbing and swaying, with small hand tremors. Real hand physics, the [pack] only moves because the hand moves. Every frame crisp and sharp, everything in focus, like a modern phone camera with a fast shutter. Realistic phone footage, ambient supermarket sound, no music, no text.
```
[GRIP] and [TURN] by pack type (always name the in-between stages: front narrows -> edge/side -> back opens up):
- **Flat bar / flat packet / bag** -- GRIP: "thumb on the front and fingers behind it". TURN: "while bringing the [pack] toward the camera, they turn it over by slowly rolling the forearm, like flipping a playing card face up: the [pack] rotates with the hand around its long side. The front with the [LOGO] logo tilts away and gets narrower, for a moment the [pack] is seen edge-on showing only its thin side, then the back with the barcode rotates into view and opens up flat toward the lens."
- **Box / carton** -- GRIP: "fingers wrapped around its side edge". TURN: "while bringing the box toward the camera, they slowly rotate it with the wrist like turning a book over to read the back cover: the box turns around its vertical axis. The front with the [LOGO] logo swings away and gets narrower, the narrow side panel of the box faces the camera for a moment, then the back panel with the barcode swings into view and faces the lens."
- **Can / bottle / jar / tub** -- GRIP: "fingers wrapped around it". TURN: "while bringing it toward the camera, they slowly twist the wrist so the [pack] rotates around its upright axis like turning a jar to read its label: the front label with the [LOGO] logo slides away around the curve, the side of the label passes the lens, then the back label with the barcode comes round and faces the camera."
If it fails with "Audio generation failed", the credits are refunded. Press retry.

### 5. Download 1080p (free)
Open the video, use the download icon and pick **1080p Upscaled**. It takes a few minutes, and a toast says "Upscaling...". Wait for `C:/Users/HP/Downloads/*_1080p.mp4` with a background `until ls ...; do sleep 3; done`, then copy it to `<slug>/clip-1080.mp4`. Never use the 720p file, because it causes blur. Ask the user before downloading if they haven't approved Flow downloads in this session.

### 6. QC the raw clip and time it
- `bash reel analyse/pipeline/product-shot/sheet.sh <slug>/clip-1080.mp4 <scratch>/raw.jpg 4`
- **Reject and re-roll (10 credits)** if: a second hand holds the pack (Cheerios v1 did this; the one-hand line in the prompt fixed it), the hand or pack warps or melts, the pack spins without the hand, there's an extra hand, there's visible motion blur or smear, the barcode isn't readable at the end, or it's the wrong product.
- Read the times off the sheet: **hand in** (first frame the hand is clearly in view), **grab end** (pack leaves the shelf), **front end** (flip starts), **flip end** (barcode facing the camera), **hold**.
- Then make an every-frame sheet of the turn (`sheet.sh ... 30 <front end - 0.1> 1.6`). Veo sometimes hesitates: the front swings back for a few frames, or front swaps to back in one frame. Cut those frames out by splitting the turn into two segments with a gap (Hershey's: `3.85:4.12:1 4.32:5.4:1` drops 4.12-4.32 where the front flashed back). Join where the pack is thinnest (edge-on), so the cut hides inside the motion.
- `bash .../grid.sh <slug>/clip-1080.mp4 <cut time - 0.2> <scratch>/grid.jpg`. Barcode centre = image px × 2 (the grid cells are 108×96 in full res).

### 7. shot.env, captions, build
`<slug>/shot.env` (Cool Ranch example: grab ~2.6, front 2.6–3.8, flip 3.8–4.7, cut 6.0):
```
VIDEO=clip-1080.mp4
SEGMENTS="<hand in frame>:<grab end>:1.3 <grab end>:<front end>:4 <front end>:<flip end>:0.8 <flip end>:<flip end+1.2>:1"
# start at the first frame the hand is clearly in view (never an empty-shelf opening).
# NEVER speed up the flip: keep it 0.8-1x so the edge-on turn is visible (1.5x made it look like the front popped to the back).
# Output has no audio by default (user request); AUDIO=1 bash build.sh ... keeps it.
BARCODE_X=<x>
BARCODE_Y=<y>
ZOOM=1.3
# optional: PUSH_START / PUSH_END (default = the 0.6 s before the lock), VERDICT_A/B/B_SPEED/C (verdict trims)
```
Captions: `PLAYWRIGHT_BROWSERS_PATH="D:/playwright-mcp/browsers" node .../labels.cjs <slug> "#<n> <Product>" "<one-line finding>"`. Write the finding only from the verdict's real highlighted ingredients. No invented claims. If the caption covers key verdict text (e.g. "Contains: ..."), pass a 4th arg for its height, e.g. `1800` (default 1690).
Build: `bash reel analyse/pipeline/product-shot/build.sh "reel analyse/products/<slug>"`

### 8. QC the result (always, before showing the user)
Read `qa-scan.jpg` and `qa-verdict.jpg`. Check:
- No black corners. Dark corners must be the sleeve; crop and check if unsure.
- The barcode is fully inside the scan frame when it turns green.
- Front visible ≤ ~0.5 s, flip natural, no blur.
- The verdict sheet shows the right product and verdict, and the caption doesn't hide key text.

To fix: adjust SEGMENTS, BARCODE_X/Y or ZOOM and rebuild (free). Only re-roll the video for problems inside the AI clip.

### 9. Deliver
Send `shot.mp4` with SendUserFile. Report the credits used and which angle was chosen. Update `angles.md`.

## Costs
About 10 credits per product (plus 10 per re-roll). Images and the 1080p upscale are free. The Flow account shows its balance under the avatar (Plus: 190 a month, reset on the 20th). The visible "Veo" watermark is required in the user's region, so leave it.
