use std::{
    collections::HashSet,
    error::Error,
    fmt::{self, Display, Formatter},
    fs,
    path::Path,
};

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::Value;

pub const DEFAULT_DATABASE_PATH: &str = "/data/foggy_map.sqlite3";
pub const MIN_H3_RESOLUTION: i64 = 0;
pub const MAX_H3_RESOLUTION: i64 = 15;
pub const MAX_H3_ID_LEN: usize = 32;
pub const MIN_HOME_ZOOM: f64 = 0.0;
pub const MAX_HOME_ZOOM: f64 = 24.0;
pub const BACKUP_FORMAT: &str = "foggy_map.backup";
pub const BACKUP_VERSION: i64 = 1;
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

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct HomeLocationInput {
    pub longitude: f64,
    pub latitude: f64,
    pub zoom: Option<f64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct HomeLocation {
    pub longitude: f64,
    pub latitude: f64,
    pub zoom: Option<f64>,
    pub updated_at: String,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Bbox {
    pub west: f64,
    pub south: f64,
    pub east: f64,
    pub north: f64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct BboxCellsPage {
    pub cells: Vec<PaintedCell>,
    pub truncated: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct BackupDocument {
    pub format: String,
    pub version: i64,
    pub exported_at: String,
    pub app_state: Vec<BackupAppStateEntry>,
    pub home_location: Option<HomeLocationInput>,
    pub painted_cells: Vec<PaintCellInput>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct BackupAppStateEntry {
    pub key: String,
    pub value: Value,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct BackupImportSummary {
    pub mode: &'static str,
    pub app_state: usize,
    pub painted_cells: usize,
    pub home_location: bool,
}

#[derive(Debug)]
pub enum BackupError {
    Sqlite(rusqlite::Error),
    Json {
        key: String,
        source: serde_json::Error,
    },
    Validation(BackupValidationError),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum BackupValidationError {
    UnsupportedFormat {
        expected: &'static str,
        actual: String,
    },
    UnsupportedVersion {
        supported: i64,
        actual: i64,
    },
    DuplicateAppStateKey {
        key: String,
    },
    DuplicatePaintedCell {
        h3_id: String,
        resolution: i64,
    },
    InvalidAppStateKey {
        key: String,
        source: AppStateKeyError,
    },
    InvalidHomeLocation(String),
    InvalidPaintedCell(String),
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

impl Display for BackupValidationError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> fmt::Result {
        match self {
            Self::UnsupportedFormat { expected, actual } => write!(
                formatter,
                "backup format must be '{expected}', got '{actual}'"
            ),
            Self::UnsupportedVersion { supported, actual } => write!(
                formatter,
                "backup version must be {supported}, got {actual}"
            ),
            Self::DuplicateAppStateKey { key } => {
                write!(formatter, "backup contains duplicate app state key '{key}'")
            }
            Self::DuplicatePaintedCell { h3_id, resolution } => write!(
                formatter,
                "backup contains duplicate painted cell '{h3_id}' at resolution {resolution}"
            ),
            Self::InvalidAppStateKey { key, source } => {
                write!(
                    formatter,
                    "backup app state key '{key}' is invalid: {source}"
                )
            }
            Self::InvalidHomeLocation(message) => {
                write!(formatter, "backup home location is invalid: {message}")
            }
            Self::InvalidPaintedCell(message) => {
                write!(formatter, "backup painted cell is invalid: {message}")
            }
        }
    }
}

impl Display for BackupError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> fmt::Result {
        match self {
            Self::Sqlite(error) => write!(formatter, "sqlite error: {error}"),
            Self::Json { key, source } => write!(
                formatter,
                "stored app state value for key '{key}' is not valid JSON: {source}"
            ),
            Self::Validation(error) => write!(formatter, "{error}"),
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

impl Error for BackupValidationError {}

impl Error for BackupError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Sqlite(error) => Some(error),
            Self::Json { source, .. } => Some(source),
            Self::Validation(error) => Some(error),
        }
    }
}

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

impl From<rusqlite::Error> for BackupError {
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

pub fn load_home_location(connection: &Connection) -> rusqlite::Result<Option<HomeLocation>> {
    connection
        .query_row(
            r#"
            SELECT longitude, latitude, zoom, updated_at
            FROM home_location
            WHERE id = 1
            "#,
            [],
            read_home_location,
        )
        .optional()
}

pub fn save_home_location(
    connection: &Connection,
    home_location: &HomeLocationInput,
) -> rusqlite::Result<HomeLocation> {
    connection.execute(
        r#"
        INSERT INTO home_location (id, longitude, latitude, zoom)
        VALUES (1, ?1, ?2, ?3)
        ON CONFLICT(id) DO UPDATE SET
            longitude = excluded.longitude,
            latitude = excluded.latitude,
            zoom = excluded.zoom,
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        "#,
        params![
            home_location.longitude,
            home_location.latitude,
            home_location.zoom
        ],
    )?;

    load_home_location(connection)
        .map(|home_location| home_location.expect("home location exists immediately after upsert"))
}

pub fn clear_home_location(connection: &Connection) -> rusqlite::Result<usize> {
    connection.execute("DELETE FROM home_location WHERE id = 1", [])
}

pub fn export_backup_document(connection: &Connection) -> Result<BackupDocument, BackupError> {
    let exported_at = current_sqlite_timestamp(connection)?;
    let app_state = load_backup_app_state(connection)?;
    let home_location = load_home_location(connection)?.map(|home_location| HomeLocationInput {
        longitude: home_location.longitude,
        latitude: home_location.latitude,
        zoom: home_location.zoom,
    });
    let painted_cells = load_backup_painted_cells(connection)?;

    Ok(BackupDocument {
        format: BACKUP_FORMAT.to_string(),
        version: BACKUP_VERSION,
        exported_at,
        app_state,
        home_location,
        painted_cells,
    })
}

pub fn validate_backup_document(backup: &BackupDocument) -> Result<(), BackupValidationError> {
    if backup.format != BACKUP_FORMAT {
        return Err(BackupValidationError::UnsupportedFormat {
            expected: BACKUP_FORMAT,
            actual: backup.format.clone(),
        });
    }

    if backup.version != BACKUP_VERSION {
        return Err(BackupValidationError::UnsupportedVersion {
            supported: BACKUP_VERSION,
            actual: backup.version,
        });
    }

    let mut app_state_keys = HashSet::with_capacity(backup.app_state.len());

    for entry in &backup.app_state {
        validate_app_state_key(&entry.key).map_err(|source| {
            BackupValidationError::InvalidAppStateKey {
                key: entry.key.clone(),
                source,
            }
        })?;

        if !app_state_keys.insert(entry.key.as_str()) {
            return Err(BackupValidationError::DuplicateAppStateKey {
                key: entry.key.clone(),
            });
        }
    }

    if let Some(home_location) = &backup.home_location {
        validate_backup_longitude(home_location.longitude, "longitude")
            .map_err(BackupValidationError::InvalidHomeLocation)?;
        validate_backup_latitude(home_location.latitude, "latitude")
            .map_err(BackupValidationError::InvalidHomeLocation)?;

        if let Some(zoom) = home_location.zoom {
            if !zoom.is_finite() || !(MIN_HOME_ZOOM..=MAX_HOME_ZOOM).contains(&zoom) {
                return Err(BackupValidationError::InvalidHomeLocation(format!(
                    "zoom must be a finite value between {MIN_HOME_ZOOM} and {MAX_HOME_ZOOM}"
                )));
            }
        }
    }

    let mut painted_cells = HashSet::with_capacity(backup.painted_cells.len());

    for cell in &backup.painted_cells {
        validate_backup_cell_identity(&cell.h3_id, cell.resolution)
            .map_err(BackupValidationError::InvalidPaintedCell)?;
        validate_backup_longitude(cell.centroid_lng, "centroid_lng")
            .map_err(BackupValidationError::InvalidPaintedCell)?;
        validate_backup_latitude(cell.centroid_lat, "centroid_lat")
            .map_err(BackupValidationError::InvalidPaintedCell)?;

        if !painted_cells.insert((cell.h3_id.as_str(), cell.resolution)) {
            return Err(BackupValidationError::DuplicatePaintedCell {
                h3_id: cell.h3_id.clone(),
                resolution: cell.resolution,
            });
        }
    }

    Ok(())
}

pub fn import_backup_overwrite(
    connection: &mut Connection,
    backup: &BackupDocument,
) -> Result<BackupImportSummary, BackupError> {
    validate_backup_document(backup).map_err(BackupError::Validation)?;

    let transaction = connection.transaction()?;

    transaction.execute("DELETE FROM app_state", [])?;
    transaction.execute("DELETE FROM home_location", [])?;
    transaction.execute("DELETE FROM painted_cells", [])?;

    {
        let mut statement = transaction.prepare(
            r#"
            INSERT INTO app_state (key, value_json)
            VALUES (?1, ?2)
            "#,
        )?;

        for entry in &backup.app_state {
            let value_json = serde_json::to_string(&entry.value)
                .expect("serialize validated backup app state value");
            statement.execute(params![entry.key, value_json])?;
        }
    }

    if let Some(home_location) = &backup.home_location {
        transaction.execute(
            r#"
            INSERT INTO home_location (id, longitude, latitude, zoom)
            VALUES (1, ?1, ?2, ?3)
            "#,
            params![
                home_location.longitude,
                home_location.latitude,
                home_location.zoom
            ],
        )?;
    }

    {
        let mut statement = transaction.prepare(
            r#"
            INSERT INTO painted_cells (
                h3_id,
                resolution,
                centroid_lng,
                centroid_lat
            ) VALUES (?1, ?2, ?3, ?4)
            "#,
        )?;

        for cell in &backup.painted_cells {
            statement.execute(params![
                cell.h3_id,
                cell.resolution,
                cell.centroid_lng,
                cell.centroid_lat
            ])?;
        }
    }

    transaction.commit()?;

    Ok(BackupImportSummary {
        mode: "overwrite",
        app_state: backup.app_state.len(),
        painted_cells: backup.painted_cells.len(),
        home_location: backup.home_location.is_some(),
    })
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

pub fn get_cells_in_bbox_limited(
    connection: &Connection,
    bbox: Bbox,
    limit: usize,
) -> rusqlite::Result<BboxCellsPage> {
    query_cells_in_bbox(connection, bbox, Some(limit))
}

fn query_cells_in_bbox(
    connection: &Connection,
    bbox: Bbox,
    limit: Option<usize>,
) -> rusqlite::Result<BboxCellsPage> {
    let fetch_limit = limit
        .map(|limit| i64::try_from(limit.saturating_add(1)).unwrap_or(i64::MAX))
        .unwrap_or(i64::MAX);
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
        LIMIT ?5
        "#,
    )?;

    let mut cells: Vec<PaintedCell> = statement
        .query_map(
            params![bbox.west, bbox.south, bbox.east, bbox.north, fetch_limit],
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
        .collect::<rusqlite::Result<_>>()?;
    let truncated = limit.is_some_and(|limit| cells.len() > limit);

    if let Some(limit) = limit.filter(|_| truncated) {
        cells.truncate(limit);
    }

    Ok(BboxCellsPage { cells, truncated })
}

fn current_sqlite_timestamp(connection: &Connection) -> rusqlite::Result<String> {
    connection.query_row("SELECT strftime('%Y-%m-%dT%H:%M:%fZ', 'now')", [], |row| {
        row.get(0)
    })
}

fn load_backup_app_state(connection: &Connection) -> Result<Vec<BackupAppStateEntry>, BackupError> {
    let mut statement = connection.prepare(
        r#"
        SELECT key, value_json
        FROM app_state
        ORDER BY key
        "#,
    )?;
    let rows = statement.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    })?;
    let mut entries = Vec::new();

    for row in rows {
        let (key, value_json) = row?;
        let value = serde_json::from_str(&value_json).map_err(|source| BackupError::Json {
            key: key.clone(),
            source,
        })?;

        entries.push(BackupAppStateEntry { key, value });
    }

    Ok(entries)
}

fn load_backup_painted_cells(connection: &Connection) -> rusqlite::Result<Vec<PaintCellInput>> {
    let mut statement = connection.prepare(
        r#"
        SELECT h3_id, resolution, centroid_lng, centroid_lat
        FROM painted_cells
        ORDER BY h3_id, resolution
        "#,
    )?;

    let cells = statement
        .query_map([], |row| {
            Ok(PaintCellInput {
                h3_id: row.get(0)?,
                resolution: row.get(1)?,
                centroid_lng: row.get(2)?,
                centroid_lat: row.get(3)?,
            })
        })?
        .collect::<rusqlite::Result<_>>()?;

    Ok(cells)
}

fn validate_backup_cell_identity(h3_id: &str, resolution: i64) -> Result<(), String> {
    if h3_id.is_empty() {
        return Err("h3_id must not be empty".to_string());
    }

    if h3_id.len() > MAX_H3_ID_LEN {
        return Err(format!("h3_id must be at most {MAX_H3_ID_LEN} characters"));
    }

    if !(MIN_H3_RESOLUTION..=MAX_H3_RESOLUTION).contains(&resolution) {
        return Err(format!(
            "resolution must be between {MIN_H3_RESOLUTION} and {MAX_H3_RESOLUTION}"
        ));
    }

    Ok(())
}

fn validate_backup_longitude(value: f64, field_name: &'static str) -> Result<(), String> {
    if !value.is_finite() || !(-180.0..=180.0).contains(&value) {
        return Err(format!(
            "{field_name} must be a finite longitude between -180 and 180"
        ));
    }

    Ok(())
}

fn validate_backup_latitude(value: f64, field_name: &'static str) -> Result<(), String> {
    if !value.is_finite() || !(-90.0..=90.0).contains(&value) {
        return Err(format!(
            "{field_name} must be a finite latitude between -90 and 90"
        ));
    }

    Ok(())
}

fn read_home_location(row: &rusqlite::Row<'_>) -> rusqlite::Result<HomeLocation> {
    Ok(HomeLocation {
        longitude: row.get(0)?,
        latitude: row.get(1)?,
        zoom: row.get(2)?,
        updated_at: row.get(3)?,
    })
}

#[cfg(test)]
mod tests {
    use std::{
        fs,
        path::PathBuf,
        time::{SystemTime, UNIX_EPOCH},
    };

    use rusqlite::{params, Connection};
    use serde_json::json;

    use super::{
        clear_home_location, erase_cells, export_backup_document, get_cells_in_bbox_limited,
        import_backup_overwrite, initialize_connection, initialize_database, load_app_state_value,
        load_home_location, paint_cells, save_app_state_value, save_home_location,
        validate_app_state_key, validate_backup_document, AppStateKeyError, BackupAppStateEntry,
        BackupDocument, BackupError, BackupValidationError, Bbox, CellRef, HomeLocationInput,
        PaintCellInput, BACKUP_FORMAT, BACKUP_VERSION,
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
    fn home_location_load_returns_none_when_missing() {
        let connection = initialized_in_memory_connection();

        let home_location = load_home_location(&connection).expect("load missing home location");

        assert_eq!(home_location, None);
    }

    #[test]
    fn home_location_save_inserts_and_updates_single_row() {
        let connection = initialized_in_memory_connection();

        let first_home_location = save_home_location(
            &connection,
            &HomeLocationInput {
                longitude: 37.6173,
                latitude: 55.7558,
                zoom: Some(14.5),
            },
        )
        .expect("save first home location");
        let second_home_location = save_home_location(
            &connection,
            &HomeLocationInput {
                longitude: -73.9857,
                latitude: 40.7484,
                zoom: None,
            },
        )
        .expect("save second home location");
        let row_count = count_table_rows(&connection, "home_location");

        assert_eq!(first_home_location.longitude, 37.6173);
        assert_eq!(first_home_location.latitude, 55.7558);
        assert_eq!(first_home_location.zoom, Some(14.5));
        assert_eq!(second_home_location.longitude, -73.9857);
        assert_eq!(second_home_location.latitude, 40.7484);
        assert_eq!(second_home_location.zoom, None);
        assert!(!second_home_location.updated_at.is_empty());
        assert_eq!(row_count, 1);
    }

    #[test]
    fn home_location_clear_deletes_existing_row() {
        let connection = initialized_in_memory_connection();

        save_home_location(
            &connection,
            &HomeLocationInput {
                longitude: 37.6173,
                latitude: 55.7558,
                zoom: Some(14.5),
            },
        )
        .expect("save home location");

        let changed = clear_home_location(&connection).expect("clear home location");
        let home_location = load_home_location(&connection).expect("load home location");

        assert_eq!(changed, 1);
        assert_eq!(home_location, None);
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
        let remaining = get_cells_in_bbox_limited(
            &connection,
            Bbox {
                west: 37.0,
                south: 55.0,
                east: 38.0,
                north: 56.0,
            },
            100,
        )
        .expect("query remaining cells")
        .cells;

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

        let visible_cells = get_cells_in_bbox_limited(
            &connection,
            Bbox {
                west: 37.0,
                south: 55.0,
                east: 38.0,
                north: 56.0,
            },
            100,
        )
        .expect("query bbox")
        .cells;

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

        let visible_cells = get_cells_in_bbox_limited(
            &connection,
            Bbox {
                west: 179.0,
                south: 9.0,
                east: -179.0,
                north: 11.0,
            },
            100,
        )
        .expect("query antimeridian bbox")
        .cells;

        assert_eq!(
            visible_cells
                .iter()
                .map(|cell| cell.h3_id.as_str())
                .collect::<Vec<_>>(),
            vec!["east-side", "west-side"]
        );
    }

    #[test]
    fn get_cells_in_bbox_limited_reports_truncation() {
        let mut connection = initialized_in_memory_connection();
        let cells = vec![
            paint_cell("inside-a", 37.1, 55.1),
            paint_cell("inside-b", 37.2, 55.2),
            paint_cell("inside-c", 37.3, 55.3),
        ];
        paint_cells(&mut connection, &cells).expect("seed painted cells");

        let page = get_cells_in_bbox_limited(
            &connection,
            Bbox {
                west: 37.0,
                south: 55.0,
                east: 38.0,
                north: 56.0,
            },
            2,
        )
        .expect("query limited bbox");

        assert_eq!(
            page.cells
                .iter()
                .map(|cell| cell.h3_id.as_str())
                .collect::<Vec<_>>(),
            vec!["inside-a", "inside-b"]
        );
        assert!(page.truncated);
    }

    #[test]
    fn get_cells_in_bbox_limited_does_not_report_truncation_under_limit() {
        let mut connection = initialized_in_memory_connection();
        let cells = vec![
            paint_cell("inside-a", 37.1, 55.1),
            paint_cell("inside-b", 37.2, 55.2),
        ];
        paint_cells(&mut connection, &cells).expect("seed painted cells");

        let page = get_cells_in_bbox_limited(
            &connection,
            Bbox {
                west: 37.0,
                south: 55.0,
                east: 38.0,
                north: 56.0,
            },
            2,
        )
        .expect("query limited bbox");

        assert_eq!(page.cells.len(), 2);
        assert!(!page.truncated);
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

    #[test]
    fn backup_export_contains_current_user_data() {
        let mut connection = initialized_in_memory_connection();

        save_app_state_value(&connection, "map.view", r#"{"zoom":12}"#).expect("save app state");
        save_home_location(
            &connection,
            &HomeLocationInput {
                longitude: 37.6173,
                latitude: 55.7558,
                zoom: Some(14.0),
            },
        )
        .expect("save home location");
        paint_cells(
            &mut connection,
            &[paint_cell("8b2a100d2db6fff", 37.6173, 55.7558)],
        )
        .expect("paint cell");

        let backup = export_backup_document(&connection).expect("export backup");

        assert_eq!(backup.format, BACKUP_FORMAT);
        assert_eq!(backup.version, BACKUP_VERSION);
        assert!(!backup.exported_at.is_empty());
        assert_eq!(
            backup.app_state,
            vec![BackupAppStateEntry {
                key: "map.view".to_string(),
                value: json!({ "zoom": 12 }),
            }]
        );
        assert_eq!(
            backup.home_location,
            Some(HomeLocationInput {
                longitude: 37.6173,
                latitude: 55.7558,
                zoom: Some(14.0),
            })
        );
        assert_eq!(
            backup.painted_cells,
            vec![paint_cell("8b2a100d2db6fff", 37.6173, 55.7558)]
        );
    }

    #[test]
    fn backup_validation_rejects_duplicate_painted_cells() {
        let mut backup = valid_backup_document();
        backup.painted_cells = vec![
            paint_cell("8b2a100d2db6fff", 37.6173, 55.7558),
            paint_cell("8b2a100d2db6fff", 37.6173, 55.7558),
        ];

        let result = validate_backup_document(&backup);

        assert_eq!(
            result,
            Err(BackupValidationError::DuplicatePaintedCell {
                h3_id: "8b2a100d2db6fff".to_string(),
                resolution: 11,
            })
        );
    }

    #[test]
    fn backup_import_overwrite_replaces_existing_user_data() {
        let mut connection = initialized_in_memory_connection();

        save_app_state_value(&connection, "old.key", r#""old""#).expect("save old app state");
        save_home_location(
            &connection,
            &HomeLocationInput {
                longitude: 1.0,
                latitude: 2.0,
                zoom: Some(3.0),
            },
        )
        .expect("save old home location");
        paint_cells(&mut connection, &[paint_cell("old-cell", 1.0, 2.0)]).expect("paint old cell");

        let backup = valid_backup_document();
        let summary = import_backup_overwrite(&mut connection, &backup).expect("import backup");

        assert_eq!(summary.mode, "overwrite");
        assert_eq!(summary.app_state, 1);
        assert_eq!(summary.painted_cells, 2);
        assert!(summary.home_location);
        assert_eq!(
            load_app_state_value(&connection, "old.key").expect("load old key"),
            None
        );
        assert_eq!(
            load_app_state_value(&connection, "map.view")
                .expect("load imported app state")
                .expect("imported app state exists"),
            r#"{"center":[37.6173,55.7558],"zoom":12}"#
        );
        assert_eq!(
            load_home_location(&connection)
                .expect("load imported home location")
                .map(|home_location| (
                    home_location.longitude,
                    home_location.latitude,
                    home_location.zoom
                )),
            Some((37.6173, 55.7558, Some(14.0)))
        );
        assert_eq!(count_table_rows(&connection, "painted_cells"), 2);
    }

    #[test]
    fn backup_import_validates_before_changing_current_data() {
        let mut connection = initialized_in_memory_connection();

        save_app_state_value(&connection, "old.key", r#""old""#).expect("save old app state");
        paint_cells(&mut connection, &[paint_cell("old-cell", 1.0, 2.0)]).expect("paint old cell");

        let mut backup = valid_backup_document();
        backup.painted_cells[0].centroid_lat = 95.0;

        let result = import_backup_overwrite(&mut connection, &backup);

        assert!(matches!(
            result,
            Err(BackupError::Validation(
                BackupValidationError::InvalidPaintedCell(_)
            ))
        ));
        assert_eq!(
            load_app_state_value(&connection, "old.key")
                .expect("load old app state")
                .expect("old app state exists"),
            r#""old""#
        );
        assert_eq!(count_table_rows(&connection, "painted_cells"), 1);
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

    fn valid_backup_document() -> BackupDocument {
        BackupDocument {
            format: BACKUP_FORMAT.to_string(),
            version: BACKUP_VERSION,
            exported_at: "2026-05-09T00:00:00.000Z".to_string(),
            app_state: vec![BackupAppStateEntry {
                key: "map.view".to_string(),
                value: json!({
                    "center": [37.6173, 55.7558],
                    "zoom": 12,
                }),
            }],
            home_location: Some(HomeLocationInput {
                longitude: 37.6173,
                latitude: 55.7558,
                zoom: Some(14.0),
            }),
            painted_cells: vec![
                paint_cell("8b2a100d2db6fff", 37.6173, 55.7558),
                paint_cell("8b2a100d2da6fff", 37.6183, 55.7568),
            ],
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
