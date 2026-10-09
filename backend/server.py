from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent / ".env")

import asyncio
import io
import logging
import os
import zipfile
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from starlette.middleware.cors import CORSMiddleware

import account
import admin
import auth
import market
import trading
from core import db, hash_password, verify_password

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("server")
logging.getLogger("httpx").setLevel(logging.WARNING)
ZIP_EXCLUDE = {"node_modules", ".git", "build", "__pycache__", ".emergent", ".cache", "test_reports", ".pytest_cache"}


async def seed_account(email: str, password: str, name: str, role: str):
    existing = await db.users.find_one({"email": email})
    if existing is None:
        uid = await auth.create_user(name, email, password, role)
        await db.users.update_one({"_id": uid}, {"$set": {"email_verified": True, "kyc_status": "verified", "kyc_level": 2}})
    elif not verify_password(password, existing["password_hash"]):
        await db.users.update_one({"email": email}, {"$set": {"password_hash": hash_password(password)}})


@asynccontextmanager
async def lifespan(app: FastAPI):
    await db.users.create_index("email", unique=True)
    await db.password_reset_tokens.create_index("expires_at", expireAfterSeconds=0)
    await db.login_attempts.create_index("identifier")
    await db.revoked_tokens.create_index("jti", unique=True)
    await db.revoked_tokens.create_index("expires_at", expireAfterSeconds=0)
    await db.wallets.create_index("user_id", unique=True)
    for coll in ("orders", "trades", "positions", "transactions", "security_logs"):
        await db[coll].create_index([("user_id", 1), ("created_at", -1)])
    await db.orders.create_index("status")
    await db.positions.create_index("status")
    await seed_account(os.environ["ADMIN_EMAIL"].lower(), os.environ["ADMIN_PASSWORD"], "Admin", "admin")
    await seed_account(os.environ["DEMO_EMAIL"].lower(), os.environ["DEMO_PASSWORD"], "John Doe", "user")
    task = asyncio.create_task(trading.engine_loop())
    yield
    task.cancel()


app = FastAPI(title="Bitlora Pro API", lifespan=lifespan)
for r in (auth.router, market.router, trading.router, account.router, admin.router):
    app.include_router(r)


@app.get("/api/")
async def root():
    return {"service": "Bitlora Pro API", "status": "ok"}


@app.get("/api/download/source")
async def download_source():
    root = Path("/app")
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for path in root.rglob("*"):
            rel = path.relative_to(root)
            if any(part in ZIP_EXCLUDE for part in rel.parts) or not path.is_file() or path.name == ".env":
                continue
            zf.write(path, f"bitlora-pro/{rel}")
        zf.writestr("bitlora-pro/backend/.env.example", "MONGO_URL=mongodb://localhost:27017\nDB_NAME=bitlora\nCORS_ORIGINS=http://localhost:3000\nJWT_SECRET=\nADMIN_EMAIL=\nADMIN_PASSWORD=\nDEMO_EMAIL=\nDEMO_PASSWORD=\nEMERGENT_EMAIL_KEY=\nEMAIL_FROM_NAME=Bitlora Pro\nFRONTEND_URL=http://localhost:3000\n")
        zf.writestr("bitlora-pro/frontend/.env.example", "REACT_APP_BACKEND_URL=http://localhost:8001\n")
    buf.seek(0)
    return StreamingResponse(buf, media_type="application/zip", headers={"Content-Disposition": "attachment; filename=bitlora-pro-source.zip"})


app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=[o.strip() for o in os.environ["CORS_ORIGINS"].split(",")],
    allow_methods=["*"],
    allow_headers=["*"],
)
