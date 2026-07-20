from fastapi import FastAPI, Request, HTTPException, Query, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

import os
import re
import base64
import requests
import hmac
import hashlib
from datetime import datetime, timedelta, timezone

from dotenv import load_dotenv
from supabase import create_client, Client

from pydantic import BaseModel, Field, EmailStr, validator
from typing import Optional

from decimal import Decimal

from passlib.context import CryptContext

import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import uuid
import asyncio
import httpx
import logging
import time
import threading

load_dotenv()

# =========================
# LOGGING
# =========================
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# =========================
# RATE LIMITER
# =========================
limiter = Limiter(key_func=get_remote_address)
app = FastAPI()
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# =========================
# PRODUCTION CORS (CLEAN)
# =========================
ALLOWED_ORIGINS = [
    "https://evosdata.netlify.app",
    "https://evosdata.xyz",
    "https://www.evosdata.xyz"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =========================
# ENV
# =========================
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

PAYSTACK_SECRET = os.getenv("PAYSTACK_SECRET_KEY")

DATAMART_API_KEY = os.getenv("DATAMART_API_KEY")
DATAMART_WEBHOOK_SECRET = os.getenv("DATAMART_WEBHOOK_SECRET")
DATAMART_BASE = "https://api.datamartgh.shop/api/developer"

# DataMart caps real /verify-number checks at 2/minute per API key — that's a
# shared budget across every visitor on the site, not per-user. _verify_cache
# avoids repeat lookups for the same number (blur + submit re-check land the
# same result), and _verify_call_times paces us under DataMart's real cap so
# concurrent users degrade to "unknown" instead of hammering 429s.
_verify_cache = {}                # normalized phone -> (timestamp, result dict)
_verify_cache_lock = threading.Lock()
VERIFY_CACHE_TTL = 300             # seconds

_verify_call_times = []           # timestamps of real calls made to DataMart
_verify_call_lock = threading.Lock()
DATAMART_VERIFY_LIMIT = 2          # per DataMart docs
DATAMART_VERIFY_WINDOW = 60        # seconds

BUNDLES_GHANA_API_KEY = os.getenv("BUNDLES_GHANA_API_KEY")
BUNDLES_GHANA_API_SECRET = os.getenv("BUNDLES_GHANA_API_SECRET")
BUNDLES_GHANA_BASE = "https://evosdata.xyz/.netlify/functions/bundlesProxy"

MOOLRE_BASE = os.getenv("MOOLRE_BASE", "https://api.moolre.com/open/transact")
MOOLRE_USERNAME = os.getenv("MOOLRE_USERNAME")
MOOLRE_API_KEY = os.getenv("MOOLRE_API_KEY")
MOOLRE_ACCOUNT_NUMBER = os.getenv("MOOLRE_ACCOUNT_NUMBER")

SWIFT_DATA_LINK_API_KEY = os.getenv("SWIFT_DATA_LINK_API_KEY")
SWIFT_DATA_LINK_BASE    = os.getenv("SWIFT_DATA_LINK_BASE", "https://swiftdata-link.com/api/v1")
SWIFT_DATA_LINK_WEBHOOK = os.getenv("SWIFT_DATA_LINK_WEBHOOK_URL", "https://api.evosdata.xyz/webhook/swiftdatalink")

AGYEKUMDATA_API_KEY          = os.getenv("AGYEKUMDATA_API_KEY")
AGYEKUMDATA_BASE             = os.getenv("AGYEKUMDATA_BASE", "https://www.agyekumdata.com/api/v1")
AGYEKUMDATA_WEBHOOK_SECRET   = os.getenv("AGYEKUMDATA_WEBHOOK_SECRET")

SMTP_HOST     = os.getenv("SMTP_HOST", "mail.spacemail.com")
SMTP_PORT     = int(os.getenv("SMTP_PORT", "465"))
SMTP_USER     = os.getenv("SMTP_USER", "support@evoshub.xyz")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")

ADMIN_SECRET = os.getenv("ADMIN_SECRET")

# =========================
# SAFETY CHECK
# =========================
required_envs = {
    "SUPABASE_URL":               SUPABASE_URL,
    "SUPABASE_KEY":               SUPABASE_KEY,
    "PAYSTACK_SECRET_KEY":        PAYSTACK_SECRET,
    "DATAMART_API_KEY":           DATAMART_API_KEY,
    "DATAMART_WEBHOOK_SECRET":    DATAMART_WEBHOOK_SECRET,
    "BUNDLES_GHANA_API_KEY":      BUNDLES_GHANA_API_KEY,
    "BUNDLES_GHANA_API_SECRET":   BUNDLES_GHANA_API_SECRET,
    "MOOLRE_USERNAME":            MOOLRE_USERNAME,
    "MOOLRE_API_KEY":             MOOLRE_API_KEY,
    "MOOLRE_ACCOUNT_NUMBER":      MOOLRE_ACCOUNT_NUMBER,
    "SWIFT_DATA_LINK_API_KEY":    SWIFT_DATA_LINK_API_KEY,
    "SWIFT_DATA_LINK_WEBHOOK":    SWIFT_DATA_LINK_WEBHOOK,
    "AGYEKUMDATA_API_KEY":        AGYEKUMDATA_API_KEY,
    "AGYEKUMDATA_WEBHOOK_SECRET": AGYEKUMDATA_WEBHOOK_SECRET,
    "ADMIN_SECRET":               ADMIN_SECRET,
    "SMTP_USER":                  SMTP_USER,
    "SMTP_PASSWORD":              SMTP_PASSWORD,
}

missing = [k for k, v in required_envs.items() if not v]
if missing:
    raise Exception(f"Missing environment variables: {', '.join(missing)}")

# =========================
# SUPABASE INIT
# =========================
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# =========================
# GLOBAL TIMEOUT CONFIG
# =========================
REQUEST_TIMEOUT = 10
BG_TIMEOUT = 25

# =========================
# PHONE NORMALISATION
# =========================
PHONE_RE = re.compile(r"^\d{9,15}$")

def normalise_phone(raw: str) -> str:
    cleaned = re.sub(r"[\s\-\(\)]", "", raw.strip())
    if not PHONE_RE.match(cleaned):
        raise HTTPException(status_code=400, detail="Invalid phone number")
    return cleaned

# =========================
# ADMIN AUTH DEPENDENCY
# =========================
def require_admin(request: Request):
    secret = request.headers.get("X-Admin-Secret", "")
    if not secret or not hmac.compare_digest(secret, ADMIN_SECRET):
        raise HTTPException(status_code=403, detail="Forbidden")

# =========================
# AGENT TOKEN AUTH
# =========================
def make_agent_token(agent_id: int) -> str:
    msg = str(agent_id).encode()
    sig = hmac.new(ADMIN_SECRET.encode(), msg, hashlib.sha256).hexdigest()
    payload = base64.urlsafe_b64encode(msg).decode()
    return f"{payload}.{sig}"

def verify_agent_token(token: str, agent_id: int) -> bool:
    try:
        payload, sig = token.rsplit(".", 1)
        msg = base64.urlsafe_b64decode(payload.encode())
        expected_id = int(msg.decode())
        if expected_id != agent_id:
            return False
        expected_sig = hmac.new(ADMIN_SECRET.encode(), msg, hashlib.sha256).hexdigest()
        return hmac.compare_digest(sig, expected_sig)
    except Exception:
        return False

def require_agent(request: Request, agent_id: int) -> int:
    token = request.headers.get("X-Agent-Token", "")
    if not token or not verify_agent_token(token, agent_id):
        raise HTTPException(status_code=403, detail="Forbidden")
    return agent_id

# =========================
# MODELS
# =========================

class RegisterRequest(BaseModel):
    username: str = Field(min_length=3, max_length=20)
    full_name: str = Field(min_length=2, max_length=50)
    email: EmailStr
    phone: str = Field(min_length=9, max_length=15)
    password: str = Field(min_length=6, max_length=128)
    referred_by: Optional[str] = None

    @validator("username")
    def username_alphanumeric(cls, v):
        if not re.match(r"^[a-zA-Z0-9_]+$", v):
            raise ValueError("Username must be alphanumeric")
        return v.lower()

    @validator("phone")
    def phone_digits_only(cls, v):
        cleaned = re.sub(r"[\s\-\(\)]", "", v)
        if not re.match(r"^\d{9,15}$", cleaned):
            raise ValueError("Invalid phone number")
        return cleaned


class LoginRequest(BaseModel):
    username: str = Field(min_length=3, max_length=80)
    password: str = Field(min_length=6, max_length=128)


class CreateOrderRequest(BaseModel):
    user_id: Optional[int] = None
    network: str = Field(min_length=2, max_length=20)
    bundle: str = Field(min_length=2, max_length=20)
    phone: str = Field(min_length=9, max_length=15)
    email: Optional[EmailStr] = None

    @validator("network")
    def network_valid(cls, v):
        allowed = {"MTN", "TELECEL", "AIRTELTIGO", "AT"}
        if v.upper() not in allowed:
            raise ValueError("Invalid network")
        return v.upper()

    @validator("phone")
    def phone_clean(cls, v):
        cleaned = re.sub(r"[\s\-\(\)]", "", v)
        if not re.match(r"^\d{9,15}$", cleaned):
            raise ValueError("Invalid phone number")
        return cleaned


class VerifyNumberRequest(BaseModel):
    phoneNumber: str = Field(min_length=9, max_length=15)
    network: Optional[str] = None  # informational only — check is MTN-specific

    @validator("phoneNumber")
    def phone_clean(cls, v):
        cleaned = re.sub(r"[\s\-\(\)]", "", v)
        if not re.match(r"^\d{9,15}$", cleaned):
            raise ValueError("Invalid phone number")
        return cleaned


class AgentBuyDataRequest(BaseModel):
    agent_id: int
    network: str = Field(min_length=2, max_length=20)
    bundle: str = Field(min_length=2, max_length=20)
    phone_number: str = Field(min_length=9, max_length=15)

    @validator("network")
    def network_valid(cls, v):
        allowed = {"MTN", "TELECEL", "AIRTELTIGO", "AT"}
        if v.upper() not in allowed:
            raise ValueError("Invalid network")
        return v.upper()

    @validator("phone_number")
    def phone_clean(cls, v):
        cleaned = re.sub(r"[\s\-\(\)]", "", v)
        if not re.match(r"^\d{9,15}$", cleaned):
            raise ValueError("Invalid phone number")
        return cleaned


class StoreOrderRequest(BaseModel):
    agent_id: int
    network: str = Field(min_length=2, max_length=20)
    bundle: str = Field(min_length=2, max_length=20)
    phone_number: str = Field(min_length=9, max_length=15)
    email: Optional[EmailStr] = None

    @validator("network")
    def network_valid(cls, v):
        allowed = {"MTN", "TELECEL", "AIRTELTIGO", "AT"}
        if v.upper() not in allowed:
            raise ValueError("Invalid network")
        return v.upper()

    @validator("phone_number")
    def phone_clean(cls, v):
        cleaned = re.sub(r"[\s\-\(\)]", "", v)
        if not re.match(r"^\d{9,15}$", cleaned):
            raise ValueError("Invalid phone number")
        return cleaned


class DepositInitiateRequest(BaseModel):
    agent_id: int
    amount: float = Field(gt=0, le=10000)
    total_charge: float = Field(gt=0, le=11000)


class WithdrawRequest(BaseModel):
    agent_id: int
    amount: float = Field(gt=0, le=10000)
    mobile_number: str = Field(min_length=9, max_length=15)
    network: str = Field(min_length=2, max_length=20)
    account_name: Optional[str] = Field(default="", max_length=80)
    provider: str = Field(default="paystack")   # "paystack" or "moolre" — chosen on step 1

    @validator("mobile_number")
    def phone_clean(cls, v):
        cleaned = re.sub(r"[\s\-\(\)]", "", v)
        if not re.match(r"^\d{9,15}$", cleaned):
            raise ValueError("Invalid mobile number")
        return cleaned

    @validator("provider")
    def provider_valid(cls, v):
        v = (v or "paystack").strip().lower()
        if v not in ("paystack", "moolre"):
            raise ValueError("Invalid provider")
        return v


class VerifyAccountRequest(BaseModel):
    agent_id: int
    mobile_number: str = Field(min_length=9, max_length=15)
    network: str = Field(min_length=2, max_length=20)
    provider: str = Field(default="paystack")

    @validator("mobile_number")
    def phone_clean(cls, v):
        cleaned = re.sub(r"[\s\-\(\)]", "", v)
        if not re.match(r"^\d{9,15}$", cleaned):
            raise ValueError("Invalid mobile number")
        return cleaned

    @validator("provider")
    def provider_valid(cls, v):
        v = (v or "paystack").strip().lower()
        if v not in ("paystack", "moolre"):
            raise ValueError("Invalid provider")
        return v


# =========================
# HELPERS
# =========================

NETWORK_MAP = {
    "MTN": "YELLO",
    "TELECEL": "TELECEL",
    "AIRTELTIGO": "AT_PREMIUM"
}

MOOLRE_CHANNEL_MAP = {
    "MTN": 1,
    "TELECEL": 6,
    "AIRTELTIGO": 7,
}

PAYSTACK_MOMO_BANK_CODE = {
    "MTN": "MTN",
    "TELECEL": "VOD",       # confirm via GET https://api.paystack.co/bank?currency=GHS&type=mobile_money
    "AIRTELTIGO": "ATL",    # confirm via the same endpoint
}

SDL_NETWORK_MAP = {
    "MTN":        "mtn",
    "TELECEL":    "telecel",
    "AIRTELTIGO": "at",
    "AT":         "at",
}

SDL_OFFER_SLUG = {
    "MTN":        "mtn_data_normal_delivery",
    "TELECEL":    "telecel_expiry_bundle",
    "AIRTELTIGO": "ishare_data_bundle",
    "AT":         "ishare_data_bundle",
}

# =========================
# AGYEKUMDATA CATEGORY MAP
# =========================
AGYEKUMDATA_CATEGORY_MAP = {
    "MTN":        "MTN Package",
    "TELECEL":    "Telecel Package",
    "AIRTELTIGO": "iShare package",
    "AT":         "iShare package",
}

# =========================
# RETRY ESCALATION CONFIG
# FIX: orders no longer hammer a single provider forever. Each order tracks
#      retry_attempts (tries on its CURRENT provider) and provider_priority
#      (which tier of the network's provider chain it's currently on).
#      After MAX_ATTEMPTS_PER_PROVIDER failed tries, the order escalates to
#      the next-priority active provider for that network. Only once every
#      provider in the chain has been exhausted AND the order is >= 3h old
#      does it get marked "failed".
#
#      Requires these columns on the "orders" table (run once in Supabase):
#        alter table orders add column if not exists retry_attempts int default 0;
#        alter table orders add column if not exists provider_priority int default 1;
# =========================
MAX_ATTEMPTS_PER_PROVIDER = 3

# =========================
# WITHDRAWAL LIQUIDITY FEE
# A flat 4% liquidity fee is charged on every agent withdrawal. The agent's
# wallet is debited the FULL amount they typed (e.g. GH₵100), but only the
# amount after the fee is actually sent out (e.g. GH₵96). The fee itself
# stays with the business.
#
#   fee           = amount * WITHDRAWAL_FEE_PERCENT / 100
#   payout_amount = amount - fee   (this is what actually gets transferred)
#
#      Requires these columns on the "agent_withdrawals" table (run once in
#      Supabase):
#        alter table agent_withdrawals add column if not exists fee numeric default 0;
#        alter table agent_withdrawals add column if not exists payout_amount numeric default 0;
# =========================
WITHDRAWAL_FEE_PERCENT = 4.0

def calc_withdrawal_fee(amount: float):
    fee = round(float(amount) * (WITHDRAWAL_FEE_PERCENT / 100), 2)
    payout_amount = round(float(amount) - fee, 2)
    return fee, payout_amount

# =========================
# BUNDLES GHANA HELPER
# =========================
def call_bundles_ghana(endpoint: str, method: str = "GET", body: dict = None):
    if not endpoint or not isinstance(endpoint, str):
        raise Exception(f"Invalid Bundles Ghana endpoint: {endpoint}")
    try:
        logger.info("CALLING BG PATH: %s METHOD: %s", endpoint, method)
        res = requests.post(
            BUNDLES_GHANA_BASE,
            json={"path": endpoint, "method": method, "body": body},
            timeout=BG_TIMEOUT
        )
        return res.json()
    except Exception as e:
        logger.error("BUNDLES GHANA PROXY ERROR: %s", str(e))
        return {"success": False, "error": str(e)}


# =========================
# SWIFT DATA LINK HELPER
# =========================
def call_swift_data_link(network: str, volume: float, phone: str) -> dict:
    network_slug = SDL_NETWORK_MAP.get(network.upper())
    offer_slug   = SDL_OFFER_SLUG.get(network.upper())

    if not network_slug or not offer_slug:
        return {"success": False, "error": f"Unsupported network: {network}"}

    phone = phone.strip()
    if phone.startswith("0"):
        phone = "233" + phone[1:]
    elif not phone.startswith("233"):
        phone = "233" + phone

    try:
        res = requests.post(
            f"{SWIFT_DATA_LINK_BASE}/order/{network_slug}",
            headers={"x-api-key": SWIFT_DATA_LINK_API_KEY, "Content-Type": "application/json"},
            json={
                "type":       "single",
                "volume":     int(volume),
                "phone":      phone,
                "offerSlug":  offer_slug,
                "webhookUrl": SWIFT_DATA_LINK_WEBHOOK,
            },
            timeout=REQUEST_TIMEOUT
        )
        return res.json()
    except Exception as e:
        logger.error("SDL ORDER ERROR: %s", str(e))
        return {"success": False, "error": str(e)}


# =========================
# AGYEKUMDATA HELPERS
# =========================

def _agyekumdata_headers():
    return {
        "X-API-KEY": AGYEKUMDATA_API_KEY,
        "Content-Type": "application/json"
    }

def _safe_agyekumdata_json(res: requests.Response, context: str) -> dict:
    logger.info(
        "AGYEKUMDATA %s RAW: status=%s body=%s",
        context, res.status_code, res.text[:500]
    )
    if not res.text or not res.text.strip():
        return {"success": False, "error": f"Empty response (HTTP {res.status_code})"}
    try:
        return res.json()
    except ValueError as e:
        logger.error("AGYEKUMDATA %s JSON ERROR: %s | body was: %s", context, str(e), res.text[:200])
        return {"success": False, "error": f"Invalid JSON: {str(e)}"}


def sanitise_agyekumdata_ref(ref: str) -> str:
    cleaned = re.sub(r"[^A-Z0-9_]", "", ref.upper())
    return cleaned[:20]


def get_agyekumdata_package_id(network: str, bundle: str) -> str:
    category = AGYEKUMDATA_CATEGORY_MAP.get(network.upper(), network)
    bundle_clean = bundle.strip().upper().replace(" ", "")
    fallback = f"{category}-{bundle_clean}"

    try:
        res = requests.get(
            f"{AGYEKUMDATA_BASE}/products",
            headers=_agyekumdata_headers(),
            timeout=REQUEST_TIMEOUT,
        )
        data = _safe_agyekumdata_json(res, "PRODUCTS")
        products = data if isinstance(data, list) else data.get("data", [])

        category_products = [
            p for p in products
            if p.get("category", "").strip() == category
        ]

        for product in category_products:
            title_clean = product.get("title", "").upper().replace(" ", "")
            if title_clean == bundle_clean:
                package_id = product.get("packageid") or product.get("packageId")
                if package_id:
                    logger.info(
                        "AGYEKUMDATA PRODUCTS: matched packageId=%s category=%s",
                        package_id, category
                    )
                    return package_id

        logger.warning(
            "AGYEKUMDATA PRODUCTS: no match for %s %s in category=%s fallback=%s",
            network, bundle, category, fallback
        )
        return fallback

    except Exception as e:
        logger.error("AGYEKUMDATA PRODUCTS ERROR: %s", str(e))
        return fallback


def call_agyekumdata_purchase(package_id: str, phone: str, client_reference: str) -> dict:
    phone = phone.strip()

    if phone.startswith("233") and len(phone) == 12:
        phone = "0" + phone[3:]
    elif len(phone) == 9 and not phone.startswith("0"):
        phone = "0" + phone

    safe_ref = sanitise_agyekumdata_ref(client_reference)

    body = {
        "packageId": package_id,
        "mobileNo": phone,
        "clientReference": safe_ref,
    }

    url = f"{AGYEKUMDATA_BASE}/purchase"

    logger.info("AGYEKUMDATA PURCHASE URL: %s", url)
    logger.info(
        "AGYEKUMDATA PURCHASE: packageId=%s phone=%s ref=%s",
        package_id, phone, safe_ref
    )

    try:
        res = requests.post(
            url,
            headers=_agyekumdata_headers(),
            json=body,
            timeout=REQUEST_TIMEOUT,
            allow_redirects=False,
        )

        if res.status_code in (301, 302, 307, 308):
            location = res.headers.get("Location")
            logger.error("AGYEKUMDATA REDIRECT: %s -> %s", res.status_code, location)
            return {"success": False, "error": f"API redirected to {location}"}

        result = _safe_agyekumdata_json(res, "PURCHASE")

        if not result.get("success"):
            logger.error(
                "AGYEKUMDATA PURCHASE FAILED: status=%s error=%s message=%s",
                res.status_code, result.get("error"), result.get("message")
            )

        return result

    except requests.exceptions.Timeout:
        logger.error("AGYEKUMDATA PURCHASE TIMEOUT ref=%s", safe_ref)
        return {"success": False, "error": "Request timed out"}

    except requests.exceptions.ConnectionError as e:
        logger.error("AGYEKUMDATA CONNECTION ERROR: %s", str(e))
        return {"success": False, "error": str(e)}

    except Exception as e:
        logger.error("AGYEKUMDATA PURCHASE ERROR: %s", str(e))
        return {"success": False, "error": str(e)}


def call_agyekumdata_status(client_reference: str) -> dict:
    safe_ref = sanitise_agyekumdata_ref(client_reference)

    try:
        res = requests.get(
            f"{AGYEKUMDATA_BASE}/order/status",
            headers=_agyekumdata_headers(),
            params={"clientReference": safe_ref},
            timeout=REQUEST_TIMEOUT,
            allow_redirects=False
        )

        if "text/html" in res.headers.get("Content-Type", "") or res.text.strip().startswith("<!DOCTYPE"):
            logger.error(
                "AGYEKUMDATA STATUS HTML RESPONSE (likely auth/base URL issue): %s",
                res.text[:200]
            )
            return {"success": False, "error": "Invalid API response (HTML instead of JSON)"}

        return _safe_agyekumdata_json(res, "STATUS")

    except requests.exceptions.Timeout:
        return {"success": False, "error": "Request timed out"}

    except Exception as e:
        logger.error("AGYEKUMDATA STATUS ERROR: %s", str(e))
        return {"success": False, "error": str(e)}


def log_agyekumdata_categories():
    try:
        res = requests.get(
            f"{AGYEKUMDATA_BASE}/categories",
            headers=_agyekumdata_headers(),
            timeout=REQUEST_TIMEOUT,
        )
        data = _safe_agyekumdata_json(res, "CATEGORIES")
        logger.info("AGYEKUMDATA CATEGORIES: %s", data)
        return data
    except Exception as e:
        logger.error("AGYEKUMDATA CATEGORIES ERROR: %s", str(e))
        return {"success": False, "error": str(e)}


def verify_agyekumdata_signature(body: bytes, signature: str) -> bool:
    try:
        if not signature:
            logger.warning("AGYEKUMDATA WEBHOOK: missing signature")
            return False
        computed = hmac.new(
            AGYEKUMDATA_WEBHOOK_SECRET.encode("utf-8"),
            body,
            hashlib.sha256,
        ).hexdigest()
        return hmac.compare_digest(computed, signature)
    except Exception as e:
        logger.error("AGYEKUMDATA SIGNATURE ERROR: %s", str(e))
        return False


# =========================
# MOOLRE HELPER
# =========================
def call_moolre(endpoint: str, body: dict):
    try:
        res = requests.post(
            f"{MOOLRE_BASE}/{endpoint}",
            headers={
                "X-API-USER": MOOLRE_USERNAME,
                "X-API-KEY": MOOLRE_API_KEY,
                "Content-Type": "application/json",
            },
            json=body,
            timeout=REQUEST_TIMEOUT
        )
        return res.json()
    except Exception as e:
        logger.error("MOOLRE ERROR: %s", str(e))
        return {"status": 0, "message": str(e)}


# =========================
# PAYSTACK TRANSFER HELPERS
# =========================
def paystack_create_recipient(name: str, mobile_number: str, network: str) -> dict:
    bank_code = PAYSTACK_MOMO_BANK_CODE.get(network.upper())
    if not bank_code:
        return {"status": False, "message": f"Unsupported network for Paystack transfer: {network}"}
    try:
        res = requests.post(
            "https://api.paystack.co/transferrecipient",
            headers={"Authorization": f"Bearer {PAYSTACK_SECRET}", "Content-Type": "application/json"},
            json={
                "type": "mobile_money",
                "name": name or "EVOS Agent",
                "account_number": mobile_number,
                "bank_code": bank_code,
                "currency": "GHS",
            },
            timeout=REQUEST_TIMEOUT,
        )
        return res.json()
    except Exception as e:
        logger.error("PAYSTACK RECIPIENT ERROR: %s", str(e))
        return {"status": False, "message": str(e)}


def paystack_initiate_transfer(amount: float, recipient_code: str, reference: str, reason: str) -> dict:
    try:
        res = requests.post(
            "https://api.paystack.co/transfer",
            headers={"Authorization": f"Bearer {PAYSTACK_SECRET}", "Content-Type": "application/json"},
            json={
                "source": "balance",
                "amount": int(round(amount * 100)),
                "recipient": recipient_code,
                "reference": reference,
                "reason": reason,
                "currency": "GHS",
            },
            timeout=REQUEST_TIMEOUT,
        )
        return res.json()
    except Exception as e:
        logger.error("PAYSTACK TRANSFER ERROR: %s", str(e))
        return {"status": False, "message": str(e)}


def paystack_verify_transfer(reference: str) -> dict:
    try:
        res = requests.get(
            f"https://api.paystack.co/transfer/verify/{reference}",
            headers={"Authorization": f"Bearer {PAYSTACK_SECRET}"},
            timeout=REQUEST_TIMEOUT,
        )
        return res.json()
    except Exception as e:
        logger.error("PAYSTACK VERIFY TRANSFER ERROR: %s", str(e))
        return {"status": False, "message": str(e)}

# =========================
# PASSWORD SECURITY
# =========================
pwd_context = CryptContext(
    schemes=["bcrypt"],
    bcrypt__rounds=12,
    deprecated="auto"
)

def hash_password(password: str) -> str:
    try:
        return pwd_context.hash(password)
    except Exception as e:
        logger.error("HASH ERROR: %s", str(e))
        raise HTTPException(status_code=500, detail="Password hashing failed")

def verify_password(plain: str, hashed: str) -> bool:
    try:
        return pwd_context.verify(plain, hashed)
    except Exception as e:
        logger.error("VERIFY ERROR: %s", str(e))
        return False


# =========================
# UTILITIES
# =========================
def extract_capacity(bundle: str) -> str:
    if not bundle:
        return ""
    return bundle.upper().replace("GB", "").replace("MB", "").strip()

def utc_now() -> datetime:
    return datetime.now(timezone.utc)

def parse_db_dt(raw: str) -> datetime:
    if not raw:
        raise ValueError("Empty datetime string")
    cleaned = raw.replace("Z", "").replace("+00:00", "")
    naive = datetime.fromisoformat(cleaned)
    return naive.replace(tzinfo=timezone.utc)


# =========================
# PAYSTACK SIGNATURE (SHA512)
# =========================
def verify_paystack_signature(body: bytes, signature: str, secret: str) -> bool:
    try:
        if not signature:
            logger.warning("PAYSTACK SIGNATURE ERROR: missing signature")
            return False
        computed = hmac.new(
            secret.encode("utf-8"),
            body,
            hashlib.sha512
        ).hexdigest()
        return hmac.compare_digest(computed, signature)
    except Exception as e:
        logger.error("PAYSTACK SIGNATURE ERROR: %s", str(e))
        return False


# =========================
# DATAMART SIGNATURE (SHA256)
# =========================
def verify_datamart_signature(body: bytes, signature: str, secret: str) -> bool:
    try:
        if not signature:
            logger.warning("DATAMART SIGNATURE ERROR: missing signature")
            return False
        computed = hmac.new(
            secret.encode("utf-8"),
            body,
            hashlib.sha256
        ).hexdigest()
        return hmac.compare_digest(computed, signature)
    except Exception as e:
        logger.error("DATAMART SIGNATURE ERROR: %s", str(e))
        return False

def verify_signature(body: bytes, signature: str, secret: str) -> bool:
    return verify_paystack_signature(body, signature, secret)


# =========================
# NETWORK PROVIDERS
# =========================
def get_provider(network: str):
    """Single highest-priority active provider — used for first dispatch
    (webhook handlers, agent buy-data, store orders), not for the retry loop."""
    try:
        res = supabase.table("provider_routes") \
            .select("provider") \
            .eq("network", network.upper()) \
            .eq("active", True) \
            .order("priority") \
            .limit(1) \
            .execute()
        if res.data:
            return res.data[0]["provider"]
        return None
    except Exception as e:
        logger.error("PROVIDER LOOKUP ERROR: %s", str(e))
        return None


def get_provider_chain(network: str):
    """Return ALL active providers for a network, ordered by priority asc.
    Used by the retry job so it can escalate through providers in order."""
    try:
        res = supabase.table("provider_routes") \
            .select("provider") \
            .eq("network", network.upper()) \
            .eq("active", True) \
            .order("priority") \
            .execute()
        return [r["provider"] for r in (res.data or [])]
    except Exception as e:
        logger.error("PROVIDER CHAIN ERROR: %s", str(e))
        return []


def handle_provider_failure(order: dict, chain: list, current_idx: int, provider: str, reason):
    """
    Called whenever a provider rejects an order during the retry job.
    Escalates to the next provider in the chain after MAX_ATTEMPTS_PER_PROVIDER
    failed tries on the current one, instead of retrying the same provider
    forever. Only fails the order outright once every provider in the chain
    has been exhausted AND the order is at least 3 hours old.
    """
    attempts = int(order.get("retry_attempts") or 0) + 1
    order_id = order["id"]

    if attempts < MAX_ATTEMPTS_PER_PROVIDER:
        supabase.table("orders").update({"retry_attempts": attempts}).eq("id", order_id).execute()
        logger.warning(
            "RETRY JOB: order %s attempt %d/%d on %s failed (%s) — will retry same provider next cycle",
            order_id, attempts, MAX_ATTEMPTS_PER_PROVIDER, provider, reason
        )
        return

    next_idx = current_idx + 1
    if next_idx < len(chain):
        supabase.table("orders").update({
            "provider_priority": next_idx + 1,  # stored 1-indexed
            "retry_attempts": 0
        }).eq("id", order_id).execute()
        logger.warning(
            "RETRY JOB: order %s exhausted %s after %d attempts (%s) — escalating to %s",
            order_id, provider, attempts, reason, chain[next_idx]
        )
        return

    # All providers in the chain have been exhausted
    order_age = utc_now() - parse_db_dt(order["created_at"])
    if order_age >= timedelta(hours=3):
        supabase.table("orders").update({"status": "failed"}).eq("id", order_id).execute()
        logger.error(
            "RETRY JOB: order %s FAILED — exhausted all %d provider(s) in chain, age %s >= 3h",
            order_id, len(chain), str(order_age).split('.')[0]
        )
    else:
        supabase.table("orders").update({"retry_attempts": attempts}).eq("id", order_id).execute()
        logger.warning(
            "RETRY JOB: order %s exhausted all providers, age %s < 3h — retrying last provider (%s)",
            order_id, str(order_age).split('.')[0], provider
        )


# =========================
# AGENT PROFIT
# =========================
def process_agent_profit(order_id, reference):
    existing = supabase.table("agent_transactions") \
        .select("id") \
        .eq("reference", reference) \
        .limit(1) \
        .execute()
    if existing.data:
        return

    order_res = supabase.table("orders") \
        .select("*") \
        .eq("id", order_id) \
        .limit(1) \
        .execute()
    if not order_res.data:
        return

    order = order_res.data[0]
    agent_id    = order.get("agent_id")
    base_price  = order.get("base_price")
    agent_price = order.get("agent_price")

    if not agent_id or base_price is None or agent_price is None:
        return

    profit = Decimal(str(agent_price)) - Decimal(str(base_price))
    if profit <= 0:
        return

    wallet = supabase.table("agent_wallets") \
        .select("*") \
        .eq("agent_id", agent_id) \
        .limit(1) \
        .execute()

    if wallet.data:
        new_balance = Decimal(str(wallet.data[0]["balance"])) + profit
        supabase.table("agent_wallets") \
            .update({"balance": float(new_balance)}) \
            .eq("agent_id", agent_id) \
            .execute()
    else:
        supabase.table("agent_wallets") \
            .insert({"agent_id": agent_id, "balance": float(profit)}) \
            .execute()

    supabase.table("agent_transactions").insert({
        "agent_id":  agent_id,
        "order_id":  order_id,
        "amount":    float(profit),
        "type":      "credit",
        "reference": reference
    }).execute()


# =========================
# USER STATS
# =========================
def calculate_rank(order_count: int):
    if order_count >= 50:   return 5
    elif order_count >= 20: return 4
    elif order_count >= 10: return 3
    elif order_count >= 5:  return 2
    return 1

def increment_user_orders(user_id: int):
    try:
        user = supabase.table("users").select("order_count").eq("id", user_id).limit(1).execute()
        if not user.data:
            return
        current = user.data[0].get("order_count") or 0
        new_count = current + 1
        supabase.table("users").update({
            "order_count": new_count,
            "rank": calculate_rank(new_count)
        }).eq("id", user_id).execute()
    except Exception as e:
        logger.error("INCREMENT USER ERROR: %s", str(e))


# =========================
# PRICES
# =========================
@app.get("/prices")
@limiter.limit("60/minute")
def get_prices(request: Request):
    try:
        data = supabase.table("prices").select("*").execute().data
        return {"status": "success", "data": data or []}
    except Exception as e:
        logger.error("PRICES ERROR: %s", str(e))
        raise HTTPException(status_code=500, detail="Failed to load prices")


# =========================
# VERIFY NUMBER (DataMart pre-check)
# Informational only — never blocks a purchase. Any failure, timeout, or
# rate-limit from DataMart just falls back to recommendation "unknown" so
# the frontend can quietly skip the warning banner and let checkout proceed.
# =========================
def _can_call_datamart_verify() -> bool:
    now = time.time()
    with _verify_call_lock:
        global _verify_call_times
        _verify_call_times = [t for t in _verify_call_times if now - t < DATAMART_VERIFY_WINDOW]
        if len(_verify_call_times) >= DATAMART_VERIFY_LIMIT:
            return False
        _verify_call_times.append(now)
        return True


def _unknown_result(message: str) -> dict:
    return {
        "status": "success",
        "checked": False,
        "servable": True,
        "recommendation": "unknown",
        "message": message,
    }


@app.post("/verify-number")
@limiter.limit("20/minute")
def verify_number(request: Request, data: VerifyNumberRequest):
    phone = data.phoneNumber
    network = (data.network or "").upper()

    # DataMart's check only exists for MTN — anything else is a no-op pass-through
    if network and network != "MTN":
        return _unknown_result("Verification only applies to MTN numbers.")

    now = time.time()
    with _verify_cache_lock:
        cached = _verify_cache.get(phone)
        if cached and now - cached[0] < VERIFY_CACHE_TTL:
            result = dict(cached[1])
            result["cached"] = True
            return result

    if not _can_call_datamart_verify():
        return _unknown_result("Live check is busy right now — you can still continue.")

    try:
        resp = requests.post(
            f"{DATAMART_BASE}/verify-number",
            headers={"X-API-Key": DATAMART_API_KEY},
            json={"phoneNumber": phone},
            timeout=5,
        )
    except requests.exceptions.RequestException as e:
        logger.warning("VERIFY NUMBER: request error: %s", str(e))
        return _unknown_result("Couldn't reach the verification service — you can still continue.")

    if resp.status_code == 429:
        return _unknown_result("Live check is busy right now — you can still continue.")

    if resp.status_code == 503:
        return _unknown_result("Verification network is momentarily unavailable — you can still continue.")

    if resp.status_code != 200:
        logger.warning("VERIFY NUMBER: DataMart returned %s: %s", resp.status_code, resp.text[:200])
        return _unknown_result("Couldn't verify right now — you can still continue.")

    try:
        dm_data = resp.json().get("data", {})
    except ValueError:
        return _unknown_result("Couldn't verify right now — you can still continue.")

    result = {
        "status": "success",
        "checked": True,
        "phoneNumber": dm_data.get("phoneNumber", phone),
        "network": dm_data.get("network", "MTN"),
        "servable": dm_data.get("servable", True),
        "recommendation": dm_data.get("recommendation", "unknown"),
        "message": dm_data.get("message", ""),
        "cached": False,
    }

    with _verify_cache_lock:
        # opportunistically drop stale entries so this dict doesn't grow forever
        for k in [k for k, v in _verify_cache.items() if now - v[0] > VERIFY_CACHE_TTL]:
            del _verify_cache[k]
        _verify_cache[phone] = (now, result)

    return result


# =========================
# BACKGROUND: RETRY STUCK ORDERS
# FIX: retry loop now walks the FULL provider chain for each order's network
#      instead of using a single fixed provider. Each order tracks how many
#      times it's been tried on its current provider (retry_attempts) and
#      which tier of the chain it's on (provider_priority). After
#      MAX_ATTEMPTS_PER_PROVIDER failures, handle_provider_failure() escalates
#      to the next-priority provider. Order only gets marked "failed" once
#      every provider in the chain is exhausted AND it's >= 3h old.
# =========================

_retry_running = False

async def retry_stuck_orders():
    global _retry_running
    if _retry_running:
        logger.info("RETRY JOB: already running, skipping duplicate")
        return

    _retry_running = True
    await asyncio.sleep(60)

    while True:
        try:
            logger.info("RETRY JOB: scanning for stuck orders...")
            now   = utc_now()
            floor = (now - timedelta(minutes=10)).isoformat()

            stuck = supabase.table("orders") \
                .select("*") \
                .eq("status", "processing") \
                .not_.is_("paystack_ref", None) \
                .is_("datamart_ref", None) \
                .lte("created_at", floor) \
                .execute()

            orders = stuck.data or []
            logger.info("RETRY JOB: %d stuck orders found", len(orders))

            for order in orders:
                try:
                    chain = get_provider_chain(order["network"])
                    if not chain:
                        logger.info("RETRY JOB: no provider chain for order %s", order['id'])
                        continue

                    current_idx = min(int(order.get("provider_priority") or 1) - 1, len(chain) - 1)
                    provider = chain[current_idx]

                    logger.info(
                        "RETRY JOB: retrying order %s via %s (tier %d/%d, attempt %d/%d)",
                        order['id'], provider, current_idx + 1, len(chain),
                        int(order.get("retry_attempts") or 0) + 1, MAX_ATTEMPTS_PER_PROVIDER
                    )

                    # ── DATAMART ──────────────────────────────────────────
                    if provider == "DATAMART":
                        dm_response = requests.post(
                            f"{DATAMART_BASE}/purchase",
                            headers={"X-API-Key": DATAMART_API_KEY},
                            json={
                                "phoneNumber": order["phone_number"],
                                "network":     NETWORK_MAP.get(order["network"]),
                                "capacity":    extract_capacity(order["bundle"]),
                                "gateway":     "wallet"
                            },
                            timeout=REQUEST_TIMEOUT
                        )
                        dm      = dm_response.json()
                        dm_data = dm.get("data", {})

                        if dm_data.get("orderReference"):
                            supabase.table("orders").update({
                                "status":            "processing",
                                "datamart_ref":      dm_data.get("orderReference"),
                                "datamart_order_id": dm_data.get("orderId")
                            }).eq("id", order["id"]).execute()

                            if order.get("paystack_ref") and not str(order["paystack_ref"]).startswith("EVOS-AGT-"):
                                process_agent_profit(order["id"], order["paystack_ref"])

                            logger.info("RETRY JOB: order %s sent to DATAMART ✅", order['id'])
                        else:
                            logger.warning("RETRY JOB: DATAMART rejected order %s: %s", order['id'], dm)
                            handle_provider_failure(order, chain, current_idx, provider, dm)

                    # ── BUNDLES GHANA ──────────────────────────────────────
                    elif provider == "BUNDLES_GHANA":
                        BG_NETWORK_MAP = {
                            "MTN":        "MTN",
                            "TELECEL":    "Telecel",
                            "AIRTELTIGO": "AirtelTigo",
                            "AT":         "AirtelTigo",
                        }
                        network_name = BG_NETWORK_MAP.get(order["network"].upper(), order["network"])
                        bg_bundles   = call_bundles_ghana(f"/bundles?network={network_name}")

                        if not bg_bundles.get("success"):
                            logger.warning("RETRY JOB: BG bundle fetch failed for order %s", order['id'])
                            handle_provider_failure(order, chain, current_idx, provider, bg_bundles)
                            continue

                        bundle_volume = order["bundle"].upper().replace(" ", "")
                        matched = next(
                            (b for b in bg_bundles.get("bundles", [])
                             if b.get("volume", "").upper().replace(" ", "") == bundle_volume
                             and b.get("status") == "active"),
                            None
                        )

                        if not matched:
                            logger.warning("RETRY JOB: no BG bundle match for order %s", order['id'])
                            handle_provider_failure(order, chain, current_idx, provider, "no bundle match")
                            continue

                        try:
                            bg_order = call_bundles_ghana(
                                "/order",
                                method="POST",
                                body={
                                    "bundle_id":   matched["id"],
                                    "phone":       order["phone_number"],
                                    "webhook_url": "https://api.evosdata.xyz/webhook/bundlesghana"
                                }
                            )
                        except Exception as bg_err:
                            logger.error("RETRY JOB: BG call error for order %s: %s", order['id'], str(bg_err))
                            handle_provider_failure(order, chain, current_idx, provider, str(bg_err))
                            continue

                        if bg_order.get("success"):
                            supabase.table("orders").update({
                                "status":            "processing",
                                "datamart_ref":      bg_order["order"]["reference"],
                                "datamart_order_id": str(bg_order["order"]["id"])
                            }).eq("id", order["id"]).execute()

                            if order.get("paystack_ref") and not str(order["paystack_ref"]).startswith("EVOS-AGT-"):
                                process_agent_profit(order["id"], order["paystack_ref"])

                            logger.info("RETRY JOB: order %s sent to BUNDLES_GHANA ✅", order['id'])
                        else:
                            msg        = bg_order.get("message", "")
                            order_type = bg_order.get("type", "")

                            # 409 conflict — BG already has this order, recover the ref
                            if order_type == "ORDER_FAILED" and "Ref:" in msg:
                                ref_match = re.search(r'Ref:\s*([\w\-]+)', msg)
                                if ref_match:
                                    existing_ref = ref_match.group(1)
                                    supabase.table("orders").update({
                                        "status":       "processing",
                                        "datamart_ref": existing_ref,
                                    }).eq("id", order["id"]).execute()
                                    logger.info("RETRY JOB: order %s recovered from 409 — ref=%s ✅", order['id'], existing_ref)
                                    continue

                            logger.warning("RETRY JOB: BG rejected order %s: %s", order['id'], bg_order)
                            handle_provider_failure(order, chain, current_idx, provider, bg_order)

                    # ── SWIFT DATA LINK ────────────────────────────────────
                    elif provider == "SWIFT_DATA_LINK":
                        volume = float(extract_capacity(order["bundle"]) or 0)
                        sdl    = call_swift_data_link(
                            network=order["network"],
                            volume=volume,
                            phone=order["phone_number"],
                        )

                        if sdl.get("success"):
                            supabase.table("orders").update({
                                "status":            "processing",
                                "datamart_ref":      sdl.get("reference"),
                                "datamart_order_id": sdl.get("orderId"),
                            }).eq("id", order["id"]).execute()

                            if order.get("paystack_ref") and not str(order["paystack_ref"]).startswith("EVOS-AGT-"):
                                process_agent_profit(order["id"], order["paystack_ref"])

                            logger.info("RETRY JOB: order %s sent to SWIFT_DATA_LINK ✅", order['id'])
                        else:
                            logger.warning("RETRY JOB: SDL rejected order %s: %s", order['id'], sdl)
                            handle_provider_failure(order, chain, current_idx, provider, sdl)

                    # ── AGYEKUMDATA ────────────────────────────────────────
                    elif provider == "AGYEKUMDATA":
                        package_id = get_agyekumdata_package_id(order["network"], order["bundle"])
                        raw_ref    = (
                            order.get("paystack_ref")
                            or order.get("evosdata_ref")
                            or str(order["id"])
                        )
                        safe_ref   = sanitise_agyekumdata_ref(raw_ref)
                        agd        = call_agyekumdata_purchase(
                            package_id=package_id,
                            phone=order["phone_number"],
                            client_reference=raw_ref,
                        )

                        if agd.get("success"):
                            agd_data = agd.get("data", {})
                            supabase.table("orders").update({
                                "status":            "processing",
                                "datamart_ref":      agd_data.get("clientReference") or safe_ref,
                                "datamart_order_id": agd_data.get("orderId"),
                            }).eq("id", order["id"]).execute()

                            if order.get("paystack_ref") and not str(order["paystack_ref"]).startswith("EVOS-AGT-"):
                                process_agent_profit(order["id"], order["paystack_ref"])

                            logger.info("RETRY JOB: order %s sent to AGYEKUMDATA ✅", order['id'])
                        else:
                            err_msg = str(agd.get("error", ""))
                            logger.warning("RETRY JOB: AGYEKUMDATA rejected order %s: %s", order['id'], agd)

                            # Duplicate clientReference — order was already submitted, recover it
                            if "Duplicate clientReference" in err_msg:
                                supabase.table("orders").update({
                                    "status":       "processing",
                                    "datamart_ref": safe_ref,
                                }).eq("id", order["id"]).execute()
                                logger.info(
                                    "RETRY JOB: order %s recovered from duplicate clientReference ✅",
                                    order['id']
                                )
                                continue

                            handle_provider_failure(order, chain, current_idx, provider, agd)

                except Exception as e:
                    logger.error("RETRY JOB: error on order %s: %s", order.get('id'), str(e))

            # ── STATUS SYNC ───────────────────────────────────────────────
            logger.info("STATUS SYNC: scanning for unresolved processing orders...")
            sync_cutoff = (now - timedelta(days=3)).isoformat()

            processing = supabase.table("orders") \
                .select("*") \
                .eq("status", "processing") \
                .not_.is_("datamart_ref", None) \
                .gte("created_at", sync_cutoff) \
                .execute()

            proc_orders = processing.data or []
            logger.info("STATUS SYNC: %d orders to check", len(proc_orders))

            for order in proc_orders:
                try:
                    provider = get_provider(order["network"])
                    ref      = order.get("datamart_ref")
                    order_id = order.get("datamart_order_id")

                    if provider == "DATAMART":
                        tracker = order_id or ref
                        if not tracker:
                            continue
                        dm = requests.get(
                            f"{DATAMART_BASE}/order-status/{tracker}",
                            headers={"X-API-Key": DATAMART_API_KEY},
                            timeout=REQUEST_TIMEOUT
                        )
                        payload = dm.json()
                        status  = str(payload.get("data", {}).get("orderStatus", "")).lower()

                    elif provider == "BUNDLES_GHANA":
                        if not ref:
                            continue
                        bg     = call_bundles_ghana(f"/order/status/{ref}")
                        status = str(bg.get("order", {}).get("status", "processing")).lower()

                    elif provider == "SWIFT_DATA_LINK":
                        tracker = ref or order_id
                        if not tracker:
                            continue
                        sdl_res = requests.get(
                            f"{SWIFT_DATA_LINK_BASE}/order/status/{tracker}",
                            headers={"x-api-key": SWIFT_DATA_LINK_API_KEY},
                            timeout=REQUEST_TIMEOUT
                        ).json()
                        status = str(sdl_res.get("order", {}).get("status", "")).lower()

                    elif provider == "AGYEKUMDATA":
                        client_ref = ref
                        if not client_ref:
                            continue
                        agd_res = call_agyekumdata_status(client_reference=client_ref)
                        status = str(agd_res.get("data", {}).get("status", "processing")).lower()
                        logger.info(
                            "STATUS SYNC: AGYEKUMDATA order %s clientRef=%s status=%s",
                            order['id'], client_ref, status
                        )

                    else:
                        continue

                    final_status = (
                        "successful"
                        if status in ["completed", "success", "delivered", "successful", "resolved"]
                        else "failed"
                        if status in ["failed", "cancelled", "refunded"]
                        else None
                    )

                    if final_status:
                        supabase.table("orders") \
                            .update({"status": final_status}) \
                            .eq("id", order["id"]) \
                            .execute()
                        logger.info("STATUS SYNC: order %s → %s ✅", order['id'], final_status)
                    else:
                        logger.info(
                            "STATUS SYNC: order %s still showing '%s' on provider — will poll again next cycle",
                            order['id'], status
                        )

                except Exception as e:
                    logger.error("STATUS SYNC: error on order %s: %s", order.get('id'), str(e))

        except Exception as e:
            logger.error("RETRY JOB ERROR: %s", str(e))

        await asyncio.sleep(300)


# =========================
# BACKGROUND: RETRY STUCK DEPOSITS
# =========================

_deposit_retry_running = False

async def retry_stuck_deposits():
    global _deposit_retry_running
    if _deposit_retry_running:
        logger.info("DEPOSIT RETRY: already running, skipping duplicate")
        return

    _deposit_retry_running = True
    await asyncio.sleep(90)

    while True:
        try:
            logger.info("DEPOSIT RETRY: scanning for stuck deposits...")

            now    = utc_now()
            floor  = (now - timedelta(minutes=5)).isoformat()
            cutoff = (now - timedelta(hours=2)).isoformat()

            stuck = supabase.table("wallet_deposits") \
                .select("*") \
                .eq("status", "pending") \
                .lte("created_at", floor) \
                .gte("created_at", cutoff) \
                .execute()

            deposits = stuck.data or []
            logger.info("DEPOSIT RETRY: %d stuck deposits found", len(deposits))

            for deposit in deposits:
                dep_id        = deposit.get("id")
                agent_id      = deposit.get("agent_id")
                credit_amount = float(deposit.get("amount", 0))
                verify_ref    = deposit.get("paystack_ref") or deposit.get("reference")

                if not verify_ref or not agent_id:
                    logger.info("DEPOSIT RETRY: skipping deposit %s — missing ref or agent_id", dep_id)
                    continue

                if credit_amount <= 0:
                    logger.info("DEPOSIT RETRY: skipping deposit %s — invalid amount %s", dep_id, credit_amount)
                    continue

                try:
                    async with httpx.AsyncClient() as client:
                        res = await client.get(
                            f"https://api.paystack.co/transaction/verify/{verify_ref}",
                            headers={"Authorization": f"Bearer {PAYSTACK_SECRET}"},
                            timeout=15,
                        )
                        data = res.json()

                    paystack_status = data.get("data", {}).get("status", "")
                    logger.info("DEPOSIT RETRY: deposit %s — Paystack status: %s", dep_id, paystack_status)

                    if paystack_status != "success":
                        age = utc_now() - parse_db_dt(deposit["created_at"])
                        if age > timedelta(minutes=30):
                            supabase.table("wallet_deposits") \
                                .update({"status": "failed"}) \
                                .eq("id", dep_id) \
                                .execute()
                            logger.info("DEPOSIT RETRY: deposit %s marked failed — Paystack unpaid after 30min", dep_id)
                        else:
                            logger.info("DEPOSIT RETRY: deposit %s still pending on Paystack — will retry", dep_id)
                        continue

                    recheck = supabase.table("wallet_deposits") \
                        .select("status") \
                        .eq("id", dep_id) \
                        .limit(1) \
                        .execute()
                    if recheck.data and recheck.data[0]["status"] == "credited":
                        logger.info("DEPOSIT RETRY: deposit %s already credited, skipping", dep_id)
                        continue

                    wallet_res = supabase.table("agent_wallets") \
                        .select("balance") \
                        .eq("agent_id", agent_id) \
                        .limit(1) \
                        .execute()

                    if wallet_res.data:
                        current     = float(wallet_res.data[0]["balance"] or 0)
                        new_balance = round(current + credit_amount, 2)
                        supabase.table("agent_wallets") \
                            .update({"balance": new_balance}) \
                            .eq("agent_id", agent_id) \
                            .execute()
                    else:
                        new_balance = round(credit_amount, 2)
                        supabase.table("agent_wallets") \
                            .insert({"agent_id": agent_id, "balance": new_balance}) \
                            .execute()

                    supabase.table("wallet_deposits") \
                        .update({"status": "credited"}) \
                        .eq("id", dep_id) \
                        .execute()

                    supabase.table("agent_transactions").insert({
                        "agent_id":  agent_id,
                        "type":      "credit",
                        "amount":    credit_amount,
                        "reference": deposit.get("reference"),
                    }).execute()

                    logger.info(
                        "DEPOSIT RETRY: deposit %s credited GH₵%s to agent %s ✅ — new balance: GH₵%s",
                        dep_id, credit_amount, agent_id, new_balance
                    )

                except Exception as e:
                    logger.error("DEPOSIT RETRY: error on deposit %s: %s", dep_id, str(e))

        except Exception as e:
            logger.error("DEPOSIT RETRY ERROR: %s", str(e))

        await asyncio.sleep(300)


@app.on_event("startup")
async def startup_event():
    log_agyekumdata_categories()
    asyncio.create_task(retry_stuck_orders())
    asyncio.create_task(retry_stuck_deposits())


# =========================
# SPACEMAIL SMTP
# =========================

def send_otp_email(to_email: str, otp: str, full_name: str) -> bool:
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = "EVOS Data Hub — Password Reset OTP"
        msg["From"]    = f"EVOS Data Hub <{SMTP_USER}>"
        msg["To"]      = to_email

        html = f"""
        <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;
                    padding:24px;border:1px solid #eee;border-radius:8px;">
            <h2 style="color:#1a1a1a;">Password Reset</h2>
            <p>Hi <strong>{full_name}</strong>,</p>
            <p>Use the OTP below to reset your EVOS Data Hub password.
               It expires in <strong>10 minutes</strong>.</p>
            <div style="font-size:36px;font-weight:bold;letter-spacing:8px;
                        text-align:center;padding:16px;background:#f4f4f4;
                        border-radius:6px;margin:24px 0;">
                {otp}
            </div>
            <p style="color:#888;font-size:13px;">
                If you didn't request this, ignore this email.
                Your password won't change.
            </p>
            <p style="color:#888;font-size:13px;">— EVOS Data Hub Team</p>
        </div>
        """

        msg.attach(MIMEText(html, "html"))

        with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT) as server:
            server.login(SMTP_USER, SMTP_PASSWORD)
            server.sendmail(SMTP_USER, to_email, msg.as_string())

        logger.info("OTP EMAIL: sent to %s", to_email)
        return True

    except Exception as e:
        logger.error("SPACEMAIL SMTP ERROR: %s", str(e))
        return False


