# Bitlora Pro

Crypto exchange platform: web exchange, mobile app screens (iPhone frames) and an admin panel.
Live market data comes from the Binance public API, with market caps from CoinGecko. Trading uses paper funds.

## Stack
- Backend: FastAPI + MongoDB (motor), in `backend/`
- Frontend: React (CRA + craco), Tailwind, shadcn/ui, lightweight-charts, recharts, in `frontend/`

## Run locally
Requirements: Python 3.11+, Node 18+, Yarn 1.x, MongoDB 6+

```bash
# backend
cd backend
cp .env.example .env        # fill JWT_SECRET, ADMIN_*, DEMO_* (EMERGENT_EMAIL_KEY is optional, see below)
pip install -r requirements.txt
uvicorn server:app --host 0.0.0.0 --port 8001 --reload

# frontend
cd frontend
cp .env.example .env        # REACT_APP_BACKEND_URL=http://localhost:8001
yarn install
yarn start                  # http://localhost:3000
```

`emergentintegrations` in requirements.txt comes from the Emergent package index. Install it with
`pip install emergentintegrations --extra-index-url https://d33sy5i8bnduwe.cloudfront.net/simple/` or remove it, because the app does not import it.

Email (password reset and verification codes) goes through Bitlora Pro's managed email proxy (`backend/emailer.py`).
Outside Bitlora Pro, replace `send_email()` with your own provider (Resend, SendGrid or SMTP).

## Routes
- `/` landing, `/markets`, `/trade/:symbol`, `/futures/:symbol`, `/account/:section`
- `/login`, `/register`, `/forgot-password`, `/reset-password`
- `/mobile`: the 10 interactive iPhone screens
- `/admin`: dashboard, users, treasury, risk, security, settings (needs the admin role)

## Backend modules
- `core.py`: database, JWT auth, platform config, audit log
- `market.py`: Binance/CoinGecko proxy with caching
- `trading.py`: wallet, spot and futures trading, and the matching/liquidation engine (runs every 3s)
- `auth.py`, `account.py`: auth, 2FA (TOTP), API keys, KYC, VIP, watchlist
- `admin.py`: admin APIs
- `emailer.py`: transactional email
- `server.py`: app setup, seeding, `/api/download/source`
