import { LookCard } from "@hance/ui/app/components/LookCard";
import { LOOKS } from "./looks";

interface Props {
  active: string;
  thumbnails: Record<string, string>;
  onSelect: (name: string) => void;
  onHover: (name: string) => void;
  onHoverEnd: () => void;
}

// The original editor's looks grid with hover-to-preview, minus the
// upload/create/delete affordances (this is a read-only try-it shell).
export function LooksGrid({ active, thumbnails, onSelect, onHover, onHoverEnd }: Props) {
  return (
    <div className="flex flex-col min-h-0">
      <div className="px-3 py-2.5 border-b border-zinc-800">
        <h2 className="text-xs font-semibold text-zinc-300 uppercase tracking-wide">Looks</h2>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        <div className="grid grid-cols-2 gap-2">
          {LOOKS.map(look => (
            <LookCard
              key={look.name}
              name={look.label}
              thumbnailUrl={thumbnails[look.name] ?? ""}
              isActive={active === look.name}
              onSelect={() => onSelect(look.name)}
              onHover={() => onHover(look.name)}
              onHoverEnd={onHoverEnd}
              // No context menu in the try shell — just block the browser default.
              onContextMenu={e => e.preventDefault()}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
