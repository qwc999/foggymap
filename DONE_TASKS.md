# DONE_TASKS - foggy_map

Архив выполненных задач проекта. После завершения задачи ее секция переносится сюда из `TASKS.md`.

---

## FOG-001 - Инициализация Git И GitHub

**Status:** Done

**Description:**
Инициализировать репозиторий в `C:\Users\Alex\PycharmProjects\foggy_map`, создать базовый `.gitignore`, минимальный `README.md` и подключить приватный GitHub remote.

**Acceptance:**
- `git status` работает из корня проекта.
- Основная ветка называется `main`.
- `origin` указывает на GitHub-репозиторий.
- Первый коммит содержит `TASKS.md`, `.gitignore` и `README.md`.

**Tests:**
Не требуются. Это настройка репозитория.

**Notes:**
- Перед созданием remote проверить, авторизован ли `gh`.
- Не коммитить build-папки, зависимости, локальные базы данных и IDE-метаданные.
- GitHub-репозиторий создан пользователем заранее: `https://github.com/qwc999/foggymap`.
- `gh` CLI на машине не установлен; remote подключен через обычный `git remote add origin`.
- `.gitignore` исключает локальные окружения и build artifacts. После перехода на Docker-first локальное `.venv/` не используется.
- Добавлен `.gitattributes`, чтобы нормализовать окончания строк и уменьшить шум в diff.

---

## FOG-002 - Docker Compose Скелет Приложения

**Status:** Done

**Description:**
Создать Docker-first структуру приложения в существующей папке проекта: frontend-контейнер с React + TypeScript + Vite и backend-контейнер с Rust HTTP API. Все зависимости должны устанавливаться внутри Docker image/volume, а не на host.

**Acceptance:**
- `docker compose up --build` запускает весь проект.
- Frontend доступен в браузере на `http://localhost:5173`.
- Backend health endpoint доступен через compose, например `http://localhost:3000/health`.
- В проекте есть `frontend/`, `backend/`, `docker-compose.yml`.
- Node dependencies, Cargo registry/cache и build output живут в Docker-managed volumes или внутри containers, не требуют host install.

**Tests:**
Запустить базовые проверки через Docker Compose, без прямого host `npm`/`cargo`.

**Notes:**
- Desktop-окна Tauri в MVP не будет. Приложение запускается локально в браузере через Docker.
- Это осознанная замена Tauri: требование "ничего не ставить на компьютер, только Docker" важнее desktop-shell.
- Реализовано: `docker-compose.yml`, `frontend/` на React + Vite, `backend/` на Rust Axum, backend endpoint `/health`.
- Проверено через Docker: `docker compose up --build -d`, frontend `http://localhost:5173`, backend `http://localhost:3000/health`.
- Проверки: `docker compose run --rm frontend npm run build`, `docker compose run --rm frontend npm audit --audit-level=moderate`, `docker compose run --rm backend cargo test`.

---

## FOG-003 - Базовые Инструменты Качества

**Status:** Done

**Description:**
Настроить форматирование, linting и тестовые команды для frontend и Rust backend так, чтобы они запускались через Docker Compose.

**Acceptance:**
- Во frontend есть TypeScript check, linting, formatting и Vitest.
- Rust-код проверяется через контейнерные команды `cargo test` и `cargo fmt`.
- В README или `TASKS.md` есть понятные команды вида `docker compose run --rm frontend ...` и `docker compose run --rm backend ...`.
- Никакие инструкции не требуют `npm install`, `npm install -g`, `cargo install` или Python package install на host.

**Tests:**
Добавить хотя бы один минимальный frontend-тест, чтобы проверить работу test runner.

**Notes:**
- Конфигурация должна быть консервативной. Не тратить ранний этап на спорные style-решения.
- Реализовано: frontend scripts `typecheck`, `lint`, `format`, `format:write`, `test`, `build`; ESLint flat config; Prettier config; минимальный Vitest smoke-test.
- Backend image теперь устанавливает `rustfmt` и `clippy`, чтобы Rust-проверки выполнялись внутри Docker.
- Команды проверок зафиксированы в README и запускаются через `docker compose run --rm --no-deps ...`.
- Проверено: frontend typecheck/lint/format/test/build/audit, backend fmt/clippy/test.

---

## FOG-004 - UI-Фундамент

**Status:** Done

**Description:**
Настроить Tailwind CSS, shadcn/ui и lucide-react. Заменить дефолтный scaffold-экран на чистую поверхность приложения, готовую для полноэкранной карты.

**Acceptance:**
- Tailwind-классы работают в приложении.
- Хотя бы один shadcn-компонент отображается.
- Стартовый экран не мешает дальнейшему встраиванию карты на весь экран.

**Tests:**
Только smoke/checks, если не появятся чистые UI helpers.

**Notes:**
- Полировка дизайна будет позже. Эта задача только про базовую UI-инфраструктуру.
- Реализовано: Tailwind CSS, shadcn-style `Button`, `cn` utility, `components.json`, lucide-react icons и alias `@/`.
- Стартовый экран заменен на полноэкранную app surface с toolbar-заготовкой поверх будущей карты.
- Проверено: frontend typecheck/lint/format/test/build/audit через Docker; локальная страница проверена через in-app browser.

