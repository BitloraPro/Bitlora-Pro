import asyncio
import hashlib
import logging
import secrets
import time
from typing import Literal, Optional

import pyotp
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from core import db, get_config, get_current_user, log_event, now, oid, require_trading, ser
from market import COIN_META, FUTURES_BASES, check_symbol, get_price, price_map, usd_prices

logger = logging.getLogger("trading")
router = APIRouter(prefix="/api", tags=["trading"])
MMR = 0.005
ASSETS = ["USDT"] + list(COIN_META.keys())
NETWORKS = {"USDT": ["TRC20", "ERC20", "BEP20"], "BTC": ["Bitcoin"], "ETH": ["ERC20", "Arbitrum"], "BNB": ["BEP20"], "SOL": ["Solana"]}
ENGINE = {"started_at": time.time(), "last_tick": 0.0, "ticks": 0, "fills": 0, "liquidations": 0, "errors": 0}


# ---------- balances ----------
async def ensure_wallet(uid: str):
    await db.wallets.update_one({"user_id": uid}, {"$setOnInsert": {"user_id": uid, "spot": {}, "futures": {}}}, upsert=True)


async def credit(uid: str, acct: str, asset: str, free: float = 0.0, locked: float = 0.0):
    await ensure_wallet(uid)
    await db.wallets.update_one({"user_id": uid}, {"$inc": {f"{acct}.{asset}.free": free, f"{acct}.{asset}.locked": locked}})


async def debit(uid: str, acct: str, asset: str, amount: float, to_locked: bool = False):
    await ensure_wallet(uid)
    inc = {f"{acct}.{asset}.free": -amount}
    if to_locked:
        inc[f"{acct}.{asset}.locked"] = amount
    res = await db.wallets.update_one({"user_id": uid, f"{acct}.{asset}.free": {"$gte": amount - 1e-9}}, {"$inc": inc})
    if res.modified_count == 0:
        raise HTTPException(status_code=400, detail=f"Insufficient {asset} balance in {acct} account")


async def balance(uid: str, acct: str, asset: str) -> tuple[float, float]:
    w = await db.wallets.find_one({"user_id": uid}) or {}
    b = w.get(acct, {}).get(asset, {})
    return b.get("free", 0.0), b.get("locked", 0.0)


async def add_tx(user: dict, kind: str, asset: str, amount: float, status: str = "completed", **extra):
    prices = await usd_prices()
    doc = {"user_id": str(user["_id"]), "email": user["email"], "type": kind, "asset": asset, "amount": amount,
           "usd_value": amount * prices.get(asset, 0), "status": status, "tx_hash": "0x" + secrets.token_hex(32),
           "created_at": now(), **extra}
    res = await db.transactions.insert_one(doc)
    return ser(await db.transactions.find_one({"_id": res.inserted_id}))


def deposit_address(uid: str, asset: str, network: str) -> str:
    h = hashlib.sha256(f"{uid}:{asset}:{network}".encode()).hexdigest()
    if network == "Bitcoin":
        return "bc1q" + h[:38]
    if network in ("TRC20",):
        return "T" + h[:33]
    if network == "Solana":
        return h[:44]
    return "0x" + h[:40]


# ---------- wallet endpoints ----------
class DepositIn(BaseModel):
    asset: str
    amount: float = Field(gt=0)
    network: Optional[str] = None


class WithdrawIn(DepositIn):
    address: str = Field(min_length=10)
    code: Optional[str] = None


class TransferIn(BaseModel):
    asset: str = "USDT"
    amount: float = Field(gt=0)
    from_account: Literal["spot", "futures"]
    to_account: Literal["spot", "futures"]


def check_asset(asset: str) -> str:
    asset = asset.upper()
    if asset not in ASSETS:
        raise HTTPException(status_code=400, detail=f"Unsupported asset {asset}")
    return asset


