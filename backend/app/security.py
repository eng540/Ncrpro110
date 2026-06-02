"""
Security Service - OAuth2 Password Bearer + RBAC + Audit Logging
AUTH-PATCH 2026-06-02 (with detailed logging)
"""

import os
import logging
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
# Logging Configuration
# ==========================================
logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

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

logger.info(f"JWT_SECRET_KEY loaded. Length: {len(SECRET_KEY)} chars")
logger.info(f"JWT_SECRET_KEY prefix: {SECRET_KEY[:10]}...")

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = int(os.getenv("JWT_EXPIRE_HOURS", "24"))
logger.info(f"ACCESS_TOKEN_EXPIRE_HOURS: {ACCESS_TOKEN_EXPIRE_HOURS}")

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
    result = bcrypt.checkpw(plain_bytes, hash_bytes)
    logger.info(f"Password verification result: {result}")
    return result

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
    
    logger.info(f"Creating token for user_id: {data.get('sub')}, role: {data.get('role')}")
    logger.info(f"Token expires at: {expire}")
    
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    logger.info(f"Token created successfully. Length: {len(encoded_jwt)}")
    return encoded_jwt

def decode_token(token: str) -> Optional[schemas.TokenPayload]:
    """Decode and validate a JWT token."""
    try:
        logger.info(f"Decoding token. Token length: {len(token)}")
        logger.info(f"Token prefix: {token[:30]}...")
        
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        
        user_id = payload.get("sub")
        role = payload.get("role")
        exp = payload.get("exp")
        
        logger.info(f"Token decoded successfully. user_id: {user_id}, role: {role}, exp: {exp}")
        
        if user_id is None:
            logger.warning("Token missing 'sub' claim")
            return None
            
        return schemas.TokenPayload(sub=int(user_id), exp=exp, role=role)
    except JWTError as e:
        logger.error(f"JWT decode error: {str(e)}")
        return None
    except Exception as e:
        logger.error(f"Unexpected error decoding token: {str(e)}")
        return None

# ==========================================
# Current User Dependencies
# ==========================================
async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
) -> models.User:
    """Get the current authenticated user from JWT token."""
    logger.info(f"get_current_user called. Token prefix: {token[:30] if token else 'None'}...")
    
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    if not token:
        logger.warning("No token provided")
        raise credentials_exception
    
    token_data = decode_token(token)
    if token_data is None or token_data.sub is None:
        logger.warning("Token decode failed or missing sub claim")
        raise credentials_exception
    
    logger.info(f"Looking up user with id: {token_data.sub}")
    user = db.query(models.User).filter(models.User.id == token_data.sub).first()
    
    if user is None:
        logger.warning(f"User with id {token_data.sub} not found")
        raise credentials_exception
    
    if not user.is_active:
        logger.warning(f"User {user.username} is inactive")
        raise credentials_exception
    
    logger.info(f"User authenticated: {user.username} (role: {user.role.name if user.role else 'None'})")
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
        logger.info(f"Checking permissions for user: {current_user.username}")
        logger.info(f"Required permissions: {required_permissions}")
        
        if not current_user.role:
            logger.warning(f"User {current_user.username} has no role assigned")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No role assigned to user"
            )
        
        permissions = current_user.role.permissions or []
        logger.info(f"User permissions: {permissions}")
        
        # Admin has all permissions
        if "*" in permissions:
            logger.info("Admin access granted")
            return current_user
        
        # Check if user has any of the required permissions
        has_permission = any(p in permissions for p in required_permissions)
        logger.info(f"Permission check result: {has_permission}")
        
        if not has_permission:
            logger.warning(f"User {current_user.username} lacks required permissions")
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
    
    logger.info(f"Audit log: user={user_id}, action={action}, entity={entity_type}:{entity_id}")
    
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