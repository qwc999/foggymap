use std::{
    error::Error,
    fmt::{self, Display, Formatter},
    fs,
    path::Path,
};

use rusqlite::{params, Connection};

pub const DEFAULT_DATABASE_PATH: &str = "/data/foggy_map.sqlite3";

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

#[cfg(test)]
mod tests {
    use std::{
        fs,
        path::PathBuf,
        time::{SystemTime, UNIX_EPOCH},
    };

    use rusqlite::{params, Connection};

    use super::{initialize_connection, initialize_database};

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

    fn temp_database_path() -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time after unix epoch")
            .as_nanos();

        std::env::temp_dir().join(format!("foggy_map_test_{nanos}.sqlite3"))
    }
}
