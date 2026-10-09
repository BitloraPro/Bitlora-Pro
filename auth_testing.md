# Auth Testing Playbook (Bitlora Pro)
- Auth uses httpOnly cookies: login/register set `access_token` (15 min) and `refresh_token` (7 days), both Secure and SameSite=Lax. POST /api/auth/refresh issues a new access cookie and POST /api/auth/logout clears both. The browser frontend never stores tokens (no localStorage).
- API clients can still send `Authorization: Bearer <token>` (the login response includes `token` for programmatic use).
- Over plain-http localhost, curl will not overwrite Secure cookies on logout; test logout against the https preview URL.
- Users stored in `users` collection, bcrypt hashes start with `$2b$`.
- Indexes: users.email unique, login_attempts.identifier, password_reset_tokens.expires_at TTL.
- 5 failed logins per IP+email => 15 min lockout (HTTP 429).
- If 2FA enabled, login without `code` returns 401 detail "2FA_REQUIRED".
- Credentials: see /app/memory/test_credentials.md
