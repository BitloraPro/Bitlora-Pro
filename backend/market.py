import asyncio
import json
import time
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, HTTPException

from core import db

BINANCE = "https://data-api.binance.vision/api/v3"
COINGECKO = "https://api.coingecko.com/api/v3"

COINS = [
    ("BTC", "Bitcoin", "bitcoin", ["layer1"]),
    ("ETH", "Ethereum", "ethereum", ["layer1"]),
    ("BNB", "BNB", "binancecoin", ["layer1"]),
    ("SOL", "Solana", "solana", ["layer1"]),
    ("XRP", "XRP", "ripple", ["layer1"]),
    ("DOGE", "Dogecoin", "dogecoin", ["meme"]),
    ("ADA", "Cardano", "cardano", ["layer1"]),
    ("TRX", "TRON", "tron", ["layer1"]),
    ("AVAX", "Avalanche", "avalanche-2", ["layer1"]),
    ("LINK", "Chainlink", "chainlink", ["defi"]),
    ("DOT", "Polkadot", "polkadot", ["layer1"]),
    ("TON", "Toncoin", "the-open-network", ["layer1"]),
    ("LTC", "Litecoin", "litecoin", ["layer1"]),
    ("BCH", "Bitcoin Cash", "bitcoin-cash", ["layer1"]),
    ("NEAR", "NEAR Protocol", "near", ["layer1", "ai"]),
    ("UNI", "Uniswap", "uniswap", ["defi"]),
    ("APT", "Aptos", "aptos", ["layer1"]),
    ("SUI", "Sui", "sui", ["layer1"]),
    ("ARB", "Arbitrum", "arbitrum", ["layer2"]),
    ("OP", "Optimism", "optimism", ["layer2"]),
    ("ATOM", "Cosmos", "cosmos", ["layer1"]),
    ("FIL", "Filecoin", "filecoin", ["defi"]),
    ("INJ", "Injective", "injective-protocol", ["defi"]),
    ("FET", "Artificial Superintelligence", "fetch-ai", ["ai"]),
    ("RENDER", "Render", "render-token", ["ai"]),
    ("SHIB", "Shiba Inu", "shiba-inu", ["meme"]),
    ("PEPE", "Pepe", "pepe", ["meme"]),
    ("FLOKI", "Floki", "floki", ["meme"]),
    ("BONK", "Bonk", "bonk", ["meme"]),
    ("WIF", "dogwifhat", "dogwifcoin", ["meme"]),
]
COIN_META = {c[0]: {"name": c[1], "cg_id": c[2], "categories": c[3]} for c in COINS}
FUTURES_BASES = {"BTC", "ETH", "BNB", "SOL", "XRP", "DOGE", "ADA", "TRX", "AVAX", "LINK", "DOT", "TON", "LTC", "BCH", "NEAR", "SUI", "ARB", "OP", "PEPE", "WIF"}
SYMBOLS = [f"{c[0]}USDT" for c in COINS]
NEW_LISTINGS = {"WIF", "RENDER", "SUI", "TON", "BONK"}
INTERVALS = {"1m", "5m", "15m", "30m", "1h", "4h", "1d", "1w"}

router = APIRouter(prefix="/api/market", tags=["market"])
_cache: dict = {}
_client: httpx.AsyncClient | None = None
_lock = asyncio.Lock()


def http() -> httpx.AsyncClient:
    global _client
    if _client is None:
        _client = httpx.AsyncClient(timeout=10)
    return _client


async def cached(key: str, ttl: float, fetch):
    hit = _cache.get(key)
    if hit and time.time() - hit[0] < ttl:
        return hit[1]
    try:
        data = await fetch()
        _cache[key] = (time.time(), data)
        return data
    except Exception as exc:
        if hit:
            return hit[1]
        raise HTTPException(status_code=502, detail=f"Market data unavailable: {exc}")


async def _binance(path: str, params: dict):
    r = await http().get(f"{BINANCE}{path}", params=params)
    r.raise_for_status()
    return r.json()


async def _market_caps():
    async def fetch():
        ids = ",".join(m["cg_id"] for m in COIN_META.values())
        r = await http().get(f"{COINGECKO}/coins/markets", params={"vs_currency": "usd", "ids": ids, "per_page": 100})
        r.raise_for_status()
        by_id = {c["id"]: c for c in r.json()}
        return {b: {"market_cap": by_id.get(m["cg_id"], {}).get("market_cap"), "circulating": by_id.get(m["cg_id"], {}).get("circulating_supply")} for b, m in COIN_META.items()}
    try:
        return await cached("mcap", 600, fetch)
    except HTTPException:
        return {}


async def get_tickers() -> list[dict]:
    async def fetch():
        raw = await _binance("/ticker/24hr", {"symbols": json.dumps(SYMBOLS, separators=(",", ":"))})
        return raw
    raw = await cached("tickers", 2.5, fetch)
    caps = await _market_caps()
    out = []
    for t in raw:
        base = t["symbol"][:-4]
        meta = COIN_META[base]
        cats = list(meta["categories"])
        if base in NEW_LISTINGS:
            cats.append("new")
        out.append({
            "symbol": t["symbol"], "base": base, "quote": "USDT", "name": meta["name"],
            "price": float(t["lastPrice"]), "change": float(t["priceChangePercent"]),
            "change_abs": float(t["priceChange"]), "high": float(t["highPrice"]), "low": float(t["lowPrice"]),
            "open": float(t["openPrice"]), "weighted_avg": float(t["weightedAvgPrice"]),
            "volume": float(t["volume"]), "quote_volume": float(t["quoteVolume"]), "trades": t["count"],
            "categories": cats, "futures": base in FUTURES_BASES,
            "market_cap": caps.get(base, {}).get("market_cap"),
        })
    out.sort(key=lambda x: x["market_cap"] or x["quote_volume"] / 10, reverse=True)
    return out


