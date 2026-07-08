from datetime import datetime, timedelta, timezone

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_db
from app.models import Role, User

_ph = PasswordHasher()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def hash_password(pw: str) -> str:
    return _ph.hash(pw)


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return _ph.verify(hashed, pw)
    except VerifyMismatchError:
        return False


def _create_token(sub: str, minutes: int | None = None, days: int | None = None) -> str:
    expire = datetime.now(timezone.utc) + (
        timedelta(minutes=minutes) if minutes else timedelta(days=days or 0)
    )
    return jwt.encode(
        {"sub": sub, "exp": expire}, settings.jwt_secret, algorithm=settings.jwt_algorithm
    )


def create_access_token(sub: str) -> str:
    return _create_token(sub, minutes=settings.access_token_minutes)


def create_refresh_token(sub: str) -> str:
    return _create_token(sub, days=settings.refresh_token_days)


def get_current_user(
    token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)
) -> User:
    cred_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED, detail="Ogiltig autentisering"
    )
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        email = payload.get("sub")
    except JWTError:
        raise cred_exc
    user = db.scalar(select(User).where(User.email == email))
    if user is None or not user.is_active:
        raise cred_exc
    return user


def require_roles(*roles: Role):
    def checker(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(status_code=403, detail="Otillräcklig behörighet")
        return user

    return checker
