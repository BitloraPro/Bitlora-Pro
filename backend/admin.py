import time
from datetime import timedelta
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from core import DEFAULT_CONFIG, client, db, get_config, log_event, now, oid, require_admin, ser
from market import COIN_META, get_tickers, ping_binance, usd_prices
from trading import ENGINE, credit, enrich_positions

router = APIRouter(prefix="/api/admin", tags=["admin"], dependencies=[Depends(require_admin)])


class UserPatch(BaseModel):
    status: Optional[Literal["active", "suspended", "banned"]] = None
    kyc_status: Optional[Literal["unverified", "pending", "verified", "rejected"]] = None
    role: Optional[Literal["user", "vip", "admin"]] = None
    vip_override: Optional[int] = None


async def sum_field(coll, match: dict, field: str) -> float:
    rows = await coll.aggregate([{"$match": match}, {"$group": {"_id": None, "v": {"$sum": f"${field}"}}}]).to_list(1)
    return rows[0]["v"] if rows else 0.0


def pct(cur: float, prev: float) -> float:
    return ((cur - prev) / prev * 100) if prev else (100.0 if cur else 0.0)


@router.get("/stats")
async def stats(days: int = 30):
    t0, t1 = now() - timedelta(days=days), now() - timedelta(days=days * 2)
    cur, prev = {"created_at": {"$gte": t0}}, {"created_at": {"$gte": t1, "$lt": t0}}
    total_users = await db.users.count_documents({})
    new_users, prev_users = await db.users.count_documents(cur), await db.users.count_documents(prev)
    active = len(await db.trades.distinct("user_id", cur))
    prev_active = len(await db.trades.distinct("user_id", prev))
    out = {"total_users": total_users, "users_change": pct(new_users, prev_users), "active_traders": active, "active_change": pct(active, prev_active)}
    for key, coll, match, field in [
        ("deposits", db.transactions, {"type": "deposit"}, "usd_value"),
        ("withdrawals", db.transactions, {"type": "withdrawal", "status": "completed"}, "usd_value"),
        ("spot_volume", db.trades, {"market": "spot"}, "quote"),
        ("futures_volume", db.trades, {"market": "futures"}, "quote"),
        ("revenue", db.trades, {}, "fee_usd"),
    ]:
        c, p = await sum_field(coll, {**match, **cur}, field), await sum_field(coll, {**match, **prev}, field)
        out[key], out[f"{key}_change"] = c, pct(c, p)
    alerts = await db.risk_alerts.find({"status": "open"}).to_list(500)
    out["alerts"] = {"total": len(alerts), **{lvl: sum(1 for a in alerts if a["level"] == lvl) for lvl in ("high", "medium", "low")}}
    out["kyc_pending"] = await db.users.count_documents({"kyc_status": "pending"})
    out["pending_withdrawals"] = await db.transactions.count_documents({"type": "withdrawal", "status": "pending"})
    return out


@router.get("/volume")
async def volume(days: int = 30):
    since = now() - timedelta(days=days)
    rows = await db.trades.aggregate([
        {"$match": {"created_at": {"$gte": since}}},
        {"$group": {"_id": {"d": {"$dateToString": {"format": "%Y-%m-%d", "date": "$created_at"}}, "m": "$market"}, "v": {"$sum": "$quote"}, "f": {"$sum": "$fee_usd"}}},
    ]).to_list(1000)
    users = await db.users.aggregate([
        {"$match": {"created_at": {"$gte": since}}},
        {"$group": {"_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$created_at"}}, "n": {"$sum": 1}}},
    ]).to_list(1000)
    series = {}
    for i in range(days, -1, -1):
        d = (now() - timedelta(days=i)).strftime("%Y-%m-%d")
        series[d] = {"date": d, "spot": 0.0, "futures": 0.0, "revenue": 0.0, "new_users": 0}
    for r in rows:
        if r["_id"]["d"] in series:
            series[r["_id"]["d"]][r["_id"]["m"]] += r["v"]
            series[r["_id"]["d"]]["revenue"] += r["f"]
    for u in users:
        if u["_id"] in series:
            series[u["_id"]]["new_users"] = u["n"]
    return list(series.values())


@router.get("/health")
async def health():
    services = []
    age = time.time() - ENGINE["last_tick"]
    services.append({"name": "Matching Engine", "status": "healthy" if age < 10 else "down", "latency_ms": round(age * 1000), "detail": f"{ENGINE['ticks']} ticks · {ENGINE['fills']} fills"})
    t = time.time()
    try:
        await client.admin.command("ping")
        services.append({"name": "Database", "status": "healthy", "latency_ms": round((time.time() - t) * 1000), "detail": "MongoDB primary"})
    except Exception as exc:
        services.append({"name": "Database", "status": "down", "latency_ms": None, "detail": str(exc)[:80]})
    try:
        ms = await ping_binance()
        services.append({"name": "Market Data Feed", "status": "healthy" if ms < 1500 else "degraded", "latency_ms": round(ms), "detail": "Binance public API"})
    except Exception:
        services.append({"name": "Market Data Feed", "status": "down", "latency_ms": None, "detail": "Binance unreachable"})
    pending = await db.transactions.count_documents({"type": "withdrawal", "status": "pending"})
    services.append({"name": "Wallet System", "status": "healthy", "latency_ms": None, "detail": f"{pending} withdrawals pending"})
    services.append({"name": "API Server", "status": "healthy", "latency_ms": None, "detail": f"uptime {int((time.time() - ENGINE['started_at']) / 60)} min"})
    services.append({"name": "Risk Engine", "status": "healthy" if age < 10 else "down", "latency_ms": None, "detail": f"{ENGINE['liquidations']} liquidations this session"})
    services.append({"name": "Email Service", "status": "degraded", "latency_ms": None, "detail": "No email provider configured"})
    return services