async def price_map() -> dict[str, float]:
    return {t["symbol"]: t["price"] for t in await get_tickers()}


async def get_price(symbol: str) -> float:
    prices = await price_map()
    if symbol not in prices:
        raise HTTPException(status_code=400, detail=f"Unsupported symbol {symbol}")
    return prices[symbol]


async def usd_prices() -> dict[str, float]:
    p = {s[:-4]: v for s, v in (await price_map()).items()}
    p["USDT"] = 1.0
    return p


def check_symbol(symbol: str) -> str:
    symbol = symbol.upper()
    if symbol not in SYMBOLS:
        raise HTTPException(status_code=400, detail=f"Unsupported symbol {symbol}")
    return symbol


@router.get("/tickers")
async def tickers():
    return await get_tickers()


@router.get("/ticker/{symbol}")
async def ticker(symbol: str):
    symbol = check_symbol(symbol)
    return next(t for t in await get_tickers() if t["symbol"] == symbol)


@router.get("/sparklines")
async def sparklines():
    async def fetch():
        async def one(sym):
            rows = await _binance("/klines", {"symbol": sym, "interval": "1h", "limit": 24})
            return sym, [float(r[4]) for r in rows]
        results = await asyncio.gather(*[one(s) for s in SYMBOLS], return_exceptions=True)
        return {s: v for s, v in (r for r in results if not isinstance(r, Exception))}
    return await cached("sparklines", 300, fetch)


@router.get("/klines")
async def klines(symbol: str, interval: str = "15m", limit: int = 300):
    symbol = check_symbol(symbol)
    if interval not in INTERVALS:
        raise HTTPException(status_code=400, detail="Invalid interval")
    limit = max(10, min(limit, 1000))

    async def fetch():
        rows = await _binance("/klines", {"symbol": symbol, "interval": interval, "limit": limit})
        return [{"time": r[0] // 1000, "open": float(r[1]), "high": float(r[2]), "low": float(r[3]), "close": float(r[4]), "volume": float(r[5])} for r in rows]
    return await cached(f"k:{symbol}:{interval}:{limit}", 4, fetch)


@router.get("/depth")
async def depth(symbol: str, limit: int = 20):
    symbol = check_symbol(symbol)
    limit = 50 if limit > 20 else 20

    async def fetch():
        d = await _binance("/depth", {"symbol": symbol, "limit": limit})
        conv = lambda rows: [[float(p), float(q)] for p, q in rows]
        return {"bids": conv(d["bids"]), "asks": conv(d["asks"]), "ts": int(time.time() * 1000)}
    return await cached(f"d:{symbol}:{limit}", 1.5, fetch)


@router.get("/trades")
async def trades(symbol: str, limit: int = 30):
    symbol = check_symbol(symbol)

    async def fetch():
        rows = await _binance("/trades", {"symbol": symbol, "limit": min(limit, 100)})
        return [{"id": r["id"], "price": float(r["price"]), "qty": float(r["qty"]), "time": r["time"], "side": "sell" if r["isBuyerMaker"] else "buy"} for r in reversed(rows)]
    return await cached(f"t:{symbol}:{limit}", 2, fetch)


@router.get("/stats")
async def stats():
    tk = await get_tickers()

    async def fetch_global():
        r = await http().get(f"{COINGECKO}/global")
        r.raise_for_status()
        d = r.json()["data"]
        return {"total_market_cap": d["total_market_cap"]["usd"], "market_cap_change": d["market_cap_change_percentage_24h_usd"], "btc_dominance": d["market_cap_percentage"]["btc"]}
    try:
        g = await cached("global", 600, fetch_global)
    except HTTPException:
        g = {"total_market_cap": sum(t["market_cap"] or 0 for t in tk), "market_cap_change": None, "btc_dominance": None}
    users = await db.users.count_documents({})
    return {
        **g,
        "volume_24h": sum(t["quote_volume"] for t in tk),
        "pairs": len(tk),
        "futures_pairs": sum(1 for t in tk if t["futures"]),
        "gainers": sum(1 for t in tk if t["change"] > 0),
        "losers": sum(1 for t in tk if t["change"] < 0),
        "platform_users": users,
    }


@router.get("/futures/{symbol}")
async def futures_info(symbol: str):
    symbol = check_symbol(symbol)
    t = next(x for x in await get_tickers() if x["symbol"] == symbol)
    premium = (t["price"] - t["weighted_avg"]) / t["weighted_avg"] if t["weighted_avg"] else 0
    funding = max(-0.0075, min(0.0075, 0.0001 + premium * 0.1))
    oi = 0.0
    async for p in db.positions.find({"symbol": symbol, "status": "open"}, {"size": 1}):
        oi += p["size"]
    now_s = int(time.time())
    next_funding = (now_s // 28800 + 1) * 28800
    return {
        "symbol": symbol, "mark_price": t["price"], "index_price": t["weighted_avg"], "funding_rate": funding,
        "next_funding_time": datetime.fromtimestamp(next_funding, tz=timezone.utc).isoformat(),
        "open_interest": oi, "open_interest_usd": oi * t["price"], "change": t["change"],
        "high": t["high"], "low": t["low"], "quote_volume": t["quote_volume"],
    }


async def ping_binance() -> float:
    start = time.time()
    r = await http().get(f"{BINANCE}/ping")
    r.raise_for_status()
    return (time.time() - start) * 1000