# =========================
# ORDERS
# =========================
@app.get("/orders/me")
@limiter.limit("30/minute")
def get_user_orders(request: Request, user_id: int = Query(...)):
    try:
        orders = supabase.table("orders").select("*").eq("user_id", user_id).execute()
        return {"status": "success", "orders": orders.data or []}
    except Exception as e:
        logger.error("GET ORDERS ERROR: %s", str(e))
        raise HTTPException(status_code=500, detail="Failed to fetch orders")

@app.get("/orders/track")
@limiter.limit("20/minute")
def track_orders(request: Request, phone: str = Query(...)):
    try:
        cleaned = normalise_phone(phone)
        orders = supabase.table("orders") \
            .select("network, bundle, price, phone_number, status, created_at, evosdata_ref, paystack_ref") \
            .eq("phone_number", cleaned) \
            .order("created_at", desc=True) \
            .limit(10) \
            .execute()
        return {"orders": orders.data or []}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("TRACK ERROR: %s", str(e))
        raise HTTPException(500, "Failed to fetch orders")

@app.post("/orders/create")
@limiter.limit("10/minute")
def create_order(request: Request, data: CreateOrderRequest):
    try:
        buyer_key = data.user_id if data.user_id else data.email

        if buyer_key:
            query = supabase.table("orders").select("id, created_at, paystack_ref, network, bundle, price, phone_number")
            if data.user_id:
                query = query.eq("user_id", data.user_id)
            else:
                query = query.eq("guest_email", data.email)

            existing = query \
                .eq("network", data.network) \
                .eq("bundle", data.bundle) \
                .eq("status", "pending_payment") \
                .order("created_at", desc=True) \
                .limit(1) \
                .execute()

            if existing.data:
                order = existing.data[0]
                created_at = parse_db_dt(order["created_at"])
                if utc_now() - created_at < timedelta(minutes=10):
                    if data.user_id:
                        user_res = supabase.table("users").select("email").eq("id", data.user_id).limit(1).execute()
                        customer_email = user_res.data[0]["email"] if user_res.data else "guest@evoshub.com"
                    else:
                        customer_email = data.email or "guest@evoshub.com"

                    new_ref = f"{order['paystack_ref']}-R{uuid.uuid4().hex[:4].upper()}"
                    try:
                        paystack = requests.post(
                            "https://api.paystack.co/transaction/initialize",
                            headers={"Authorization": f"Bearer {PAYSTACK_SECRET}", "Content-Type": "application/json"},
                            json={
                                "email": customer_email,
                                "amount": int(float(order["price"]) * 100),
                                "reference": new_ref,
                                "callback_url": "https://evosdata.xyz/success",
                            },
                            timeout=REQUEST_TIMEOUT
                        ).json()
                    except requests.exceptions.RequestException:
                        raise HTTPException(500, "Payment service error")

                    if not paystack.get("status"):
                        raise HTTPException(400, "Payment reinit failed")

                    supabase.table("orders").update({"paystack_ref": new_ref}).eq("id", order["id"]).execute()

                    return {
                        "status": True,
                        "pending": True,
                        "message": f"Pending {order['bundle']} {order['network']} order found. Redirecting to payment...",
                        "reference": new_ref,
                        "payment_url": paystack["data"]["authorization_url"],
                    }

        price_res = supabase.table("prices").select("price").eq("network", data.network).eq("bundle", data.bundle).limit(1).execute()
        if not price_res.data:
            raise HTTPException(400, "Invalid bundle")

        price = float(price_res.data[0]["price"])

        customer_email = None
        if data.user_id:
            user_res = supabase.table("users").select("email").eq("id", data.user_id).limit(1).execute()
            if not user_res.data:
                raise HTTPException(404, "User not found")
            customer_email = user_res.data[0]["email"]
        else:
            customer_email = data.email

        if not customer_email:
            customer_email = "guest@evoshub.com"

        callback_url = "https://evosdata.xyz/success"

        try:
            paystack = requests.post(
                "https://api.paystack.co/transaction/initialize",
                headers={"Authorization": f"Bearer {PAYSTACK_SECRET}", "Content-Type": "application/json"},
                json={"email": customer_email, "amount": int(price * 100), "callback_url": callback_url},
                timeout=REQUEST_TIMEOUT
            ).json()
        except requests.exceptions.RequestException:
            raise HTTPException(500, "Payment service error")

        if not paystack.get("status"):
            raise HTTPException(400, "Payment init failed")

        ref      = paystack["data"]["reference"]
        evos_ref = f"EVOS-{uuid.uuid4().hex[:8].upper()}"

        payload = {
            "user_id":      data.user_id,
            "guest_email":  None if data.user_id else customer_email,
            "network":      data.network,
            "bundle":       data.bundle,
            "price":        price,
            "phone_number": data.phone,
            "paystack_ref": ref,
            "evosdata_ref": evos_ref,
            "status":       "pending_payment"
        }
        supabase.table("orders").insert(payload).execute()

        return {"status": True, "payment_url": paystack["data"]["authorization_url"], "reference": ref}

    except HTTPException:
        raise
    except Exception as e:
        logger.error("CREATE ORDER ERROR: %s", str(e))
        raise HTTPException(status_code=500, detail="Server error")


