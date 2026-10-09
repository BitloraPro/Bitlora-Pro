import hashlib
import secrets
from datetime import timedelta, timezone
from typing import List, Literal, Optional

import pyotp
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from core import db, get_current_user, hash_password, log_event, now, oid, ser, verify_password
from emailer import send_verification_email
from market import SYMBOLS

router = APIRouter(prefix="/api/account", tags=["account"])
VIP_TIERS = [0, 1_000_000, 5_000_000, 20_000_000, 100_000_000, 250_000_000, 500_000_000, 1_000_000_000, 2_500_000_000, 5_000_000_000]


class ProfileIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    phone: Optional[str] = None
    country: Optional[str] = None


class PasswordIn(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)


class CodeIn(BaseModel):
    code: str = Field(min_length=6, max_length=6)


class KycIn(BaseModel):
    full_name: str = Field(min_length=2)
    country: str = Field(min_length=2)
    dob: str
    doc_type: Literal["passport", "national_id", "driver_license"]
    doc_number: str = Field(min_length=4)


class ApiKeyIn(BaseModel):
    label: str = Field(min_length=2, max_length=40)
    permissions: List[Literal["read", "spot", "futures", "withdraw"]] = ["read"]
    ip_whitelist: List[str] = []


async def volume_30d(uid: str) -> float:
    since = now() - timedelta(days=30)
    rows = await db.trades.aggregate([{"$match": {"user_id": uid, "created_at": {"$gte": since}}},
                                      {"$group": {"_id": None, "v": {"$sum": "$quote"}}}]).to_list(1)
    return rows[0]["v"] if rows else 0.0


@router.get("/overview")
async def overview(user: dict = Depends(get_current_user)):
    uid = str(user["_id"])
    vol = await volume_30d(uid)
    tier = max(i for i, t in enumerate(VIP_TIERS) if vol >= t)
    if user.get("vip_override") is not None:
        tier = user["vip_override"]
    nxt = VIP_TIERS[tier + 1] if tier + 1 < len(VIP_TIERS) else None
    keys = await db.api_keys.count_documents({"user_id": uid})
    logins = await db.security_logs.find({"user_id": uid}).sort("created_at", -1).to_list(15)
    score = 25 + (25 if user.get("twofa_enabled") else 0) + (25 if user.get("email_verified") else 0) + (25 if user.get("kyc_status") == "verified" else 0)
    return {"user": ser(user), "vip": {"tier": tier, "volume_30d": vol, "next_tier_volume": nxt, "progress": min(100, vol / nxt * 100) if nxt else 100},
            "api_keys": keys, "security_score": score, "activity": ser(logins)}


@router.put("/profile")
async def profile(body: ProfileIn, user: dict = Depends(get_current_user)):
    await db.users.update_one({"_id": user["_id"]}, {"$set": body.model_dump()})
    return ser(await db.users.find_one({"_id": user["_id"]}))


@router.post("/password")
async def change_password(body: PasswordIn, request: Request, user: dict = Depends(get_current_user)):
    if not verify_password(body.current_password, user["password_hash"]):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    await db.users.update_one({"_id": user["_id"]}, {"$set": {"password_hash": hash_password(body.new_password)}})
    await log_event("Password Change", user, "Password updated", "success", request)
    return {"ok": True}


@router.post("/2fa/setup")
async def twofa_setup(user: dict = Depends(get_current_user)):
    if user.get("twofa_enabled"):
        raise HTTPException(status_code=400, detail="2FA is already enabled")
    secret = pyotp.random_base32()
    await db.users.update_one({"_id": user["_id"]}, {"$set": {"twofa_pending_secret": secret}})
    return {"secret": secret, "otpauth_url": pyotp.TOTP(secret).provisioning_uri(name=user["email"], issuer_name="Bitlora Pro")}


@router.post("/2fa/enable")
async def twofa_enable(body: CodeIn, request: Request, user: dict = Depends(get_current_user)):
    secret = user.get("twofa_pending_secret")
    if not secret or not pyotp.TOTP(secret).verify(body.code, valid_window=1):
        raise HTTPException(status_code=400, detail="Invalid authenticator code")
    await db.users.update_one({"_id": user["_id"]}, {"$set": {"twofa_enabled": True, "twofa_secret": secret}, "$unset": {"twofa_pending_secret": ""}})
    await log_event("2FA Enabled", user, "Google Authenticator bound", "success", request)
    return {"ok": True}


