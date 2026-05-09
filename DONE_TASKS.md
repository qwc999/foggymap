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

---

## FOG-009 - API Состояния Приложения

**Status:** Done

**Description:**
Экспортировать HTTP API для сохранения и загрузки JSON-encoded app state значений по ключу.

**Acceptance:**
- Frontend может сохранять и загружать типизированное состояние через небольшой API client.
- Отсутствующий ключ возвращает `null`/`None` без ошибки.
- Некорректный input обрабатывается предсказуемо.

**Tests:**
Rust-тесты покрывают insert, update, load и missing-key поведение.

**Notes:**
- Добавлен backend API: `GET /app-state/{key}` и `PUT /app-state/{key}`. Через frontend dev proxy он доступен как `/api/app-state/{key}`.
- `GET` возвращает `{ "key": "...", "value": null }` для отсутствующего ключа без ошибки.
- `PUT` принимает payload `{ "value": <json> }`, сохраняет JSON в `app_state.value_json` и обновляет существующий ключ через SQLite upsert.
- Ключи app state валидируются: допустимы ASCII letters/digits, `_`, `-`, `.`, максимум 64 символа; ошибки возвращаются JSON-ответом с `400`.
- Добавлен typed frontend client `loadAppState<T>()` / `saveAppState<T>()` в `frontend/src/api/appState.ts`.
- Проверено: backend `cargo fmt --check`, `cargo test`, `cargo clippy --all-targets -- -D warnings`; frontend typecheck/lint/format/test/build/audit.
- Проверено в реальном compose-сервисе: missing-key load, save, load, update и invalid-key error.

---

## FOG-010 - API Painted Cells

**Status:** Done

**Description:**
Экспортировать HTTP API для закрашивания ячеек, стирания ячеек и загрузки закрашенных ячеек внутри текущего viewport.

**Acceptance:**
- `paint_cells` вставляет batches одной транзакцией.
- `erase_cells` удаляет batches одной транзакцией.
- `get_cells_in_bbox` возвращает только ячейки, чей сохраненный centroid попадает в bounds.
- Повторное закрашивание той же ячейки идемпотентно.

**Tests:**
Rust-тесты покрывают batch insert, duplicate insert, erase, bbox query и примерный batch на 10k ячеек.

**Notes:**
- Добавлен backend API: `POST /painted-cells/paint`, `POST /painted-cells/erase`, `GET /painted-cells?west=...&south=...&east=...&north=...`.
- Payload paint: `{ "cells": [{ "h3_id": "...", "resolution": 11, "centroid_lng": 37.61, "centroid_lat": 55.75 }] }`.
- Payload erase: `{ "cells": [{ "h3_id": "...", "resolution": 11 }] }`.
- Batch paint и erase выполняются через SQLite transaction; paint использует `ON CONFLICT(h3_id, resolution) DO NOTHING`, поэтому повторная покраска ячейки не создает дубликат и не меняет состояние.
- Bbox-запрос фильтрует только по сохраненному centroid и поддерживает bounds через antimeridian (`west > east`).
- Добавлена валидация batch size до 10k, координат, H3 resolution и пустых/слишком длинных `h3_id`; некорректный input возвращает JSON error с `400`.
- Проверено: `docker compose run --rm --no-deps backend cargo fmt --check`, `cargo test`, `cargo clippy --all-targets -- -D warnings`.
- Проверено в реальном compose-сервисе: paint, duplicate paint, bbox query, erase, empty bbox after erase и invalid bbox error.

---

## FOG-011 - Сохранение Положения Карты

**Status:** Done

**Description:**
Сохранять и восстанавливать центр карты, zoom, bearing если будет использоваться, и текущий режим карты.

**Acceptance:**
- После закрытия и повторного открытия приложения восстанавливается последняя позиция карты.
- Переключение обычная карта/спутник сохраняется.
- Сохранение движения карты debounced и не пишет в БД на каждый animation frame.

**Tests:**
Unit-тесты на helpers сериализации состояния. Для restart behavior - ручная проверка.