# =========================
# PAYSTACK WEBHOOK
# =========================
@app.post("/webhook/paystack")
async def paystack_webhook(request: Request):
    try:
        body      = await request.body()
        signature = request.headers.get("x-paystack-signature")

        if not signature or not verify_signature(body, signature, PAYSTACK_SECRET):
            logger.warning("PAYSTACK WEBHOOK: invalid signature from %s", request.client.host)
            print(f"PAYSTACK WEBHOOK: invalid signature from {request.client.host}")
            return {"status": "invalid signature"}

        payload = await request.json()
        event   = payload.get("event")

        # =========================
        # EVENT: charge.success (existing purchase-dispatch logic, unchanged)
        # =========================
        if event == "charge.success":

            reference = payload["data"]["reference"]
            print(f"PAYSTACK WEBHOOK: charge.success received, reference={reference}")

            order_res = supabase.table("orders").select("*").eq("paystack_ref", reference).limit(1).execute()
            if not order_res.data:
                print(f"PAYSTACK WEBHOOK: no order found for reference={reference}")
                return {"status": "not found"}

            order = order_res.data[0]
            if order["status"] != "pending_payment":
                print(f"PAYSTACK WEBHOOK: order {order['id']} already processed (status={order['status']})")
                return {"status": "already processed"}

            supabase.table("orders").update({"status": "paid"}).eq("paystack_ref", reference).execute()
            print(f"PAYSTACK WEBHOOK: order {order['id']} marked as paid")

            if order.get("user_id"):
                increment_user_orders(order["user_id"])

            provider = get_provider(order["network"])
            print(f"PAYSTACK WEBHOOK: resolved provider={provider} for network={order['network']}")

            try:
                if provider == "DATAMART":
                    dm_response = requests.post(
                        f"{DATAMART_BASE}/purchase",
                        headers={"X-API-Key": DATAMART_API_KEY},
                        json={
                            "phoneNumber": order["phone_number"],
                            "network": NETWORK_MAP.get(order["network"]),
                            "capacity": extract_capacity(order["bundle"]),
                            "gateway": "wallet"
                        },
                        timeout=REQUEST_TIMEOUT
                    )
                    dm = dm_response.json()
                    dm_data = dm.get("data", {})
                    supabase.table("orders").update({
                        "status": "processing",
                        "datamart_ref": dm_data.get("orderReference"),
                        "datamart_order_id": dm_data.get("orderId")
                    }).eq("paystack_ref", reference).execute()
                    process_agent_profit(order["id"], reference)
                    print(f"PAYSTACK WEBHOOK: order {order['id']} dispatched to DATAMART orderId={dm_data.get('orderId')}")

                elif provider == "BUNDLES_GHANA":
                    BG_NETWORK_MAP = {"MTN": "MTN", "TELECEL": "Telecel", "AIRTELTIGO": "AirtelTigo", "AT": "AirtelTigo"}
                    network_name = BG_NETWORK_MAP.get(order["network"].upper(), order["network"])
                    bg_bundles = call_bundles_ghana(f"/bundles?network={network_name}")
                    if not bg_bundles.get("success"):
                        raise Exception(f"Bundles Ghana fetch failed: {bg_bundles.get('error')}")

                    bundle_volume = order["bundle"].upper().replace(" ", "")
                    matched = next(
                        (b for b in bg_bundles.get("bundles", [])
                         if b.get("volume", "").upper().replace(" ", "") == bundle_volume
                         and b.get("status") == "active"),
                        None
                    )
                    if not matched:
                        raise Exception(f"No active BG bundle for {network_name} {bundle_volume}")

                    bg_order = call_bundles_ghana("/order", method="POST", body={
                        "bundle_id": matched["id"],
                        "phone": order["phone_number"],
                        "webhook_url": "https://api.evosdata.xyz/webhook/bundlesghana"
                    })
                    if not bg_order.get("success"):
                        raise Exception(f"BG order failed: {bg_order.get('error', bg_order.get('message'))}")

                    supabase.table("orders").update({
                        "status": "processing",
                        "datamart_ref": bg_order["order"]["reference"],
                        "datamart_order_id": str(bg_order["order"]["id"])
                    }).eq("paystack_ref", reference).execute()
                    process_agent_profit(order["id"], reference)
                    print(f"PAYSTACK WEBHOOK: order {order['id']} dispatched to BUNDLES_GHANA orderId={bg_order['order']['id']}")

                elif provider == "SWIFT_DATA_LINK":
                    volume = float(extract_capacity(order["bundle"]) or 0)
                    sdl = call_swift_data_link(network=order["network"], volume=volume, phone=order["phone_number"])
                    if not sdl.get("success"):
                        raise Exception(f"SDL order failed: {sdl.get('error', sdl)}")
                    supabase.table("orders").update({
                        "status": "processing",
                        "datamart_ref": sdl.get("reference"),
                        "datamart_order_id": sdl.get("orderId"),
                    }).eq("paystack_ref", reference).execute()
                    process_agent_profit(order["id"], reference)
                    print(f"PAYSTACK WEBHOOK: order {order['id']} dispatched to SWIFT_DATA_LINK orderId={sdl.get('orderId')}")

                elif provider == "AGYEKUMDATA":
                    package_id = get_agyekumdata_package_id(order["network"], order["bundle"])
                    safe_ref   = sanitise_agyekumdata_ref(reference)
                    agd        = call_agyekumdata_purchase(
                        package_id=package_id,
                        phone=order["phone_number"],
                        client_reference=reference,
                    )
                    if not agd.get("success"):
                        raise Exception(f"AGYEKUMDATA order failed: {agd.get('error', agd)}")
                    agd_data = agd.get("data", {})
                    supabase.table("orders").update({
                        "status":            "processing",
                        "datamart_ref":      agd_data.get("clientReference") or safe_ref,
                        "datamart_order_id": agd_data.get("orderId"),
                    }).eq("paystack_ref", reference).execute()
                    process_agent_profit(order["id"], reference)
                    logger.info(
                        "PAYSTACK WEBHOOK: order %s dispatched to AGYEKUMDATA orderId=%s ✅",
                        order['id'], agd_data.get("orderId")
                    )
                    print(f"PAYSTACK WEBHOOK: order {order['id']} dispatched to AGYEKUMDATA orderId={agd_data.get('orderId')}")

                else:
                    raise Exception("No provider assigned")

                return {"status": "success"}

            except Exception as e:
                logger.error("PURCHASE ERROR: %s", str(e))
                print(f"PURCHASE ERROR: {str(e)}")
                supabase.table("orders").update({"status": "failed"}).eq("paystack_ref", reference).execute()
                return {"status": "purchase failed"}

        # =========================
        # EVENT: transfer.success / transfer.failed / transfer.reversed
        # (agent withdrawal payout status updates)
        # =========================
        elif event in ("transfer.success", "transfer.failed", "transfer.reversed"):

            data      = payload.get("data", {})
            reference = data.get("reference")

            print(f"PAYSTACK WEBHOOK: {event} received, reference={reference}")

            if not reference:
                print("PAYSTACK WEBHOOK: transfer event missing reference, ignoring")
                return {"status": "ignored"}

            wd = supabase.table("agent_withdrawals").select("*").eq("paystack_ref", reference).limit(1).execute()
            if not wd.data:
                print(f"PAYSTACK WEBHOOK: no agent_withdrawals row found for reference={reference}")
                return {"status": "not found"}

            row          = wd.data[0]
            final_status = "paid" if event == "transfer.success" else "failed"

            if row.get("status") == final_status:
                print(f"PAYSTACK WEBHOOK: withdrawal {row.get('id')} already marked {final_status}")
                return {"status": "already processed"}

            supabase.table("agent_withdrawals").update({"status": final_status}).eq("paystack_ref", reference).execute()
            print(f"PAYSTACK WEBHOOK: withdrawal {row.get('id')} updated to status={final_status}")

            if final_status == "paid":
                # -------------------------
                # Record the debit transaction, guarding against duplicate inserts
                # -------------------------
                existing_tx = supabase.table("agent_transactions").select("id").eq("reference", reference).limit(1).execute()
                if not existing_tx.data:
                    supabase.table("agent_transactions").insert({
                        "agent_id":  row["agent_id"],
                        "amount":    -float(row["amount"]),
                        "type":      "withdrawal",
                        "reference": reference,
                    }).execute()
                    print(f"PAYSTACK WEBHOOK: agent_transactions debit recorded for agent={row['agent_id']} amount=-{row['amount']}")
                else:
                    print(f"PAYSTACK WEBHOOK: agent_transactions entry already exists for reference={reference}, skipping insert")
            else:
                # -------------------------
                # Failed or reversed transfer: refund the agent's wallet
                # -------------------------
                wlt = supabase.table("agent_wallets").select("balance").eq("agent_id", row["agent_id"]).limit(1).execute()
                if wlt.data:
                    new_balance = float(wlt.data[0]["balance"]) + float(row["amount"])
                    supabase.table("agent_wallets").update({
                        "balance": new_balance
                    }).eq("agent_id", row["agent_id"]).execute()
                    logger.info("PAYSTACK TRANSFER WEBHOOK: refunded GH₵%s to agent %s", row["amount"], row["agent_id"])
                    print(f"PAYSTACK WEBHOOK: refunded GH₵{row['amount']} to agent {row['agent_id']}, new balance={new_balance}")
                else:
                    print(f"PAYSTACK WEBHOOK: no agent_wallets row found for agent={row['agent_id']}, refund skipped")

            return {"status": "processed"}

        # =========================
        # EVENT: anything else — ignore
        # =========================
        else:
            print(f"PAYSTACK WEBHOOK: ignored event type={event}")
            return {"status": "ignored"}

    except Exception as e:
        logger.error("PAYSTACK WEBHOOK ERROR: %s", str(e))
        print(f"PAYSTACK WEBHOOK ERROR: {str(e)}")
        return {"status": "error"}

