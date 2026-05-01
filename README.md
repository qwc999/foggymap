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

Команда запуска будет добавлена после создания Docker Compose структуры:

```powershell
docker compose up --build
```

## Работа С Задачами

Задачи ведутся в [TASKS.md](TASKS.md). Одна выполненная задача обычно соответствует одному git-коммиту. Для тестируемых задач тесты добавляются в том же коммите.