@router.get("/activities")
async def activities(limit: int = 12):
    return ser(await db.security_logs.find({}).sort("created_at", -1).to_list(limit))


@router.get("/top-markets")
async def top_markets(market: Literal["spot", "futures"] = "spot"):
    rows = await db.trades.aggregate([{"$match": {"market": market}}, {"$group": {"_id": "$symbol", "v": {"$sum": "$quote"}, "n": {"$sum": 1}}}, {"$sort": {"v": -1}}]).to_list(10)
    tk = {t["symbol"]: t for t in await get_tickers()}
    return [{"symbol": r["_id"], "platform_volume": r["v"], "trades": r["n"], "price": tk.get(r["_id"], {}).get("price"), "change": tk.get(r["_id"], {}).get("change"),
             "global_volume": tk.get(r["_id"], {}).get("quote_volume")} for r in rows]


@router.get("/users")
async def users(q: Optional[str] = None, kyc_status: Optional[str] = None, status: Optional[str] = None, role: Optional[str] = None, page: int = 1, limit: int = 20):
    query: dict = {}
    if q:
        query["$or"] = [{"email": {"$regex": q, "$options": "i"}}, {"name": {"$regex": q, "$options": "i"}}]
        if q.isdigit():
            query["$or"].append({"uid": int(q)})
    for k, v in (("kyc_status", kyc_status), ("status", status), ("role", role)):
        if v:
            query[k] = v
    total = await db.users.count_documents(query)
    rows = await db.users.find(query).sort("created_at", -1).skip((page - 1) * limit).limit(limit).to_list(limit)
    counts = {"all": await db.users.count_documents({}), "kyc_pending": await db.users.count_documents({"kyc_status": "pending"}),
              "suspended": await db.users.count_documents({"status": "suspended"}), "banned": await db.users.count_documents({"status": "banned"})}
    return {"items": ser(rows), "total": total, "page": page, "pages": max(1, -(-total // limit)), "counts": counts}


@router.patch("/users/{user_id}")
async def patch_user(user_id: str, body: UserPatch, request: Request, admin: dict = Depends(require_admin)):
    upd = {k: v for k, v in body.model_dump().items() if v is not None}
    if not upd:
        raise HTTPException(status_code=400, detail="Nothing to update")
    if user_id == str(admin["_id"]) and (upd.get("status", "active") != "active" or upd.get("role", "admin") != "admin"):
        raise HTTPException(status_code=400, detail="You cannot restrict your own admin account")
    if upd.get("kyc_status") == "verified":
        upd["kyc_level"] = 2
    res = await db.users.find_one_and_update({"_id": oid(user_id)}, {"$set": upd})
    if not res:
        raise HTTPException(status_code=404, detail="User not found")
    await log_event("Admin Action", admin, f"Updated {res['email']}: {upd}", "success", request)
    return ser(await db.users.find_one({"_id": oid(user_id)}))


@router.get("/treasury")
async def treasury():
    cfg = await get_config()
    prices = await usd_prices()
    totals: dict = {}
    async for w in db.wallets.find({}):
        for acct in ("spot", "futures"):
            for asset, b in w.get(acct, {}).items():
                totals[asset] = totals.get(asset, 0) + b.get("free", 0) + b.get("locked", 0)
    ratio = cfg["hot_wallet_ratio"]
    assets = sorted([{"asset": a, "name": COIN_META.get(a, {}).get("name", "Tether USD"), "amount": v, "usd": v * prices.get(a, 0),
                      "hot": v * ratio, "cold": v * (1 - ratio)} for a, v in totals.items() if v > 1e-12], key=lambda x: x["usd"], reverse=True)
    total = sum(a["usd"] for a in assets)
    pend = await db.transactions.find({"type": "withdrawal", "status": "pending"}).to_list(500)
    return {"total_usd": total, "hot_usd": total * ratio, "cold_usd": total * (1 - ratio), "hot_ratio": ratio, "assets": assets,
            "pending_withdrawals_usd": sum(p["usd_value"] for p in pend), "pending_withdrawals_count": len(pend)}


@router.get("/transactions")
async def all_transactions(type: Optional[str] = None, status: Optional[str] = None, limit: int = 50):
    q = {k: v for k, v in (("type", type), ("status", status)) if v}
    return ser(await db.transactions.find(q).sort("created_at", -1).to_list(min(limit, 200)))


@router.post("/withdrawals/{tx_id}/{action}")
async def review_withdrawal(tx_id: str, action: Literal["approve", "reject"], request: Request, admin: dict = Depends(require_admin)):
    tx = await db.transactions.find_one_and_update({"_id": oid(tx_id), "type": "withdrawal", "status": "pending"},
                                                   {"$set": {"status": "completed" if action == "approve" else "rejected", "reviewed_by": admin["email"], "reviewed_at": now()}})
    if not tx:
        raise HTTPException(status_code=404, detail="Pending withdrawal not found")
    if action == "approve":
        await credit(tx["user_id"], "spot", tx["asset"], locked=-tx["amount"])
    else:
        await credit(tx["user_id"], "spot", tx["asset"], free=tx["amount"], locked=-tx["amount"])
    await log_event("Withdrawal Review", admin, f"{action} {tx['amount']} {tx['asset']} for {tx['email']}", "success", request)
    return {"ok": True}


@router.get("/risk")
async def risk():
    positions = await db.positions.find({"status": "open"}).to_list(1000)
    free = {}
    async for w in db.wallets.find({"user_id": {"$in": list({p["user_id"] for p in positions})}}):
        free[w["user_id"]] = w.get("futures", {}).get("USDT", {}).get("free", 0)
    enriched = await enrich_positions(positions, free)
    since = now() - timedelta(hours=24)
    liqs = await db.liquidations.find({}).sort("created_at", -1).to_list(100)
    alerts = await db.risk_alerts.find({}).sort("created_at", -1).to_list(100)
    for p in enriched:
        if p["risk"] == "high":
            alerts.insert(0, {"_id": f"live-{p['id']}", "level": "high", "type": "Margin Call", "status": "live", "created_at": now(),
                              "message": f"{p['email']} {p['side']} {p['symbol']} margin ratio {p['margin_ratio']:.1f}%"})
    adl = sorted([p for p in enriched if p["unrealized_pnl"] > 0], key=lambda p: p["roe"] * p["leverage"], reverse=True)
    return {"open_interest_usd": sum(p["notional"] for p in enriched), "positions_count": len(enriched),
            "long_usd": sum(p["notional"] for p in enriched if p["side"] == "long"), "short_usd": sum(p["notional"] for p in enriched if p["side"] == "short"),
            "unrealized_pnl": sum(p["unrealized_pnl"] for p in enriched),
            "liquidations_24h_usd": sum(lq["notional"] for lq in liqs if lq["created_at"].replace(tzinfo=since.tzinfo) >= since),
            "positions": sorted(enriched, key=lambda p: p["margin_ratio"], reverse=True), "liquidations": ser(liqs), "alerts": ser(alerts),
            "adl_queue": [{"id": p["id"], "email": p["email"], "symbol": p["symbol"], "side": p["side"], "roe": p["roe"], "leverage": p["leverage"], "rank": i + 1} for i, p in enumerate(adl[:20])]}


@router.post("/risk/alerts/{alert_id}/resolve")
async def resolve_alert(alert_id: str):
    res = await db.risk_alerts.update_one({"_id": oid(alert_id)}, {"$set": {"status": "resolved", "resolved_at": now()}})
    if not res.matched_count:
        raise HTTPException(status_code=404, detail="Alert not found")
    return {"ok": True}


@router.get("/config")
async def config():
    return await get_config()


@router.put("/config")
async def update_config(body: dict, request: Request, admin: dict = Depends(require_admin)):
    upd = {}
    for k, v in body.items():
        if k not in DEFAULT_CONFIG:
            continue
        default = DEFAULT_CONFIG[k]
        if isinstance(default, bool):
            upd[k] = bool(v)
        elif isinstance(default, (int, float)):
            upd[k] = type(default)(v)
            if upd[k] < 0:
                raise HTTPException(status_code=400, detail=f"{k} must be positive")
        else:
            upd[k] = str(v)
    if "hot_wallet_ratio" in upd and upd["hot_wallet_ratio"] > 1:
        raise HTTPException(status_code=400, detail="hot_wallet_ratio must be between 0 and 1")
    if "max_leverage" in upd and not 1 <= upd["max_leverage"] <= 125:
        raise HTTPException(status_code=400, detail="max_leverage must be 1-125")
    await db.config.update_one({"_id": "platform"}, {"$set": upd}, upsert=True)
    await log_event("Config Change", admin, ", ".join(f"{k}={v}" for k, v in upd.items()), "success", request)
    return await get_config()


@router.get("/security-logs")
async def security_logs(type: Optional[str] = None, status: Optional[str] = None, limit: int = 100):
    q = {k: v for k, v in (("type", type), ("status", status)) if v}
    rows = await db.security_logs.find(q).sort("created_at", -1).to_list(min(limit, 500))
    types = await db.security_logs.distinct("type")
    return {"items": ser(rows), "types": types}
