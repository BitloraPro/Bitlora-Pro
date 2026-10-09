import logging
import secrets
from datetime import timedelta
from typing import Optional

import pyotp
from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, EmailStr, Field
from pymongo import ReturnDocument

from core import (clear_auth_cookies, is_revoked, revoke_refresh, client_ip, db, decode_token, get_config, get_current_user, hash_password, log_event, now, oid, ser,
                  set_auth_cookies, verify_password)
from emailer import send_reset_email
from trading import add_tx, credit

logger = logging.getLogger("auth")
router = APIRouter(prefix="/api/auth", tags=["auth"])


class RegisterIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class LoginIn(BaseModel):
    email: EmailStr
    password: str
    code: Optional[str] = None


class ForgotIn(BaseModel):
    email: EmailStr


class ResetIn(BaseModel):
    token: str
    password: str = Field(min_length=8, max_length=128)


async def next_uid() -> int:
    doc = await db.counters.find_one_and_update({"_id": "uid"}, {"$inc": {"seq": 1}}, upsert=True, return_document=ReturnDocument.AFTER)
    return 1000000 + doc["seq"]


async def create_user(name: str, email: str, password: str, role: str = "user"):
    cfg = await get_config()
    doc = {"name": name, "email": email, "password_hash": hash_password(password), "role": role, "status": "active",
           "kyc_status": "unverified", "kyc_level": 0, "email_verified": False, "twofa_enabled": False, "watchlist": ["BTCUSDT", "ETHUSDT", "SOLUSDT"],
           "uid": await next_uid(), "created_at": now(), "last_login": None}
    res = await db.users.insert_one(doc)
    user = await db.users.find_one({"_id": res.inserted_id})
    if cfg["welcome_bonus_usdt"] > 0:
        await credit(str(res.inserted_id), "spot", "USDT", free=float(cfg["welcome_bonus_usdt"]))
        await add_tx(user, "bonus", "USDT", float(cfg["welcome_bonus_usdt"]), from_addr="Welcome Bonus")
    return res.inserted_id


@router.post("/register")
async def register(body: RegisterIn, request: Request, response: Response):
    cfg = await get_config()
    if not cfg["registration_enabled"]:
        raise HTTPException(status_code=403, detail="New registrations are temporarily disabled")
    email = body.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="An account with this email already exists")
    user = await db.users.find_one({"_id": await create_user(body.name.strip(), email, body.password)})
    await log_event("New User", user, "Account registered", "success", request)
    return {"token": set_auth_cookies(response, str(user["_id"]), email), "user": ser(user)}


@router.post("/login")
async def login(body: LoginIn, request: Request, response: Response):
    email = body.email.lower()
    cfg = await get_config()
    ident = f"{client_ip(request)}:{email}"
    att = await db.login_attempts.find_one({"identifier": ident})
    if att and att.get("count", 0) >= cfg["max_login_attempts"] and att["locked_until"] > now().replace(tzinfo=None):
        raise HTTPException(status_code=429, detail="Too many failed attempts. Try again in 15 minutes.")
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(body.password, user["password_hash"]):
        await db.login_attempts.update_one({"identifier": ident}, {"$inc": {"count": 1}, "$set": {"locked_until": (now() + timedelta(minutes=15)).replace(tzinfo=None)}}, upsert=True)
        await log_event("Failed Login", user or {"_id": None, "email": email}, "Invalid credentials", "failed", request)
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if user.get("status") in ("suspended", "banned"):
        raise HTTPException(status_code=403, detail=f"Account {user['status']}. Contact support.")
    if user.get("twofa_enabled"):
        if not body.code:
            raise HTTPException(status_code=401, detail="2FA_REQUIRED")
        if not pyotp.TOTP(user["twofa_secret"]).verify(body.code, valid_window=1):
            raise HTTPException(status_code=401, detail="Invalid 2FA code")
    await db.login_attempts.delete_one({"identifier": ident})
    await db.users.update_one({"_id": user["_id"]}, {"$set": {"last_login": now()}})
    await log_event("User Login", user, "Password login", "success", request)
    return {"token": set_auth_cookies(response, str(user["_id"]), email), "user": ser(user)}


@router.get("/me")
async def me(request: Request):
    return ser(await get_current_user(request))


@router.post("/refresh")
async def refresh(request: Request, response: Response):
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    payload = decode_token(token, "refresh")
    if await is_revoked(payload):
        clear_auth_cookies(response)
        raise HTTPException(status_code=401, detail="Session revoked")
    await revoke_refresh(payload)
    user = await db.users.find_one({"_id": oid(payload["sub"])})
    if not user or user.get("status") in ("suspended", "banned"):
        clear_auth_cookies(response)
        raise HTTPException(status_code=401, detail="Session no longer valid")
    set_auth_cookies(response, str(user["_id"]), user["email"])
    return {"ok": True}


@router.post("/logout")
async def logout(request: Request, response: Response):
    try:
        user = await get_current_user(request)
        await log_event("Logout", user, "Session ended", "success", request)
    except HTTPException:
        pass
    token = request.cookies.get("refresh_token")
    if token:
        try:
            await revoke_refresh(decode_token(token, "refresh"))
        except HTTPException:
            pass
    clear_auth_cookies(response)
    return {"ok": True}


@router.post("/forgot-password")
async def forgot(body: ForgotIn, request: Request):
    user = await db.users.find_one({"email": body.email.lower()})
    out = {"ok": True, "message": "If the account exists, a reset link has been sent."}
    if user:
        recent = await db.password_reset_tokens.find_one({"user_id": str(user["_id"]), "created_at": {"$gte": now() - timedelta(seconds=60)}})
        if recent:
            return out
        token = secrets.token_urlsafe(32)
        await db.password_reset_tokens.insert_one({"token": token, "user_id": str(user["_id"]), "used": False,
                                                   "expires_at": (now() + timedelta(hours=1)).replace(tzinfo=None), "created_at": now()})
        try:
            await send_reset_email(user, token)
            await log_event("Password Reset Request", user, "Reset link emailed", "pending", request)
        except HTTPException as exc:
            await db.password_reset_tokens.delete_one({"token": token})
            await log_event("Password Reset Request", user, f"Reset email failed: {exc.detail}", "failed", request)
    return out


@router.post("/reset-password")
async def reset(body: ResetIn, request: Request):
    rec = await db.password_reset_tokens.find_one({"token": body.token, "used": False})
    if not rec or rec["expires_at"] < now().replace(tzinfo=None):
        raise HTTPException(status_code=400, detail="Reset link is invalid or expired")
    await db.users.update_one({"_id": oid(rec["user_id"])}, {"$set": {"password_hash": hash_password(body.password)}})
    await db.password_reset_tokens.update_one({"_id": rec["_id"]}, {"$set": {"used": True}})
    user = await db.users.find_one({"_id": oid(rec["user_id"])})
    await log_event("Password Reset", user, "Password changed via reset link", "success", request)
    return {"ok": True}