@router.get("/wallet")
async def get_wallet(user: dict = Depends(get_current_user)):
    uid = str(user["_id"])
    await ensure_wallet(uid)
    w = await db.wallets.find_one({"user_id": uid})
    prices = await usd_prices()
    tk = {s[:-4]: s for s in await price_map()}
    from market import get_tickers
    changes = {t["base"]: t["change"] for t in await get_tickers()}
    assets, total, change_usd = [], 0.0, 0.0
    for asset, b in w.get("spot", {}).items():
        amt = b.get("free", 0) + b.get("locked", 0)
        if amt <= 1e-12:
            continue
        usd = amt * prices.get(asset, 0)
        ch = changes.get(asset, 0.0)
        change_usd += usd - usd / (1 + ch / 100)
        total += usd
        assets.append({"asset": asset, "name": COIN_META.get(asset, {}).get("name", "Tether USD"), "free": b.get("free", 0),
                       "locked": b.get("locked", 0), "total": amt, "price": prices.get(asset, 0), "usd": usd, "change": ch, "tradable": asset in tk})
    assets.sort(key=lambda a: a["usd"], reverse=True)
    fut = w.get("futures", {}).get("USDT", {})
    upnl = 0.0
    async for p in db.positions.find({"user_id": uid, "status": "open"}):
        upnl += (prices.get(p["symbol"][:-4], p["entry_price"]) - p["entry_price"]) * p["size"] * (1 if p["side"] == "long" else -1)
    fut_equity = fut.get("free", 0) + fut.get("locked", 0) + upnl
    grand = total + fut_equity
    return {
        "spot": assets, "spot_usd": total,
        "futures": {"free": fut.get("free", 0), "locked": fut.get("locked", 0), "unrealized_pnl": upnl, "equity": fut_equity},
        "total_usd": grand, "total_btc": grand / prices["BTC"] if prices.get("BTC") else 0,
        "change_24h_usd": change_usd, "change_24h_pct": (change_usd / (total - change_usd) * 100) if total - change_usd > 0 else 0,
    }


@router.get("/wallet/address/{asset}")
async def get_address(asset: str, network: Optional[str] = None, user: dict = Depends(get_current_user)):
    asset = check_asset(asset)
    nets = NETWORKS.get(asset, ["BEP20"])
    net = network if network in nets else nets[0]
    return {"asset": asset, "network": net, "networks": nets, "address": deposit_address(str(user["_id"]), asset, net)}


@router.post("/wallet/deposit")
async def deposit(body: DepositIn, user: dict = Depends(require_trading)):
    asset = check_asset(body.asset)
    prices = await usd_prices()
    if body.amount * prices.get(asset, 0) > 1_000_000:
        raise HTTPException(status_code=400, detail="Single deposit cannot exceed $1,000,000")
    net = body.network or NETWORKS.get(asset, ["BEP20"])[0]
    await credit(str(user["_id"]), "spot", asset, free=body.amount)
    tx = await add_tx(user, "deposit", asset, body.amount, network=net, address=deposit_address(str(user["_id"]), asset, net), from_addr="External")
    return tx


@router.post("/wallet/withdraw")
async def withdraw(body: WithdrawIn, user: dict = Depends(require_trading)):
    asset = check_asset(body.asset)
    cfg = await get_config()
    if cfg["kyc_required_for_withdrawal"] and user.get("kyc_status") != "verified":
        raise HTTPException(status_code=403, detail="KYC verification required for withdrawals")
    if user.get("twofa_enabled"):
        if not body.code or not pyotp.TOTP(user["twofa_secret"]).verify(body.code, valid_window=1):
            raise HTTPException(status_code=400, detail="Invalid 2FA code")
    prices = await usd_prices()
    usd = body.amount * prices.get(asset, 0)
    since = now().replace(hour=0, minute=0, second=0, microsecond=0)
    used = 0.0
    async for t in db.transactions.find({"user_id": str(user["_id"]), "type": "withdrawal", "status": {"$ne": "rejected"}, "created_at": {"$gte": since}}):
        used += t["usd_value"]
    if used + usd > cfg["daily_withdraw_limit_usd"]:
        raise HTTPException(status_code=400, detail=f"Daily withdrawal limit of ${cfg['daily_withdraw_limit_usd']:,.0f} exceeded")
    await debit(str(user["_id"]), "spot", asset, body.amount, to_locked=True)
    tx = await add_tx(user, "withdrawal", asset, body.amount, status="pending", network=body.network or NETWORKS.get(asset, ["BEP20"])[0],
                      address=body.address, fee=body.amount * 0.001)
    await log_event("Withdrawal Request", user, f"{body.amount} {asset} to {body.address[:10]}…", "pending")
    return tx