# =========================
# DATAMART WEBHOOK
# =========================
@app.post("/webhook/datamart")
async def datamart_webhook(request: Request):
    try:
        body      = await request.body()
        signature = request.headers.get("X-DataMart-Signature")
        event     = request.headers.get("X-DataMart-Event", "")

        if not signature or not verify_datamart_signature(body, signature, DATAMART_WEBHOOK_SECRET):
            raise HTTPException(401, "Invalid signature")

        payload   = await request.json()
        data      = payload.get("data", {})
        order_ref = data.get("orderReference") or data.get("reference")
        order_id  = data.get("orderId")
        status    = str(data.get("status", "")).lower()

        logger.info("DATAMART EVENT: %s", event)
        logger.info("DATAMART REF: %s", order_ref)
        logger.info("DATAMART ORDER ID: %s", order_id)
        logger.info("DATAMART STATUS: %s", status)

        if not order_ref and not order_id:
            return {"received": True}

        final_status = (
            "successful" if status in ["completed", "success", "delivered"]
            else "failed" if status in ["failed", "cancelled", "refunded"]
            else "processing"
        )

        if order_ref:
            supabase.table("orders").update({"status": final_status}).eq("datamart_ref", order_ref).execute()
            logger.info("DATAMART WEBHOOK: updated by datamart_ref=%s → %s", order_ref, final_status)
        elif order_id:
            supabase.table("orders").update({"status": final_status}).eq("datamart_order_id", str(order_id)).execute()
            logger.info("DATAMART WEBHOOK: updated by order_id=%s → %s", order_id, final_status)

        return {"received": True}

    except HTTPException as e:
        logger.warning("DATAMART WEBHOOK AUTH ERROR: %s", str(e.detail))
        raise e
    except Exception as e:
        logger.error("DATAMART WEBHOOK ERROR: %s", str(e))
        return {"received": False}


