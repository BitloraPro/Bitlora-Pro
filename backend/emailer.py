import ipaddress
import logging
import os
import re
from html import escape
from html.parser import HTMLParser
from urllib.parse import urlparse

import httpx
from fastapi import HTTPException

logger = logging.getLogger("email")
EMAIL_BASE_URL = "https://integrations.emergentagent.com"
EMAIL_KEY = os.environ["EMERGENT_EMAIL_KEY"]
EMAIL_FROM_NAME = os.environ["EMAIL_FROM_NAME"]
EMAIL_REPLY_TO = os.environ.get("EMAIL_REPLY_TO")
FRONTEND_URL = os.environ["FRONTEND_URL"].rstrip("/")

_SHORTENERS = ("bit.ly", "tinyurl.com", "t.co", "is.gd", "cutt.ly", "goo.gl", "rebrand.ly")
_CRED_ASK = ("reply with your password", "reply with the code", "send your password", "cvv",
             "send us your password", "enter your password below", "confirm your card number",
             "your full card number", "seed phrase", "recovery phrase", "verify your card",
             "social security number", "confirm your bank details")
_HOSTISH = re.compile(r"\b(?:https?://)?((?:[a-z0-9-]+\.)+[a-z]{2,})", re.I)


def _host_ok(host: str) -> bool:
    if not host or "xn--" in host:
        return False
    try:
        ipaddress.ip_address(host)
        return False
    except ValueError:
        pass
    return not any(host == s or host.endswith("." + s) for s in _SHORTENERS)


def _same_site(shown: str, real: str) -> bool:
    return shown == real or real.endswith("." + shown) or shown.endswith("." + real)


class _EmailScan(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tags, self.urls, self.anchors = set(), [], []
        self._href, self._text = None, []

    def handle_starttag(self, tag, attrs):
        self.tags.add(tag.lower())
        self.urls += [v for k, v in attrs if k.lower() in ("href", "src") and v]
        if tag.lower() == "a":
            self._href = dict((k.lower(), v) for k, v in attrs).get("href")
            self._text = []

    def handle_data(self, data):
        if self._href is not None:
            self._text.append(data)

    def handle_endtag(self, tag):
        if tag.lower() == "a" and self._href is not None:
            self.anchors.append((self._href, "".join(self._text)))
            self._href, self._text = None, []


def _assert_safe_email(subject: str, html: str) -> None:
    scan = _EmailScan()
    scan.feed(html)
    if scan.tags & {"form", "input", "textarea", "select"}:
        raise ValueError("No forms or input fields in email (G2)")
    body = f"{subject}\n{html}".lower()
    for p in _CRED_ASK:
        if p in body:
            raise ValueError(f"Email asks the recipient for credentials: {p!r} (G2)")
    for url in scan.urls:
        low = url.strip().lower()
        if low.startswith(("mailto:", "tel:", "cid:", "#")):
            continue
        if not low.startswith("https://"):
            raise ValueError(f"Email links/assets must be absolute https: {url!r} (G3)")
        host = urlparse(low).hostname or ""
        if not _host_ok(host) or urlparse(low).username is not None:
            raise ValueError(f"Shortened, numeric-host or credential-bearing URL: {url!r} (G3)")
    for href, text in scan.anchors:
        real = urlparse(href.strip().lower()).hostname or ""
        if not real:
            continue
        for m in _HOSTISH.finditer(text):
            if not _same_site(m.group(1).lower(), real):
                raise ValueError(f"Anchor text {m.group(1)!r} != real link host {real!r} (G3)")


async def send_email(*, to: str, subject: str, html: str) -> str | None:
    _assert_safe_email(subject, html)
    payload = {"to": [to], "subject": subject, "html": html, "from_name": EMAIL_FROM_NAME}
    if EMAIL_REPLY_TO:
        payload["contact_email"] = EMAIL_REPLY_TO
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(f"{EMAIL_BASE_URL}/api/v1/email/send", headers={"X-Email-Key": EMAIL_KEY}, json=payload)
        resp.raise_for_status()
        return resp.json().get("id")
    except httpx.HTTPStatusError as e:
        try:
            code = e.response.json().get("code", "")
        except ValueError:
            code = ""
        if code in ("insufficient_credits", "integration_disabled", "daily_limit_reached"):
            logger.warning("Email paused: %s (%s)", code, e.response.status_code)
            raise HTTPException(status_code=503, detail="Email is temporarily unavailable")
        logger.error("Email send failed: %s %s", e.response.status_code, e.response.text)
        raise HTTPException(status_code=502, detail="Failed to send email")
    except Exception as e:
        logger.error("Email send error: %s", e)
        raise HTTPException(status_code=500, detail="Failed to send email")


def _layout(name: str, intro: str, block: str, note: str) -> str:
    brand = escape(EMAIL_FROM_NAME)
    return (
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b0f19;padding:32px 0">'
        '<tr><td align="center"><table role="presentation" width="520" cellpadding="0" cellspacing="0" '
        'style="background:#111827;border:1px solid #1f2937;border-radius:12px;font-family:Arial,Helvetica,sans-serif;color:#f9fafb">'
        f'<tr><td style="padding:28px 32px 8px;font-size:22px;font-weight:bold">Bitlora <span style="color:#f59e0b">Pro</span></td></tr>'
        f'<tr><td style="padding:8px 32px;font-size:15px;line-height:22px;color:#d1d5db">Hi {escape(name)},<br><br>{intro}</td></tr>'
        f'<tr><td style="padding:16px 32px">{block}</td></tr>'
        f'<tr><td style="padding:8px 32px 28px;font-size:12px;line-height:18px;color:#6b7280">{note}<br><br>'
        f'Sent by {brand}. We never ask for your password, 2FA codes or card details by email.</td></tr>'
        '</table></td></tr></table>'
    )


async def send_reset_email(user: dict, token: str):
    link = f"{FRONTEND_URL}/reset-password?token={token}"
    block = (f'<a href="{escape(link)}" style="display:inline-block;background:#f59e0b;color:#0b0f19;text-decoration:none;'
             'font-weight:bold;padding:12px 28px;border-radius:8px">Reset Password</a>')
    html = _layout(user.get("name", "there"), "We received a request to reset the password for your account. Use the button below to choose a new one. The link expires in 1 hour and can only be used once.",
                   block, "If you didn't request this, you can safely ignore this email — your password will not change.")
    return await send_email(to=user["email"], subject=f"Reset your {EMAIL_FROM_NAME} password", html=html)


async def send_verification_email(user: dict, code: str):
    block = (f'<div style="font-family:Courier New,monospace;font-size:32px;letter-spacing:8px;font-weight:bold;color:#f59e0b;'
             f'background:#0b0f19;border:1px solid #1f2937;border-radius:8px;padding:16px;text-align:center">{escape(code)}</div>')
    html = _layout(user.get("name", "there"), "Enter this code on the Security page of your account to verify your email address. It expires in 10 minutes.",
                   block, "If you didn't start email verification, you can ignore this message.")
    return await send_email(to=user["email"], subject=f"Your {EMAIL_FROM_NAME} verification code", html=html)