@router.post("/wallet/transfer")
async def transfer(body: TransferIn, user: dict = Depends(require_trading)):
    if body.from_account == body.to_account:
        raise HTTPException(status_code=400, detail="Source and destination must differ")
    if body.asset.upper() != "USDT":
        raise HTTPException(status_code=400, detail="Only USDT can be transferred to futures")
    await debit(str(user["_id"]), body.from_account, "USDT", body.amount)
    await credit(str(user["_id"]), body.to_account, "USDT", free=body.amount)
    tx = await add_tx(user, "transfer", "USDT", body.amount, from_addr=body.from_account, address=body.to_account)
    return tx


@router.get("/wallet/transactions")
async def transactions(type: Optional[str] = None, limit: int = 50, user: dict = Depends(get_current_user)):
    q = {"user_id": str(user["_id"])}
    if type:
        q["type"] = type
    return ser(await db.transactions.find(q).sort("created_at", -1).to_list(min(limit, 200)))


# ---------- spot ----------
class SpotOrderIn(BaseModel):
    symbol: str
    side: Literal["buy", "sell"]
    type: Literal["limit", "market", "stop_limit"]
    amount: float = Field(gt=0)
    price: Optional[float] = Field(default=None, gt=0)
    stop_price: Optional[float] = Field(default=None, gt=0)


async def record_trade(uid, order_id, symbol, side, price, amount, fee, fee_asset, market, pnl=None, email=None):
    await db.trades.insert_one({"user_id": uid, "email": email, "order_id": order_id, "symbol": symbol, "side": side, "price": price,
                                "amount": amount, "quote": price * amount, "fee": fee, "fee_asset": fee_asset,
                                "fee_usd": fee if fee_asset == "USDT" else fee * price, "market": market, "realized_pnl": pnl, "created_at": now()})


async def fill_spot(order: dict, exec_price: float, fee_rate: float, locked: bool):
    uid, base, amt = order["user_id"], order["base"], order["amount"]
    if order["side"] == "buy":
        cost = amt * exec_price
        if locked:
            reserved = amt * order["price"]
            await credit(uid, "spot", "USDT", free=reserved - cost, locked=-reserved)
        fee = amt * fee_rate
        await credit(uid, "spot", base, free=amt - fee)
        fee_asset = base
    else:
        if locked:
            await credit(uid, "spot", base, locked=-amt)
        fee = amt * exec_price * fee_rate
        await credit(uid, "spot", "USDT", free=amt * exec_price - fee)
        fee_asset = "USDT"
    await db.orders.update_one({"_id": order["_id"]}, {"$set": {"status": "filled", "filled": amt, "avg_price": exec_price, "fee": fee, "fee_asset": fee_asset, "updated_at": now()}})
    await record_trade(uid, str(order["_id"]), order["symbol"], order["side"], exec_price, amt, fee, fee_asset, "spot", email=order.get("email"))
    ENGINE["fills"] += 1


def validate_spot(body: SpotOrderIn, last: float):
    if body.type != "market" and not body.price:
        raise HTTPException(status_code=400, detail="Price is required for limit orders")
    if body.type == "stop_limit" and not body.stop_price:
        raise HTTPException(status_code=400, detail="Stop price is required")
    if body.amount * (body.price or last) < 1:
        raise HTTPException(status_code=400, detail="Minimum order value is 1 USDT")