# =========================
# BUNDLES GHANA WEBHOOK
# =========================
@app.post("/webhook/bundlesghana")
async def bundlesghana_webhook(request: Request):
    try:
        payload   = await request.json()
        event     = payload.get("event", "")
        reference = payload.get("reference")
        status    = str(payload.get("status", "")).lower()

        logger.info("BUNDLES GHANA EVENT: %s", event)
        logger.info("BUNDLES GHANA REF: %s", reference)
        logger.info("BUNDLES GHANA STATUS: %s", status)

        if not reference:
            return {"received": True}

        final_status = (
            "successful" if status in ["delivered"]
            else "processing" if status in ["placed", "processing"]
            else "failed" if status in ["failed", "cancelled", "refunded"]
            else "processing"
        )
        supabase.table("orders").update({"status": final_status}).eq("datamart_ref", reference).execute()
        return {"received": True}
    except Exception as e:
        logger.error("BUNDLES GHANA WEBHOOK ERROR: %s", str(e))
        return {"received": False}


# =========================
# SWIFT DATA LINK WEBHOOK
# =========================
@app.post("/webhook/swiftdatalink")
async def swiftdatalink_webhook(request: Request):
    try:
        payload   = await request.json()
        event     = payload.get("event", "")
        order_id  = payload.get("orderId", "")
        reference = payload.get("reference", "")
        status    = str(payload.get("status", "")).lower()

        logger.info("SDL WEBHOOK EVENT: %s", event)
        logger.info("SDL WEBHOOK ORDER ID: %s", order_id)
        logger.info("SDL WEBHOOK REFERENCE: %s", reference)
        logger.info("SDL WEBHOOK STATUS: %s", status)

        if not order_id and not reference:
            return {"received": True}

        final_status = (
            "successful" if status in ["delivered", "resolved"]
            else "failed" if status in ["failed", "cancelled", "refunded"]
            else "processing"
        )

        if reference:
            supabase.table("orders").update({"status": final_status}).eq("datamart_ref", reference).execute()
            logger.info("SDL WEBHOOK: updated by reference=%s → %s", reference, final_status)
        elif order_id:
            supabase.table("orders").update({"status": final_status}).eq("datamart_order_id", order_id).execute()
            logger.info("SDL WEBHOOK: updated by orderId=%s → %s", order_id, final_status)

        return {"received": True}
    except Exception as e:
        logger.error("SDL WEBHOOK ERROR: %s", str(e))
        return {"received": False}


# =========================
# AGYEKUMDATA WEBHOOK
# =========================
@app.post("/webhook/agyekumdata")
async def agyekumdata_webhook(request: Request):
    try:
        body      = await request.body()
        signature = request.headers.get("X-AGYEKUMDATA-SIGNATURE", "")

        if not verify_agyekumdata_signature(body, signature):
            logger.warning(
                "AGYEKUMDATA WEBHOOK: invalid signature from %s",
                request.client.host
            )
            return {"received": False, "reason": "invalid signature"}

        payload  = await request.json()
        event    = payload.get("event", "")
        order_id = payload.get("orderId", "")
        status   = str(payload.get("status", "")).upper()

        logger.info(
            "AGYEKUMDATA WEBHOOK EVENT=%s ORDER_ID=%s STATUS=%s",
            event, order_id, status
        )

        if event != "ORDER_STATUS_UPDATED":
            logger.info("AGYEKUMDATA WEBHOOK: ignoring event %s", event)
            return {"received": True}

        if not order_id:
            logger.warning("AGYEKUMDATA WEBHOOK: no orderId in payload")
            return {"received": True}

        final_status = (
            "successful" if status in ["SUCCESS", "COMPLETED", "DELIVERED"]
            else "failed"  if status in ["FAILED", "CANCELLED", "REJECTED"]
            else "processing"
        )

        result = supabase.table("orders") \
            .update({"status": final_status}) \
            .eq("datamart_order_id", order_id) \
            .execute()

        if result.data:
            logger.info(
                "AGYEKUMDATA WEBHOOK: updated %d row(s) by orderId=%s → %s",
                len(result.data), order_id, final_status
            )
        else:
            fallback = supabase.table("orders") \
                .update({"status": final_status}) \
                .eq("datamart_ref", order_id) \
                .execute()
            logger.info(
                "AGYEKUMDATA WEBHOOK: fallback updated %d row(s) by datamart_ref=%s → %s",
                len(fallback.data or []), order_id, final_status
            )

        return {"received": True}

    except Exception as e:
        logger.error("AGYEKUMDATA WEBHOOK ERROR: %s", str(e))
        return {"received": False}


# =========================
# SYNC ORDER
# =========================
@app.post("/orders/sync/{reference}")
@limiter.limit("20/minute")
def sync_order(request: Request, reference: str):
    try:
        order_res = supabase.table("orders").select("*").eq("paystack_ref", reference).limit(1).execute()
        if not order_res.data:
            raise HTTPException(404, "Order not found")

        order    = order_res.data[0]
        tracker  = order.get("datamart_order_id") or order.get("datamart_ref")
        if not tracker:
            return {"status": "not processed yet"}

        provider = get_provider(order["network"])

        if provider == "DATAMART":
            dm = requests.get(
                f"{DATAMART_BASE}/order-status/{tracker}",
                headers={"X-API-Key": DATAMART_API_KEY},
                timeout=REQUEST_TIMEOUT
            )
            dm.raise_for_status()
            payload = dm.json()
            status = str(payload.get("data", {}).get("orderStatus", "")).lower()

        elif provider == "BUNDLES_GHANA":
            bg_ref = order.get("datamart_ref")
            if not bg_ref:
                status = order["status"].lower()
            else:
                bg = call_bundles_ghana(f"/order/status/{bg_ref}")
                status = str(bg.get("order", {}).get("status", "processing")).lower()

        elif provider == "SWIFT_DATA_LINK":
            sdl_res = requests.get(
                f"{SWIFT_DATA_LINK_BASE}/order/status/{tracker}",
                headers={"x-api-key": SWIFT_DATA_LINK_API_KEY},
                timeout=REQUEST_TIMEOUT
            ).json()
            status = str(sdl_res.get("order", {}).get("status", "processing")).lower()

        elif provider == "AGYEKUMDATA":
            client_ref = order.get("datamart_ref") or tracker
            agd_res = call_agyekumdata_status(client_reference=client_ref)
            status = str(agd_res.get("data", {}).get("status", "processing")).lower()
            logger.info("SYNC ORDER: AGYEKUMDATA clientRef=%s status=%s", client_ref, status)

        else:
            status = "processing"

        final_status = (
            "successful" if status in ["completed", "success", "delivered", "successful", "resolved"]
            else "failed" if status in ["failed", "cancelled", "refunded"]
            else "processing"
        )
        supabase.table("orders").update({"status": final_status}).eq("paystack_ref", reference).execute()
        return {"status": final_status}

    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error("SYNC ERROR: %s", str(e))
        raise HTTPException(500, "Sync failed")


# =========================
# USER PROFILE
# =========================
@app.get("/users/me")
@limiter.limit("30/minute")
def get_user(request: Request, user_id: int):
    try:
        res = supabase.table("users").select("*").eq("id", user_id).single().execute()
        user = res.data
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        user_data = {
            "id":           user.get("id"),
            "username":     user.get("username"),
            "email":        user.get("email"),
            "full_name":    user.get("full_name"),
            "role":         user.get("role", "user"),
            "agent_status": user.get("agent_status", "pending"),
            "rank":         user.get("rank", 1),
            "referral_code": user.get("referral_code", ""),
        }
        return {"status": "success", "user": user_data}
    except Exception as e:
        logger.error("GET USER ERROR: %s", str(e))
        raise HTTPException(status_code=500, detail="Failed to fetch user")


# =========================
# AGENT DASHBOARD
# =========================
@app.get("/agent/dashboard/{agent_id}")
@limiter.limit("30/minute")
async def agent_dashboard(request: Request, agent_id: int, _: int = Depends(require_agent)):
    user = supabase.table("users").select("role, agent_status").eq("id", agent_id).limit(1).execute()
    if not user.data:
        return {"error": "User not found"}
    u = user.data[0]
    if u["role"] != "agent" or u["agent_status"] != "approved":
        return {"error": "Not authorized"}

    wallet = supabase.table("agent_wallets").select("*").eq("agent_id", agent_id).limit(1).execute()
    balance = wallet.data[0]["balance"] if wallet.data else 0

    transactions = supabase.table("agent_transactions").select("*").eq("agent_id", agent_id).execute()
    total_earned = sum(t["amount"] for t in transactions.data) if transactions.data else 0

    orders = supabase.table("orders").select("id", count="exact").eq("agent_id", agent_id).execute()

    return {
        "wallet_balance":     balance,
        "total_earned":       total_earned,
        "total_sales":        orders.count if hasattr(orders, "count") else len(orders.data or []),
        "transactions_count": len(transactions.data or [])
    }


@app.get("/agent/wallet/{agent_id}")
@limiter.limit("30/minute")
async def get_wallet(request: Request, agent_id: int, _: int = Depends(require_agent)):
    wallet = supabase.table("agent_wallets").select("*").eq("agent_id", agent_id).limit(1).execute()
    if not wallet.data:
        return {"agent_id": agent_id, "balance": 0}
    return wallet.data[0]


@app.get("/agent/transactions/{agent_id}")
@limiter.limit("30/minute")
async def agent_transactions(request: Request, agent_id: int, _: int = Depends(require_agent)):
    res = supabase.table("agent_transactions") \
        .select("*") \
        .eq("agent_id", agent_id) \
        .order("created_at", desc=True) \
        .limit(50) \
        .execute()
    return {"transactions": res.data or []}


@app.get("/agent/sales/{agent_id}")
@limiter.limit("30/minute")
async def agent_sales(request: Request, agent_id: int, _: int = Depends(require_agent)):
    orders = supabase.table("orders") \
        .select("id, agent_price, base_price, created_at") \
        .eq("agent_id", agent_id) \
        .execute()
    data = orders.data or []
    total_profit = sum(
        (o["agent_price"] - o["base_price"])
        for o in data
        if o.get("agent_price") and o.get("base_price")
    )
    return {"total_orders": len(data), "total_profit": total_profit}


# =========================
# AGENT WITHDRAW
# NOTE: "Enable OTP for transfers" must be OFF in the Paystack dashboard
#       (Settings -> Preferences) for this flow to work correctly. That
#       setting sends the OTP to the phone/email registered on the
#       business's Paystack account — NOT to the agent or the transfer
#       recipient — so agents have no way to receive or enter it. With
#       OTP disabled, /transfer returns "success" or "pending" directly
#       and the payout completes without any manual step.
# =========================
@app.get("/agent/withdraw/fee-info")
@limiter.limit("30/minute")
def get_withdraw_fee_info(request: Request):
    return {"fee_percent": WITHDRAWAL_FEE_PERCENT}


