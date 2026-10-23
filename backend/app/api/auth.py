
from fastapi import APIRouter, HTTPException, status

from app.schemas.auth import (
    RegisterRequest,
    LoginRequest,
    UserResponse,
    TokenResponse,
)
from app.services.auth_service import register_user, login_user

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post(
    "/register",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
)
async def register(data: RegisterRequest):
    user = await register_user(
        data.name,
        str(data.email),
        data.password,
    )

    if user is None:
        raise HTTPException(
            status_code=409,
            detail="An account with this email already exists.",
        )

    return user


@router.post("/login", response_model=TokenResponse)
async def login(data: LoginRequest):
    result = await login_user(
        str(data.email),
        data.password,
    )

    if result is None:
        raise HTTPException(
            status_code=401,
            detail="Invalid email or password.",
        )

    return result