def is_marketable(body: SpotOrderIn, last: float) -> bool:
    if body.type == "market":
        return True
    return body.type == "limit" and ((body.side == "buy" and body.price >= last) or (body.side == "sell" and body.price <= last))


async def reserve_spot(uid: str, base: str, body: SpotOrderIn, price: float, lock: bool):
    if body.side == "buy":
        await debit(uid, "spot", "USDT", body.amount * price, to_locked=lock)
    else:
        await debit(uid, "spot", base, body.amount, to_locked=lock)


@router.post("/spot/order")
async def place_spot(body: SpotOrderIn, user: dict = Depends(require_trading)):
    symbol = check_symbol(body.symbol)
    base, uid = symbol[:-4], str(user["_id"])
    cfg = await get_config()
    last = await get_price(symbol)
    validate_spot(body, last)
    order = {"user_id": uid, "email": user["email"], "symbol": symbol, "base": base, "side": body.side, "type": body.type,
             "price": body.price if body.type != "market" else last, "stop_price": body.stop_price, "amount": body.amount,
             "filled": 0.0, "avg_price": None, "status": "open", "triggered": body.type != "stop_limit", "created_at": now(), "updated_at": now()}
    marketable = is_marketable(body, last)
    await reserve_spot(uid, base, body, last if marketable else body.price, lock=not marketable)
    res = await db.orders.insert_one(order)
    order["_id"] = res.inserted_id
    if marketable:
        await fill_spot(order, last, cfg["spot_taker_fee"], locked=False)
    return ser(await db.orders.find_one({"_id": order["_id"]}))


@router.delete("/spot/order/{order_id}")
async def cancel_spot(order_id: str, user: dict = Depends(get_current_user)):
    o = await db.orders.find_one_and_update({"_id": oid(order_id), "user_id": str(user["_id"]), "status": "open"},
                                            {"$set": {"status": "canceled", "updated_at": now()}})
    if not o:
        raise HTTPException(status_code=404, detail="Open order not found")
    if o["side"] == "buy":
        reserved = o["amount"] * o["price"]
        await credit(o["user_id"], "spot", "USDT", free=reserved, locked=-reserved)
    else:
        await credit(o["user_id"], "spot", o["base"], free=o["amount"], locked=-o["amount"])
    return {"ok": True}


@router.get("/spot/orders")
async def spot_orders(status: str = "open", symbol: Optional[str] = None, user: dict = Depends(get_current_user)):
    q = {"user_id": str(user["_id"]), "status": "open" if status == "open" else {"$ne": "open"}}
    if symbol:
        q["symbol"] = symbol.upper()
    return ser(await db.orders.find(q).sort("created_at", -1).to_list(100))


@router.get("/spot/trades")
async def my_trades(market: str = "spot", user: dict = Depends(get_current_user)):
    return ser(await db.trades.find({"user_id": str(user["_id"]), "market": market}).sort("created_at", -1).to_list(100))


# ---------- futures ----------
class FuturesOrderIn(BaseModel):
    symbol: str
    side: Literal["long", "short"]
    type: Literal["limit", "market"] = "market"
    size: float = Field(gt=0)
    leverage: int = Field(ge=1, le=125)
    margin_mode: Literal["cross", "isolated"] = "cross"
    price: Optional[float] = Field(default=None, gt=0)
    tp: Optional[float] = Field(default=None, gt=0)
    sl: Optional[float] = Field(default=None, gt=0)
    reduce_only: bool = False


class TpSlIn(BaseModel):
    tp: Optional[float] = None
    sl: Optional[float] = None


def direction(side: str) -> int:
    return 1 if side == "long" else -1


def liq_price(p: dict, free_balance: float) -> float:
    margin = p["margin"] + (free_balance if p["margin_mode"] == "cross" else 0)
    buffer = (margin - p["entry_price"] * p["size"] * MMR) / p["size"]
    return max(0.0, p["entry_price"] - buffer * direction(p["side"]))


