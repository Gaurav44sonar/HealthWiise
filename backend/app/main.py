from app.api.auth import router as auth_router
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from app.api.profile import router as profile_router
from app.api.nutrition import router as nutrition_router
from app.api.sleep import router as sleep_router
from app.api.fitness import router as fitness_router
from app.api.wellness import router as wellness_router
from app.api.cycle import router as cycle_router
from app.api.ai import router as ai_router

from app.db.database import (
    check_database_connection,
    close_database_connection,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        await check_database_connection()
        print("MongoDB connected successfully")
        yield
    finally:
        await close_database_connection()


app = FastAPI(
    title="HealthWiise API",
    description="Backend API for HealthWiise wellness platform",
    version="0.1.0",
    lifespan=lifespan,
)

app.include_router(auth_router, prefix="/api")
app.include_router(profile_router, prefix="/api")
app.include_router(nutrition_router, prefix="/api")
app.include_router(sleep_router, prefix="/api")
app.include_router(fitness_router, prefix="/api")
app.include_router(wellness_router, prefix="/api")
app.include_router(cycle_router, prefix="/api")
app.include_router(ai_router, prefix="/api")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    return {
        "message": "Welcome to HealthWiise API",
        "status": "running",
    }


@app.get("/health")
async def health_check():
    try:
        await check_database_connection()
        return {
            "status": "healthy",
            "application": "HealthWiise",
            "database": "connected",
        }
    except Exception:
        raise HTTPException(
            status_code=503,
            detail="Database unavailable",
        )