**Notes:**
- Добавлен frontend state module `frontend/src/state/mapViewState.ts`: default state, storage key `map.view`, нормализация JSON из API, сериализация и stable signature для дедупликации save.
- `App` загружает `map.view` через FOG-009 API, передает состояние в `MapView` и сохраняет изменения через debounced `saveAppState`.
- `MapView` теперь принимает controlled `viewState`, стартует с сохраненными center/zoom/bearing/mode, отправляет изменения после `moveend` и меняет raster style при переключении street/satellite без remount.
- Toolbar получил рабочие кнопки `Map` и `Satellite`; `Brush` оставлен disabled до задач рисования.
- Сохранение не запускается, пока начальная загрузка app state не завершена; повторное сохранение одинакового состояния отсекается signature-сравнением.
- Проверено: frontend typecheck/lint/format/test/build/audit через Docker.
- Проверено в реальном compose-сервисе: frontend и backend подняты, `/api/app-state/map.view` сохраняет и возвращает center/zoom/bearing/mode через frontend proxy. После проверки состояние сброшено на default street/Moscow.

---

## FOG-012 - H3 Helpers На Frontend

**Status:** Done

**Description:**
Добавить H3 helpers для определения ячейки под курсором, преобразования границы ячейки в GeoJSON и расчета brush radius.

**Acceptance:**
- `lat/lng` конвертируются в H3-ячейку текущего resolution.
- H3-ячейки конвертируются в валидные GeoJSON polygons для MapLibre.
- Радиус кисти в метрах переводится в разумный H3 disk radius.

**Tests:**
Vitest-тесты для всех чистых helper-функций.

**Notes:**
- Добавлена dependency `h3-js` во frontend через Docker.
- Добавлен shared config `frontend/src/config/h3.ts`: `DEFAULT_H3_RESOLUTION = 11`, min/max H3 resolution и базовые brush radius constants.
- Добавлен helper module `frontend/src/geo/h3Helpers.ts`:
  - `lngLatToH3Cell` конвертирует `lng/lat` в H3 id;
  - `h3CellToGeoJsonFeature` возвращает closed GeoJSON Polygon feature с координатами `[lng, lat]`;
  - `h3CellsToGeoJsonFeatureCollection` готовит FeatureCollection для MapLibre sources;
  - `metersToH3DiskRadius` переводит радиус кисти в метрах в H3 `gridDisk` radius через средние edge/apothem/center-spacing метрики;
  - `getH3DiskForLngLat` возвращает набор H3-ячеек для кисти вокруг точки.
- Helpers валидируют координаты, H3 resolution, cell id и неотрицательный радиус кисти.
- Проверено: frontend typecheck/lint/format/test/build/audit через Docker; Vitest покрывает cell conversion, GeoJSON polygon closure, FeatureCollection, brush radius, grid disk и invalid input.

---

## FOG-013 - Preview H3-Ячейки Под Курсором

**Status:** Done

**Description:**
При движении курсора по карте показывать H3-ячейку под курсором как прозрачный highlighted polygon.

**Acceptance:**
- Подсвеченная ячейка плавно следует за курсором.
- Preview скрывается, когда курсор уходит с карты.
- Preview не ломает обычное взаимодействие с картой.

**Tests:**
Достаточно ручной визуальной проверки.

**Notes:**
- Реализован preview overlay в `MapView`: курсор конвертируется в H3 `res 11`, ячейка преобразуется в GeoJSON Polygon через helpers из FOG-012 и рисуется прозрачным cyan fill + outline поверх карты.
- Preview обновляется на `mousemove`, очищается при уходе курсора с canvas и не меняет обычные pan/zoom interactions.
- Source/layers preview восстанавливаются после `load`/`styledata`, поэтому overlay продолжает работать после смены base style и не зависит от успешной загрузки raster tiles.
- Проверено через Docker: frontend typecheck, lint, format check, Vitest, build и npm audit.
- Проверено визуально в headless Chrome на локальном `http://localhost:5173`: при наведении на карту появился прозрачный H3-полигон; runtime exceptions не было. После проверки `map.view` сброшен на default street/Moscow/zoom 11.

---

## FOG-014 - Рисование Кистью

**Status:** Done

**Description:**
Добавить paint mode: drag по карте закрашивает H3-ячейки под радиусом кисти, рисует их прозрачным overlay и сохраняет в SQLite.

**Acceptance:**
- Drag оставляет видимый след посещенной территории.
- Закрашенные ячейки остаются после restart.
- Записи в БД батчатся, а не отправляются на каждое mouse event.
- Карта остается usable во время рисования.

**Tests:**
Unit-тесты на brush/H3 helper logic. Rust persistence уже покрыта в FOG-010.