async def open_or_adjust(user_id: str, email: str, symbol: str, side: str, size: float, price: float, leverage: int, mode: str,
                         tp=None, sl=None, reduce_only=False):
    cfg = await get_config()
    fee = size * price * cfg["futures_fee"]
    existing = await db.positions.find_one({"user_id": user_id, "symbol": symbol, "status": "open"})
    remaining = size
    if existing and existing["side"] != side:
        reduce = min(size, existing["size"])
        await close_position(existing, price, reduce)
        remaining = size - reduce
    elif reduce_only:
        raise HTTPException(status_code=400, detail="Reduce-only order would increase position")
    if reduce_only or remaining <= 1e-12:
        return
    margin = remaining * price / leverage
    await debit(user_id, "futures", "USDT", margin + fee)
    await credit(user_id, "futures", "USDT", locked=margin)
    existing = await db.positions.find_one({"user_id": user_id, "symbol": symbol, "status": "open"})
    if existing:
        new_size = existing["size"] + remaining
        entry = (existing["entry_price"] * existing["size"] + price * remaining) / new_size
        upd = {"size": new_size, "entry_price": entry, "margin": existing["margin"] + margin, "updated_at": now()}
        if tp:
            upd["tp"] = tp
        if sl:
            upd["sl"] = sl
        await db.positions.update_one({"_id": existing["_id"]}, {"$set": upd})
    else:
        await db.positions.insert_one({"user_id": user_id, "email": email, "symbol": symbol, "side": side, "size": remaining, "entry_price": price,
                                       "leverage": leverage, "margin_mode": mode, "margin": margin, "tp": tp, "sl": sl, "status": "open",
                                       "realized_pnl": 0.0, "created_at": now(), "updated_at": now()})
    await record_trade(user_id, None, symbol, "buy" if side == "long" else "sell", price, remaining, fee, "USDT", "futures", email=email)


async def close_position(p: dict, price: float, size: Optional[float] = None, status: str = "closed"):
    cfg = await get_config()
    size = min(size or p["size"], p["size"])
    part = size / p["size"]
    margin_part = p["margin"] * part
    pnl = (price - p["entry_price"]) * size * direction(p["side"])
    fee = size * price * cfg["futures_fee"] if status != "liquidated" else 0
    payout = margin_part + pnl - fee
    if status == "liquidated":
        payout = max(0.0, payout)
    await credit(p["user_id"], "futures", "USDT", free=payout, locked=-margin_part)
    if payout < 0:
        await db.wallets.update_one({"user_id": p["user_id"]}, {"$max": {"futures.USDT.free": 0.0}})
    remaining = p["size"] - size
    if remaining <= 1e-12:
        await db.positions.update_one({"_id": p["_id"]}, {"$set": {"status": status, "close_price": price, "closed_at": now(),
                                                                    "realized_pnl": p.get("realized_pnl", 0) + pnl - fee}})
    else:
        await db.positions.update_one({"_id": p["_id"]}, {"$set": {"size": remaining, "margin": p["margin"] - margin_part, "updated_at": now()},
                                                          "$inc": {"realized_pnl": pnl - fee}})
    await record_trade(p["user_id"], str(p["_id"]), p["symbol"], "sell" if p["side"] == "long" else "buy", price, size, fee, "USDT", "futures", pnl=pnl - fee, email=p.get("email"))
    return pnl


