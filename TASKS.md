# TASKS - foggy_map

Текстовый аналог Jira для проекта. Каждая задача содержит id, название, описание, статус, критерии готовности, тесты и заметки.

## Правила Работы

**Статусы:** `Todo`, `In Progress`, `Blocked`, `Done`

- Задача берется в работу только после явной команды пользователя.
- Одна успешно выполненная задача обычно должна становиться одним git-коммитом.
- Если задачу можно осмысленно протестировать, тесты пишутся в том же коммите.
- Если задача не тестируется осмысленно, это нужно явно отметить в итоговом отчете.
- Субагенты, плагины и скиллы используются тогда, когда они реально повышают качество, позволяют безопасно распараллелить работу или помогают не забивать контекст. Использовать их формально не нужно.
- Архитектурные изменения, которые затрагивают хранение, источники карт или модель редактирования, сначала фиксируются в этом файле.

## Текущие Архитектурные Решения

- Оболочка: Tauri, целевая ОС - Windows.
- Frontend: React, TypeScript, Vite.
- Рендер карты: MapLibre GL JS.
- Backend: Rust-команды Tauri. Фронт не работает с SQLite напрямую.
- Хранение: локальная SQLite-база в директории данных приложения.
- Модель посещенных территорий: H3-ячейки, стартовое разрешение - `res 11`, если тесты не покажут, что нужно менять точность.
- Редактирование: кисть и ластик поверх карты.
- Закрашенная область рисуется прозрачным overlay-слоем и не закрывает саму карту.
- Источники карт должны быть заменяемыми. Публичные OSM tiles можно использовать на раннем этапе разработки, но архитектура не должна быть жестко привязана к ним.
- Спутниковый режим должен быть конфигурируемым. Предпочтительные источники - бесплатные/open варианты вроде NASA GIBS, OpenAerialMap или Sentinel/Copernicus-derived слоев. Esri World Imagery можно рассматривать только как optional-слой для личного использования с attribution и зафиксированными ограничениями.

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
- Локальное `.venv/` создано для возможных Python-утилит и добавлено в `.gitignore`.
- Добавлен `.gitattributes`, чтобы нормализовать окончания строк и уменьшить шум в diff.

---

## FOG-002 - Скелет Tauri React Приложения

**Status:** Todo

**Description:**
Создать структуру Tauri + React + TypeScript + Vite в существующей папке проекта.

**Acceptance:**
- `npm install` успешно завершается.
- `npm run tauri dev` открывает локальное desktop-окно.
- В проекте есть `src`, `src-tauri`, `package.json`, `vite.config.ts`.
- У приложения задан стабильный идентификатор, например `com.foggymap.app`.

**Tests:**
Запустить базовые frontend/Rust проверки, доступные после scaffolding.

**Notes:**
- На данный момент поддерживаем только Windows.
- До диагностики ошибок scaffolding проверить Rust, Node и Windows build tooling.

---

## FOG-003 - Базовые Инструменты Качества

**Status:** Todo

**Description:**
Настроить форматирование, linting и тестовые команды для frontend и Rust backend.

**Acceptance:**
- Во frontend есть TypeScript check, linting, formatting и Vitest.
- Rust-код проверяется через `cargo test` и форматируется через `cargo fmt`.
- В `package.json` есть понятные scripts для частых проверок.

**Tests:**
Добавить хотя бы один минимальный frontend-тест, чтобы проверить работу test runner.

**Notes:**
- Конфигурация должна быть консервативной. Не тратить ранний этап на спорные style-решения.

---

## FOG-004 - UI-Фундамент

**Status:** Todo

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

---

## FOG-005 - Конфигурация Источников Карт

**Status:** Todo

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

---

## FOG-006 - Базовая MapLibre Карта

**Status:** Todo

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

---

## FOG-007 - Выбор Спутникового Провайдера Для MVP

**Status:** Todo

**Description:**
Проверить кандидатов бесплатных satellite/imagery слоев и выбрать поведение для MVP.

**Acceptance:**
- Проверены как минимум NASA GIBS и еще один кандидат.
- Зафиксированы ограничения: разрешение, attribution, условия доступа, пригодность для offline.
- Выбранный MVP-вариант добавлен в map provider config.

**Tests:**
Provider config tests покрывают выбранный спутниковый вариант.

**Notes:**
- Цель - юридически чистый default. Более красивый optional-provider можно добавить позже, если его условия подходят.

---

## FOG-008 - SQLite Schema И Миграции

**Status:** Todo

**Description:**
Создать Rust-инициализацию базы и миграции для app state, painted H3 cells и home location.

**Acceptance:**
- SQLite-база создается в директории данных приложения.
- Миграции идемпотентны.
- Есть таблицы `app_state`, `painted_cells`, `home_location`.
- WAL mode включен, если он совместим с Tauri runtime setup.

**Tests:**
Rust-тесты прогоняют миграции на in-memory или временной SQLite-базе.

**Notes:**
- `painted_cells` должна хранить H3 id, resolution, centroid longitude, centroid latitude и timestamp.

---

## FOG-009 - Команды Состояния Приложения

**Status:** Todo

**Description:**
Экспортировать Tauri-команды для сохранения и загрузки JSON-encoded app state значений по ключу.

**Acceptance:**
- Frontend может сохранять и загружать типизированное состояние через небольшой IPC wrapper.
- Отсутствующий ключ возвращает `null`/`None` без ошибки.
- Некорректный input обрабатывается предсказуемо.

**Tests:**
Rust-тесты покрывают insert, update, load и missing-key поведение.

**Notes:**
- Позже здесь будут храниться center, zoom, map mode, выбранный инструмент и размер кисти.

