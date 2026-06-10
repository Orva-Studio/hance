import { useRef, useState } from "react";
import type { EffectGroup as EffectGroupType, RangeOption } from "@hance/core";
import { RangeSlider } from "./RangeSlider";
import { ZONES, rgbFromWheel, wheelFromRgb, zoneIsNeutral, type Zone } from "./colorWheelMath";

interface Props {
  group: EffectGroupType;
  values: Record<string, string | number | boolean>;
  onChange: (key: string, value: string | number | boolean) => void;
  onCommit: () => void;
  disabled: boolean;
  animating: boolean;
}

const WHEEL_SIZE = 180;
const ZONE_ORDER: Zone[] = ["lift", "gamma", "gain"];

function num(values: Props["values"], key: string, fallback: number): number {
  const v = values[key];
  return typeof v === "number" ? v : fallback;
}

export function ColorWheelsControls({ group, values, onChange, onCommit, disabled, animating }: Props) {
  const [zone, setZone] = useState<Zone>("lift");
  const [fineOpen, setFineOpen] = useState(false);
  const wheelRef = useRef<HTMLDivElement>(null);
  const def = ZONES[zone];

  const keys = [`${zone}-r`, `${zone}-g`, `${zone}-b`] as const;
  const r = num(values, keys[0], def.neutral);
  const g = num(values, keys[1], def.neutral);
  const b = num(values, keys[2], def.neutral);
  const { x, y, master } = wheelFromRgb(zone, r, g, b);

  function setRgb(next: [number, number, number]) {
    onChange(keys[0], next[0]);
    onChange(keys[1], next[1]);
    onChange(keys[2], next[2]);
  }

  function puckFromPointer(e: React.PointerEvent): { x: number; y: number } {
    const rect = wheelRef.current!.getBoundingClientRect();
    let px = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    let py = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
    const len = Math.hypot(px, py);
    if (len > 1) { px /= len; py /= len; }
    return { x: px, y: py };
  }

  function handlePointerDown(e: React.PointerEvent) {
    if (disabled) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = puckFromPointer(e);
    setRgb(rgbFromWheel(zone, p.x, p.y, master));
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (disabled || e.buttons !== 1) return;
    const p = puckFromPointer(e);
    setRgb(rgbFromWheel(zone, p.x, p.y, master));
  }

  function handlePointerUp() {
    if (!disabled) onCommit();
  }

  function resetZone() {
    if (disabled) return;
    setRgb([def.neutral, def.neutral, def.neutral]);
    onCommit();
  }

  const puckLeft = ((x * 0.92 + 1) / 2) * 100;
  const puckTop = ((1 - y * 0.92) / 2) * 100;

  return (
    <div className="flex flex-col gap-2 py-1">
      <div className="flex gap-1">
        {ZONE_ORDER.map(z => {
          const zd = ZONES[z];
          const nonNeutral = !zoneIsNeutral(
            z,
            num(values, `${z}-r`, zd.neutral),
            num(values, `${z}-g`, zd.neutral),
            num(values, `${z}-b`, zd.neutral),
          );
          return (
            <button
              key={z}
              onClick={() => setZone(z)}
              className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
                z === zone ? "bg-zinc-700 text-zinc-100" : "bg-zinc-800/60 text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {zd.label}
              {nonNeutral && <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />}
            </button>
          );
        })}
      </div>

      <div className="flex justify-center">
        <div
          ref={wheelRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onDoubleClick={resetZone}
          title="Drag to balance; double-click to reset"
          className="relative rounded-full cursor-crosshair touch-none select-none"
          style={{
            width: WHEEL_SIZE,
            height: WHEEL_SIZE,
            // Hue ring matching the math basis: R east, G at 120deg CCW, B at 240deg.
            // CSS conic gradients run clockwise from north, so remap: from 90deg,
            // counter-rotation via the reversed stop order.
            background: `
              radial-gradient(circle, rgb(24 24 27) 0%, rgb(24 24 27 / 0.4) 45%, transparent 72%),
              conic-gradient(from 90deg,
                red, magenta, blue, cyan, lime, yellow, red)
            `,
            boxShadow: "inset 0 0 0 1px rgb(255 255 255 / 0.08)",
          }}
        >
          <div
            className="absolute w-3 h-3 rounded-full border-2 border-white shadow pointer-events-none"
            style={{ left: `${puckLeft}%`, top: `${puckTop}%`, transform: "translate(-50%, -50%)" }}
          />
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="w-1 h-1 rounded-full bg-zinc-500" />
          </div>
        </div>
      </div>

      <RangeSlider
        label={`${def.label} Master`}
        value={Number(master.toFixed(3))}
        min={def.min}
        max={def.max}
        step={0.01}
        onChange={m => setRgb(rgbFromWheel(zone, x, y, m))}
        onCommit={onCommit}
        disabled={disabled}
        animating={animating}
      />

      <button
        onClick={() => setFineOpen(!fineOpen)}
        className="self-start text-[11px] text-zinc-500 hover:text-zinc-300"
      >
        {fineOpen ? "▾" : "▸"} Fine ({zone} RGB)
      </button>
      {fineOpen && group.options
        .filter((o): o is RangeOption => o.type === "range" && o.key.startsWith(`${zone}-`))
        .map(opt => (
          <RangeSlider
            key={opt.key}
            label={opt.label}
            value={num(values, opt.key, opt.default)}
            min={opt.min}
            max={opt.max}
            step={opt.step}
            onChange={v => onChange(opt.key, v)}
            onCommit={onCommit}
            disabled={disabled}
            animating={animating}
          />
        ))}
    </div>
  );
}
