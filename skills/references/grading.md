# Grading reference — judging and dialing in a film look

How to evaluate a grade and refine it toward a convincing film look. Used by
`refine`, and any time you tune flags on top of a preset for one shot.

## The render → read → adjust loop

You can critique your own grades — you do not need the user in the loop for every
step. Tune flags on a still, look at the result, decide what is wrong, adjust.

1. Render a **still**, never a full video, while iterating:
   `<runner> preview <file> --preset <name> [flags] -o /tmp/out.png`
   (For video, extract one representative frame first.)
2. **Read the output image** and judge it against the intent and the original.
3. Name the specific problem (too punchy, hazy, wrong artifact, mood mismatch).
4. Change one or two flags and re-render. Repeat until it reads as film.
5. Inspect suspected artifacts at 1:1 — crop the region and read that:
   `ffmpeg -i out.png -vf "crop=W:H:X:Y" crop.png`

Render variants side by side when a choice is unclear (e.g. two split-tone hues),
read both, keep the winner.

## What makes a grade read as "film" (not digital)

Presets applied raw often look punchy and digital. Classic film tends to want:

- **Lifted blacks** — `--fade` ~0.04–0.1. Pure black reads digital. To tint the
  lift (e.g. teal/green blacks like a music-video grade) add `--fade-color`
  (`warm`, `green`, `teal`, `magenta`). The default `neutral` keeps the classic
  uncolored lift.
- **Highlight rolloff** — `--highlights` ~0.12–0.25. Gentle shoulder, not clipped.
- **Restrained saturation** — `--subtractive-sat` ~0.92–1.05. Oversaturation is the
  most common "digital" tell. The before image often looks "better" only because
  the after was pushed too hard.
- **Grain** — `--grain-iso` ~800–1100, `--grain-size 1`. Texture sells film.
- **Halation** — `--halation-amount` ~0.18–0.3 on highlights for a soft glow.
- **Vignette** — `--vignette-amount` ~0.16–0.34 to frame the subject.
- Drop **chromatic aberration** (`--no-aberration`) unless you want an obvious lens
  look; it reads as digital fringing.

Start from the preset that owns the image's color identity, then layer these.

## Split tone (teal-orange and when not to)

`--split-tone-shadow-hue 200 --split-tone-highlight-hue 40` → **cool teal shadows,
warm highlights** (the classic teal-orange). Swap the two values to reverse it. Tune
with `--split-tone-amount` (~0.3–0.4 is plenty; 0.6 is heavy) and `--split-tone-pivot`.

Each hue walks a full hue→RGB wheel, so any value reaches any tone: ~180 lands on
**true teal** (not just cyan), ~120 green, ~30 amber, ~300 magenta. Shadows and
highlights are independent, so non-complementary pairs (e.g. teal shadows + amber —
not pure-complement — highlights) are easy. Highlights tint more subtly than shadows
by default; raise `--split-tone-highlight-strength` (0–1, default 0.5) toward 1 for
equal-strength highlight toning. Pair with a tinted lift (`--fade-color teal`) to get the alternating
cool-blacks / warm-highlights look from a music-video grade.

- **Use it** for action, landscape, cityscape — anything that benefits from cool/warm
  separation. Match a reference's mood by reading where its highlights vs shadows sit.
- **Skip it** for warm, intimate, single-mood scenes (sunset portrait, golden hour
  embrace). Cool shadows fight the warmth — those want consistent warmth instead
  (`--no-split-tone`, nudge `--white-balance` warmer).
- Always verify direction by swapping the shadow/highlight hues and reading both.

## Color wheels (lift/gamma/gain)

Per-channel control over shadows (`--lift-r/g/b`, offset), midtones (`--gamma-r/g/b`,
power, >1 brightens), and highlights (`--gain-r/g/b`, multiply). Neutral by default;
disable with `--no-color-wheels`.

- **Reach for wheels, not split tone, for corrective work**: neutralizing a cast in
  one tonal zone, matching shot-to-shot balance, or cooling/warming only the
  highlights. Split tone is the stylized hue-toning tool; wheels are surgical.
- **Stay subtle**: lift ±0.02–0.06, gain 0.92–1.10, gamma 0.9–1.15. The flag ranges
  go far beyond what reads as film.
- Teal-orange via wheels: `--lift-b 0.04 --lift-r -0.02 --gain-r 1.08 --gain-b 0.94`.
- **One owner per zone**: a tinted fade, split-tone shadows, and a blue lift all
  push the blacks at once and triple-tint them. Pick which tool owns each zone and
  zero the others before judging the result.

## Common artifacts and fixes

| Symptom | Cause | Fix |
|---|---|---|
| Cyan/green "negative" fringe on backlit whites (e.g. a white shirt) | Heavy halation + bloom blooming a bright near-neutral, leaving the complementary cast | Lower `--halation-amount` and `--bloom-amount`; add `--split-tone-protect-neutrals` |
| Hazy / washed, less crisp than the original | Over-warming a cool scene + too much halation | Cooler/neutral `--white-balance`, lower halation, slightly raise `--contrast`/saturation |
| Looks digital / harsh | No fade, clipped highlights, oversaturated | Add `--fade`, raise `--highlights`, lower `--subtractive-sat`, add grain |
| Mood feels off | Toning fights the scene | Re-pick split-tone direction or remove it |

## Image asset prep (for web compares, etc.)

- Crop/scale to the target aspect first (cover, then center-crop):
  `ffmpeg -i in.jpg -vf "scale=W:H:force_original_aspect_ratio=increase,crop=W:H" out.png`
- Grade the cropped master, then export web `webp`:
  `ffmpeg -i graded.png -c:v libwebp -quality 80 out.webp`
- Grain inflates file size (high-frequency detail compresses poorly) — expect grainy
  grades to be larger; drop webp quality a little if needed.
