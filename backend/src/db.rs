use std::{
    error::Error,
    fmt::{self, Display, Formatter},
    fs,
    path::Path,
};

use rusqlite::{params, Connection, OptionalExtension};

pub const DEFAULT_DATABASE_PATH: &str = "/data/foggy_map.sqlite3";
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

#[cfg(test)]
mod tests {
    use std::{
        fs,
        path::PathBuf,
        time::{SystemTime, UNIX_EPOCH},
    };

    use rusqlite::{params, Connection};

    use super::{
        initialize_connection, initialize_database, load_app_state_value, save_app_state_value,
        validate_app_state_key, AppStateKeyError,
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

    fn temp_database_path() -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time after unix epoch")
            .as_nanos();

        std::env::temp_dir().join(format!("foggy_map_test_{nanos}.sqlite3"))
    }
}
