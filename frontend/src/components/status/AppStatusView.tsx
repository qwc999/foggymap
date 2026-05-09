import { ArrowLeft, Circle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type StatusTone = "ok" | "pending" | "error" | "info";

export interface StatusItem {
  label: string;
  value: string;
  tone: StatusTone;
}

interface AppStatusViewProps {
  items: StatusItem[];
  onBackToMap: () => void;
}

const statusToneClassNames: Record<StatusTone, string> = {
  ok: "text-emerald-300",
  pending: "text-amber-300",
  error: "text-red-300",
  info: "text-cyan-300",
};

export function AppStatusView({ items, onBackToMap }: AppStatusViewProps) {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-6 py-6">
        <header className="flex items-center justify-between gap-4 border-b border-white/10 pb-5">
          <div>
            <h1 className="text-xl font-semibold tracking-normal">Status</h1>
            <p className="mt-1 text-sm text-slate-400">Runtime state and persistence</p>
          </div>
          <Button
            className="h-10 rounded-md border-white/15 bg-slate-800 text-slate-100 hover:bg-slate-700"
            data-testid="back-to-map"
            type="button"
            variant="secondary"
            onClick={onBackToMap}
          >
            <ArrowLeft className="h-4 w-4" />
            Map
          </Button>
        </header>

        <section
          aria-label="Application status"
          className="mt-8 overflow-hidden rounded-lg border border-white/10 bg-slate-900/75"
          data-testid="app-status-view"
        >
          {items.map((item) => (
            <div
              key={item.label}
              className="grid grid-cols-[minmax(8rem,14rem)_1fr] items-center gap-4 border-b border-white/10 px-4 py-3 last:border-b-0"
            >
              <div className="flex items-center gap-2 text-sm font-medium text-slate-300">
                <Circle
                  className={cn(
                    "h-2.5 w-2.5 fill-current",
                    statusToneClassNames[item.tone],
                  )}
                />
                {item.label}
              </div>
              <div
                className={cn("text-sm font-semibold", statusToneClassNames[item.tone])}
              >
                {item.value}
              </div>
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}
