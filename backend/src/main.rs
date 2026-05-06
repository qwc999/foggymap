use std::{env, error::Error};

use axum::{routing::get, Json, Router};
use serde::Serialize;
use tower_http::cors::{Any, CorsLayer};

mod db;

#[derive(Serialize)]
struct HealthResponse {
    status: &'static str,
    service: &'static str,
}

async fn health() -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok",
        service: "foggy_map_backend",
    })
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn Error>> {
    let host = env::var("APP_HOST").unwrap_or_else(|_| "0.0.0.0".to_string());
    let port = env::var("APP_PORT").unwrap_or_else(|_| "3000".to_string());
    let database_path =
        env::var("DATABASE_PATH").unwrap_or_else(|_| db::DEFAULT_DATABASE_PATH.to_string());
    let bind_addr = format!("{host}:{port}");

    db::initialize_database(&database_path)?;

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new().route("/health", get(health)).layer(cors);
    let listener = tokio::net::TcpListener::bind(&bind_addr).await?;

    println!("foggy_map_backend listening on {bind_addr}; database={database_path}");
    axum::serve(listener, app).await?;

    Ok(())
}
