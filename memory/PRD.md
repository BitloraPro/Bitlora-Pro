# Bitlora Pro — PRD

## Original Problem Statement
Build a complete, production-grade crypto exchange named "Bitlora Pro" (dark #0b0f19, orange #f59e0b, green #10b981, red #ef4444) matching the reference images: mobile app screens in iPhone frames (welcome, home, market tabs, spot trade, futures up to 20x, wallet, login/signup/forgot, side menu), a desktop web exchange (landing, markets, spot terminal, futures terminal, account & security), and an enterprise admin panel (dashboard, users/KYC, wallet & treasury, futures & risk, security/compliance/config). No placeholders; downloadable source package.

## User Choices
- Market data: Binance public API (data-api.binance.vision) + CoinGecko (market caps/global)
- Defaults applied: paper trading with real prices (10,000 USDT welcome bonus), JWT email/password auth with admin role, single app with routes, zip download served by the backend

## Architecture
- Backend FastAPI modules: core.py (db, auth helpers, config, audit log), market.py (Binance/CoinGecko proxy + cache), trading.py (wallet, spot, futures, matching/risk engine loop every 3s), auth.py, account.py (2FA TOTP, email verify, API keys, KYC, VIP, watchlist), admin.py, server.py (lifespan seeding, /api/download/source zip)
- Frontend React + react-query polling, lightweight-charts candles, recharts, shadcn
- Routes: / (landing), /markets, /trade/:symbol, /futures/:symbol, /account/:section, /login, /register, /forgot-password, /reset-password, /mobile (10 live iPhone frames), /admin/* (dashboard, users, treasury, risk, security, settings)

## Implemented (2026-10-09)
- All modules above, end to end. Backend 48/48 tests pass; frontend smoke flows pass (iteration_1)

- 2026-10-09: Real email delivery (Bitlora Pro managed Resend) for password reset links and email verification codes (backend/emailer.py)

## Known limitations
- Deposits are instant paper credits; withdrawals go to an admin approval queue (no on-chain broadcast)
- Futures mark price comes from Binance spot (Binance futures API is geo-blocked from the server); funding is derived from spot data
- Hot/cold split is a configurable ratio over custodial liabilities

## Backlog
- P1: WebSocket price streaming
- P1: Insurance fund / socialized loss accounting; rate limiting on register/forgot
- P2: Referral program, Earn products, CMS/announcements, support tickets, reports export
