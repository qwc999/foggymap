# foggy_map

Локальное приложение для отметки посещенных мест на карте мира. Проект запускается через Docker Compose и открывается в браузере на `localhost`.

## Планируемый Стек

- React + TypeScript + Vite
- Rust backend API
- MapLibre GL JS
- SQLite
- H3 для хранения закрашенных территорий
- Docker Compose

## Окружение

Зависимости проекта не должны устанавливаться на host-систему. Все запускается через Docker:

- Node-зависимости устанавливаются внутри frontend-контейнера/volume.
- Rust toolchain и Cargo-зависимости находятся внутри backend-контейнера/volume.
- SQLite-данные приложения хранятся в Docker volume.
- На host нужны только Git, Docker и Docker Compose.
- Не использовать `npm install -g`, host `npm install`, host `cargo install` или локальные Python-окружения для разработки приложения.

## Запуск

Запуск всего приложения:

```powershell
docker compose up --build
```

После запуска:

- Frontend: `http://localhost:5173`
- Backend health check: `http://localhost:3000/health`

Остановка:

```powershell
docker compose down
```

## Проверки

Все проверки запускаются через Docker:

```powershell
docker compose run --rm --no-deps frontend npm run typecheck
docker compose run --rm --no-deps frontend npm run lint
docker compose run --rm --no-deps frontend npm run format
docker compose run --rm --no-deps frontend npm run test
docker compose run --rm --no-deps frontend npm run build
docker compose run --rm --no-deps frontend npm audit --audit-level=moderate
docker compose run --rm --no-deps backend cargo fmt --check
docker compose run --rm --no-deps backend cargo clippy -- -D warnings
docker compose run --rm --no-deps backend cargo test
```

## Работа С Задачами

Активные задачи ведутся в [TASKS.md](TASKS.md). Выполненные задачи переносятся в [DONE_TASKS.md](DONE_TASKS.md). Одна выполненная задача обычно соответствует одному git-коммиту. Для тестируемых задач тесты добавляются в том же коммите.