---

## FOG-005 - Конфигурация Источников Карт

**Status:** Done

**Description:**
Создать типизированную модель конфигурации map providers: обычные карты, спутниковые слои, attribution, max zoom, tile URL templates и технические заметки по провайдеру.

**Acceptance:**
- Providers описаны в одном модуле, а не захардкожены внутри map-компонентов.
- Обычный и спутниковый режим используют одну abstraction.
- Attribution является частью provider config.

**Tests:**
Unit-тесты на выбор provider и fallback-поведение.

**Notes:**
- Эта задача готовит приложение к замене публичных development tile-серверов.
- Реализовано: typed provider config, режимы `street`/`satellite`, default provider selection и fallback для неизвестного/неподходящего provider id.
- Satellite provider пока intentional placeholder до FOG-007, чтобы не закреплять юридически спорный или технически слабый источник.
- Проверено: frontend typecheck/lint/format/test/build/audit через Docker; provider tests покрывают selection и fallback.

---

## FOG-006 - Базовая MapLibre Карта

**Status:** Done

**Description:**
Отрисовать полноэкранную MapLibre-карту с pan и zoom. Для первого варианта использовать development street provider.

**Acceptance:**
- Карта занимает все окно.
- Работает перемещение мышью и zoom колесом.
- Attribution виден и не перекрыт UI.
- При React remount не создаются дублирующиеся map instances.

**Tests:**
Компонентный smoke-тест, если практично. Для canvas-карты допустима ручная визуальная проверка.

**Notes:**
- Начальный центр можно поставить в Москве или нейтральной точке до появления home location.
- Реализовано: `MapView` на MapLibre GL JS, raster style из provider config, OSM development provider, attribution и navigation controls.
- Проверено: frontend typecheck/lint/format/test/build/audit через Docker; browser DOM содержит MapLibre canvas и attribution; browser console без warning/error.
- Vite build предупреждает о крупном chunk из-за MapLibre. Это ожидаемо для карты и не блокирует MVP; code splitting можно сделать позже, если понадобится.

---

## FOG-007 - Выбор Спутникового Провайдера Для MVP

**Status:** Done

**Description:**
Проверить кандидатов бесплатных satellite/imagery слоев и выбрать поведение для MVP.

**Acceptance:**
- Проверены как минимум NASA GIBS и еще один кандидат.
- Зафиксированы ограничения: разрешение, attribution, условия доступа, пригодность для offline.
- Выбранный MVP-вариант добавлен в map provider config.

**Tests:**
Provider config tests покрывают выбранный спутниковый вариант.

**Notes:**
- Выбран default: `nasa-gibs-modis-terra-true-color`, слой NASA GIBS MODIS Terra Corrected Reflectance True Color через Web Mercator WMTS.
- Ограничение выбранного слоя: `GoogleMapsCompatible_Level9`, максимум zoom 9 и примерно 305.75 метров на пиксель на лучшем native tile level; это юридически чистый, но не детальный городской satellite basemap.
- Attribution хранится в provider config: `NASA GIBS / EOSDIS`; добавлены ссылки на документацию и условия использования NASA Earthdata.
- Offline-пригодность: слой online-only; приложение не хранит базовые тайлы карты. Offline-пакеты или кеш - отдельная будущая задача.
- Проверен OpenAerialMap как альтернативный кандидат: оставлен для будущего optional provider, потому что покрытие неравномерное и каталоговое, поэтому он слабый global default для MVP.
- Проверено: frontend typecheck/lint/format/test/build/audit через Docker; provider tests покрывают NASA GIBS default, tile URL, attribution и ограничения.

---

## FOG-008 - SQLite Schema И Миграции

**Status:** Done

**Description:**
Создать backend-инициализацию базы и миграции для app state, painted H3 cells и home location.

**Acceptance:**
- SQLite-база создается в Docker volume приложения.
- Миграции идемпотентны.
- Есть таблицы `app_state`, `painted_cells`, `home_location`.
- WAL mode включен, если он совместим с выбранным Docker/SQLite setup.

**Tests:**
Rust-тесты прогоняют миграции на in-memory или временной SQLite-базе.

**Notes:**
- Добавлен backend-модуль `db`, который открывает SQLite-файл из `DATABASE_PATH`, по умолчанию `/data/foggy_map.sqlite3`.
- `docker-compose.yml` передает `DATABASE_PATH: /data/foggy_map.sqlite3`; каталог `/data` остается Docker volume `app_data`.
- Добавлена таблица `schema_migrations`; первая миграция создает `app_state`, `painted_cells`, `home_location` и индекс `idx_painted_cells_centroid`.
- `painted_cells` хранит `h3_id`, `resolution`, `centroid_lng`, `centroid_lat` и `painted_at`; добавлены базовые CHECK constraints для координат и H3 resolution.
- При старте backend включает `foreign_keys`, `journal_mode = WAL` и `synchronous = NORMAL`, затем применяет миграции.
- Проверено: `docker compose run --rm --no-deps backend cargo fmt --check`, `cargo test`, `cargo clippy --all-targets -- -D warnings`.
- Проверено в реальном compose-сервисе: backend отвечает на `/health`, файл `/data/foggy_map.sqlite3` создается в Docker volume.
