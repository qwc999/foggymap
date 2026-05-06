use std::{
    error::Error,
    fmt::{self, Display, Formatter},
    fs,
    path::Path,
};

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

pub const DEFAULT_DATABASE_PATH: &str = "/data/foggy_map.sqlite3";
pub const MIN_H3_RESOLUTION: i64 = 0;
pub const MAX_H3_RESOLUTION: i64 = 15;
const MAX_APP_STATE_KEY_LEN: usize = 64;

const INITIAL_SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS app_state (
    key TEXT PRIMARY KEY,
    value_json TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS painted_cells (
    h3_id TEXT NOT NULL,
    resolution INTEGER NOT NULL CHECK (resolution BETWEEN 0 AND 15),
    centroid_lng REAL NOT NULL CHECK (centroid_lng BETWEEN -180.0 AND 180.0),
    centroid_lat REAL NOT NULL CHECK (centroid_lat BETWEEN -90.0 AND 90.0),
    painted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    PRIMARY KEY (h3_id, resolution)
);

CREATE INDEX IF NOT EXISTS idx_painted_cells_centroid
    ON painted_cells (centroid_lng, centroid_lat);

CREATE TABLE IF NOT EXISTS home_location (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    longitude REAL NOT NULL CHECK (longitude BETWEEN -180.0 AND 180.0),
    latitude REAL NOT NULL CHECK (latitude BETWEEN -90.0 AND 90.0),
    zoom REAL,
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
"#;

const MIGRATIONS: &[Migration] = &[Migration {
    version: 1,
    name: "initial_schema",
    sql: INITIAL_SCHEMA,
}];

#[derive(Debug)]
pub enum StorageError {
    Io(std::io::Error),
    Sqlite(rusqlite::Error),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AppStateKeyError {
    Empty,
    TooLong { max_len: usize },
    InvalidCharacter { character: char },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PaintCellInput {
    pub h3_id: String,
    pub resolution: i64,
    pub centroid_lng: f64,
    pub centroid_lat: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PaintedCell {
    pub h3_id: String,
    pub resolution: i64,
    pub centroid_lng: f64,
    pub centroid_lat: f64,
    pub painted_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CellRef {
    pub h3_id: String,
    pub resolution: i64,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Bbox {
    pub west: f64,
    pub south: f64,
    pub east: f64,
    pub north: f64,
}

impl Display for AppStateKeyError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> fmt::Result {
        match self {
            Self::Empty => write!(formatter, "app state key must not be empty"),
            Self::TooLong { max_len } => {
                write!(
                    formatter,
                    "app state key must be at most {max_len} characters"
                )
            }
            Self::InvalidCharacter { character } => write!(
                formatter,
                "app state key contains unsupported character '{character}'"
            ),
        }
    }
}

impl Display for StorageError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> fmt::Result {
        match self {
            Self::Io(error) => write!(formatter, "storage I/O error: {error}"),
            Self::Sqlite(error) => write!(formatter, "sqlite error: {error}"),
        }
    }
}

impl Error for StorageError {}

impl From<std::io::Error> for StorageError {
    fn from(error: std::io::Error) -> Self {
        Self::Io(error)
    }
}

impl From<rusqlite::Error> for StorageError {
    fn from(error: rusqlite::Error) -> Self {
        Self::Sqlite(error)
    }
}

struct Migration {
    version: i64,
    name: &'static str,
    sql: &'static str,
}

pub fn initialize_database(path: impl AsRef<Path>) -> Result<(), StorageError> {
    let connection = open_database(path)?;
    initialize_connection(&connection)?;

    Ok(())
}

pub fn open_database(path: impl AsRef<Path>) -> Result<Connection, StorageError> {
    let path = path.as_ref();

    if let Some(parent) = path
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
    {
        fs::create_dir_all(parent)?;
    }

    Ok(Connection::open(path)?)
}

pub fn initialize_connection(connection: &Connection) -> rusqlite::Result<()> {
    configure_connection(connection)?;
    ensure_migrations_table(connection)?;
    run_pending_migrations(connection)
}

fn configure_connection(connection: &Connection) -> rusqlite::Result<()> {
    connection.execute_batch(
        r#"
        PRAGMA foreign_keys = ON;
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = NORMAL;
        "#,
    )
}

fn ensure_migrations_table(connection: &Connection) -> rusqlite::Result<()> {
    connection.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        );
        "#,
    )
}

fn run_pending_migrations(connection: &Connection) -> rusqlite::Result<()> {
    for migration in MIGRATIONS {
        if is_migration_applied(connection, migration.version)? {
            continue;
        }

        connection.execute_batch("BEGIN IMMEDIATE;")?;
        let result = apply_migration(connection, migration);

        match result {
            Ok(()) => connection.execute_batch("COMMIT;")?,
            Err(error) => {
                let _ = connection.execute_batch("ROLLBACK;");
                return Err(error);
            }
        }
    }

    Ok(())
}

fn is_migration_applied(connection: &Connection, version: i64) -> rusqlite::Result<bool> {
    connection.query_row(
        "SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE version = ?1)",
        params![version],
        |row| row.get(0),
    )
}

fn apply_migration(connection: &Connection, migration: &Migration) -> rusqlite::Result<()> {
    connection.execute_batch(migration.sql)?;
    connection.execute(
        "INSERT INTO schema_migrations (version, name) VALUES (?1, ?2)",
        params![migration.version, migration.name],
    )?;

    Ok(())
}

pub fn validate_app_state_key(key: &str) -> Result<(), AppStateKeyError> {
    if key.is_empty() {
        return Err(AppStateKeyError::Empty);
    }

    if key.len() > MAX_APP_STATE_KEY_LEN {
        return Err(AppStateKeyError::TooLong {
            max_len: MAX_APP_STATE_KEY_LEN,
        });
    }

    if let Some(character) = key.chars().find(|character| {
        !character.is_ascii_alphanumeric() && !matches!(character, '_' | '-' | '.')
    }) {
        return Err(AppStateKeyError::InvalidCharacter { character });
    }

    Ok(())
}

pub fn load_app_state_value(
    connection: &Connection,
    key: &str,
) -> rusqlite::Result<Option<String>> {
    connection
        .query_row(
            "SELECT value_json FROM app_state WHERE key = ?1",
            params![key],
            |row| row.get(0),
        )
        .optional()
}

pub fn save_app_state_value(
    connection: &Connection,
    key: &str,
    value_json: &str,
) -> rusqlite::Result<()> {
    connection.execute(
        r#"
        INSERT INTO app_state (key, value_json)
        VALUES (?1, ?2)
        ON CONFLICT(key) DO UPDATE SET
            value_json = excluded.value_json,
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        "#,
        params![key, value_json],
    )?;

    Ok(())
}

pub fn paint_cells(
    connection: &mut Connection,
    cells: &[PaintCellInput],
) -> rusqlite::Result<usize> {
    let transaction = connection.transaction()?;
    let changed = {
        let mut statement = transaction.prepare(
            r#"
            INSERT INTO painted_cells (
                h3_id,
                resolution,
                centroid_lng,
                centroid_lat
            ) VALUES (?1, ?2, ?3, ?4)
            ON CONFLICT(h3_id, resolution) DO NOTHING
            "#,
        )?;
        let mut changed = 0;

        for cell in cells {
            changed += statement.execute(params![
                cell.h3_id,
                cell.resolution,
                cell.centroid_lng,
                cell.centroid_lat
            ])?;
        }

        changed
    };

    transaction.commit()?;

    Ok(changed)
}

pub fn erase_cells(connection: &mut Connection, cells: &[CellRef]) -> rusqlite::Result<usize> {
    let transaction = connection.transaction()?;
    let changed = {
        let mut statement = transaction.prepare(
            r#"
            DELETE FROM painted_cells
            WHERE h3_id = ?1 AND resolution = ?2
            "#,
        )?;
        let mut changed = 0;

        for cell in cells {
            changed += statement.execute(params![cell.h3_id, cell.resolution])?;
        }

        changed
    };

    transaction.commit()?;

    Ok(changed)
}

pub fn get_cells_in_bbox(
    connection: &Connection,
    bbox: Bbox,
) -> rusqlite::Result<Vec<PaintedCell>> {
    let mut statement = connection.prepare(
        r#"
        SELECT h3_id, resolution, centroid_lng, centroid_lat, painted_at
        FROM painted_cells
        WHERE centroid_lat >= ?2
            AND centroid_lat <= ?4
            AND (
                (?1 <= ?3 AND centroid_lng >= ?1 AND centroid_lng <= ?3)
                OR
                (?1 > ?3 AND (centroid_lng >= ?1 OR centroid_lng <= ?3))
            )
        ORDER BY h3_id, resolution
        "#,
    )?;

    let cells = statement
        .query_map(
            params![bbox.west, bbox.south, bbox.east, bbox.north],
            |row| {
                Ok(PaintedCell {
                    h3_id: row.get(0)?,
                    resolution: row.get(1)?,
                    centroid_lng: row.get(2)?,
                    centroid_lat: row.get(3)?,
                    painted_at: row.get(4)?,
                })
            },
        )?
        .collect();

    cells
}

#[cfg(test)]
mod tests {
    use std::{
        fs,
        path::PathBuf,
        time::{SystemTime, UNIX_EPOCH},
    };

    use rusqlite::{params, Connection};

    use super::{
        erase_cells, get_cells_in_bbox, initialize_connection, initialize_database,
        load_app_state_value, paint_cells, save_app_state_value, validate_app_state_key,
        AppStateKeyError, Bbox, CellRef, PaintCellInput,
    };

    #[test]
    fn migrations_create_expected_tables() {
        let connection = Connection::open_in_memory().expect("open in-memory sqlite");

        initialize_connection(&connection).expect("run migrations");

        for table_name in [
            "schema_migrations",
            "app_state",
            "painted_cells",
            "home_location",
        ] {
            let exists: bool = connection
                .query_row(
                    "SELECT EXISTS(SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = ?1)",
                    params![table_name],
                    |row| row.get(0),
                )
                .expect("query table existence");

            assert!(exists, "expected table {table_name} to exist");
        }
    }

    #[test]
    fn migrations_are_idempotent() {
        let connection = Connection::open_in_memory().expect("open in-memory sqlite");

        initialize_connection(&connection).expect("run migrations first time");
        initialize_connection(&connection).expect("run migrations second time");

        let migration_count: i64 = connection
            .query_row("SELECT COUNT(*) FROM schema_migrations", [], |row| {
                row.get(0)
            })
            .expect("query migration count");

        assert_eq!(migration_count, 1);
    }

    #[test]
    fn painted_cells_schema_matches_storage_contract() {
        let connection = Connection::open_in_memory().expect("open in-memory sqlite");

        initialize_connection(&connection).expect("run migrations");
        connection
            .execute(
                r#"
                INSERT INTO painted_cells (
                    h3_id,
                    resolution,
                    centroid_lng,
                    centroid_lat
                ) VALUES (?1, ?2, ?3, ?4)
                "#,
                params!["8b2a100d2db6fff", 11, 37.6173, 55.7558],
            )
            .expect("insert painted cell");

        let stored_cell: (String, i64, f64, f64, String) = connection
            .query_row(
                r#"
                SELECT h3_id, resolution, centroid_lng, centroid_lat, painted_at
                FROM painted_cells
                WHERE h3_id = ?1 AND resolution = ?2
                "#,
                params!["8b2a100d2db6fff", 11],
                |row| {
                    Ok((
                        row.get(0)?,
                        row.get(1)?,
                        row.get(2)?,
                        row.get(3)?,
                        row.get(4)?,
                    ))
                },
            )
            .expect("read painted cell");

        assert_eq!(stored_cell.0, "8b2a100d2db6fff");
        assert_eq!(stored_cell.1, 11);
        assert_eq!(stored_cell.2, 37.6173);
        assert_eq!(stored_cell.3, 55.7558);
        assert!(!stored_cell.4.is_empty());
    }

    #[test]
    fn file_database_uses_wal_journal_mode() {
        let path = temp_database_path();

        initialize_database(&path).expect("initialize temp database");
        let connection = Connection::open(&path).expect("open initialized temp database");
        let journal_mode: String = connection
            .query_row("PRAGMA journal_mode;", [], |row| row.get(0))
            .expect("query journal mode");

        fs::remove_file(&path).expect("remove temp database");

        assert_eq!(journal_mode, "wal");
    }

    #[test]
    fn app_state_load_returns_none_when_key_is_missing() {
        let connection = Connection::open_in_memory().expect("open in-memory sqlite");

        initialize_connection(&connection).expect("run migrations");
        let value =
            load_app_state_value(&connection, "map.viewport").expect("load missing app state");

        assert_eq!(value, None);
    }

    #[test]
    fn app_state_save_inserts_and_loads_value() {
        let connection = Connection::open_in_memory().expect("open in-memory sqlite");

        initialize_connection(&connection).expect("run migrations");
        save_app_state_value(
            &connection,
            "map.viewport",
            r#"{"center":[37.6173,55.7558],"zoom":11}"#,
        )
        .expect("save app state");

        let value = load_app_state_value(&connection, "map.viewport")
            .expect("load saved app state")
            .expect("app state value exists");

        assert_eq!(value, r#"{"center":[37.6173,55.7558],"zoom":11}"#);
    }

    #[test]
    fn app_state_save_updates_existing_value() {
        let connection = Connection::open_in_memory().expect("open in-memory sqlite");

        initialize_connection(&connection).expect("run migrations");
        save_app_state_value(&connection, "map.zoom", "11").expect("save first value");
        save_app_state_value(&connection, "map.zoom", "12").expect("save second value");

        let value = load_app_state_value(&connection, "map.zoom")
            .expect("load updated app state")
            .expect("app state value exists");
        let row_count: i64 = connection
            .query_row("SELECT COUNT(*) FROM app_state", [], |row| row.get(0))
            .expect("count app state rows");

        assert_eq!(value, "12");
        assert_eq!(row_count, 1);
    }

    #[test]
    fn app_state_key_validation_accepts_stable_client_keys() {
        for key in ["map.viewport", "map-mode", "brush_size", "homeLocation1"] {
            validate_app_state_key(key).expect("valid app state key");
        }
    }

    #[test]
    fn app_state_key_validation_rejects_unsupported_keys() {
        assert_eq!(validate_app_state_key(""), Err(AppStateKeyError::Empty));
        assert!(matches!(
            validate_app_state_key("map viewport"),
            Err(AppStateKeyError::InvalidCharacter { character: ' ' })
        ));
        assert!(matches!(
            validate_app_state_key(&"a".repeat(65)),
            Err(AppStateKeyError::TooLong { max_len: 64 })
        ));
    }

    #[test]
    fn paint_cells_inserts_batch() {
        let mut connection = initialized_in_memory_connection();
        let cells = vec![
            paint_cell("8b2a100d2db6fff", 37.6173, 55.7558),
            paint_cell("8b2a100d2da6fff", 37.6183, 55.7568),
            paint_cell("8b2a100d2d96fff", 37.6193, 55.7578),
        ];

        let changed = paint_cells(&mut connection, &cells).expect("paint cells");
        let row_count = count_table_rows(&connection, "painted_cells");

        assert_eq!(changed, 3);
        assert_eq!(row_count, 3);
    }

    #[test]
    fn paint_cells_rolls_back_batch_on_error() {
        let mut connection = initialized_in_memory_connection();
        let cells = vec![
            paint_cell("8b2a100d2db6fff", 37.6173, 55.7558),
            paint_cell("8b2a100d2da6fff", 37.6183, 95.0),
        ];

        let result = paint_cells(&mut connection, &cells);
        let row_count = count_table_rows(&connection, "painted_cells");

        assert!(result.is_err());
        assert_eq!(row_count, 0);
    }

    #[test]
    fn paint_cells_is_idempotent_for_duplicates() {
        let mut connection = initialized_in_memory_connection();
        let cells = vec![paint_cell("8b2a100d2db6fff", 37.6173, 55.7558)];

        let first_changed = paint_cells(&mut connection, &cells).expect("paint first time");
        let second_changed = paint_cells(&mut connection, &cells).expect("paint second time");
        let row_count = count_table_rows(&connection, "painted_cells");

        assert_eq!(first_changed, 1);
        assert_eq!(second_changed, 0);
        assert_eq!(row_count, 1);
    }

    #[test]
    fn erase_cells_deletes_batch() {
        let mut connection = initialized_in_memory_connection();
        let cells = vec![
            paint_cell("8b2a100d2db6fff", 37.6173, 55.7558),
            paint_cell("8b2a100d2da6fff", 37.6183, 55.7568),
            paint_cell("8b2a100d2d96fff", 37.6193, 55.7578),
        ];
        paint_cells(&mut connection, &cells).expect("seed painted cells");

        let changed = erase_cells(
            &mut connection,
            &[
                cell_ref("8b2a100d2db6fff"),
                cell_ref("8b2a100d2d96fff"),
                cell_ref("8b2a100d2d16fff"),
            ],
        )
        .expect("erase cells");
        let remaining = get_cells_in_bbox(
            &connection,
            Bbox {
                west: 37.0,
                south: 55.0,
                east: 38.0,
                north: 56.0,
            },
        )
        .expect("query remaining cells");

        assert_eq!(changed, 2);
        assert_eq!(
            remaining
                .iter()
                .map(|cell| cell.h3_id.as_str())
                .collect::<Vec<_>>(),
            vec!["8b2a100d2da6fff"]
        );
    }

    #[test]
    fn get_cells_in_bbox_returns_only_cells_with_centroids_inside_bounds() {
        let mut connection = initialized_in_memory_connection();
        let cells = vec![
            paint_cell("inside-west", 37.1, 55.1),
            paint_cell("inside-east", 37.9, 55.9),
            paint_cell("outside-lng", 38.1, 55.5),
            paint_cell("outside-lat", 37.5, 56.1),
        ];
        paint_cells(&mut connection, &cells).expect("seed painted cells");

        let visible_cells = get_cells_in_bbox(
            &connection,
            Bbox {
                west: 37.0,
                south: 55.0,
                east: 38.0,
                north: 56.0,
            },
        )
        .expect("query bbox");

        assert_eq!(
            visible_cells
                .iter()
                .map(|cell| cell.h3_id.as_str())
                .collect::<Vec<_>>(),
            vec!["inside-east", "inside-west"]
        );
    }

    #[test]
    fn get_cells_in_bbox_supports_antimeridian_bounds() {
        let mut connection = initialized_in_memory_connection();
        let cells = vec![
            paint_cell("west-side", -179.5, 10.0),
            paint_cell("east-side", 179.5, 10.0),
            paint_cell("outside", 0.0, 10.0),
        ];
        paint_cells(&mut connection, &cells).expect("seed painted cells");

        let visible_cells = get_cells_in_bbox(
            &connection,
            Bbox {
                west: 179.0,
                south: 9.0,
                east: -179.0,
                north: 11.0,
            },
        )
        .expect("query antimeridian bbox");

        assert_eq!(
            visible_cells
                .iter()
                .map(|cell| cell.h3_id.as_str())
                .collect::<Vec<_>>(),
            vec!["east-side", "west-side"]
        );
    }

    #[test]
    fn paint_cells_handles_10k_cell_batch() {
        let mut connection = initialized_in_memory_connection();
        let cells = (0..10_000)
            .map(|index| {
                paint_cell(
                    &format!("8b2a{index:011x}"),
                    -120.0 + f64::from(index % 100) * 0.001,
                    35.0 + f64::from(index / 100) * 0.001,
                )
            })
            .collect::<Vec<_>>();

        let changed = paint_cells(&mut connection, &cells).expect("paint 10k cells");
        let row_count = count_table_rows(&connection, "painted_cells");

        assert_eq!(changed, 10_000);
        assert_eq!(row_count, 10_000);
    }

    fn temp_database_path() -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time after unix epoch")
            .as_nanos();

        std::env::temp_dir().join(format!("foggy_map_test_{nanos}.sqlite3"))
    }

    fn initialized_in_memory_connection() -> Connection {
        let connection = Connection::open_in_memory().expect("open in-memory sqlite");

        initialize_connection(&connection).expect("run migrations");

        connection
    }

    fn paint_cell(h3_id: &str, centroid_lng: f64, centroid_lat: f64) -> PaintCellInput {
        PaintCellInput {
            h3_id: h3_id.to_string(),
            resolution: 11,
            centroid_lng,
            centroid_lat,
        }
    }

    fn cell_ref(h3_id: &str) -> CellRef {
        CellRef {
            h3_id: h3_id.to_string(),
            resolution: 11,
        }
    }

    fn count_table_rows(connection: &Connection, table_name: &str) -> i64 {
        connection
            .query_row(&format!("SELECT COUNT(*) FROM {table_name}"), [], |row| {
                row.get(0)
            })
            .expect("count table rows")
    }
}