**Notes:**
- Brush button в toolbar теперь включает paint mode; текущий MVP-радиус кисти использует `DEFAULT_BRUSH_RADIUS_METERS = 30`.
- `MapView` рисует отдельный прозрачный blue overlay для painted H3 cells и сохраняет preview-ячейку поверх него.
- Во время drag новые H3-ячейки добавляются в overlay сразу, а в SQLite отправляются batched после завершения stroke через `POST /painted-cells/paint`.
- Добавлен frontend client `frontend/src/api/paintedCells.ts` для bbox load и paint batch save.
- Добавлены чистые helpers `frontend/src/paint/brush.ts`: дедупликация новых H3 ids, подготовка backend payload с centroid и chunking до 10k cells.
- Для restart behavior добавлена базовая загрузка painted cells из текущего viewport bbox; полноценная debounce/prune/max-limit логика остается в FOG-015.
- Проверено через Docker: frontend typecheck, lint, format check, Vitest, build и npm audit.
- E2E-проверка в локальном compose: headless Chrome включил brush, протянул stroke по карте, backend получил 12 новых H3 cells, эти cells остались после `docker compose restart backend`; runtime exceptions не было. Проверочные cells затем удалены через erase API, `map.view` восстановлен к прежнему значению.

---

## FOG-015 - Viewport-Подгрузка Закрашенных Ячеек

**Status:** Done

**Description:**
Загружать painted cells для видимых bounds карты после pan/zoom и рендерить только эти ячейки.

**Acceptance:**
- При возвращении в ранее закрашенную область overlay подгружается заново.
- При уходе из области frontend source не держит лишние ячейки.
- Bbox-запросы debounced.
- Временный max result limit защищает от гигантских payload.

**Tests:**
Проверить helpers построения bbox-запроса и frontend merge/replace logic, если они будут выделены.

**Notes:**
- Backend bbox API теперь принимает `limit`, по умолчанию ограничивает ответ 20k cells, не принимает `limit=0` и значения выше 50k, а также возвращает `truncated`.
- SQLite bbox query получает `limit + 1`, чтобы определить truncation без отправки лишнего payload.
- Frontend viewport-загрузка использует `limit=20000`, debounce 350ms и заменяет текущий overlay результатом нового bbox-запроса, вместо накопления всех когда-либо виденных cells.
- Локально нарисованные, но еще не сохраненные H3 cells добавляются поверх результата viewport-загрузки, чтобы stroke не мигал при гонке с запросом.
- Добавлен `frontend/src/paint/viewport.ts` с bbox signature, debounce/limit constants и helper для сборки viewport-scoped H3 ids.
- `MapView` получил технический `data-painted-cell-count` для E2E-проверки размера текущего frontend overlay state.
- Проверено через Docker: backend fmt, test, clippy; frontend typecheck, lint, format, Vitest, build и npm audit.
- E2E-проверка в локальном compose: headless Chrome нарисовал 12 временных cells в viewport A, при загрузке viewport B frontend count стал 0, при возврате в viewport A count снова стал 12 и совпал с API; runtime exceptions не было. Проверочные cells удалены, `map.view` восстановлен.

---

## FOG-016 - Режим Ластика

**Status:** Done

**Description:**
Добавить erase mode, который использует ту же brush geometry, но удаляет ячейки из storage и overlay.

**Acceptance:**
- Ластик удаляет видимые painted cells.
- Удаленные ячейки не появляются после restart.
- Paint и erase mode переключаются без remount карты.

**Tests:**
Unit-тесты на shared brush mode helpers, если они будут выделены.

**Notes:**
- Добавлен отдельный erase mode с кнопкой ластика в toolbar; paint и erase переключаются через общий `brushMode` без remount MapLibre-карты.
- Ластик использует ту же H3 brush geometry, что и кисть, но удаляет только уже видимые painted cells из overlay.
- Pending paint и erase операции взаимно отменяются для одной H3-ячейки, чтобы быстрые локальные изменения не сохраняли устаревшее состояние.
- Сохранение батчится после завершения stroke: erase batches отправляются перед paint batches, а не на каждое mouse event.
- Preview и cursor визуально отличаются: paint использует cyan/crosshair, erase - orange/not-allowed.
- Viewport reload учитывает локально стертые, но еще не сохраненные cells, чтобы stale bbox result не возвращал их в overlay.
- Проверено через Docker: frontend typecheck, lint, format, Vitest, build и npm audit.
- E2E-проверка в локальном compose: headless Chrome поставил 7 временных cells кистью, стер их ластиком до frontend count 0, после reload cells не вернулись. Проверочные данные очищены, `map.view` восстановлен.

---

## FOG-017 - Начальная Панель Инструментов

