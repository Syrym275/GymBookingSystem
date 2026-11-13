"""Gym booking API backed by PostgreSQL."""

from fastapi import FastAPI, HTTPException, Path, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from psycopg import Error as DatabaseError
from pydantic import ValidationError
from .auth import router as auth_router
from .bookings import router as bookings_router
from .members import router as members_router
from .payments import router as payments_router
from .verification import router as verification_router

from .catalog import data_source, get_catalog, get_trainer_profile
from .models import HealthResponse, PublicCatalog, PublicHall, PublicTrainer, TrainerProfile


app = FastAPI(
    title="Gym Booking System API",
    version="0.2.0",
    description=(
        "PostgreSQL-backed catalogue, trainer profiles, registration, bookings and payments. "
        "DATABASE_URL is required for database-backed routes; no sample catalogue fallback."
    ),
)
FIELD_LABELS = {
    "full_name": "Full name",
    "email": "Email",
    "phone": "Phone",
    "password": "Password",
    "membership_plan": "Membership plan",
    "specialization": "Specialization",
    "session_price_kzt": "Session price",
}


@app.exception_handler(RequestValidationError)
async def readable_validation_error(_: Request, error: RequestValidationError) -> JSONResponse:
    """Send 422 errors as one sentence; the frontend shows `detail` when it is a string."""
    messages = []
    for item in error.errors():
        message = str(item.get("msg", "Invalid value")).removeprefix("Value error, ")
        field = next((str(part) for part in reversed(item.get("loc", ())) if isinstance(part, str) and part != "body"), None)
        if field:
            message = f"{FIELD_LABELS.get(field, field.replace('_', ' ').capitalize())}: {message[0].lower()}{message[1:]}"
        messages.append(message.rstrip(".") + ".")
    return JSONResponse(status_code=422, content={"detail": " ".join(messages) or "Invalid request."})


app.include_router(auth_router)
app.include_router(bookings_router)
app.include_router(members_router)
app.include_router(payments_router)
app.include_router(verification_router)

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


@app.get("/trainers/{trainer_id}", response_model=TrainerProfile, tags=["Public catalogue"])
def trainer_profile(trainer_id: int = Path(gt=0)) -> TrainerProfile:
    """Public professional fields only, including inactive/pending profiles; no account or contact data."""
    try:
        return get_trainer_profile(trainer_id)
    except (DatabaseError, ValidationError):
        raise HTTPException(status_code=503, detail="The trainer profile is temporarily unavailable.") from None


@app.get("/halls", response_model=list[PublicHall], tags=["Public catalogue"])
def list_halls() -> list[PublicHall]:
    """List active halls and public prices; no login required."""
    return load_catalog().halls


@app.get("/public/catalog", response_model=PublicCatalog, tags=["Public catalogue"])
def public_catalog() -> PublicCatalog:
    """Match the frontend PublicCatalog contract for the next integration step."""
    return load_catalog()
