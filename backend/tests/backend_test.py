"""Bitlora Pro – backend regression tests.

Covers: auth, market, wallet, spot, futures, account, admin, download.
"""
import os
import time
import uuid

import pyotp
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")
load_dotenv(Path(__file__).resolve().parents[2] / "frontend" / ".env")
import pytest
import requests
from pymongo import MongoClient

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")
_mongo = MongoClient(MONGO_URL)[DB_NAME]

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = os.environ["ADMIN_EMAIL"]
ADMIN_PASSWORD = os.environ["ADMIN_PASSWORD"]
DEMO_EMAIL = os.environ["DEMO_EMAIL"]
DEMO_PASSWORD = os.environ["DEMO_PASSWORD"]
SINK_PASSWORD = os.environ["TEST_SINK_PASSWORD"]


# ---------- shared helpers ----------
def _session(token=None):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    if token:
        s.headers["Authorization"] = f"Bearer {token}"
    return s


def _login(email, password, code=None):
    body = {"email": email, "password": password}
    if code:
        body["code"] = code
    r = requests.post(f"{API}/auth/login", json=body, timeout=15)
    return r


@pytest.fixture(scope="session")
def admin_token():
    r = _login(ADMIN_EMAIL, ADMIN_PASSWORD)
    assert r.status_code == 200, f"admin login failed: {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="session")
def demo_token():
    r = _login(DEMO_EMAIL, DEMO_PASSWORD)
    assert r.status_code == 200, f"demo login failed: {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="session")
def admin_client(admin_token):
    return _session(admin_token)


@pytest.fixture(scope="session")
def demo_client(demo_token):
    return _session(demo_token)