@router.post("/futures/order")
async def place_futures(body: FuturesOrderIn, user: dict = Depends(require_trading)):
    symbol = check_symbol(body.symbol)
    if symbol[:-4] not in FUTURES_BASES:
        raise HTTPException(status_code=400, detail=f"{symbol} perpetual is not listed")
    cfg = await get_config()
    if body.leverage > cfg["max_leverage"]:
        raise HTTPException(status_code=400, detail=f"Maximum leverage is {cfg['max_leverage']}x")
    uid = str(user["_id"])
    last = await get_price(symbol)
    if body.size * last < 5:
        raise HTTPException(status_code=400, detail="Minimum notional is 5 USDT")
    if body.type == "market" or (body.side == "long" and body.price >= last) or (body.side == "short" and body.price <= last):
        await open_or_adjust(uid, user["email"], symbol, body.side, body.size, last, body.leverage, body.margin_mode, body.tp, body.sl, body.reduce_only)
        return {"status": "filled", "price": last}
    if not body.price:
        raise HTTPException(status_code=400, detail="Price is required for limit orders")
    reserve = body.size * body.price / body.leverage
    await debit(uid, "futures", "USDT", reserve, to_locked=True)
    doc = {**body.model_dump(), "symbol": symbol, "user_id": uid, "email": user["email"], "reserved": reserve, "status": "open", "created_at": now()}
    res = await db.futures_orders.insert_one(doc)
    return ser(await db.futures_orders.find_one({"_id": res.inserted_id}))


@router.delete("/futures/order/{order_id}")
async def cancel_futures(order_id: str, user: dict = Depends(get_current_user)):
    o = await db.futures_orders.find_one_and_update({"_id": oid(order_id), "user_id": str(user["_id"]), "status": "open"}, {"$set": {"status": "canceled"}})
    if not o:
        raise HTTPException(status_code=404, detail="Open order not found")
    await credit(o["user_id"], "futures", "USDT", free=o["reserved"], locked=-o["reserved"])
    return {"ok": True}


@router.get("/futures/orders")
async def futures_orders(status: str = "open", user: dict = Depends(get_current_user)):
    q = {"user_id": str(user["_id"]), "status": "open" if status == "open" else {"$ne": "open"}}
    return ser(await db.futures_orders.find(q).sort("created_at", -1).to_list(100))


async def enrich_positions(positions: list[dict], free_by_user: dict) -> list[dict]:
    prices = await price_map()
    out = []
    for p in positions:
        mark = prices.get(p["symbol"], p["entry_price"])
        pnl = (mark - p["entry_price"]) * p["size"] * direction(p["side"])
        free = free_by_user.get(p["user_id"], 0.0)
        equity = p["margin"] + pnl + (free if p["margin_mode"] == "cross" else 0)
        maint = mark * p["size"] * MMR
        ratio = maint / equity * 100 if equity > 0 else 100.0
        out.append({**ser(p), "mark_price": mark, "unrealized_pnl": pnl, "roe": pnl / p["margin"] * 100 if p["margin"] else 0,
                    "notional": mark * p["size"], "liq_price": liq_price(p, free), "margin_ratio": ratio,
                    "risk": "high" if ratio > 60 else "medium" if ratio > 25 else "low"})
    return out


@router.get("/futures/positions")
async def positions(user: dict = Depends(get_current_user)):
    uid = str(user["_id"])
    free, _ = await balance(uid, "futures", "USDT")
    return await enrich_positions(await db.positions.find({"user_id": uid, "status": "open"}).to_list(100), {uid: free})


@router.get("/futures/history")
async def position_history(user: dict = Depends(get_current_user)):
    return ser(await db.positions.find({"user_id": str(user["_id"]), "status": {"$ne": "open"}}).sort("closed_at", -1).to_list(100))


@router.post("/futures/position/{pos_id}/close")
async def close_pos(pos_id: str, size: Optional[float] = None, user: dict = Depends(require_trading)):
    p = await db.positions.find_one({"_id": oid(pos_id), "user_id": str(user["_id"]), "status": "open"})
    if not p:
        raise HTTPException(status_code=404, detail="Position not found")
    price = await get_price(p["symbol"])
    pnl = await close_position(p, price, size)
    return {"ok": True, "price": price, "pnl": pnl}


@router.put("/futures/position/{pos_id}/tpsl")
async def set_tpsl(pos_id: str, body: TpSlIn, user: dict = Depends(get_current_user)):
    res = await db.positions.update_one({"_id": oid(pos_id), "user_id": str(user["_id"]), "status": "open"}, {"$set": {"tp": body.tp, "sl": body.sl}})
    if not res.matched_count:
        raise HTTPException(status_code=404, detail="Position not found")
    return {"ok": True}


