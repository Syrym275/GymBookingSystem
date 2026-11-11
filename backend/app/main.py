"""Week 10: read-only FastAPI foundation and public sample catalogue."""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from psycopg import Error as DatabaseError
from pydantic import ValidationError
from .auth import router as auth_router
from .bookings import router as bookings_router
from .members import router as members_router
from .payments import router as payments_router

from .catalog import data_source, get_catalog
from .models import HealthResponse, PublicCatalog, PublicHall, PublicTrainer


app = FastAPI(
    title="Gym Booking System API",
    version="0.2.0",
    description=(
        "Week 10 public catalogue. Sample data by default; optional read-only "
        "PostgreSQL access to the Task 9 trainers and halls tables. "
        "Authentication, bookings and payments remain future work."
    ),
)
app.include_router(auth_router)
app.include_router(bookings_router)
app.include_router(members_router)
app.include_router(payments_router)

# For the React dev server. This is browser configuration, not authentication.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["GET", "POST"],
)


@app.get("/", tags=["Service"])
def index() -> dict[str, str]:
    return {"service": "Gym Booking System API", "docs": "/docs", "data_source": data_source()}


def load_catalog() -> PublicCatalog:
    try:
        return get_catalog()
    except (DatabaseError, ValidationError):
        # Do not leak connection details or silently substitute sample data.
        raise HTTPException(
            status_code=503,
            detail="The catalogue is temporarily unavailable. Check the backend database configuration.",
        ) from None


@app.get("/health", response_model=HealthResponse, tags=["Service"])
def health() -> HealthResponse:
    """Check that the API responds; this does not test a database connection."""
    return HealthResponse(status="ok", service="gym-booking-api")


@app.get("/trainers", response_model=list[PublicTrainer], tags=["Public catalogue"])
def list_trainers() -> list[PublicTrainer]:
    """List active trainers and public prices; no login required."""
    return load_catalog().trainers


@app.get("/halls", response_model=list[PublicHall], tags=["Public catalogue"])
def list_halls() -> list[PublicHall]:
    """List active halls and public prices; no login required."""
    return load_catalog().halls


@app.get("/public/catalog", response_model=PublicCatalog, tags=["Public catalogue"])
def public_catalog() -> PublicCatalog:
    """Match the frontend PublicCatalog contract for the next integration step."""
    return load_catalog()
