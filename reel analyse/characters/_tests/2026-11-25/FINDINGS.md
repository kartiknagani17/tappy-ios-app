# Character opening clip — test round 1 findings (2026-11-25)

Character: gabby. 6 variations, prompts in `PROMPTS.md`. Clips in this folder, sheets in `qa/` (`qa/compare-all.jpg` = 1 frame/sec of each).
Cost: 60 credits (6 × 10). 3 extra attempts failed with "Audio generation failed" and were refunded.

## Scorecard
| # | Setting / type | Verdict | Usable trim | Notes |
|---|---|---|---|---|
| V5 | Parking, selfie, line | **Best** | 0.0–5.2 s | Line starts at 0.0 s, perfect lip-sync, face matches refs. She isn't really walking (background hardly moves). Fake store sign "Gaured". |
| V4 | Kitchen pantry, line | **Strong** | 2.3–8.0 s | Line at 2.45–5.25 s, then a big grimace = great hook beat. Swapped the pretzels for eggs. |
| V3 | Kitchen unpack, silent | **Good (best silent)** | 3.5–7.0 s | Crackers out, skeptical look at the camera ~4.5 s. Calm, very real-looking. Took 3 tries (audio failure). |
| V1 | Aisle tote, silent | OK | 5.0–8.0 s | Very natural shopping, but low energy. Glances at camera only at 0 s and ~6.5 s. |
| V2 | Aisle cart, line | OK with trim | 0.0–3.0 s | Line 0–2.8 s. Cereal box flies through the air at ~1 s (physics glitch). She walks out of frame at the end. Face a bit thinner than the refs. |
| V6 | Parking, bag, friend walking backwards | **Reject** | — | Veo did the "follow me" trope: her hand reaches out to the camera, she turns her back to it at ~2 s, and she never walks. |

## Rules learned
1. **The method works.** Nano Banana with `front` + `left` as refs, then Veo 3.1 Lite in Frames mode (start image only), x1. The face held across all 6.
2. **Lines come out exact and lip-synced.** Put the line *first* in the video prompt if it should open the clip. If the action comes first, the line starts late (V4 started at 2.45 s). An image written as "mid-sentence" makes the line start at 0 s (V2, V5).
3. **Silent clips stay silent.** No rogue speech. Ask for one clear reaction (a skeptical eyebrow or a grimace) at a stated time, otherwise the glance lands randomly.
4. **Never write "friend walking backwards" or anyone else walking with her.** That's what caused V6. For parking lot clips, use her own selfie (V5) or a camera standing still.
5. **"Drop it into the cart" can make things fly.** Prefer "places it", "sets it down", "slides it in".
6. **Reactions are the hook.** The grimace and skeptical-look moments (V2, V3, V4) read best. Ask for one in every clip.
7. **Brands on packs are AI gibberish** ("Chitoos", "Chocolo Krispis"). That's fine (no trademarks), but keep packs moving or small so they don't compete with the real product shot.
8. **Flow quirks:**
   - The refs clear after every image submit.
   - Use ⋮ → Animate on an image tile to set it as the start frame.
   - The video menu resets to Ingredients x4 (40 credits), so set it to Frames x1 every time.
   - "Audio generation failed" is refunded; just retry.
   - Chrome's multi-download block has to be allowed once.
   - 720p is enough for QC. Upscale to 1080p only for clips you keep.

## Audio: decided 2026-11-25, keep spoken audio
`stitch.sh` now keeps the character clips' audio and puts silence under the product shot. It also trims with `CS_IN/CS_OUT/CE_IN/CE_OUT`.
Tested in `stitch-test/`: V5 (0–5.2 s) → Cool Ranch shot → V3 (3.5–7 s) gives 20.6 s, with the voice at 0–5 s, silence at 5.2–17.1 s, ambience after, and clean cuts.

## Proposed set: 5 clips per character (25 total)
1. Aisle, silent: shopping plus one look at the camera.
2. Aisle, line (cart or basket).
3. Kitchen, silent: unpacking plus a skeptical look.
4. Kitchen, line, then a grimace.
5. Parking lot, selfie, line.

Each character gets its own lines. That's 15 lines in total, persona-safe: no medical claims.