---

## FOG-010 - Команды Painted Cells

**Status:** Todo

**Description:**
Экспортировать Tauri-команды для закрашивания ячеек, стирания ячеек и загрузки закрашенных ячеек внутри текущего viewport.

**Acceptance:**
- `paint_cells` вставляет batches одной транзакцией.
- `erase_cells` удаляет batches одной транзакцией.
- `get_cells_in_bbox` возвращает только ячейки, чей сохраненный centroid попадает в bounds.
- Повторное закрашивание той же ячейки идемпотентно.

**Tests:**
Rust-тесты покрывают batch insert, duplicate insert, erase, bbox query и примерный batch на 10k ячеек.

**Notes:**
- Payload команд должен быть простым и явным. Aggregation добавим позже, не в MVP-команду.

---

## FOG-011 - Сохранение Положения Карты

**Status:** Todo

**Description:**
Сохранять и восстанавливать центр карты, zoom, bearing если будет использоваться, и текущий режим карты.

**Acceptance:**
- После закрытия и повторного открытия приложения восстанавливается последняя позиция карты.
- Переключение обычная карта/спутник сохраняется.
- Сохранение движения карты debounced и не пишет в БД на каждый animation frame.

**Tests:**
Unit-тесты на helpers сериализации состояния. Для restart behavior - ручная проверка.

**Notes:**
- Использовать команды app state из FOG-009.

---

## FOG-012 - H3 Helpers На Frontend

**Status:** Todo

**Description:**
Добавить H3 helpers для определения ячейки под курсором, преобразования границы ячейки в GeoJSON и расчета brush radius.

**Acceptance:**
- `lat/lng` конвертируются в H3-ячейку текущего resolution.
- H3-ячейки конвертируются в валидные GeoJSON polygons для MapLibre.
- Радиус кисти в метрах переводится в разумный H3 disk radius.

**Tests:**
Vitest-тесты для всех чистых helper-функций.

**Notes:**
- H3 resolution хранить в одном shared config module.

---

## FOG-013 - Preview H3-Ячейки Под Курсором

**Status:** Todo

**Description:**
При движении курсора по карте показывать H3-ячейку под курсором как прозрачный highlighted polygon.

**Acceptance:**
- Подсвеченная ячейка плавно следует за курсором.
- Preview скрывается, когда курсор уходит с карты.
- Preview не ломает обычное взаимодействие с картой.

**Tests:**
Достаточно ручной визуальной проверки.

**Notes:**
- Это proof point перед реализацией кисти.

---

## FOG-014 - Рисование Кистью

**Status:** Todo

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
- Первый цвет overlay: синий с opacity около `0.30-0.40`.

---

## FOG-015 - Viewport-Подгрузка Закрашенных Ячеек

**Status:** Todo

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
- Low-zoom aggregation - отдельная оптимизация позже.

---

## FOG-016 - Режим Ластика

**Status:** Todo

**Description:**
Добавить erase mode, который использует ту же brush geometry, но удаляет ячейки из storage и overlay.

**Acceptance:**
- Ластик удаляет видимые painted cells.
- Удаленные ячейки не появляются после restart.
- Paint и erase mode переключаются без remount карты.

**Tests:**
Unit-тесты на shared brush mode helpers, если они будут выделены.

**Notes:**
- Cursor/preview должен визуально отличать erase mode.

---

## FOG-017 - Начальная Панель Инструментов

**Status:** Todo

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
- Для tool buttons использовать иконки там, где это уместно.

---

## FOG-018 - Home Location

**Status:** Todo

**Description:**
Дать пользователю возможность задать, сохранить и быстро открыть домашнюю точку.

**Acceptance:**
- Пользователь может установить home из текущего центра карты или кликом по карте.
- Home сохраняется после restart.
- Кнопка home в toolbar центрирует карту на сохраненной точке.

**Tests:**
Rust-тесты на persistence home location. Frontend-тесты для state helpers, если практично.

**Notes:**
- Точный UX можно решить перед стартом задачи.

---

## FOG-019 - Помощник Радиуса 10км Вокруг Дома

**Status:** Todo

**Description:**
Добавить helper, который показывает и при подтверждении закрашивает область вокруг home в радиусе 10км.

**Acceptance:**
- Радиус 10км можно показать на карте.
- Перед bulk painting пользователь должен подтвердить действие.
- Bulk painting батчится и не замораживает UI.

**Tests:**
Тесты на radius geometry и batch generation helpers.

**Notes:**
- В зависимости от H3 resolution может понадобиться progress indicator.

---

## FOG-020 - Backup Export/Import

**Status:** Todo

**Description:**
Добавить локальный export/import пользовательских данных.

**Acceptance:**
- Пользователь может экспортировать SQLite-базу или стабильный app backup format.
- Пользователь может импортировать backup с понятным overwrite/merge behavior.
- Import валидирует backup до изменения текущих данных.

**Tests:**
Rust-тесты на backup validation и import behavior.

**Notes:**
- Перед реализацией выбрать формат: raw DB copy проще, structured archive безопаснее на долгую перспективу.

---

## Backlog

- H3 aggregation на низких zoom через parent cells.
- Compaction плотных painted regions: children cells -> parent cells.
- Undo/redo для paint и erase.
- Импорт GPX/FIT/KML-треков.
- Offline map packages для выбранных регионов.
- UI настроек map providers.
- Search/geocoding через бесплатный provider или локальный index.
- Иконка приложения и полировка Windows installer.
- Performance benchmark для больших painted datasets.
- Дизайн-полировка после стабилизации MVP behavior.