@router.post("/2fa/disable")
async def twofa_disable(body: CodeIn, request: Request, user: dict = Depends(get_current_user)):
    if not user.get("twofa_enabled") or not pyotp.TOTP(user["twofa_secret"]).verify(body.code, valid_window=1):
        raise HTTPException(status_code=400, detail="Invalid authenticator code")
    await db.users.update_one({"_id": user["_id"]}, {"$set": {"twofa_enabled": False}, "$unset": {"twofa_secret": ""}})
    await log_event("2FA Disabled", user, "Authenticator removed", "warning", request)
    return {"ok": True}


@router.post("/email/send-code")
async def send_email_code(user: dict = Depends(get_current_user)):
    if user.get("email_verified"):
        raise HTTPException(status_code=400, detail="Email already verified")
    sent_at = user.get("email_code_sent_at")
    if sent_at and (now() - sent_at.replace(tzinfo=timezone.utc)).total_seconds() < 60:
        raise HTTPException(status_code=429, detail="Please wait a minute before requesting another code")
    code = f"{secrets.randbelow(10**6):06d}"
    await send_verification_email(user, code)
    await db.users.update_one({"_id": user["_id"]}, {"$set": {"email_code": code, "email_code_exp": now() + timedelta(minutes=10), "email_code_sent_at": now()}})
    return {"ok": True, "sent_to": user["email"]}


@router.post("/email/verify")
async def verify_email(body: CodeIn, request: Request, user: dict = Depends(get_current_user)):
    exp = user.get("email_code_exp")
    if not exp or exp.replace(tzinfo=timezone.utc) < now():
        raise HTTPException(status_code=400, detail="Verification code expired. Request a new one.")
    if user.get("email_code") != body.code:
        raise HTTPException(status_code=400, detail="Invalid verification code")
    await db.users.update_one({"_id": user["_id"]}, {"$set": {"email_verified": True}, "$unset": {"email_code": ""}})
    await log_event("Email Verified", user, "Email address confirmed", "success", request)
    return {"ok": True}


@router.post("/kyc")
async def submit_kyc(body: KycIn, request: Request, user: dict = Depends(get_current_user)):
    if user.get("kyc_status") in ("pending", "verified"):
        raise HTTPException(status_code=400, detail=f"KYC already {user['kyc_status']}")
    await db.users.update_one({"_id": user["_id"]}, {"$set": {"kyc_status": "pending", "kyc": {**body.model_dump(), "submitted_at": now()}}})
    await log_event("KYC Submitted", user, f"{body.doc_type} verification", "pending", request)
    return {"ok": True}


@router.get("/api-keys")
async def list_keys(user: dict = Depends(get_current_user)):
    return ser(await db.api_keys.find({"user_id": str(user["_id"])}).sort("created_at", -1).to_list(50))


@router.post("/api-keys")
async def create_key(body: ApiKeyIn, request: Request, user: dict = Depends(get_current_user)):
    if "withdraw" in body.permissions and not body.ip_whitelist:
        raise HTTPException(status_code=400, detail="Withdrawal permission requires an IP whitelist")
    api_key = secrets.token_hex(32)
    secret = secrets.token_hex(32)
    doc = {"user_id": str(user["_id"]), "label": body.label, "api_key": api_key, "secret_hash": hashlib.sha256(secret.encode()).hexdigest(),
           "permissions": body.permissions, "ip_whitelist": body.ip_whitelist, "created_at": now()}
    res = await db.api_keys.insert_one(doc)
    await log_event("API Key Created", user, body.label, "success", request)
    return {**ser(await db.api_keys.find_one({"_id": res.inserted_id})), "secret": secret}


@router.delete("/api-keys/{key_id}")
async def delete_key(key_id: str, request: Request, user: dict = Depends(get_current_user)):
    res = await db.api_keys.delete_one({"_id": oid(key_id), "user_id": str(user["_id"])})
    if not res.deleted_count:
        raise HTTPException(status_code=404, detail="API key not found")
    await log_event("API Key Deleted", user, key_id, "success", request)
    return {"ok": True}


@router.post("/watchlist/{symbol}")
async def toggle_watch(symbol: str, user: dict = Depends(get_current_user)):
    symbol = symbol.upper()
    if symbol not in SYMBOLS:
        raise HTTPException(status_code=400, detail="Unknown symbol")
    wl = user.get("watchlist", [])
    wl = [s for s in wl if s != symbol] if symbol in wl else wl + [symbol]
    await db.users.update_one({"_id": user["_id"]}, {"$set": {"watchlist": wl}})
    return {"watchlist": wl}