# ---------- matching / risk engine ----------
def spot_triggered(o: dict, last: float) -> bool:
    return last >= o["stop_price"] if o["side"] == "buy" else last <= o["stop_price"]


def limit_crossed(side: str, limit: float, last: float) -> bool:
    return last <= limit if side in ("buy", "long") else last >= limit


async def match_spot_orders(prices: dict, maker_fee: float):
    async for o in db.orders.find({"status": "open"}):
        last = prices.get(o["symbol"])
        if not last:
            continue
        if not o["triggered"]:
            if not spot_triggered(o, last):
                continue
            await db.orders.update_one({"_id": o["_id"]}, {"$set": {"triggered": True}})
        if limit_crossed(o["side"], o["price"], last):
            claimed = await db.orders.find_one_and_update({"_id": o["_id"], "status": "open"}, {"$set": {"status": "filling"}})
            if claimed:
                await fill_spot(o, o["price"], maker_fee, locked=True)


async def match_futures_orders(prices: dict):
    async for o in db.futures_orders.find({"status": "open"}):
        last = prices.get(o["symbol"])
        if not last or not limit_crossed(o["side"], o["price"], last):
            continue
        claimed = await db.futures_orders.find_one_and_update({"_id": o["_id"], "status": "open"}, {"$set": {"status": "filled", "filled_at": now()}})
        if not claimed:
            continue
        await credit(o["user_id"], "futures", "USDT", free=o["reserved"], locked=-o["reserved"])
        try:
            await open_or_adjust(o["user_id"], o["email"], o["symbol"], o["side"], o["size"], o["price"], o["leverage"], o["margin_mode"], o.get("tp"), o.get("sl"), o.get("reduce_only"))
        except HTTPException as exc:
            await db.futures_orders.update_one({"_id": o["_id"]}, {"$set": {"status": "rejected", "reason": exc.detail}})


async def liquidate(p: dict, mark: float):
    pnl = await close_position(p, mark, status="liquidated")
    ENGINE["liquidations"] += 1
    await db.liquidations.insert_one({"user_id": p["user_id"], "email": p.get("email"), "symbol": p["symbol"], "side": p["side"], "size": p["size"],
                                      "entry_price": p["entry_price"], "liq_price": mark, "leverage": p["leverage"], "loss": pnl,
                                      "notional": p["size"] * mark, "created_at": now()})
    await db.risk_alerts.insert_one({"level": "high", "type": "Liquidation", "message": f"{p.get('email')} {p['side']} {p['symbol']} {p['leverage']}x liquidated at {mark:,.4f}",
                                     "status": "open", "created_at": now()})


def target_hit(p: dict, mark: float) -> bool:
    d = direction(p["side"])
    tp_hit = p.get("tp") and (mark - p["tp"]) * d >= 0
    sl_hit = p.get("sl") and (mark - p["sl"]) * d <= 0
    return bool(tp_hit or sl_hit)


async def check_positions(prices: dict):
    async for p in db.positions.find({"status": "open"}):
        mark = prices.get(p["symbol"])
        if not mark:
            continue
        free, _ = await balance(p["user_id"], "futures", "USDT")
        if (mark - liq_price(p, free)) * direction(p["side"]) <= 0:
            await liquidate(p, mark)
        elif target_hit(p, mark):
            await close_position(p, mark)


async def engine_tick():
    prices = await price_map()
    cfg = await get_config()
    await match_spot_orders(prices, cfg["spot_maker_fee"])
    await match_futures_orders(prices)
    await check_positions(prices)


async def engine_loop():
    while True:
        try:
            await engine_tick()
            ENGINE["last_tick"] = time.time()
            ENGINE["ticks"] += 1
        except Exception as exc:
            ENGINE["errors"] += 1
            logger.warning("engine tick failed: %s", exc)
        await asyncio.sleep(3)