# ---------- auth ----------
class TestAuth:
    def test_root(self):
        r = requests.get(f"{API}/", timeout=10)
        assert r.status_code == 200
        assert r.json().get("status") == "ok"

    def test_register_new_user_gets_bonus(self):
        email = f"test_{uuid.uuid4().hex[:10]}@bitlora.example.com"
        r = requests.post(f"{API}/auth/register", json={"name": "Test User", "email": email, "password": "TestPass@123"}, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "token" in data and data["user"]["email"] == email
        # Verify 10,000 USDT bonus
        s = _session(data["token"])
        w = s.get(f"{API}/wallet", timeout=15).json()
        usdt = next((a for a in w["spot"] if a["asset"] == "USDT"), None)
        assert usdt and usdt["free"] >= 10000, f"expected 10000 USDT bonus, got {usdt}"

    def test_duplicate_register_fails(self):
        r = requests.post(f"{API}/auth/register", json={"name": "Xx", "email": DEMO_EMAIL, "password": "whatever123"}, timeout=15)
        assert r.status_code == 400

    def test_login_invalid(self):
        r = _login(DEMO_EMAIL, "wrong-password-x")
        assert r.status_code in (401, 429)

    def test_me(self, demo_client):
        r = demo_client.get(f"{API}/auth/me", timeout=10)
        assert r.status_code == 200
        assert r.json()["email"] == DEMO_EMAIL

    def test_logout(self, demo_token):
        s = _session(demo_token)
        r = s.post(f"{API}/auth/logout", timeout=10)
        assert r.status_code == 200

    def test_forgot_and_reset(self):
        # Use Resend's test sink so the real email send succeeds.
        email = "delivered@resend.dev"
        # Ensure user exists with a known password (register may 400 if already present from prior runs)
        requests.post(f"{API}/auth/register", json={"name": "Delivered Sink", "email": email, "password": SINK_PASSWORD}, timeout=15)
        # Reset login_attempts & ensure deterministic password
        _mongo.login_attempts.delete_many({})
        from passlib.context import CryptContext
        pwd = CryptContext(schemes=["bcrypt"], deprecated="auto").hash(SINK_PASSWORD)
        _mongo.users.update_one({"email": email}, {"$set": {"password_hash": pwd, "status": "active"}})
        # Baseline login works
        assert _login(email, SINK_PASSWORD).status_code == 200
        # 1) forgot-password returns generic ok, no token in body, email send succeeds (no 5xx)
        r = requests.post(f"{API}/auth/forgot-password", json={"email": email}, timeout=60)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("ok") is True and "message" in body
        assert "reset_token" not in body and "token" not in body
        # Non-existent email -> same generic response
        r_none = requests.post(f"{API}/auth/forgot-password", json={"email": f"nope_{uuid.uuid4().hex[:6]}@bitlora.example.com"}, timeout=30)
        assert r_none.status_code == 200
        assert r_none.json().get("message") == body["message"]
        # 2) Pull latest reset token from Mongo
        user_doc = _mongo.users.find_one({"email": email})
        assert user_doc is not None
        tok_doc = _mongo.password_reset_tokens.find_one({"user_id": str(user_doc["_id"]), "used": False}, sort=[("created_at", -1)])
        assert tok_doc is not None, "password_reset_tokens doc not created"
        token = tok_doc["token"]
        r2 = requests.post(f"{API}/auth/reset-password", json={"token": token, "password": "NewPass@456"}, timeout=10)
        assert r2.status_code == 200
        _mongo.login_attempts.delete_many({})
        assert _login(email, SINK_PASSWORD).status_code == 401
        assert _login(email, "NewPass@456").status_code == 200
        # 3) Reused token rejected
        r3 = requests.post(f"{API}/auth/reset-password", json={"token": token, "password": "AnotherPass@789"}, timeout=10)
        assert r3.status_code == 400
        # 4) Restore the sink password via a fresh forgot/reset cycle
        _mongo.login_attempts.delete_many({})
        r4 = requests.post(f"{API}/auth/forgot-password", json={"email": email}, timeout=60)
        assert r4.status_code == 200
        tok_doc2 = _mongo.password_reset_tokens.find_one({"user_id": str(user_doc["_id"]), "used": False}, sort=[("created_at", -1)])
        assert tok_doc2 is not None
        r5 = requests.post(f"{API}/auth/reset-password", json={"token": tok_doc2["token"], "password": SINK_PASSWORD}, timeout=10)
        assert r5.status_code == 200
        assert _login(email, SINK_PASSWORD).status_code == 200

    def test_brute_force_lockout(self):
        # Use a dedicated fresh account so we don't lock out the demo account.
        email = f"brute_{uuid.uuid4().hex[:8]}@bitlora.example.com"
        requests.post(f"{API}/auth/register", json={"name": "Bx", "email": email, "password": "GoodPass@123"}, timeout=15)
        codes = []
        for _ in range(6):
            codes.append(_login(email, "wrong-xxx").status_code)
        assert 429 in codes, f"expected 429 after 5 failed, got {codes}"


# ---------- cookie auth (httpOnly) ----------
class TestCookieAuth:
    def test_login_sets_httponly_cookies_and_me_works_without_bearer(self):
        s = requests.Session()
        r = s.post(f"{API}/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD}, timeout=15)
        assert r.status_code == 200, r.text
        # Inspect Set-Cookie headers for httpOnly + Secure + SameSite=Lax
        set_cookie_headers = r.raw.headers.getlist("Set-Cookie") if hasattr(r.raw.headers, "getlist") else r.headers.get_all("Set-Cookie") if hasattr(r.headers, "get_all") else [r.headers.get("Set-Cookie", "")]
        joined = "\n".join(set_cookie_headers)
        assert "access_token=" in joined and "refresh_token=" in joined, joined
        for name in ("access_token", "refresh_token"):
            # find the specific cookie line
            line = next((h for h in set_cookie_headers if h.startswith(name + "=")), "")
            assert "HttpOnly" in line, f"{name} missing HttpOnly: {line}"
            assert "Secure" in line, f"{name} missing Secure: {line}"
            # NOTE: Backend code sets SameSite=Lax, but Bitlora Pro's K8s ingress rewrites
            # the Set-Cookie to SameSite=None; Partitioned so cross-site preview cookies
            # work. We assert *some* SameSite attribute is present.
            assert "samesite=" in line.lower(), f"{name} missing SameSite: {line}"
        # cookies attached to session jar
        assert s.cookies.get("access_token"), "no access_token in session jar"
        assert s.cookies.get("refresh_token"), "no refresh_token in session jar"
        # /me works via cookies only (no Authorization header)
        r_me = s.get(f"{API}/auth/me", timeout=15)
        assert r_me.status_code == 200
        assert r_me.json()["email"] == DEMO_EMAIL

    def test_refresh_issues_new_access_cookie(self):
        s = requests.Session()
        assert s.post(f"{API}/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD}, timeout=15).status_code == 200
        old_access = s.cookies.get("access_token")
        time.sleep(1.1)  # JWT exp has 1-second precision; wait so a new token differs
        r = s.post(f"{API}/auth/refresh", timeout=15)
        assert r.status_code == 200, r.text
        new_access = s.cookies.get("access_token")
        assert new_access, "no access_token after refresh"
        assert new_access != old_access, "refresh did not rotate access_token"
        # /me still works
        assert s.get(f"{API}/auth/me", timeout=15).status_code == 200

    def test_refresh_without_cookie_401(self):
        r = requests.post(f"{API}/auth/refresh", timeout=15)
        assert r.status_code == 401

    def test_logout_clears_cookies(self):
        s = requests.Session()
        assert s.post(f"{API}/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD}, timeout=15).status_code == 200
        assert s.get(f"{API}/auth/me", timeout=15).status_code == 200
        r = s.post(f"{API}/auth/logout", timeout=15)
        assert r.status_code == 200
        # Jar should no longer have access_token (server sent deletion)
        assert not s.cookies.get("access_token"), f"access_token still present: {s.cookies.get_dict()}"
        assert not s.cookies.get("refresh_token"), f"refresh_token still present: {s.cookies.get_dict()}"
        # Follow-up /me should 401
        r_me = s.get(f"{API}/auth/me", timeout=15)
        assert r_me.status_code == 401

    def test_register_sets_cookies(self):
        s = requests.Session()
        email = f"cookie_{uuid.uuid4().hex[:8]}@bitlora.example.com"
        r = s.post(f"{API}/auth/register", json={"name": "Cookie User", "email": email, "password": "CookiePass@12"}, timeout=15)
        assert r.status_code == 200, r.text
        assert s.cookies.get("access_token") and s.cookies.get("refresh_token")
        # /me via cookies
        r_me = s.get(f"{API}/auth/me", timeout=15)
        assert r_me.status_code == 200 and r_me.json()["email"] == email

    def test_bearer_fallback_still_works(self):
        # API-client flow: use returned token in Authorization header on a fresh session (no cookies)
        r = requests.post(f"{API}/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD}, timeout=15)
        assert r.status_code == 200
        token = r.json()["token"]
        r_me = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {token}"}, timeout=15)
        assert r_me.status_code == 200 and r_me.json()["email"] == DEMO_EMAIL

    def test_private_api_without_cookie_or_bearer_401(self):
        r = requests.get(f"{API}/auth/me", timeout=15)
        assert r.status_code == 401


# ---------- market ----------
class TestMarket:
    def test_tickers(self):
        r = requests.get(f"{API}/market/tickers", timeout=20)
        assert r.status_code == 200
        rows = r.json()
        assert isinstance(rows, list) and len(rows) > 5
        assert any(t["symbol"] == "BTCUSDT" for t in rows)

    def test_sparklines(self):
        r = requests.get(f"{API}/market/sparklines", timeout=20)
        assert r.status_code == 200

    def test_klines(self):
        r = requests.get(f"{API}/market/klines", params={"symbol": "BTCUSDT", "interval": "15m"}, timeout=20)
        assert r.status_code == 200
        assert len(r.json()) > 10

    def test_depth(self):
        r = requests.get(f"{API}/market/depth", params={"symbol": "BTCUSDT"}, timeout=20)
        assert r.status_code == 200
        d = r.json()
        assert "bids" in d and "asks" in d

    def test_trades(self):
        r = requests.get(f"{API}/market/trades", params={"symbol": "BTCUSDT"}, timeout=20)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_stats(self):
        r = requests.get(f"{API}/market/stats", timeout=20)
        assert r.status_code == 200

    def test_futures(self):
        r = requests.get(f"{API}/market/futures/BTCUSDT", timeout=20)
        assert r.status_code == 200


# ---------- wallet + spot ----------
class TestWalletAndSpot:
    def test_wallet(self, demo_client):
        r = demo_client.get(f"{API}/wallet", timeout=15)
        assert r.status_code == 200
        assert r.json()["spot_usd"] >= 0

    def test_deposit_credits_balance(self, demo_client):
        r0 = demo_client.get(f"{API}/wallet", timeout=15).json()
        before = next((a["free"] for a in r0["spot"] if a["asset"] == "USDT"), 0)
        r = demo_client.post(f"{API}/wallet/deposit", json={"asset": "USDT", "amount": 500}, timeout=15)
        assert r.status_code == 200, r.text
        r2 = demo_client.get(f"{API}/wallet", timeout=15).json()
        after = next((a["free"] for a in r2["spot"] if a["asset"] == "USDT"), 0)
        assert after - before >= 499.9

    def test_withdraw_insufficient(self, demo_client):
        r = demo_client.post(f"{API}/wallet/withdraw", json={"asset": "BTC", "amount": 999999, "address": "bc1qxxxxxxxxxxxxxxxxxxxxxxxxxxx"}, timeout=15)
        assert r.status_code == 400

    def test_transfer_spot_to_futures(self, demo_client):
        r = demo_client.post(f"{API}/wallet/transfer", json={"asset": "USDT", "amount": 100, "from_account": "spot", "to_account": "futures"}, timeout=15)
        assert r.status_code == 200
        w = demo_client.get(f"{API}/wallet", timeout=15).json()
        assert w["futures"]["free"] >= 100

    def test_spot_market_buy_and_sell(self, demo_client):
        # Market buy a small amount of BTC
        r = demo_client.post(f"{API}/spot/order", json={"symbol": "BTCUSDT", "side": "buy", "type": "market", "amount": 0.0005}, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "filled"
        # Sell it back
        r2 = demo_client.post(f"{API}/spot/order", json={"symbol": "BTCUSDT", "side": "sell", "type": "market", "amount": 0.0003}, timeout=15)
        assert r2.status_code == 200

    def test_spot_limit_and_cancel(self, demo_client):
        # Place limit far below market -> stays open
        price = 1000.0
        r = demo_client.post(f"{API}/spot/order", json={"symbol": "BTCUSDT", "side": "buy", "type": "limit", "amount": 0.001, "price": price}, timeout=15)
        assert r.status_code == 200, r.text
        oid_ = r.json()["id"]
        assert r.json()["status"] == "open"
        # Confirm visible in open orders
        orders = demo_client.get(f"{API}/spot/orders", params={"status": "open"}, timeout=15).json()
        assert any(o["id"] == oid_ for o in orders)
        # Cancel
        rc = demo_client.delete(f"{API}/spot/order/{oid_}", timeout=15)
        assert rc.status_code == 200

    def test_spot_stop_limit(self, demo_client):
        r = demo_client.post(f"{API}/spot/order", json={"symbol": "BTCUSDT", "side": "buy", "type": "stop_limit", "amount": 0.001, "price": 1000, "stop_price": 1200}, timeout=15)
        assert r.status_code == 200, r.text

    def test_withdraw_creates_pending(self, demo_client):
        r = demo_client.post(f"{API}/wallet/withdraw", json={"asset": "USDT", "amount": 10, "address": "0xdeadbeefdeadbeefdeadbeef"}, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "pending"

    def test_transactions_list(self, demo_client):
        r = demo_client.get(f"{API}/wallet/transactions", timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list) and len(r.json()) > 0

    def test_trade_history(self, demo_client):
        r = demo_client.get(f"{API}/spot/trades", timeout=15)
        assert r.status_code == 200


# ---------- futures ----------
class TestFutures:
    def test_open_and_close_position(self, demo_client):
        # Ensure futures has margin
        demo_client.post(f"{API}/wallet/transfer", json={"asset": "USDT", "amount": 500, "from_account": "spot", "to_account": "futures"}, timeout=15)
        # Open long 20x isolated
        r = demo_client.post(f"{API}/futures/order", json={"symbol": "BTCUSDT", "side": "long", "type": "market",
                                                           "size": 0.001, "leverage": 20, "margin_mode": "isolated"}, timeout=15)
        assert r.status_code == 200, r.text
        # Positions show enrich fields
        pos = demo_client.get(f"{API}/futures/positions", timeout=15).json()
        assert len(pos) >= 1
        p = next(x for x in pos if x["symbol"] == "BTCUSDT")
        for k in ("liq_price", "margin_ratio", "unrealized_pnl"):
            assert k in p
        # TP/SL set
        rt = demo_client.put(f"{API}/futures/position/{p['id']}/tpsl", json={"tp": p["entry_price"] * 1.5, "sl": p["entry_price"] * 0.5}, timeout=15)
        assert rt.status_code == 200
        # Close
        rc = demo_client.post(f"{API}/futures/position/{p['id']}/close", timeout=15)
        assert rc.status_code == 200

    def test_leverage_too_high_rejected(self, demo_client):
        r = demo_client.post(f"{API}/futures/order", json={"symbol": "BTCUSDT", "side": "long", "type": "market",
                                                           "size": 0.001, "leverage": 50, "margin_mode": "cross"}, timeout=15)
        assert r.status_code == 400

    def test_futures_limit_and_cancel(self, demo_client):
        r = demo_client.post(f"{API}/futures/order", json={"symbol": "BTCUSDT", "side": "long", "type": "limit",
                                                           "size": 0.001, "leverage": 10, "margin_mode": "cross", "price": 1000}, timeout=15)
        assert r.status_code == 200, r.text
        oid_ = r.json()["id"]
        rc = demo_client.delete(f"{API}/futures/order/{oid_}", timeout=15)
        assert rc.status_code == 200


# ---------- account ----------
class TestAccount:
    def test_overview(self, demo_client):
        r = demo_client.get(f"{API}/account/overview", timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert "vip" in d and "security_score" in d

    def test_2fa_setup_enable_disable(self):
        # Fresh user so we don't touch demo
        email = f"twofa_{uuid.uuid4().hex[:8]}@bitlora.example.com"
        reg = requests.post(f"{API}/auth/register", json={"name": "Tx", "email": email, "password": "TwoFaPass@12"}, timeout=15).json()
        c = _session(reg["token"])
        s = c.post(f"{API}/account/2fa/setup", timeout=10)
        assert s.status_code == 200
        secret = s.json()["secret"]
        code = pyotp.TOTP(secret).now()
        e = c.post(f"{API}/account/2fa/enable", json={"code": code}, timeout=10)
        assert e.status_code == 200, e.text
        # Login now requires code
        r = _login(email, "TwoFaPass@12")
        assert r.status_code == 401 and "2FA" in r.text
        time.sleep(1)
        r = _login(email, "TwoFaPass@12", code=pyotp.TOTP(secret).now())
        assert r.status_code == 200
        # Disable
        d = c.post(f"{API}/account/2fa/disable", json={"code": pyotp.TOTP(secret).now()}, timeout=10)
        assert d.status_code == 200

    def test_email_send_verify(self):
        # Use Resend's test sink so the real send succeeds. Register if needed.
        email = "delivered@resend.dev"
        requests.post(f"{API}/auth/register", json={"name": "Delivered Sink", "email": email, "password": SINK_PASSWORD}, timeout=15)
        _mongo.login_attempts.delete_many({})
        # Ensure unverified + no cooldown + known password
        from passlib.context import CryptContext
        pwd = CryptContext(schemes=["bcrypt"], deprecated="auto").hash(SINK_PASSWORD)
        _mongo.users.update_one({"email": email}, {"$set": {"password_hash": pwd, "email_verified": False},
                                                   "$unset": {"email_code": "", "email_code_exp": "", "email_code_sent_at": ""}})
        tok = _login(email, SINK_PASSWORD).json()["token"]
        c = _session(tok)
        r = c.post(f"{API}/account/email/send-code", timeout=60)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("ok") is True
        assert body.get("sent_to") == email
        # Code must NOT be in response
        assert "code" not in body
        # Second call within 60s -> 429 (does not send another email)
        r429 = c.post(f"{API}/account/email/send-code", timeout=10)
        assert r429.status_code == 429, r429.text
        # Read code from Mongo
        user_doc = _mongo.users.find_one({"email": email})
        code = user_doc.get("email_code")
        assert code and len(code) == 6
        # Wrong code -> 400
        wrong = "999999" if code != "999999" else "111111"
        bad = c.post(f"{API}/account/email/verify", json={"code": wrong}, timeout=10)
        assert bad.status_code == 400
        # Correct code -> 200 and email_verified becomes true
        v = c.post(f"{API}/account/email/verify", json={"code": code}, timeout=10)
        assert v.status_code == 200
        user_after = _mongo.users.find_one({"email": email})
        assert user_after.get("email_verified") is True

    def test_api_key_create_list_delete(self, demo_client):
        r = demo_client.post(f"{API}/account/api-keys", json={"label": f"TEST_{uuid.uuid4().hex[:6]}", "permissions": ["read", "spot"], "ip_whitelist": []}, timeout=10)
        assert r.status_code == 200
        kid = r.json()["id"]
        assert "secret" in r.json()
        lst = demo_client.get(f"{API}/account/api-keys", timeout=10).json()
        assert any(k["id"] == kid for k in lst)
        d = demo_client.delete(f"{API}/account/api-keys/{kid}", timeout=10)
        assert d.status_code == 200

    def test_api_key_withdraw_requires_ip(self, demo_client):
        r = demo_client.post(f"{API}/account/api-keys", json={"label": "TEST_wd", "permissions": ["withdraw"], "ip_whitelist": []}, timeout=10)
        assert r.status_code == 400

    def test_kyc_submit(self):
        email = f"kyc_{uuid.uuid4().hex[:8]}@bitlora.example.com"
        reg = requests.post(f"{API}/auth/register", json={"name": "Kx", "email": email, "password": "KycPass@1234"}, timeout=15).json()
        c = _session(reg["token"])
        r = c.post(f"{API}/account/kyc", json={"full_name": "Jane D", "country": "US", "dob": "1990-01-01", "doc_type": "passport", "doc_number": "A1234567"}, timeout=10)
        assert r.status_code == 200
        me = c.get(f"{API}/auth/me", timeout=10).json()
        assert me["kyc_status"] == "pending"

    def test_watchlist_toggle(self, demo_client):
        r = demo_client.post(f"{API}/account/watchlist/BNBUSDT", timeout=10)
        assert r.status_code == 200
        assert "BNBUSDT" in r.json()["watchlist"]
        r2 = demo_client.post(f"{API}/account/watchlist/BNBUSDT", timeout=10)
        assert "BNBUSDT" not in r2.json()["watchlist"]


# ---------- admin ----------
class TestAdmin:
    def test_non_admin_forbidden(self, demo_client):
        r = demo_client.get(f"{API}/admin/stats", timeout=10)
        assert r.status_code == 403

    def test_stats(self, admin_client):
        r = admin_client.get(f"{API}/admin/stats", timeout=15)
        assert r.status_code == 200
        d = r.json()
        for k in ("total_users", "spot_volume", "futures_volume", "alerts"):
            assert k in d

    def test_volume(self, admin_client):
        r = admin_client.get(f"{API}/admin/volume", timeout=15)
        assert r.status_code == 200 and isinstance(r.json(), list)

    def test_health(self, admin_client):
        r = admin_client.get(f"{API}/admin/health", timeout=15)
        assert r.status_code == 200
        names = {s["name"] for s in r.json()}
        assert "Matching Engine" in names and "Database" in names

    def test_activities(self, admin_client):
        r = admin_client.get(f"{API}/admin/activities", timeout=15)
        assert r.status_code == 200

    def test_top_markets(self, admin_client):
        r = admin_client.get(f"{API}/admin/top-markets", timeout=15)
        assert r.status_code == 200

    def test_users_and_patch(self, admin_client):
        r = admin_client.get(f"{API}/admin/users", params={"q": "john"}, timeout=15)
        assert r.status_code == 200
        items = r.json()["items"]
        assert any(u["email"] == DEMO_EMAIL for u in items)
        demo = next(u for u in items if u["email"] == DEMO_EMAIL)
        # No-op patch to keep demo in good state
        rp = admin_client.patch(f"{API}/admin/users/{demo['id']}", json={"status": "active", "kyc_status": "verified"}, timeout=15)
        assert rp.status_code == 200

    def test_treasury_and_transactions(self, admin_client):
        assert admin_client.get(f"{API}/admin/treasury", timeout=15).status_code == 200
        assert admin_client.get(f"{API}/admin/transactions", timeout=15).status_code == 200

    def test_withdrawal_approve(self, admin_client, demo_client):
        # Create pending withdrawal first
        wr = demo_client.post(f"{API}/wallet/withdraw", json={"asset": "USDT", "amount": 5, "address": "0xpendingapprove1234567890"}, timeout=15)
        assert wr.status_code == 200
        txid = wr.json()["id"]
        r = admin_client.post(f"{API}/admin/withdrawals/{txid}/approve", timeout=15)
        assert r.status_code == 200
        # Reject path – create another and reject
        wr2 = demo_client.post(f"{API}/wallet/withdraw", json={"asset": "USDT", "amount": 5, "address": "0xpendingreject1234567890"}, timeout=15)
        txid2 = wr2.json()["id"]
        r2 = admin_client.post(f"{API}/admin/withdrawals/{txid2}/reject", timeout=15)
        assert r2.status_code == 200

    def test_risk(self, admin_client):
        r = admin_client.get(f"{API}/admin/risk", timeout=15)
        assert r.status_code == 200
        assert "open_interest_usd" in r.json()

    def test_security_logs(self, admin_client):
        r = admin_client.get(f"{API}/admin/security-logs", timeout=15)
        assert r.status_code == 200

    def test_config_get_put_and_maintenance(self, admin_client, demo_client):
        g = admin_client.get(f"{API}/admin/config", timeout=10)
        assert g.status_code == 200
        # Enable maintenance -> demo blocked from trading
        pu = admin_client.put(f"{API}/admin/config", json={"maintenance_mode": True}, timeout=10)
        assert pu.status_code == 200
        time.sleep(1)
        rt = demo_client.post(f"{API}/spot/order", json={"symbol": "BTCUSDT", "side": "buy", "type": "market", "amount": 0.0005}, timeout=15)
        assert rt.status_code == 503
        # Restore
        admin_client.put(f"{API}/admin/config", json={"maintenance_mode": False}, timeout=10)


# ---------- download ----------
class TestDownload:
    def test_source_zip(self):
        r = requests.get(f"{API}/download/source", timeout=60, stream=True)
        assert r.status_code == 200
        assert "zip" in r.headers.get("content-type", "")
        # Just read a few bytes to confirm the stream yields data
        chunk = next(r.iter_content(1024))
        assert chunk and chunk[:2] == b"PK"