**Status:** Done

**Description:**
Создать компактный современный toolbar поверх карты: переключение режима карты, paint/erase tools, brush size control и disabled home button placeholder.

**Acceptance:**
- Контролы toolbar влияют на поведение карты.
- Размер кисти сохраняется.
- Контролы не перекрывают attribution и важные map interactions.
- UI usable на типичных desktop-размерах окна.

**Tests:**
Component tests для состояния toolbar, если это будет полезно.

**Notes:**
- Toolbar вынесен в `frontend/src/components/toolbar/AppToolbar.tsx`.
- Панель использует icon-only controls для map/satellite, brush/eraser и disabled home placeholder.
- Добавлен slider + numeric input для размера кисти; интерактивный диапазон ограничен 5-500м, default остается 30м.
- Размер кисти сохраняется через app-state key `brush.radiusMeters` и восстанавливается после reload/restart.
- `App` передает выбранный размер кисти в `MapView`, поэтому brush geometry реально меняется при работе с картой.
- Добавлены тесты `AppToolbar.test.tsx` и `brushSettings.test.ts`.
- Проверено через Docker: frontend format, typecheck, Vitest, lint, build и npm audit.
- E2E-проверка в локальном compose: headless Chrome проверил отображение toolbar, переключение map/paint/erase, disabled Home, отсутствие overlap с attribution/navigation и сохранение brush radius `75` после reload. Проверочные значения `map.view` и `brush.radiusMeters` восстановлены.

---

## FOG-018 - Home Location

**Status:** Done

**Description:**
Дать пользователю возможность задать, сохранить и быстро открыть домашнюю точку.

**Acceptance:**
- Пользователь может установить home из текущего центра карты или кликом по карте.
- Home сохраняется после restart.
- Кнопка home в toolbar центрирует карту на сохраненной точке.

**Tests:**
Rust-тесты на persistence home location. Frontend-тесты для state helpers, если практично.

**Notes:**
- Добавлен backend API `GET/PUT/DELETE /home-location` поверх таблицы `home_location`.
- Home можно сохранить из текущего центра карты, выбрать кликом по карте и открыть кнопкой Home.
- Toolbar получил отдельные controls `home-button`, `set-home-center`, `pick-home-on-map`.
- `MapView` рисует home marker и поддерживает режим выбора home кликом без remount карты.
- Frontend state helpers из `frontend/src/state/homeLocation.ts` нормализуют сохраненную точку и строят следующий `MapViewState`.
- Добавлены тесты `homeLocation.test.ts`, `homeLocation` API tests и Rust-тесты на insert/update/load/clear.
- Проверено через Docker: backend fmt, test, clippy; frontend format, typecheck, Vitest, lint, build и npm audit.
- E2E-проверка в локальном compose: headless Chrome сохранил home из центра, перешел домой из другого viewport, выбрал home кликом по карте; исходные `map.view` и `home_location` восстановлены.

---

## FOG-019 - Помощник Радиуса 10км Вокруг Дома

**Status:** Done

**Description:**
Добавить helper, который показывает и при подтверждении закрашивает область вокруг home в радиусе 10км.

**Acceptance:**
- Радиус 10км можно показать на карте.
- Перед bulk painting пользователь должен подтвердить действие.
- Bulk painting батчится и не замораживает UI.

**Tests:**
Тесты на radius geometry и batch generation helpers.

**Notes:**
- Добавлен helper `frontend/src/paint/homeRadius.ts` для GeoJSON preview-круга и генерации H3 cells вокруг home.
- Bulk-закраска 10км использует H3 `res 10`: проверка показала, что `res 11` дает около 123k cells, что слишком тяжело для стартовой bulk-операции.
- `MapView` получил отдельный прозрачный слой home radius preview, который восстанавливается после смены style.
- Toolbar получил кнопки `home-radius-preview` и `paint-home-radius`.
- Перед bulk painting показывается confirmation panel; без подтверждения API-записи не выполняются.
- Bulk painting отправляет cells в существующий paint API батчами до 10k и делает yield между batch-ами.
- Проверено через Docker: frontend format, typecheck, Vitest, lint, build и npm audit.
- E2E-проверка в локальном compose: headless Chrome включил preview, открыл confirmation, подтвердил bulk paint, backend получил 17 412 новых cells, frontend overlay count стал 17 412. Проверочные cells удалены, `map.view` и `home_location` восстановлены.

---

## FOG-020 - Backup Export/Import

**Status:** Done

