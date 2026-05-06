use std::{env, error::Error, path::PathBuf, sync::Arc};

use axum::{
    extract::{rejection::JsonRejection, Path, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::get,
    Json, Router,
};
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tower_http::cors::{Any, CorsLayer};

mod db;

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

enum ApiError {
    InvalidAppStateKey(db::AppStateKeyError),
    InvalidJson(JsonRejection),
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

fn open_initialized_connection(state: &ApiState) -> Result<Connection, ApiError> {
    let connection = db::open_database(state.database_path.as_ref()).map_err(ApiError::Storage)?;
    db::initialize_connection(&connection).map_err(to_storage_error)?;

    Ok(connection)
}

fn to_storage_error(error: rusqlite::Error) -> ApiError {
    ApiError::Storage(error.into())
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
        .with_state(state)
        .layer(cors);
    let listener = tokio::net::TcpListener::bind(&bind_addr).await?;

    println!("foggy_map_backend listening on {bind_addr}; database={database_path}");
    axum::serve(listener, app).await?;

    Ok(())
}
