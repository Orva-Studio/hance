import { EffectGroup } from "./EffectGroup";
import type { EffectGroup as EffectGroupType } from "@hance/core";

interface Props {
  schema: EffectGroupType[];
  values: Record<string, string | number | boolean>;
  onChange: (key: string, value: string | number | boolean) => void;
  onCommit: () => void;
  onReset: () => void;
  canReset: boolean;
  animating: boolean;
}

export function AdjustmentsPanel({ schema, values, onChange, onCommit, onReset, canReset, animating }: Props) {
  return (
    <div className="flex flex-col h-full">
      <div className="px-5 py-3 border-b border-zinc-800 flex items-center justify-between">
        <h2 className="text-xs font-semibold text-zinc-300 uppercase tracking-wide">Adjustments</h2>
        <button
          onClick={canReset ? onReset : undefined}
          disabled={!canReset}
          title={canReset ? "Reset to saved look" : "No changes to reset"}
          className={
            canReset
              ? "text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
              : "text-xs text-zinc-600 cursor-default"
          }
        >
          Reset
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-3">
        {schema.map(group => (
          <EffectGroup
            key={group.key}
            group={group}
            values={values}
            onChange={onChange}
            onCommit={onCommit}
            animating={animating}
          />
        ))}
      </div>
    </div>
  );
}