**Description:**
Добавить локальный export/import пользовательских данных.

**Acceptance:**
- Пользователь может экспортировать SQLite-базу или стабильный app backup format.
- Пользователь может импортировать backup с понятным overwrite/merge behavior.
- Import валидирует backup до изменения текущих данных.

**Tests:**
Rust-тесты на backup validation и import behavior.

**Notes:**
- Выбран стабильный JSON backup format вместо raw SQLite copy: `format = "foggy_map.backup"`, `version = 1`, `exported_at`, `app_state`, `home_location`, `painted_cells`.
- Добавлены backend endpoints `GET /backup/export` и `POST /backup/import?mode=overwrite`; через frontend dev proxy они доступны как `/api/backup/export` и `/api/backup/import?mode=overwrite`.
- Import пока поддерживает только понятный overwrite behavior: другие mode отклоняются `400 invalid_backup_import_mode`.
- Backup валидируется до транзакции: format/version, app state keys, duplicate app state keys, duplicate painted cells, home coordinates/zoom, H3 id/resolution и centroid coordinates.
- Overwrite import выполняется одной транзакцией: текущие `app_state`, `home_location` и `painted_cells` заменяются данными из backup.
- Toolbar получил кнопки export/import. Export скачивает JSON-файл, import читает локальный JSON, требует подтверждение overwrite и после успешного импорта перезагружает пользовательское состояние из backend.
- Import/export в UI блокируются, пока загружается или сохраняется app state/home/paint data, чтобы backup не расходился с pending changes и import не перетирался поздним save.
- Добавлены frontend API client и тесты для backup, обновлены component tests toolbar.
- Проверено через Docker: backend fmt, test, clippy; frontend format, typecheck, Vitest, lint, build.
- Проверено в реальном compose-сервисе: export через backend и frontend proxy, invalid backup возвращает `400 invalid_backup` без изменения счетчика painted cells, import без `mode=overwrite` возвращает `400 invalid_backup_import_mode`.
- Playwright CLI был проверен внутри Docker, но браузерная проверка UI не выполнена: frontend-контейнер не содержит Chrome/Chromium (`Chromium distribution 'chrome' is not found`). UI покрыт component tests и production build.

---

## FOG-021 - Улучшить Видимость Кнопок Toolbar

**Status:** Done

**Description:**
Кнопки управления картой сейчас плохо читаются: иконки на темных/активных кнопках почти не видны, особенно в верхней панели управления.

**Acceptance:**
- Иконки всех кнопок toolbar хорошо видны в active, inactive, disabled и hover/focus состояниях.
- Активное состояние кнопок различимо без потери контраста иконки.
- Toolbar остается компактным и не перекрывает важные элементы карты.

**Tests:**
Frontend component tests для toolbar states, если изменение можно проверить статически. Дополнительно визуальная проверка в браузере.

**Notes:**
- Toolbar icon buttons получили явные high-contrast состояния: active `cyan` с темной иконкой, inactive slate с белой иконкой, disabled slate с приглушенной иконкой.
- Lucide-иконки увеличены до `h-5 w-5` и получили более толстый stroke, чтобы не пропадать на темном фоне.
- Компонентные тесты проверяют active/disabled classes и размер иконок.
- Проверено через Docker: frontend format, typecheck, AppToolbar tests, lint, build.

---

## FOG-022 - Вынести Технический Статус С Карты

**Status:** Done

**Description:**
Убрать нижний статусный блок с карты (`Backend: available`, `Map state`, `Brush`, `Home`, `Paint`, `Backup` и т.д.) и перенести эти данные на отдельную страницу/экран.

**Acceptance:**
- На экране карты больше нет нижнего технического status overlay.
- Есть отдельная страница/экран, где можно посмотреть backend/app-state/brush/home/paint/backup status.
- С карты можно попасть на этот экран понятным способом, не перегружая основной toolbar.
- Возврат со status-экрана обратно на карту очевиден.

**Tests:**
Frontend tests на наличие отдельного status view и отсутствие status overlay на map view, если структура позволит.

**Notes:**
- Нижний status overlay удален с карты.
- Добавлен отдельный `AppStatusView` с runtime/persistence статусами и кнопкой возврата на карту.
- На карте добавлена компактная отдельная кнопка `open-status-view` справа сверху, не внутри основного toolbar.
- Добавлен компонентный тест `AppStatusView.test.tsx`.
- Проверено через Docker: frontend format, typecheck, AppStatusView test, lint, build.