@app.post("/agent/withdraw")
@limiter.limit("5/minute")
async def request_withdrawal(request: Request, payload: WithdrawRequest):
    token = request.headers.get("X-Agent-Token", "")
    if not token or not verify_agent_token(token, payload.agent_id):
        raise HTTPException(status_code=403, detail="Forbidden")

    agent_id      = payload.agent_id
    amount        = float(payload.amount)
    mobile_number = payload.mobile_number
    network       = payload.network.upper()
    account_name  = payload.account_name or ""
    provider      = payload.provider  # "paystack" or "moolre", chosen on step 1

    wallet = supabase.table("agent_wallets").select("balance").eq("agent_id", agent_id).limit(1).execute()
    if not wallet.data:
        return {"error": "Wallet not found"}

    balance = float(wallet.data[0]["balance"])
    if amount > balance:
        return {"error": "Insufficient balance"}
    if amount < 5:
        return {"error": "Minimum withdrawal is GH₵5"}

    new_balance = round(balance - amount, 2)
    supabase.table("agent_wallets").update({"balance": new_balance}).eq("agent_id", agent_id).execute()

    def refund():
        supabase.table("agent_wallets").update({"balance": balance}).eq("agent_id", agent_id).execute()

    fee, payout_amount = calc_withdrawal_fee(amount)

    # ── PAYSTACK PATH ───────────────────────────────────────────
    if provider == "paystack":
        if network not in PAYSTACK_MOMO_BANK_CODE:
            refund()
            return {"error": f"Unsupported network for Paystack: {network}"}

        paystack_ref = f"evos-wd-{agent_id}-{uuid.uuid4().hex[:12]}"

        wd = supabase.table("agent_withdrawals").insert({
            "agent_id":       agent_id,
            "amount":         amount,
            "fee":            fee,
            "payout_amount":  payout_amount,
            "account_name":   account_name,
            "account_number": mobile_number,
            "bank_name":      network,
            "status":         "processing",
            "provider":       "paystack",
            "paystack_ref":   paystack_ref,
        }).execute()

        if not wd.data:
            refund()
            return {"error": "Failed to create withdrawal record"}

        withdrawal_id = wd.data[0]["id"]

        recipient = paystack_create_recipient(account_name or "EVOS Agent", mobile_number, network)
        if not recipient.get("status"):
            refund()
            supabase.table("agent_withdrawals").update({"status": "failed"}).eq("id", withdrawal_id).execute()
            return {"error": recipient.get("message", "Could not create transfer recipient")}

        recipient_code = recipient["data"]["recipient_code"]
        # NOTE: only the post-fee amount is actually transferred. The agent's
        # wallet was already debited the full `amount` above.
        transfer = paystack_initiate_transfer(
            amount=payout_amount,
            recipient_code=recipient_code,
            reference=paystack_ref,
            reason=f"EVOS Agent Withdrawal #{withdrawal_id}",
        )

        if not transfer.get("status"):
            refund()
            supabase.table("agent_withdrawals").update({"status": "failed"}).eq("id", withdrawal_id).execute()
            return {"error": transfer.get("message", "Paystack transfer failed")}

        tdata           = transfer.get("data", {})
        transfer_status = tdata.get("status")   # expected "success" | "pending" with OTP disabled

        # Safety net: if OTP somehow gets re-enabled on the Paystack dashboard
        # and a transfer comes back requiring it, we can't ask the agent for
        # a code they'll never receive — fail safely and refund instead of
        # silently holding their balance forever.
        if transfer_status == "otp":
            refund()
            supabase.table("agent_withdrawals").update({"status": "failed"}).eq("id", withdrawal_id).execute()
            logger.error(
                "PAYSTACK WITHDRAW: transfer %s came back requiring OTP — is 'Enable OTP for "
                "transfers' still on in the Paystack dashboard? Refunding agent %s.",
                withdrawal_id, agent_id
            )
            return {
                "error": "Withdrawals are temporarily unavailable. Please contact support.",
            }

        final_status = "paid" if transfer_status == "success" else "processing"

        supabase.table("agent_withdrawals").update({
            "status": final_status,
            "paystack_transfer_code": tdata.get("transfer_code"),
        }).eq("id", withdrawal_id).execute()

        supabase.table("agent_transactions").insert({
            "agent_id":  agent_id,
            "amount":    -amount,
            "type":      "withdrawal",
            "reference": paystack_ref,
        }).execute()

        return {
            "status":          "success",
            "provider":        "paystack",
            "message":         "Transfer initiated. Funds will arrive shortly.",
            "withdrawal_id":   withdrawal_id,
            "transfer_status": final_status,
            "amount":          amount,
            "fee":             fee,
            "payout_amount":   payout_amount,
        }

    # ── MOOLRE PATH (unchanged behaviour, now explicitly chosen) ──
    channel = MOOLRE_CHANNEL_MAP.get(network)
    if not channel:
        refund()
        return {"error": f"Unsupported network: {network}"}

    external_ref = f"EVOS-WD-{agent_id}-{uuid.uuid4().hex[:8].upper()}"

    wd = supabase.table("agent_withdrawals").insert({
        "agent_id":       agent_id,
        "amount":         amount,
        "fee":            fee,
        "payout_amount":  payout_amount,
        "account_name":   account_name,
        "account_number": mobile_number,
        "bank_name":      network,
        "status":         "processing",
        "provider":       "moolre",
        "moolre_ref":     external_ref,
    }).execute()

    if not wd.data:
        refund()
        return {"error": "Failed to create withdrawal record"}

    withdrawal_id = wd.data[0]["id"]

    try:
        # NOTE: only the post-fee amount is actually transferred. The agent's
        # wallet was already debited the full `amount` above.
        moolre_res = call_moolre("transfer", {
            "type":          1,
            "channel":       channel,
            "currency":      "GHS",
            "amount":        str(payout_amount),
            "receiver":      mobile_number,
            "externalref":   external_ref,
            "reference":     f"EVOS Agent Withdrawal #{withdrawal_id}",
            "accountnumber": MOOLRE_ACCOUNT_NUMBER,
        })

        if str(moolre_res.get("status")) == "1":
            tx_data      = moolre_res.get("data", {})
            tx_status    = tx_data.get("txstatus", 0) if isinstance(tx_data, dict) else 0
            final_status = "paid" if tx_status == 1 else "processing"
            supabase.table("agent_withdrawals").update({"status": final_status}).eq("id", withdrawal_id).execute()
            supabase.table("agent_transactions").insert({
                "agent_id":  agent_id,
                "amount":    -amount,
                "type":      "withdrawal",
                "reference": external_ref
            }).execute()
            return {
                "status":          "success",
                "provider":        "moolre",
                "message":         "Transfer initiated. Funds will arrive shortly.",
                "withdrawal_id":   withdrawal_id,
                "transfer_status": final_status,
                "amount":          amount,
                "fee":             fee,
                "payout_amount":   payout_amount,
            }
        else:
            refund()
            supabase.table("agent_withdrawals").update({"status": "failed"}).eq("id", withdrawal_id).execute()
            error_msg = moolre_res.get("message", "Transfer failed")
            if isinstance(error_msg, list):
                error_msg = " ".join(error_msg)
            return {"error": error_msg or "Moolre transfer failed"}

    except Exception as e:
        logger.error("MOOLRE TRANSFER ERROR: %s", str(e))
        refund()
        supabase.table("agent_withdrawals").update({"status": "failed"}).eq("id", withdrawal_id).execute()
        return {"error": "Transfer service error. Funds refunded to wallet."}

# =========================
# AGENT WITHDRAW — VERIFY ACCOUNT (resolves name before confirming)
# =========================
@app.post("/agent/withdraw/verify-account")
@limiter.limit("10/minute")
async def verify_withdraw_account(request: Request, payload: VerifyAccountRequest):
    token = request.headers.get("X-Agent-Token", "")
    if not token or not verify_agent_token(token, payload.agent_id):
        raise HTTPException(status_code=403, detail="Forbidden")

    network = payload.network.upper()

    if payload.provider == "paystack":
        recipient = paystack_create_recipient("EVOS Agent", payload.mobile_number, network)
        if not recipient.get("status"):
            error_msg = recipient.get("message", "Could not verify account")
            return {"status": "error", "message": error_msg}

        rdata = recipient.get("data", {})
        details = rdata.get("details", {})
        return {
            "status": "success",
            "provider": "paystack",
            "account_name": details.get("account_name") or "",
            "recipient_code": rdata.get("recipient_code"),
            "mobile_number": payload.mobile_number,
            "network": network,
        }

    # Moolre has no name-resolution endpoint in this integration —
    # fall back to whatever name the agent types in on the frontend.
    return {
        "status": "success",
        "provider": "moolre",
        "account_name": "",
        "mobile_number": payload.mobile_number,
        "network": network,
        "note": "Moolre does not support account name lookup — agent must confirm name manually.",
    }
        

@app.get("/agent/withdrawal/status/{withdrawal_id}")
@limiter.limit("20/minute")
async def check_withdrawal_status(request: Request, withdrawal_id: int):
    try:
        wd = supabase.table("agent_withdrawals").select("*").eq("id", withdrawal_id).limit(1).execute()
        if not wd.data:
            return {"error": "Withdrawal not found"}

        row = wd.data[0]

        token = request.headers.get("X-Agent-Token", "")
        if not token or not verify_agent_token(token, row["agent_id"]):
            raise HTTPException(status_code=403, detail="Forbidden")

        if row.get("status") in ["paid", "failed", "rejected"]:
            return {"status": row.get("status"), "withdrawal": row}

        provider = row.get("provider", "moolre")
        final_status = row.get("status")

        if provider == "paystack":
            ref = row.get("paystack_ref")
            if not ref:
                return {"status": final_status, "withdrawal": row}
            result = paystack_verify_transfer(ref)
            if result.get("status"):
                t_status = result.get("data", {}).get("status")
                final_status = "paid" if t_status == "success" else "failed" if t_status == "failed" else "processing"
        else:
            moolre_ref = row.get("moolre_ref")
            if not moolre_ref:
                return {"status": final_status, "withdrawal": row}
            status_res = call_moolre("status", {
                "type":          1,
                "idtype":        1,
                "id":            moolre_ref,
                "accountnumber": MOOLRE_ACCOUNT_NUMBER,
            })
            if str(status_res.get("status")) == "1":
                tx_status    = status_res.get("data", {}).get("txstatus", 0)
                final_status = "paid" if tx_status == 1 else "failed" if tx_status == 2 else "processing"

        if final_status != row.get("status"):
            supabase.table("agent_withdrawals").update({"status": final_status}).eq("id", withdrawal_id).execute()
            if final_status == "failed":
                wlt = supabase.table("agent_wallets").select("balance").eq("agent_id", row["agent_id"]).limit(1).execute()
                if wlt.data:
                    supabase.table("agent_wallets").update({
                        "balance": float(wlt.data[0]["balance"]) + float(row["amount"])
                    }).eq("agent_id", row["agent_id"]).execute()

        return {"status": final_status, "withdrawal": row}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("WITHDRAWAL STATUS ERROR: %s", str(e))
        return {"error": "Failed to check status"}

# =========================
# MOOLRE WEBHOOK
# =========================
@app.post("/webhook/moolre")
async def moolre_webhook(request: Request):
    try:
        payload      = await request.json()
        data         = payload.get("data", {})
        external_ref = data.get("externalref") or payload.get("externalref")
        tx_status    = data.get("txstatus") if isinstance(data, dict) else payload.get("txstatus")

        if not external_ref:
            return {"received": True}

        if not str(external_ref).startswith("EVOS-WD-"):
            logger.info("MOOLRE WEBHOOK: ignoring non-withdrawal ref %s", external_ref)
            return {"received": True}

        wd = supabase.table("agent_withdrawals").select("*").eq("moolre_ref", external_ref).limit(1).execute()
        if not wd.data:
            logger.warning("MOOLRE WEBHOOK: withdrawal not found for ref %s", external_ref)
            return {"received": True}

        row = wd.data[0]
        final_status = (
            "paid"        if tx_status == 1
            else "failed" if tx_status == 2
            else "processing"
        )

        supabase.table("agent_withdrawals").update({"status": final_status}).eq("moolre_ref", external_ref).execute()

        if final_status == "paid" and row.get("status") != "paid":
            supabase.table("agent_transactions").insert({
                "agent_id":  row["agent_id"],
                "amount":    -float(row["amount"]),
                "type":      "withdrawal",
                "reference": external_ref
            }).execute()

        if final_status == "failed" and row.get("status") != "failed":
            wlt = supabase.table("agent_wallets").select("balance").eq("agent_id", row["agent_id"]).limit(1).execute()
            if wlt.data:
                current = float(wlt.data[0]["balance"])
                supabase.table("agent_wallets").update({
                    "balance": current + float(row["amount"])
                }).eq("agent_id", row["agent_id"]).execute()
                logger.info("MOOLRE WEBHOOK: refunded GH₵%s to agent %s", row['amount'], row['agent_id'])

        logger.info("MOOLRE WEBHOOK: withdrawal %s updated to %s", external_ref, final_status)
        return {"received": True}
    except Exception as e:
        logger.error("MOOLRE WEBHOOK ERROR: %s", str(e))
        return {"received": False}


# =========================
# ADMIN WITHDRAWALS — PROTECTED
# =========================
@app.post("/admin/withdrawals/{withdrawal_id}/paid")
async def mark_paid(withdrawal_id: int, _: None = Depends(require_admin)):
    supabase.table("agent_withdrawals").update({"status": "paid"}).eq("id", withdrawal_id).execute()
    return {"status": "paid"}


@app.post("/admin/withdrawals/{withdrawal_id}/reject")
async def reject_withdrawal(withdrawal_id: int, _: None = Depends(require_admin)):
    req = supabase.table("agent_withdrawals").select("*").eq("id", withdrawal_id).limit(1).execute()
    if not req.data:
        return {"error": "Not found"}

    row = req.data[0]
    if row["status"] != "pending":
        return {"error": "Already processed"}

    wallet  = supabase.table("agent_wallets").select("balance").eq("agent_id", row["agent_id"]).limit(1).execute()
    current = float(wallet.data[0]["balance"])
    supabase.table("agent_wallets").update({"balance": current + float(row["amount"])}).eq("agent_id", row["agent_id"]).execute()
    supabase.table("agent_withdrawals").update({"status": "rejected"}).eq("id", withdrawal_id).execute()
    return {"status": "rejected"}


# =========================
# AGENT PRICING
# =========================
@app.get("/agent/pricing/{agent_id}")
@limiter.limit("30/minute")
def get_agent_pricing(request: Request, agent_id: int, _: int = Depends(require_agent)):
    try:
        base_res     = supabase.table("base_prices").select("*").execute()
        base_prices  = base_res.data or []

        override_res = supabase.table("admin_agent_prices") \
            .select("*") \
            .eq("agent_id", agent_id) \
            .execute()
        override_prices = override_res.data or []

        override_map = {}
        for row in override_prices:
            if not row:
                continue
            key = f"{row.get('network','').strip().lower()}-{row.get('bundle','').strip().lower()}"
            override_map[key] = float(row.get("cost_price", 0) or 0)

        agent_res    = supabase.table("agent_prices").select("*").eq("agent_id", agent_id).execute()
        agent_prices = agent_res.data or []

        markup_map = {}
        for row in agent_prices:
            if not row:
                continue
            key = f"{row.get('network','').strip().lower()}-{row.get('bundle','').strip().lower()}"
            markup_map[key] = float(row.get("markup", 0) or 0)

        result = []
        for item in base_prices:
            if not item:
                continue
            network  = item.get("network", "").strip()
            bundle   = item.get("bundle", "").strip()
            key      = f"{network.lower()}-{bundle.lower()}"

            if key in override_map:
                base_price = override_map[key]
            else:
                base_price = float(item.get("cost_price", 0) or 0)

            markup = float(markup_map.get(key, 0) or 0)
            result.append({
                "network":          network,
                "bundle":           bundle,
                "base_price":       base_price,
                "markup":           markup,
                "final_price":      round(base_price + markup, 2),
                "has_override":     key in override_map,
            })

        return {"status": "success", "prices": result}
    except Exception as e:
        logger.error("AGENT PRICING ERROR: %s", str(e))
        return {"status": "error", "prices": []}


