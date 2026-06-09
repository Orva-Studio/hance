import { useState, useRef, useEffect } from "react";
import type { EffectGroup as EffectGroupType } from "@hance/core";
import { RangeSlider } from "./RangeSlider";
import { SelectControl } from "./SelectControl";
import { OptionControl } from "./EffectGroup";
import { deriveHighlightHue, inferMode, type SplitToneMode } from "./splitToneMode";

const SHADOW_KEY = "split-tone-shadow-hue";
const HIGHLIGHT_KEY = "split-tone-highlight-hue";

/**
 * Split-tone controls with a UI-only "tone mode" that links the two hue sliders.
 * Natural keeps highlight = shadow; Complementary keeps highlight = shadow+180,
 * updating live as the shadow slider moves; Custom frees both. Mode is never
 * persisted — it is inferred from the current hue pair (e.g. on preset load).
 */
export function SplitToneControls({ group, values, onChange, onCommit, disabled, animating }: {
  group: EffectGroupType;
  values: Record<string, string | number | boolean>;
  onChange: (key: string, value: string | number | boolean) => void;
  onCommit: () => void;
  disabled: boolean;
  animating: boolean;
}) {
  const shadowHue = numberOf(values[SHADOW_KEY], 30);
  const highlightHue = numberOf(values[HIGHLIGHT_KEY], 210);

  const [mode, setMode] = useState<SplitToneMode>(() => inferMode(shadowHue, highlightHue));
  // Skip re-inference for hue changes we trigger ourselves, so an explicit
  // "Custom" choice stays sticky even while the hues still look linked.
  const selfUpdate = useRef(false);
  useEffect(() => {
    if (selfUpdate.current) {
      selfUpdate.current = false;
      return;
    }
    setMode(inferMode(shadowHue, highlightHue));
  }, [shadowHue, highlightHue]);

  const linked = mode !== "custom";

  function changeMode(next: string) {
    const m = next as SplitToneMode;
    setMode(m);
    if (m !== "custom") {
      selfUpdate.current = true;
      onChange(HIGHLIGHT_KEY, deriveHighlightHue(shadowHue, m));
      onCommit();
    }
  }

  function changeShadow(v: number) {
    onChange(SHADOW_KEY, v);
    if (linked) {
      selfUpdate.current = true;
      onChange(HIGHLIGHT_KEY, deriveHighlightHue(v, mode as "natural" | "complementary"));
    }
  }

  return (
    <>
      {group.options.map(opt => {
        if (opt.key === SHADOW_KEY && opt.type === "range") {
          return (
            <div key="tone-mode-and-shadow" className="flex flex-col">
              <SelectControl
                label="Mode"
                value={mode}
                choices={["natural", "complementary", "custom"]}
                onChange={changeMode}
                disabled={disabled}
              />
              <RangeSlider
                label={opt.label}
                value={shadowHue}
                min={opt.min}
                max={opt.max}
                step={opt.step}
                onChange={changeShadow}
                onCommit={onCommit}
                disabled={disabled}
                animating={animating}
              />
            </div>
          );
        }
        if (opt.key === HIGHLIGHT_KEY && opt.type === "range") {
          return (
            <RangeSlider
              key={opt.key}
              label={opt.label}
              value={highlightHue}
              min={opt.min}
              max={opt.max}
              step={opt.step}
              onChange={v => onChange(HIGHLIGHT_KEY, v)}
              onCommit={onCommit}
              disabled={disabled || linked}
              animating={animating}
            />
          );
        }
        return (
          <OptionControl
            key={opt.key}
            opt={opt}
            value={values[opt.key] ?? opt.default}
            onChange={v => onChange(opt.key, v)}
            onCommit={onCommit}
            disabled={disabled}
            animating={animating}
          />
        );
      })}
    </>
  );
}

function numberOf(value: string | number | boolean | undefined, fallback: number): number {
  return typeof value === "number" ? value : fallback;
}
