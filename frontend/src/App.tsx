import { useEffect, useState } from "react";

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
    <main className="app-shell">
      <section className="intro-panel" aria-label="Стартовый экран foggy_map">
        <p className="eyebrow">foggy_map</p>
        <h1>Локальная карта посещенных мест</h1>
        <p className="description">
          Docker Compose skeleton готов. Следующий шаг - подключить карту, хранение и
          инструменты закрашивания.
        </p>
        <div className="status-row">
          <span className={`status-dot status-${health}`} />
          <span>
            Backend:{" "}
            {health === "loading"
              ? "проверяется"
              : health === "ok"
                ? "доступен"
                : "недоступен"}
          </span>
        </div>
      </section>
    </main>
  );
}
