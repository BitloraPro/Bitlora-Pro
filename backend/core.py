import os
import secrets
from datetime import datetime, timezone, timedelta
from typing import Any

import bcrypt
import jwt
from bson import ObjectId
from fastapi import HTTPException, Request, Response
from motor.motor_asyncio import AsyncIOMotorClient

client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = client[os.environ["DB_NAME"]]
JWT_ALGORITHM = "HS256"
HIDDEN_FIELDS = {"password_hash", "twofa_secret", "twofa_pending_secret", "email_code", "secret_hash"}

DEFAULT_CONFIG = {
    "platform_name": "Bitlora Pro",
    "maintenance_mode": False,
    "registration_enabled": True,
    "kyc_required_for_withdrawal": False,
    "spot_maker_fee": 0.001,
    "spot_taker_fee": 0.001,
    "futures_fee": 0.0005,
    "max_leverage": 20,
    "daily_withdraw_limit_usd": 100000,
    "hot_wallet_ratio": 0.1,
    "welcome_bonus_usdt": 10000,
    "max_login_attempts": 5,
}


def now() -> datetime:
    return datetime.now(timezone.utc)


def ser(value: Any) -> Any:
    if isinstance(value, list):
        return [ser(v) for v in value]
    if isinstance(value, dict):
        out = {}
        for k, v in value.items():
            if k in HIDDEN_FIELDS:
                continue
            out["id" if k == "_id" else k] = ser(v)
        return out
    if isinstance(value, ObjectId):
        return str(value)
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.isoformat()
    return value


def oid(value: str) -> ObjectId:
    try:
        return ObjectId(value)
    except Exception:
        raise HTTPException(status_code=404, detail="Not found")


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


ACCESS_TTL = timedelta(minutes=15)
REFRESH_TTL = timedelta(days=7)


def create_access_token(user_id: str, email: str) -> str:
    payload = {"sub": user_id, "email": email, "type": "access", "jti": secrets.token_hex(8), "exp": now() + ACCESS_TTL}
    return jwt.encode(payload, os.environ["JWT_SECRET"], algorithm=JWT_ALGORITHM)


def create_refresh_token(user_id: str) -> str:
    payload = {"sub": user_id, "type": "refresh", "jti": secrets.token_hex(16), "exp": now() + REFRESH_TTL}
    return jwt.encode(payload, os.environ["JWT_SECRET"], algorithm=JWT_ALGORITHM)


def decode_token(token: str, kind: str) -> dict:
    try:
        payload = jwt.decode(token, os.environ["JWT_SECRET"], algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Session expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    if payload.get("type") != kind:
        raise HTTPException(status_code=401, detail="Invalid token type")
    return payload


def set_auth_cookies(response: Response, user_id: str, email: str) -> str:
    access = create_access_token(user_id, email)
    opts = {"httponly": True, "secure": True, "samesite": "lax", "path": "/"}
    response.set_cookie("access_token", access, max_age=int(ACCESS_TTL.total_seconds()), **opts)
    response.set_cookie("refresh_token", create_refresh_token(user_id), max_age=int(REFRESH_TTL.total_seconds()), **opts)
    return access


async def revoke_refresh(payload: dict):
    exp = datetime.fromtimestamp(payload["exp"], tz=timezone.utc).replace(tzinfo=None)
    await db.revoked_tokens.update_one({"jti": payload["jti"]}, {"$setOnInsert": {"jti": payload["jti"], "expires_at": exp}}, upsert=True)


async def is_revoked(payload: dict) -> bool:
    return await db.revoked_tokens.find_one({"jti": payload.get("jti")}) is not None


def clear_auth_cookies(response: Response):
    for name in ("access_token", "refresh_token"):
        response.delete_cookie(name, path="/", secure=True, httponly=True, samesite="lax")


async def get_config() -> dict:
    doc = await db.config.find_one({"_id": "platform"}) or {}
    return {**DEFAULT_CONFIG, **{k: v for k, v in doc.items() if k != "_id"}}


async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        token = auth[7:] if auth.startswith("Bearer ") else None
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    payload = decode_token(token, "access")
    user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    if user.get("status") in ("suspended", "banned"):
        raise HTTPException(status_code=403, detail=f"Account {user['status']}")
    return user


async def require_admin(request: Request) -> dict:
    user = await get_current_user(request)
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


async def require_trading(request: Request) -> dict:
    user = await get_current_user(request)
    cfg = await get_config()
    if cfg["maintenance_mode"] and user.get("role") != "admin":
        raise HTTPException(status_code=503, detail="Platform is under maintenance")
    return user


def client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    return fwd.split(",")[0].strip() if fwd else (request.client.host if request.client else "-")


async def log_event(kind: str, user: dict | None, details: str, status: str = "success", request: Request | None = None):
    await db.security_logs.insert_one({
        "type": kind,
        "user_id": str(user["_id"]) if user else None,
        "email": user.get("email") if user else None,
        "details": details,
        "status": status,
        "ip": client_ip(request) if request else "-",
        "device": (request.headers.get("user-agent", "-")[:120] if request else "system"),
        "created_at": now(),
    })
