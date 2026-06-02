"""
Security Service - OAuth2 Password Bearer + RBAC + Audit Logging
AUTH-PATCH 2026-06-02
"""

import os
import bcrypt
from datetime import datetime, timedelta
from typing import Optional

from jose import JWTError, jwt
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db

# ==========================================
# Configuration (from environment variables)
# ==========================================
SECRET_KEY = os.getenv("JWT_SECRET_KEY")
if not SECRET_KEY:
    # Fallback for development only - MUST be changed in production
    SECRET_KEY = "nrc-latrine-tracker-dev-secret-key-CHANGE-IMMEDIATELY"
    import warnings
    warnings.warn(
        "JWT_SECRET_KEY not set in environment. Using insecure default. "
        "Set JWT_SECRET_KEY environment variable immediately!",
        RuntimeWarning
    )

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = int(os.getenv("JWT_EXPIRE_HOURS", "24"))

# ==========================================
# OAuth2 Scheme
# ==========================================
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/token")

# ==========================================
# Password Hashing (bcrypt)
# ==========================================
def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plain password against a bcrypt hash."""
    plain_bytes = plain_password.encode("utf-8")
    hash_bytes = hashed_password.encode("utf-8") if isinstance(hashed_password, str) else hashed_password
    return bcrypt.checkpw(plain_bytes, hash_bytes)

def get_password_hash(password: str) -> str:
    """Hash a password using bcrypt with cost factor 12."""
    password_bytes = password.encode("utf-8")
    salt = bcrypt.gensalt(rounds=12)
    hashed = bcrypt.hashpw(password_bytes, salt)
    return hashed.decode("utf-8")

# ==========================================
# JWT Token Management
# ==========================================
def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create a JWT access token."""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def decode_token(token: str) -> Optional[schemas.TokenPayload]:
    """Decode and validate a JWT token."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        role = payload.get("role")
        if user_id is None:
            return None
        return schemas.TokenPayload(sub=int(user_id), exp=payload.get("exp"), role=role)
    except JWTError:
        return None

# ==========================================
# Current User Dependencies
# ==========================================
async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
) -> models.User:
    """Get the current authenticated user from JWT token."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    token_data = decode_token(token)
    if token_data is None or token_data.sub is None:
        raise credentials_exception
    user = db.query(models.User).filter(models.User.id == token_data.sub).first()
    if user is None or not user.is_active:
        raise credentials_exception
    return user

async def get_current_active_user(
    current_user: models.User = Depends(get_current_user)
) -> models.User:
    """Ensure user is active."""
    return current_user

# ==========================================
# Role-Based Access Control (RBAC)
# ==========================================
def require_role(required_permissions: list):
    """Dependency factory to check user permissions."""
    async def role_checker(
        current_user: models.User = Depends(get_current_user)
    ) -> models.User:
        if not current_user.role:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No role assigned to user"
            )
        permissions = current_user.role.permissions or []
        # Admin has all permissions
        if "*" in permissions:
            return current_user
        # Check if user has any of the required permissions
        if not any(p in permissions for p in required_permissions):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions for this operation"
            )
        return current_user
    return role_checker

# Predefined role requirements
require_admin = require_role(["*"])
require_engineer = require_role([
    "latrines:read", "latrines:write",
    "boq_items:read", "boq_items:write",
    "remarks:read", "remarks:write"
])
require_viewer = require_role([
    "latrines:read", "boq_items:read",
    "remarks:read", "reports:read"
])

# ==========================================
# Audit Logging
# ==========================================
def log_audit(
    db: Session,
    user_id: Optional[int],
    action: str,
    entity_type: Optional[str] = None,
    entity_id: Optional[int] = None,
    old_values: Optional[dict] = None,
    new_values: Optional[dict] = None,
    request: Optional[Request] = None
) -> models.AuditLog:
    """Create an audit log entry."""
    ip_address = None
    if request and request.client:
        ip_address = request.client.host
    log = models.AuditLog(
        user_id=user_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        old_values=old_values,
        new_values=new_values,
        ip_address=ip_address
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return log