use std::{env, error::Error, path::PathBuf, sync::Arc};

use axum::{
    extract::{rejection::JsonRejection, Path, Query, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tower_http::cors::{Any, CorsLayer};

mod db;

const MAX_PAINTED_CELLS_BATCH_LEN: usize = 10_000;
const DEFAULT_PAINTED_CELLS_QUERY_LIMIT: usize = 20_000;
const MAX_PAINTED_CELLS_QUERY_LIMIT: usize = 50_000;
const MAX_H3_ID_LEN: usize = 32;

#[derive(Clone)]
struct ApiState {
    database_path: Arc<PathBuf>,
}

#[derive(Serialize)]
struct HealthResponse {
    status: &'static str,
    service: &'static str,
}

#[derive(Deserialize)]
struct SaveAppStateRequest {
    value: Value,
}

#[derive(Serialize)]
struct AppStateResponse {
    key: String,
    value: Option<Value>,
}

#[derive(Serialize)]
struct ErrorResponse {
    error: &'static str,
    message: String,
}

#[derive(Deserialize)]
struct PaintCellsRequest {
    cells: Vec<db::PaintCellInput>,
}

#[derive(Deserialize)]
struct EraseCellsRequest {
    cells: Vec<db::CellRef>,
}

#[derive(Deserialize)]
struct PaintedCellsQuery {
    west: f64,
    south: f64,
    east: f64,
    north: f64,
    limit: Option<usize>,
}

#[derive(Serialize)]
struct PaintedCellsResponse {
    cells: Vec<db::PaintedCell>,
    limit: usize,
    truncated: bool,
}

#[derive(Serialize)]
struct BatchMutationResponse {
    requested: usize,
    changed: usize,
}

enum ApiError {
    InvalidAppStateKey(db::AppStateKeyError),
    InvalidJson(JsonRejection),
    InvalidPaintedCellsInput(String),
    InvalidBbox(String),
    Storage(db::StorageError),
    CorruptAppState {
        key: String,
        source: serde_json::Error,
    },
}

async fn health() -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok",
        service: "foggy_map_backend",
    })
}

async fn load_app_state(
    State(state): State<ApiState>,
    Path(key): Path<String>,
) -> Result<Json<AppStateResponse>, ApiError> {
    db::validate_app_state_key(&key).map_err(ApiError::InvalidAppStateKey)?;

    let connection = open_initialized_connection(&state)?;
    let value_json = db::load_app_state_value(&connection, &key).map_err(to_storage_error)?;
    let value = value_json
        .map(|value_json| {
            serde_json::from_str(&value_json).map_err(|source| ApiError::CorruptAppState {
                key: key.clone(),
                source,
            })
        })
        .transpose()?;

    Ok(Json(AppStateResponse { key, value }))
}

async fn save_app_state(
    State(state): State<ApiState>,
    Path(key): Path<String>,
    payload: Result<Json<SaveAppStateRequest>, JsonRejection>,
) -> Result<(StatusCode, Json<AppStateResponse>), ApiError> {
    db::validate_app_state_key(&key).map_err(ApiError::InvalidAppStateKey)?;

    let Json(payload) = payload.map_err(ApiError::InvalidJson)?;
    let value_json = serde_json::to_string(&payload.value).expect("serialize JSON value");
    let connection = open_initialized_connection(&state)?;

    db::save_app_state_value(&connection, &key, &value_json).map_err(to_storage_error)?;

    Ok((
        StatusCode::OK,
        Json(AppStateResponse {
            key,
            value: Some(payload.value),
        }),
    ))
}

async fn paint_cells(
    State(state): State<ApiState>,
    payload: Result<Json<PaintCellsRequest>, JsonRejection>,
) -> Result<Json<BatchMutationResponse>, ApiError> {
    let Json(payload) = payload.map_err(ApiError::InvalidJson)?;

    validate_paint_cells_request(&payload.cells)?;

    let mut connection = open_initialized_connection(&state)?;
    let changed = db::paint_cells(&mut connection, &payload.cells).map_err(to_storage_error)?;

    Ok(Json(BatchMutationResponse {
        requested: payload.cells.len(),
        changed,
    }))
}