@app.post("/agent/pricing/save")
@limiter.limit("10/minute")
def save_agent_pricing(request: Request, payload: dict):
    try:
        agent_id = str(payload.get("agent_id", "")).strip()
        prices   = payload.get("prices", [])

        if not agent_id:
            return {"status": "failed", "message": "agent_id required"}

        token = request.headers.get("X-Agent-Token", "")
        try:
            agent_id_int = int(agent_id)
        except ValueError:
            return {"status": "failed", "message": "Invalid agent_id"}
        if not token or not verify_agent_token(token, agent_id_int):
            raise HTTPException(status_code=403, detail="Forbidden")

        supabase.table("agent_prices").delete().eq("agent_id", agent_id).execute()

        rows = []
        for item in prices:
            network = str(item.get("network", "")).strip()
            bundle  = str(item.get("bundle", "")).strip()
            try:
                markup = float(item.get("markup", 0) or 0)
            except:
                markup = 0
            rows.append({"agent_id": agent_id, "network": network, "bundle": bundle, "markup": markup})

        if rows:
            supabase.table("agent_prices").insert(rows).execute()

        return {"status": "success"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("SAVE AGENT PRICING ERROR: %s", str(e))
        return {"status": "failed", "message": "Unable to save pricing"}


# =========================
# ADMIN: PER-AGENT BASE PRICE OVERRIDES
# =========================
@app.get("/admin/agent-prices")
def admin_get_agent_prices(request: Request, _: None = Depends(require_admin)):
    try:
        rows = supabase.table("admin_agent_prices").select("*").order("agent_id").execute()
        return {"status": "success", "data": rows.data or []}
    except Exception as e:
        logger.error("ADMIN AGENT PRICES GET ERROR: %s", str(e))
        raise HTTPException(500, "Failed to fetch agent prices")


@app.post("/admin/agent-prices")
def admin_set_agent_price(request: Request, payload: dict, _: None = Depends(require_admin)):
    try:
        agent_id   = int(payload["agent_id"])
        network    = str(payload["network"]).strip().upper()
        bundle     = str(payload["bundle"]).strip()
        cost_price = float(payload["cost_price"])

        supabase.table("admin_agent_prices").upsert({
            "agent_id":   agent_id,
            "network":    network,
            "bundle":     bundle,
            "cost_price": cost_price,
            "updated_at": utc_now().isoformat(),
        }, on_conflict="agent_id,network,bundle").execute()

        return {"status": "success"}
    except Exception as e:
        logger.error("ADMIN AGENT PRICES SET ERROR: %s", str(e))
        raise HTTPException(500, "Failed to set agent price")


@app.delete("/admin/agent-prices/{override_id}")
def admin_delete_agent_price(override_id: int, request: Request, _: None = Depends(require_admin)):
    try:
        supabase.table("admin_agent_prices").delete().eq("id", override_id).execute()
        return {"status": "deleted"}
    except Exception as e:
        logger.error("ADMIN AGENT PRICES DELETE ERROR: %s", str(e))
        raise HTTPException(500, "Failed to delete")

# =========================
# AGENT WALLET DEPOSIT
# =========================
@app.post("/agent/deposit/initiate")
@limiter.limit("10/minute")
async def initiate_deposit(request: Request, payload: DepositInitiateRequest):
    try:
        token = request.headers.get("X-Agent-Token", "")
        if not token or not verify_agent_token(token, payload.agent_id):
            raise HTTPException(status_code=403, detail="Forbidden")

        agent_id     = payload.agent_id
        amount       = payload.amount
        total_charge = payload.total_charge

        user_res = supabase.table("users").select("email, username").eq("id", agent_id).limit(1).execute()
        if not user_res.data:
            return {"error": "Agent not found"}

        agent_email = user_res.data[0].get("email", "")
        reference   = f"EVOS-DEP-{agent_id}-{uuid.uuid4().hex[:10].upper()}"

        async with httpx.AsyncClient() as client:
            res = await client.post(
                "https://api.paystack.co/transaction/initialize",
                headers={"Authorization": f"Bearer {PAYSTACK_SECRET}", "Content-Type": "application/json"},
                json={
                    "email":     agent_email,
                    "amount":    int(total_charge * 100),
                    "reference": reference,
                    "currency":  "GHS",
                    "metadata": {
                        "agent_id":      agent_id,
                        "type":          "wallet_deposit",
                        "credit_amount": amount,
                    },
                    "callback_url": f"{os.getenv('FRONTEND_URL', 'https://evosdata.xyz')}/success?type=deposit",
                },
            )
            data = res.json()

        if not data.get("status"):
            return {"error": data.get("message", "Paystack init failed")}

        paystack_ref = data["data"].get("reference", reference)

        supabase.table("wallet_deposits").insert({
            "agent_id":     agent_id,
            "reference":    reference,
            "paystack_ref": paystack_ref,
            "amount":       amount,
            "total_charge": total_charge,
            "status":       "pending",
        }).execute()

        return {"status": "created", "reference": reference, "payment_url": data["data"]["authorization_url"]}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("DEPOSIT INITIATE ERROR: %s", str(e))
        return {"error": "Failed to initiate deposit"}


@app.post("/agent/deposit/verify")
@limiter.limit("20/minute")
async def verify_deposit(request: Request, payload: dict):
    try:
        reference = str(payload.get("reference", "")).strip()
        if not reference:
            return {"error": "reference required"}

        lookup_col = "reference" if reference.startswith("EVOS-DEP-") else "paystack_ref"

        existing = supabase.table("wallet_deposits").select("*").eq(lookup_col, reference).limit(1).execute()
        if not existing.data:
            return {"error": "Deposit record not found"}

        deposit = existing.data[0]

        token = request.headers.get("X-Agent-Token", "")
        if not token or not verify_agent_token(token, deposit["agent_id"]):
            raise HTTPException(status_code=403, detail="Forbidden")

        if deposit.get("status") == "credited":
            wallet_res = supabase.table("agent_wallets").select("balance").eq("agent_id", deposit["agent_id"]).limit(1).execute()
            balance = float(wallet_res.data[0]["balance"]) if wallet_res.data else 0
            return {"status": "already_credited", "wallet_balance": balance}

        verify_ref = deposit.get("paystack_ref") or deposit.get("reference")
        async with httpx.AsyncClient() as client:
            res = await client.get(
                f"https://api.paystack.co/transaction/verify/{verify_ref}",
                headers={"Authorization": f"Bearer {PAYSTACK_SECRET}"},
            )
            data = res.json()

        if not data.get("status") or data["data"].get("status") != "success":
            supabase.table("wallet_deposits").update({"status": "failed"}).eq("id", deposit["id"]).execute()
            return {"error": "Payment not successful", "paystack_status": data["data"].get("status")}

        agent_id      = deposit["agent_id"]
        credit_amount = float(deposit["amount"])

        wallet_res = supabase.table("agent_wallets").select("balance").eq("agent_id", agent_id).limit(1).execute()
        if wallet_res.data:
            current_balance = float(wallet_res.data[0]["balance"] or 0)
            new_balance     = round(current_balance + credit_amount, 2)
            supabase.table("agent_wallets").update({"balance": new_balance}).eq("agent_id", agent_id).execute()
        else:
            new_balance = round(credit_amount, 2)
            supabase.table("agent_wallets").insert({"agent_id": agent_id, "balance": new_balance}).execute()

        supabase.table("wallet_deposits").update({"status": "credited"}).eq("id", deposit["id"]).execute()
        supabase.table("agent_transactions").insert({
            "agent_id":  agent_id,
            "type":      "credit",
            "amount":    credit_amount,
            "reference": deposit.get("reference"),
            "note":      "Wallet top-up via Paystack",
        }).execute()

        return {"status": "credited", "credited_amount": credit_amount, "wallet_balance": new_balance}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("DEPOSIT VERIFY ERROR: %s", str(e))
        return {"error": "Verification failed"}


# =========================
# AGENT BUY DATA
# =========================
@app.post("/agent/buy-data")
@limiter.limit("10/minute")
async def agent_buy_data(request: Request, payload: AgentBuyDataRequest):
    try:
        token = request.headers.get("X-Agent-Token", "")
        if not token or not verify_agent_token(token, payload.agent_id):
            raise HTTPException(status_code=403, detail="Forbidden")

        agent_id     = payload.agent_id
        network      = payload.network
        bundle       = payload.bundle
        phone_number = payload.phone_number

        override_res = supabase.table("admin_agent_prices") \
            .select("cost_price") \
            .eq("agent_id", agent_id) \
            .ilike("network", network) \
            .ilike("bundle", bundle) \
            .limit(1) \
            .execute()

        if override_res.data:
            cost_price = float(override_res.data[0]["cost_price"])
        else:
            price_res = supabase.table("base_prices") \
                .select("cost_price") \
                .ilike("network", network) \
                .ilike("bundle", bundle) \
                .limit(1) \
                .execute()
            if not price_res.data:
                return {"status": "error", "message": "Bundle not found"}
            cost_price = float(price_res.data[0].get("cost_price", 0))

        if cost_price <= 0:
            return {"status": "error", "message": "Invalid bundle price"}

        agent_res = supabase.table("users") \
            .select("username") \
            .eq("id", agent_id) \
            .eq("role", "agent") \
            .eq("agent_status", "approved") \
            .limit(1) \
            .execute()
        if not agent_res.data:
            return {"status": "error", "message": "Agent not found or not approved"}

        # ── DUPLICATE GUARD ─────────────────────────────────────────────
        # Block the exact same agent+network+bundle+phone combo from being
        # bought again within 5 minutes (accidental double-click / double-tap,
        # or a resubmit after a slow response). Looks at recent orders
        # regardless of status, since even a "failed" one still means the
        # same request just went through moments ago.
        dupe_floor = (utc_now() - timedelta(minutes=5)).isoformat()
        dupe_res = supabase.table("orders") \
            .select("id, created_at") \
            .eq("agent_id", agent_id) \
            .ilike("network", network) \
            .ilike("bundle", bundle) \
            .eq("phone_number", phone_number) \
            .gte("created_at", dupe_floor) \
            .order("created_at", desc=True) \
            .limit(1) \
            .execute()

        if dupe_res.data:
            last_order_at = parse_db_dt(dupe_res.data[0]["created_at"])
            wait_left = timedelta(minutes=5) - (utc_now() - last_order_at)
            wait_seconds = max(int(wait_left.total_seconds()), 1)
            return {
                "status": "error",
                "message": (
                    f"You just bought {bundle} for {phone_number} moments ago. "
                    f"Please wait {wait_seconds}s before repeating this exact order."
                ),
                "duplicate": True,
                "retry_after_seconds": wait_seconds,
            }

        wallet_res = supabase.table("agent_wallets").select("balance").eq("agent_id", agent_id).limit(1).execute()
        wallet_balance = float(wallet_res.data[0]["balance"]) if wallet_res.data else 0.0

        if wallet_balance < cost_price:
            return {"status": "error", "message": f"Insufficient wallet balance. Need GH₵ {cost_price:.2f}, have GH₵ {wallet_balance:.2f}"}

        new_balance = round(wallet_balance - cost_price, 2)
        supabase.table("agent_wallets").update({"balance": new_balance}).eq("agent_id", agent_id).execute()

        reference = f"EVOS-AGT-{agent_id}-{uuid.uuid4().hex[:10].upper()}"

        order_res = supabase.table("orders").insert({
            "agent_id":     agent_id,
            "network":      network,
            "bundle":       bundle,
            "phone_number": phone_number,
            "price":        cost_price,
            "evosdata_ref": reference,
            "paystack_ref": reference,
            "status":       "processing",
        }).execute()

        if not order_res.data:
            supabase.table("agent_wallets").update({"balance": wallet_balance}).eq("agent_id", agent_id).execute()
            return {"status": "error", "message": "Failed to create order"}

        order_id = order_res.data[0].get("id")

        supabase.table("agent_transactions").insert({
            "agent_id":  agent_id,
            "type":      "debit",
            "amount":    cost_price,
            "reference": reference,
            "order_id":  order_id,
        }).execute()

        try:
            provider = get_provider(network)

            if provider == "DATAMART":
                dm_response = requests.post(
                    f"{DATAMART_BASE}/purchase",
                    headers={"X-API-Key": DATAMART_API_KEY},
                    json={
                        "phoneNumber": phone_number,
                        "network":     NETWORK_MAP.get(network.upper()),
                        "capacity":    extract_capacity(bundle),
                        "gateway":     "wallet"
                    },
                    timeout=REQUEST_TIMEOUT
                )
                dm = dm_response.json()
                dm_data = dm.get("data", {})
                supabase.table("orders").update({
                    "datamart_ref": dm_data.get("orderReference"),
                    "datamart_order_id": dm_data.get("orderId"),
                    "status": "processing"
                }).eq("id", order_id).execute()

            elif provider == "BUNDLES_GHANA":
                BG_NETWORK_MAP = {"MTN": "MTN", "TELECEL": "Telecel", "AIRTELTIGO": "AirtelTigo"}
                network_name = BG_NETWORK_MAP.get(network.upper(), network)
                bg_bundles = call_bundles_ghana(f"/bundles?network={network_name}")
                if bg_bundles.get("success"):
                    bundle_volume = bundle.upper().replace(" ", "")
                    matched = next(
                        (b for b in bg_bundles.get("bundles", [])
                         if b.get("volume", "").upper().replace(" ", "") == bundle_volume
                         and b.get("status") == "active"),
                        None
                    )
                    if matched:
                        bg_order = call_bundles_ghana("/order", method="POST", body={
                            "bundle_id":   matched["id"],
                            "phone":       phone_number,
                            "webhook_url": "https://api.evosdata.xyz/webhook/bundlesghana"
                        })
                        if bg_order.get("success"):
                            supabase.table("orders").update({
                                "datamart_ref": bg_order["order"]["reference"],
                                "datamart_order_id": str(bg_order["order"]["id"]),
                                "status": "processing"
                            }).eq("id", order_id).execute()

            elif provider == "SWIFT_DATA_LINK":
                volume = float(extract_capacity(bundle) or 0)
                sdl = call_swift_data_link(network=network, volume=volume, phone=phone_number)
                if sdl.get("success"):
                    supabase.table("orders").update({
                        "datamart_ref": sdl.get("reference"),
                        "datamart_order_id": sdl.get("orderId"),
                        "status": "processing"
                    }).eq("id", order_id).execute()

            elif provider == "AGYEKUMDATA":
                package_id = get_agyekumdata_package_id(network, bundle)
                safe_ref   = sanitise_agyekumdata_ref(reference)
                agd        = call_agyekumdata_purchase(
                    package_id=package_id,
                    phone=phone_number,
                    client_reference=reference,
                )
                if agd.get("success"):
                    agd_data = agd.get("data", {})
                    supabase.table("orders").update({
                        "datamart_ref":      agd_data.get("clientReference") or safe_ref,
                        "datamart_order_id": agd_data.get("orderId"),
                        "status":            "processing",
                    }).eq("id", order_id).execute()
                    logger.info(
                        "AGENT BUY DATA: order %s dispatched to AGYEKUMDATA orderId=%s ✅",
                        order_id, agd_data.get("orderId")
                    )
                else:
                    logger.warning(
                        "AGENT BUY DATA: AGYEKUMDATA rejected order %s: %s",
                        order_id, agd
                    )

        except Exception as dispatch_err:
            logger.error("AGENT BUY DATA DISPATCH ERROR: %s", str(dispatch_err))

        return {
            "status":             "success",
            "message":            f"{bundle} queued for {phone_number}",
            "reference":          reference,
            "order_id":           order_id,
            "new_wallet_balance": new_balance,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error("AGENT BUY DATA ERROR: %s", str(e))
        return {"status": "error", "message": "Something went wrong. Please try again."}


# =========================
# AGENT STORE
# =========================
@app.get("/store/{agent_id}")
@limiter.limit("60/minute")
async def public_agent_store(request: Request, agent_id: int):
    try:
        user = supabase.table("users") \
            .select("id,username,full_name,store_name,role,agent_status") \
            .eq("id", agent_id).limit(1).execute()
        if not user.data:
            return {"status": "error", "message": "Store not found"}
        u = user.data[0]
        if u.get("role") != "agent" or u.get("agent_status") != "approved":
            return {"status": "error", "message": "Store unavailable"}

        prices  = supabase.table("base_prices").select("*").order("network").execute()
        markups = supabase.table("agent_prices").select("*").eq("agent_id", agent_id).execute()

        markup_map = {}
        for m in (markups.data or []):
            key = f"{m['network'].strip().lower()}::{m['bundle'].strip().lower()}"
            markup_map[key] = float(m.get("markup", 0) or 0)

        bundles = []
        for row in (prices.data or []):
            network    = row.get("network", "").strip()
            bundle     = row.get("bundle", "").strip()
            key        = f"{network.lower()}::{bundle.lower()}"
            base_price = float(row.get("cost_price", 0) or 0)
            markup     = float(markup_map.get(key, 0))
            bundles.append({
                "network":     network,
                "bundle":      bundle,
                "base_price":  base_price,
                "markup":      markup,
                "final_price": round(base_price + markup, 2)
            })

        return {
            "status":     "success",
            "agent_id":   agent_id,
            "agent_name": u.get("store_name") or u.get("username") or u.get("full_name") or "Agent",
            "prices":     bundles
        }
    except Exception as e:
        logger.error("STORE ERROR: %s", str(e))
        return {"status": "error", "message": "Failed to load store"}


@app.post("/agent/store-name")
@limiter.limit("10/minute")
async def save_store_name(request: Request, payload: dict):
    try:
        agent_id   = payload.get("agent_id")
        store_name = str(payload.get("store_name", "")).strip()
        if not agent_id:
            return {"error": "agent_id required"}

        token = request.headers.get("X-Agent-Token", "")
        try:
            agent_id_int = int(agent_id)
        except (ValueError, TypeError):
            return {"error": "Invalid agent_id"}
        if not token or not verify_agent_token(token, agent_id_int):
            raise HTTPException(status_code=403, detail="Forbidden")

        if len(store_name) > 40:
            return {"error": "Store name must be 40 characters or less"}
        supabase.table("users").update({"store_name": store_name or None}).eq("id", agent_id).execute()
        return {"status": "success", "store_name": store_name}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("SAVE STORE NAME ERROR: %s", str(e))
        return {"error": "Failed to save store name"}


@app.get("/agent/store-name/{agent_id}")
@limiter.limit("30/minute")
async def get_store_name(request: Request, agent_id: int, _: int = Depends(require_agent)):
    try:
        res = supabase.table("users").select("store_name, username").eq("id", agent_id).limit(1).execute()
        if not res.data:
            return {"error": "Agent not found"}
        return {"store_name": res.data[0].get("store_name") or "", "username": res.data[0].get("username") or ""}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("GET STORE NAME ERROR: %s", str(e))
        return {"error": "Failed to fetch store name"}


# =========================
# STORE ORDER
# =========================
@app.post("/store/order")
@limiter.limit("10/minute")
async def create_store_order(request: Request, payload: StoreOrderRequest):
    try:
        agent_id       = payload.agent_id
        network        = payload.network
        bundle         = payload.bundle
        phone_number   = payload.phone_number
        customer_email = str(payload.email or "customer@evoshub.store").strip()

        agent = supabase.table("users") \
            .select("id,role,agent_status,full_name,username") \
            .eq("id", agent_id).limit(1).execute()
        if not agent.data:
            return {"status": "error", "message": "Store not found"}
        user = agent.data[0]
        if user.get("role") != "agent" or user.get("agent_status") != "approved":
            return {"status": "error", "message": "Store unavailable"}

        base = supabase.table("base_prices").select("cost_price").eq("network", network).eq("bundle", bundle).limit(1).execute()
        if not base.data:
            return {"status": "error", "message": "Bundle not found"}
        base_price = float(base.data[0]["cost_price"])

        markup = supabase.table("agent_prices").select("markup") \
            .eq("agent_id", agent_id).eq("network", network).eq("bundle", bundle).limit(1).execute()
        markup_price = float(markup.data[0].get("markup", 0) or 0) if markup.data else 0.0
        agent_price  = round(base_price + markup_price, 2)

        reference = f"STORE-{agent_id}-{uuid.uuid4().hex[:10].upper()}"

        order = supabase.table("orders").insert({
            "agent_id":     agent_id,
            "email":        customer_email,
            "network":      network,
            "bundle":       bundle,
            "price":        agent_price,
            "phone_number": phone_number,
            "paystack_ref": reference,
            "status":       "pending_payment",
            "base_price":   base_price,
            "agent_price":  agent_price,
            "profit":       markup_price
        }).execute()

        if not order.data:
            return {"status": "error", "message": "Failed to create order"}

        order_id = order.data[0]["id"]

        pay = requests.post(
            "https://api.paystack.co/transaction/initialize",
            json={
                "email":        customer_email,
                "amount":       int(agent_price * 100),
                "reference":    reference,
                "callback_url": f"https://evosdata.xyz/store/{agent_id}",
                "metadata":     {"order_id": order_id, "agent_id": agent_id, "network": network, "bundle": bundle}
            },
            headers={"Authorization": f"Bearer {PAYSTACK_SECRET}", "Content-Type": "application/json"},
            timeout=30
        )
        pay_data = pay.json()

        if not pay_data.get("status"):
            supabase.table("orders").delete().eq("id", order_id).execute()
            return {"status": "error", "message": "Payment initialization failed"}

        return {
            "status":      "created",
            "order_id":    order_id,
            "reference":   reference,
            "pay_amount":  agent_price,
            "payment_url": pay_data["data"]["authorization_url"]
        }
    except Exception as e:
        logger.error("STORE ORDER ERROR: %s", str(e))
        return {"status": "error", "message": "Failed to create order"}


# =========================
# AUTH
# =========================
@app.post("/auth/register")
@limiter.limit("5/minute")
def register(request: Request, data: RegisterRequest):
    try:
        username = data.username
        email    = str(data.email).strip().lower()
        phone    = data.phone

        existing_user = supabase.table("users").select("id").eq("username", username).limit(1).execute()
        if existing_user.data:
            return {"status": "username_taken"}

        existing_email = supabase.table("users").select("id").eq("email", email).limit(1).execute()
        if existing_email.data:
            return {"status": "email_taken"}

        try:
            hashed_password = pwd_context.hash(str(data.password))
        except Exception as e:
            logger.error("HASH ERROR: %s", repr(e))
            raise HTTPException(status_code=500, detail="Password hashing failed")

        referral_code = f"{username}_{phone[-4:]}" if len(phone) >= 4 else username

        insert = supabase.table("users").insert({
            "username":      username,
            "full_name":     data.full_name.strip(),
            "email":         email,
            "phone":         phone,
            "password":      hashed_password,
            "referred_by":   data.referred_by,
            "referral_code": referral_code,
            "order_count":   0,
            "rank":          1
        }).execute()

        if not insert.data:
            raise HTTPException(status_code=500, detail="User creation failed")

        return {"status": "created", "email": email, "username": username, "referral_code": referral_code}

    except HTTPException:
        raise
    except Exception as e:
        logger.error("REGISTER ERROR: %s", str(e))
        raise HTTPException(status_code=500, detail="Server error")


@app.post("/auth/login")
@limiter.limit("10/minute")
def login(request: Request, data: LoginRequest):
    try:
        username = (data.username or "").strip().lower()
        if not username:
            raise HTTPException(status_code=400, detail="Username required")

        user_res = supabase.table("users") \
            .select("*") \
            .or_(f"username.eq.{username},email.eq.{username}") \
            .limit(1) \
            .execute()

        dummy_hash = "$2b$12$KIXzCq3C3T6tFkUd9nj6aO.WwSIFqh4fQieFzpxKx5Mj5.z1rklHC"
        stored_password = user_res.data[0].get("password") if user_res.data else dummy_hash

        try:
            password_ok = pwd_context.verify(data.password, stored_password)
        except Exception:
            password_ok = False

        if not user_res.data or not password_ok:
            return {"status": "invalid_credentials"}

        user = user_res.data[0]

        user_data = {
            "id":            user.get("id"),
            "username":      user.get("username"),
            "email":         user.get("email"),
            "full_name":     user.get("full_name"),
            "referral_code": user.get("referral_code"),
            "rank":          user.get("rank", 1),
            "role":          user.get("role", "user"),
            "agent_status":  user.get("agent_status", "pending"),
            "agent_token":   make_agent_token(user["id"]) if (
                user.get("role") == "agent" and user.get("agent_status") == "approved"
            ) else None,
        }
        return {"status": "ok", "user": user_data}

    except HTTPException:
        raise
    except Exception as e:
        logger.error("LOGIN ERROR: %s", str(e))
        raise HTTPException(status_code=500, detail="Server error")


# =========================
# TODAY DASHBOARD
# =========================
@app.get("/today/{user_id}")
@limiter.limit("30/minute")
def today_dashboard(request: Request, user_id: int):
    try:
        global_orders = supabase.table("orders").select("id", count="exact").execute()
        total_orders  = global_orders.count or 0

        user_orders = supabase.table("orders") \
            .select("*") \
            .eq("user_id", user_id) \
            .order("created_at", desc=True) \
            .execute()
        my_orders = user_orders.data or []

        success_status = ["processing", "successful", "delivered", "initiated"]
        my_successful_orders = [o for o in my_orders if o["status"] in success_status]

        transactions = [
            {
                "network":      row["network"],
                "amount":       f'{row["bundle"]} - GHS {row["price"]}',
                "phone_number": row["phone_number"],
                "evosdata_ref": row["evosdata_ref"],
                "paystack_ref": row["paystack_ref"],
                "datamart_ref": row["datamart_ref"],
                "status":       row["status"],
                "created_at":   row["created_at"]
            }
            for row in my_orders
        ]

        return {
            "global": {"total_orders": total_orders},
            "user": {
                "my_orders":            len(my_orders),
                "my_successful_orders": len(my_successful_orders),
                "transactions":         transactions
            }
        }
    except Exception as e:
        logger.error("TODAY ERROR: %s", str(e))
        raise HTTPException(500, "Server error")


# =========================
# USSD
# =========================
@app.post("/ussd")
@limiter.limit("30/minute")
async def ussd(request: Request):
    data = await request.json()
    phone        = data.get("phoneNumber")
    text         = data.get("text", "")
    user_input   = text.split("*") if text else []

    if text == "":
        return (
            "CON Welcome to EVOS Business Hub\n"
            "1. Buy Data\n"
            "2. My Orders\n"
            "3. Support\n"
        )

    if user_input[0] == "1":
        if len(user_input) == 1:
            return "CON Select Network\n1. MTN\n2. Telecel\n3. AirtelTigo"

        network_map = {"1": "MTN", "2": "TELECEL", "3": "AIRTELTIGO"}
        network = network_map.get(user_input[1])
        if not network:
            return "END Invalid network selected"

        if len(user_input) == 2:
            return f"CON {network} Bundles\n1. 1GB - GH₵5\n2. 2GB - GH₵10\n3. 5GB - GH₵20"

        bundle_map = {"1": ("1GB", 5), "2": ("2GB", 10), "3": ("5GB", 20)}
        bundle_data = bundle_map.get(user_input[2])
        if not bundle_data:
            return "END Invalid bundle selected"

        bundle, price = bundle_data

        try:
            price_res = supabase.table("prices").select("price").eq("network", network).eq("bundle", bundle).limit(1).execute()
            if not price_res.data:
                return "END Bundle not available"

            actual_price = float(price_res.data[0]["price"])
            paystack = requests.post(
                "https://api.paystack.co/transaction/initialize",
                headers={"Authorization": f"Bearer {PAYSTACK_SECRET}", "Content-Type": "application/json"},
                json={"email": f"{phone}@evosdata.ussd", "amount": int(actual_price * 100), "callback_url": "https://evosdata.xyz/success"},
                timeout=REQUEST_TIMEOUT
            ).json()

            if not paystack.get("status"):
                return "END Payment init failed. Try again."

            ref      = paystack["data"]["reference"]
            evos_ref = f"EVOS-{uuid.uuid4().hex[:8].upper()}"

            supabase.table("orders").insert({
                "network":      network,
                "bundle":       bundle,
                "price":        actual_price,
                "phone_number": phone,
                "status":       "pending_payment",
                "evosdata_ref": evos_ref,
                "paystack_ref": ref
            }).execute()

            return (
                f"END Order Created\n"
                f"Network: {network}\n"
                f"Bundle: {bundle}\n"
                f"Pay: {paystack['data']['authorization_url']}"
            )
        except Exception as e:
            logger.error("USSD ERROR: %s", str(e))
            return "END Service temporarily unavailable"

    if user_input[0] == "2":
        return "END Check orders at:\nhttps://evosdata.netlify.app"

    if user_input[0] == "3":
        return "END EVOS Support:\nWhatsApp: +233208718943"

    return "END Invalid request"


# =========================
# FORGOT / RESET PASSWORD
# =========================
import random

class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class VerifyOTPRequest(BaseModel):
    email: EmailStr
    otp: str = Field(min_length=6, max_length=6)


class ResetPasswordRequest(BaseModel):
    email: EmailStr
    otp: str = Field(min_length=6, max_length=6)
    new_password: str = Field(min_length=6, max_length=128)


@app.post("/auth/forgot-password")
@limiter.limit("3/minute")
def forgot_password(request: Request, data: ForgotPasswordRequest):
    try:
        email = str(data.email).strip().lower()

        user_res = supabase.table("users") \
            .select("id, full_name, email") \
            .eq("email", email) \
            .limit(1) \
            .execute()

        if not user_res.data:
            return {"status": "sent", "message": "If that email exists, an OTP has been sent."}

        user    = user_res.data[0]
        user_id = user["id"]

        supabase.table("password_resets") \
            .update({"used": True}) \
            .eq("user_id", user_id) \
            .eq("used", False) \
            .execute()

        otp        = str(random.randint(100000, 999999))
        expires_at = (utc_now() + timedelta(minutes=10)).isoformat()

        supabase.table("password_resets").insert({
            "user_id":    user_id,
            "otp":        otp,
            "expires_at": expires_at,
            "used":       False,
        }).execute()

        sent = send_otp_email(
            to_email  = user["email"],
            otp       = otp,
            full_name = user.get("full_name", "User")
        )

        if not sent:
            logger.error("FORGOT PASSWORD: email failed for user %s", user_id)

        return {"status": "sent", "message": "If that email exists, an OTP has been sent."}

    except Exception as e:
        logger.error("FORGOT PASSWORD ERROR: %s", str(e))
        raise HTTPException(status_code=500, detail="Server error")


@app.post("/auth/verify-otp")
@limiter.limit("5/minute")
def verify_otp(request: Request, data: VerifyOTPRequest):
    try:
        email = str(data.email).strip().lower()

        user_res = supabase.table("users") \
            .select("id") \
            .eq("email", email) \
            .limit(1) \
            .execute()

        if not user_res.data:
            raise HTTPException(status_code=400, detail="Invalid OTP")

        user_id = user_res.data[0]["id"]

        reset_res = supabase.table("password_resets") \
            .select("*") \
            .eq("user_id", user_id) \
            .eq("otp", data.otp) \
            .eq("used", False) \
            .order("created_at", desc=True) \
            .limit(1) \
            .execute()

        if not reset_res.data:
            raise HTTPException(status_code=400, detail="Invalid OTP")

        reset      = reset_res.data[0]
        expires_at = parse_db_dt(reset["expires_at"])

        if utc_now() > expires_at:
            raise HTTPException(status_code=400, detail="OTP has expired")

        return {"status": "valid", "message": "OTP verified. You may now reset your password."}

    except HTTPException:
        raise
    except Exception as e:
        logger.error("VERIFY OTP ERROR: %s", str(e))
        raise HTTPException(status_code=500, detail="Server error")


@app.post("/auth/reset-password")
@limiter.limit("5/minute")
def reset_password(request: Request, data: ResetPasswordRequest):
    try:
        email = str(data.email).strip().lower()

        user_res = supabase.table("users") \
            .select("id") \
            .eq("email", email) \
            .limit(1) \
            .execute()

        if not user_res.data:
            raise HTTPException(status_code=400, detail="Invalid request")

        user_id = user_res.data[0]["id"]

        reset_res = supabase.table("password_resets") \
            .select("*") \
            .eq("user_id", user_id) \
            .eq("otp", data.otp) \
            .eq("used", False) \
            .order("created_at", desc=True) \
            .limit(1) \
            .execute()

        if not reset_res.data:
            raise HTTPException(status_code=400, detail="Invalid OTP")

        reset      = reset_res.data[0]
        expires_at = parse_db_dt(reset["expires_at"])

        if utc_now() > expires_at:
            raise HTTPException(status_code=400, detail="OTP has expired")

        new_hashed = hash_password(data.new_password)
        supabase.table("users") \
            .update({"password": new_hashed}) \
            .eq("id", user_id) \
            .execute()

        supabase.table("password_resets") \
            .update({"used": True}) \
            .eq("id", reset["id"]) \
            .execute()

        logger.info("RESET PASSWORD: user %s reset their password", user_id)
        return {"status": "success", "message": "Password reset successfully. You can now log in."}

    except HTTPException:
        raise
    except Exception as e:
        logger.error("RESET PASSWORD ERROR: %s", str(e))
        raise HTTPException(status_code=500, detail="Server error")


# =========================
# WHATSAPP WEBHOOK
# NOTE: In-memory sessions reset on restart.
#       For persistence, migrate sessions to Supabase or Redis.
# =========================
from fastapi.responses import Response

sessions: dict = {}

def get_session(phone: str):
    if phone not in sessions:
        sessions[phone] = {"step": "start", "network": None, "bundle": None, "price": None}
    return sessions[phone]

def fetch_price(network: str, bundle: str):
    res = supabase.table("prices").select("price").eq("network", network).eq("bundle", bundle).limit(1).execute()
    if not res.data:
        return None
    return float(res.data[0]["price"])

def init_paystack(email: str, amount: float):
    res = requests.post(
        "https://api.paystack.co/transaction/initialize",
        headers={"Authorization": f"Bearer {PAYSTACK_SECRET}", "Content-Type": "application/json"},
        json={"email": email, "amount": int(amount * 100), "callback_url": "https://evosdata.netlify.app/success"}
    )
    data = res.json()
    if not data.get("status"):
        return None
    return data["data"]

@app.post("/whatsapp/webhook")
@limiter.limit("20/minute")
async def whatsapp_webhook(request: Request):
    form    = await request.form()
    message = form.get("Body", "").strip().lower()
    phone   = form.get("From")

    session = get_session(phone)
    reply   = ""

    if message in ["hi", "hello", "start", "menu"]:
        session["step"] = "menu"
        reply = "👋 *EVOS DATA HUB*\n\n1️⃣ Buy Data\n2️⃣ Track Order\n3️⃣ Support"
    elif message == "1" and session["step"] == "menu":
        session["step"] = "network"
        reply = "📡 Select Network:\n\n1️⃣ MTN\n2️⃣ Telecel\n3️⃣ AirtelTigo"
    elif message in ["1", "mtn"] and session["step"] == "network":
        session["network"] = "MTN"
        session["step"]    = "bundle"
        reply = "📦 Send MTN bundle (e.g. 1GB, 2GB)"
    elif message in ["2", "telecel"] and session["step"] == "network":
        session["network"] = "TELECEL"
        session["step"]    = "bundle"
        reply = "📦 Send Telecel bundle"
    elif message in ["3", "airteltigo"] and session["step"] == "network":
        session["network"] = "AIRTELTIGO"
        session["step"]    = "bundle"
        reply = "📦 Send AirtelTigo bundle"
    elif session["step"] == "bundle":
        session["bundle"] = message.upper()
        price = fetch_price(session["network"], session["bundle"])
        if not price:
            reply = "❌ Bundle not found. Try again."
        else:
            session["price"] = price
            session["step"]  = "confirm"
            reply = f"📦 *ORDER SUMMARY*\n\nNetwork: {session['network']}\nBundle: {session['bundle']}\nPrice: GHS {price}\n\n1️⃣ Confirm & Pay\n2️⃣ Cancel"
    elif message == "1" and session["step"] == "confirm":
        evos_ref = f"EVOS-{uuid.uuid4().hex[:8].upper()}"
        paystack = init_paystack(email=f"{phone}@evosdata.com", amount=session["price"])
        if not paystack:
            reply = "❌ Payment initialization failed."
        else:
            paystack_ref = paystack["reference"]
            supabase.table("orders").insert({
                "network":      session["network"],
                "bundle":       session["bundle"],
                "price":        session["price"],
                "phone_number": phone,
                "status":       "pending_payment",
                "evosdata_ref": evos_ref,
                "paystack_ref": paystack_ref
            }).execute()
            reply = f"💳 *PAYMENT READY*\n\nAmount: GHS {session['price']}\n\nPay here:\n{paystack['authorization_url']}\n\nData delivered automatically after payment."
            session["step"] = "done"
    elif message == "2":
        session["step"] = "menu"
        reply = "❌ Order cancelled. Type *menu* to restart."
    elif message == "3":
        reply = "💬 Support: https://wa.me/233208718943"
    else:
        reply = "❌ Invalid input. Type *menu*."

    xml = f"<Response><Message>{reply}</Message></Response>"
    return Response(content=xml, media_type="application/xml")


@app.get("/")
def root():
    return {"status": "EVOS API is running"}
