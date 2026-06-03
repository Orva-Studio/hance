# /hance refine

The depth entry point. Take **one** look on **one** file and dial it in until it's
right — adjusting effect flags on top of a base preset, iterating on a still preview,
and self-evaluating each render. This is the follow-on to `try`: `try` finds a
direction (breadth, user picks), `refine` perfects it (depth, agent iterates).

**REQUIRED BACKGROUND:** Read `references/grading.md` first — it has the
render→read→adjust loop, what makes a grade read as film, split-tone guidance, and
the artifact fix table.

## Args

`<file> [base-preset] [intent]`

- `<file>` — required. Image, or a video (extract a still to iterate on).
- `base-preset` — optional. The look to start from. If omitted, infer from the image
  or from a prior `try` pick.
- `intent` — optional free text or a reference image ("warmer", "more grain", "match
  this", "classic film, less punchy").

## What to do

1. Pick the runner per `SKILL.md`. Read `references/grading.md`.
2. Render a still with the base preset: `<runner> preview <file> --preset <base> -o $WORK/v.png`.
3. **Read the render.** Compare to the original and the stated intent. Name the
   specific problem.
4. Adjust one or two flags toward the intent (see grading.md for which knob does
   what), re-render, read again. Loop until it reads right. Inspect any suspected
   artifact at 1:1 with a crop.
5. Report the final flag set. Offer to apply it to the full file/video, and to save
   it as a named preset (`<runner> preset save <name> <flags>`) so the look is
   reproducible.

## Hard rules

- Iterate on a **still** (`hance preview`). Never run a full video render to explore.
- Change one or two flags per iteration, not many — you cannot attribute the result
  otherwise.
- Don't invent flags. Only names from `hance --help`.
- When you've layered flags on top of a preset, say so plainly (it's "<preset>, tuned",
  not the stock preset). If you save it, give it its own name.