async fn erase_cells(
    State(state): State<ApiState>,
    payload: Result<Json<EraseCellsRequest>, JsonRejection>,
) -> Result<Json<BatchMutationResponse>, ApiError> {
    let Json(payload) = payload.map_err(ApiError::InvalidJson)?;

    validate_cell_refs_request(&payload.cells)?;

    let mut connection = open_initialized_connection(&state)?;
    let changed = db::erase_cells(&mut connection, &payload.cells).map_err(to_storage_error)?;

    Ok(Json(BatchMutationResponse {
        requested: payload.cells.len(),
        changed,
    }))
}

async fn get_painted_cells_in_bbox(
    State(state): State<ApiState>,
    Query(query): Query<PaintedCellsQuery>,
) -> Result<Json<PaintedCellsResponse>, ApiError> {
    let (bbox, limit) = validate_painted_cells_query(query)?;
    let connection = open_initialized_connection(&state)?;
    let page = db::get_cells_in_bbox_limited(&connection, bbox, limit).map_err(to_storage_error)?;

    Ok(Json(PaintedCellsResponse {
        cells: page.cells,
        limit,
        truncated: page.truncated,
    }))
}

fn open_initialized_connection(state: &ApiState) -> Result<Connection, ApiError> {
    let connection = db::open_database(state.database_path.as_ref()).map_err(ApiError::Storage)?;
    db::initialize_connection(&connection).map_err(to_storage_error)?;

    Ok(connection)
}

fn to_storage_error(error: rusqlite::Error) -> ApiError {
    ApiError::Storage(error.into())
}

fn validate_paint_cells_request(cells: &[db::PaintCellInput]) -> Result<(), ApiError> {
    validate_batch_len(cells.len())?;

    for cell in cells {
        validate_cell_identity(&cell.h3_id, cell.resolution)?;
        validate_longitude(cell.centroid_lng, "centroid_lng")?;
        validate_latitude(cell.centroid_lat, "centroid_lat")?;
    }

    Ok(())
}

fn validate_cell_refs_request(cells: &[db::CellRef]) -> Result<(), ApiError> {
    validate_batch_len(cells.len())?;

    for cell in cells {
        validate_cell_identity(&cell.h3_id, cell.resolution)?;
    }

    Ok(())
}

fn validate_batch_len(len: usize) -> Result<(), ApiError> {
    if len > MAX_PAINTED_CELLS_BATCH_LEN {
        return Err(ApiError::InvalidPaintedCellsInput(format!(
            "painted cells batch must contain at most {MAX_PAINTED_CELLS_BATCH_LEN} cells"
        )));
    }

    Ok(())
}

fn validate_cell_identity(h3_id: &str, resolution: i64) -> Result<(), ApiError> {
    if h3_id.is_empty() {
        return Err(ApiError::InvalidPaintedCellsInput(
            "h3_id must not be empty".to_string(),
        ));
    }

    if h3_id.len() > MAX_H3_ID_LEN {
        return Err(ApiError::InvalidPaintedCellsInput(format!(
            "h3_id must be at most {MAX_H3_ID_LEN} characters"
        )));
    }

    if !(db::MIN_H3_RESOLUTION..=db::MAX_H3_RESOLUTION).contains(&resolution) {
        return Err(ApiError::InvalidPaintedCellsInput(format!(
            "resolution must be between {} and {}",
            db::MIN_H3_RESOLUTION,
            db::MAX_H3_RESOLUTION
        )));
    }

    Ok(())
}

fn validate_painted_cells_query(query: PaintedCellsQuery) -> Result<(db::Bbox, usize), ApiError> {
    validate_bbox_longitude(query.west, "west")?;
    validate_bbox_longitude(query.east, "east")?;
    validate_bbox_latitude(query.south, "south")?;
    validate_bbox_latitude(query.north, "north")?;
    let limit = validate_painted_cells_query_limit(query.limit)?;

    if query.south > query.north {
        return Err(ApiError::InvalidBbox(
            "south must be less than or equal to north".to_string(),
        ));
    }

    let bbox = db::Bbox {
        west: query.west,
        south: query.south,
        east: query.east,
        north: query.north,
    };

    Ok((bbox, limit))
}

