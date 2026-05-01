import { useEffect, useState } from "react";
import { Brush, MapPinned, Satellite } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type HealthState = "loading" | "ok" | "error";

export function App() {
  const [health, setHealth] = useState<HealthState>("loading");

  useEffect(() => {
    let cancelled = false;

    fetch("/api/health")
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Backend health failed: ${response.status}`);
        }
        return response.json() as Promise<{ status: string }>;
      })
      .then((body) => {
        if (!cancelled) {
          setHealth(body.status === "ok" ? "ok" : "error");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHealth("error");
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-background text-foreground">
      <div className="absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.11)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.11)_1px,transparent_1px)] bg-[size:42px_42px]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_32%_22%,rgba(20,184,166,0.20),transparent_30%),radial-gradient(circle_at_76%_72%,rgba(59,130,246,0.18),transparent_34%)]" />

      <div className="absolute left-4 top-4 flex items-center gap-2 rounded-lg border border-border bg-background/72 p-2 shadow-2xl backdrop-blur">
        <Button>
          <MapPinned className="h-4 w-4" />
          Карта
        </Button>
        <Button variant="secondary" size="icon" aria-label="Спутниковый режим">
          <Satellite className="h-4 w-4" />
        </Button>
        <Button variant="secondary" size="icon" aria-label="Кисть">
          <Brush className="h-4 w-4" />
        </Button>
      </div>

      <div className="absolute bottom-4 left-4 flex items-center gap-3 rounded-lg border border-border bg-background/72 px-4 py-3 text-sm text-slate-200 shadow-2xl backdrop-blur">
        <span
          className={cn(
            "h-2.5 w-2.5 rounded-full bg-amber-400",
            health === "ok" && "bg-emerald-400",
            health === "error" && "bg-red-500",
          )}
        />
        <span>
          Backend:{" "}
          {health === "loading"
            ? "проверяется"
            : health === "ok"
              ? "доступен"
              : "недоступен"}
        </span>
      </div>
    </main>
  );
}