fn validate_painted_cells_query_limit(limit: Option<usize>) -> Result<usize, ApiError> {
    let limit = limit.unwrap_or(DEFAULT_PAINTED_CELLS_QUERY_LIMIT);

    if limit == 0 || limit > MAX_PAINTED_CELLS_QUERY_LIMIT {
        return Err(ApiError::InvalidBbox(format!(
            "limit must be between 1 and {MAX_PAINTED_CELLS_QUERY_LIMIT}"
        )));
    }

    Ok(limit)
}

fn validate_longitude(value: f64, field_name: &'static str) -> Result<(), ApiError> {
    if !value.is_finite() || !(-180.0..=180.0).contains(&value) {
        return Err(ApiError::InvalidPaintedCellsInput(format!(
            "{field_name} must be a finite longitude between -180 and 180"
        )));
    }

    Ok(())
}

fn validate_latitude(value: f64, field_name: &'static str) -> Result<(), ApiError> {
    if !value.is_finite() || !(-90.0..=90.0).contains(&value) {
        return Err(ApiError::InvalidPaintedCellsInput(format!(
            "{field_name} must be a finite latitude between -90 and 90"
        )));
    }

    Ok(())
}

fn validate_bbox_longitude(value: f64, field_name: &'static str) -> Result<(), ApiError> {
    if !value.is_finite() || !(-180.0..=180.0).contains(&value) {
        return Err(ApiError::InvalidBbox(format!(
            "{field_name} must be a finite longitude between -180 and 180"
        )));
    }

    Ok(())
}

fn validate_bbox_latitude(value: f64, field_name: &'static str) -> Result<(), ApiError> {
    if !value.is_finite() || !(-90.0..=90.0).contains(&value) {
        return Err(ApiError::InvalidBbox(format!(
            "{field_name} must be a finite latitude between -90 and 90"
        )));
    }

    Ok(())
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let (status, error, message) = match self {
            Self::InvalidAppStateKey(error) => (
                StatusCode::BAD_REQUEST,
                "invalid_app_state_key",
                error.to_string(),
            ),
            Self::InvalidJson(error) => (error.status(), "invalid_json", error.body_text()),
            Self::InvalidPaintedCellsInput(message) => (
                StatusCode::BAD_REQUEST,
                "invalid_painted_cells_input",
                message,
            ),
            Self::InvalidBbox(message) => (StatusCode::BAD_REQUEST, "invalid_bbox", message),
            Self::Storage(error) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                "storage_error",
                error.to_string(),
            ),
            Self::CorruptAppState { key, source } => (
                StatusCode::INTERNAL_SERVER_ERROR,
                "corrupt_app_state",
                format!("stored app state value for key '{key}' is not valid JSON: {source}"),
            ),
        };

        (status, Json(ErrorResponse { error, message })).into_response()
    }
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn Error>> {
    let host = env::var("APP_HOST").unwrap_or_else(|_| "0.0.0.0".to_string());
    let port = env::var("APP_PORT").unwrap_or_else(|_| "3000".to_string());
    let database_path =
        env::var("DATABASE_PATH").unwrap_or_else(|_| db::DEFAULT_DATABASE_PATH.to_string());
    let bind_addr = format!("{host}:{port}");

    db::initialize_database(&database_path)?;
    let state = ApiState {
        database_path: Arc::new(PathBuf::from(&database_path)),
    };

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        .route("/health", get(health))
        .route("/app-state/{key}", get(load_app_state).put(save_app_state))
        .route("/painted-cells", get(get_painted_cells_in_bbox))
        .route("/painted-cells/paint", post(paint_cells))
        .route("/painted-cells/erase", post(erase_cells))
        .with_state(state)
        .layer(cors);
    let listener = tokio::net::TcpListener::bind(&bind_addr).await?;

    println!("foggy_map_backend listening on {bind_addr}; database={database_path}");
    axum::serve(listener, app).await?;

    Ok(())
}
