from fastapi import FastAPI, Request, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

import os
import re
import requests
import hmac
import hashlib
from datetime import datetime, timedelta

from dotenv import load_dotenv
from supabase import create_client, Client

from pydantic import BaseModel, Field, EmailStr
from typing import Optional

from decimal import Decimal

from jose import jwt
from passlib.context import CryptContext

from datetime import datetime, timedelta
import uuid

import asyncio

load_dotenv()

app = FastAPI()

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

BUNDLES_GHANA_API_KEY = os.getenv("BUNDLES_GHANA_API_KEY")
BUNDLES_GHANA_API_SECRET = os.getenv("BUNDLES_GHANA_API_SECRET")
BUNDLES_GHANA_BASE = "https://evosdata.xyz/.netlify/functions/bundlesProxy"

MOOLRE_BASE = os.getenv("MOOLRE_BASE", "https://api.moolre.com/open/transact")  # confirm exact base URL
MOOLRE_USERNAME = os.getenv("MOOLRE_USERNAME")
MOOLRE_API_KEY = os.getenv("MOOLRE_API_KEY")
MOOLRE_ACCOUNT_NUMBER = os.getenv("MOOLRE_ACCOUNT_NUMBER")

# =========================
# SAFETY CHECK (PRODUCTION SAFE)
# =========================
required_envs = {
    "SUPABASE_URL": SUPABASE_URL,
    "SUPABASE_KEY": SUPABASE_KEY,
    "PAYSTACK_SECRET_KEY": PAYSTACK_SECRET,
    "DATAMART_API_KEY": DATAMART_API_KEY,
    "DATAMART_WEBHOOK_SECRET": DATAMART_WEBHOOK_SECRET,
    "BUNDLES_GHANA_API_KEY": BUNDLES_GHANA_API_KEY,
    "BUNDLES_GHANA_API_SECRET": BUNDLES_GHANA_API_SECRET,
    "MOOLRE_USERNAME": MOOLRE_USERNAME,       # add these
    "MOOLRE_API_KEY": MOOLRE_API_KEY,
    "MOOLRE_ACCOUNT_NUMBER": MOOLRE_ACCOUNT_NUMBER,
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



# =========================
# MODELS
# =========================

class RegisterRequest(BaseModel):
    username: str = Field(min_length=3, max_length=20)
    full_name: str = Field(min_length=2, max_length=50)
    email: EmailStr
    phone: str = Field(min_length=10, max_length=15)
    password: str = Field(min_length=6)
    referred_by: Optional[str] = None


class LoginRequest(BaseModel):
    username: str = Field(min_length=3)
    password: str = Field(min_length=6)

from pydantic import BaseModel, EmailStr
from typing import Optional

class CreateOrderRequest(BaseModel):
    user_id: Optional[int] = None
    network: str
    bundle: str
    phone: str
    email: Optional[EmailStr] = None
    
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

# =========================
# BUNDLES GHANA HELPER
# =========================
def call_bundles_ghana(endpoint: str, method: str = "GET", body: dict = None):
    if not endpoint or not isinstance(endpoint, str):
        raise Exception(f"Invalid Bundles Ghana endpoint: {endpoint}")
    try:
        print("CALLING BG PATH:", endpoint, "METHOD:", method)
        res = requests.post(
            BUNDLES_GHANA_BASE,
            json={
                "path": endpoint,
                "method": method,
                "body": body
            },
            timeout=REQUEST_TIMEOUT
        )
        print("BG PROXY STATUS:", res.status_code)
        print("BG PROXY BODY:", res.text[:300])
        return res.json()
    except Exception as e:
        print("BUNDLES GHANA PROXY ERROR:", str(e))
        return {"success": False, "error": str(e)}

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
        print(f"MOOLRE {endpoint} STATUS:", res.status_code)
        print(f"MOOLRE {endpoint} BODY:", res.text[:300])
        return res.json()
    except Exception as e:
        print("MOOLRE ERROR:", str(e))
        return {"status": 0, "message": str(e)}
        
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
        print("HASH ERROR:", str(e))
        raise HTTPException(
            status_code=500,
            detail="Password hashing failed"
        )


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return pwd_context.verify(plain, hashed)
    except Exception as e:
        print("VERIFY ERROR:", str(e))
        return False


# =========================
# UTILITIES
# =========================
def extract_capacity(bundle: str) -> str:
    if not bundle:
        return ""

    return (
        bundle.upper()
        .replace("GB", "")
        .replace("MB", "")
        .strip()
    )

# =========================
# PAYSTACK SIGNATURE
# Uses SHA512
# =========================
def verify_paystack_signature(
    body: bytes,
    signature: str,
    secret: str
) -> bool:
    try:
        if not signature:
            print("PAYSTACK SIGNATURE ERROR: missing signature")
            return False

        computed = hmac.new(
            secret.encode("utf-8"),
            body,
            hashlib.sha512
        ).hexdigest()

        return hmac.compare_digest(computed, signature)

    except Exception as e:
        print("PAYSTACK SIGNATURE ERROR:", str(e))
        return False


# =========================
# DATAMART SIGNATURE
# Uses SHA256 + WEBHOOK SECRET
# =========================
def verify_datamart_signature(
    body: bytes,
    signature: str,
    secret: str
) -> bool:
    try:
        if not signature:
            print("DATAMART SIGNATURE ERROR: missing signature")
            return False

        computed = hmac.new(
            secret.encode("utf-8"),
            body,
            hashlib.sha256
        ).hexdigest()

        return hmac.compare_digest(computed, signature)

    except Exception as e:
        print("DATAMART SIGNATURE ERROR:", str(e))
        return False


# =========================
# LEGACY WRAPPER (OPTIONAL)
# Defaults to Paystack
# =========================
def verify_signature(
    body: bytes,
    signature: str,
    secret: str
) -> bool:
    return verify_paystack_signature(
        body,
        signature,
        secret
    )

# =========================
# NETWORK PROVIDERS
# =========================

def get_provider(network: str):
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
        print("PROVIDER LOOKUP ERROR:", str(e))
        return None

# =========================
# AGENTS STATUS
# =========================
def can_access_agent_system(user):
    return (
        user.role == "agent"
        and user.agent_status == "approved"
    )


# =========================
# CORE PROFIT SYS
# =========================
def handle_successful_order(order):
    base = order.base_price
    agent_price = order.agent_price
    agent_id = order.agent_id

    if agent_id:
        profit = agent_price - base

        credit_wallet(agent_id, profit)

        log_transaction(
            agent_id=agent_id,
            amount=profit,
            order_id=order.id,
            type="credit"
        )


# =========================
# WALLET UPDATE SYS
# =========================
def update_wallet(agent_id, amount):
    wallet = get_wallet(agent_id)

    if not wallet:
        create_wallet(agent_id, amount)
    else:
        wallet.balance += amount
        save(wallet)
# =========================
# PRICES
# =========================
@app.get("/prices")
def get_prices():
    try:
        data = supabase.table("prices").select("*").execute().data
        return {"status": "success", "data": data or []}
    except Exception as e:
        print("PRICES ERROR:", str(e))
        raise HTTPException(status_code=500, detail="Failed to load prices")


# =========================
# BACKGROUND: RETRY STUCK ORDERS + STATUS UPDATE
# =========================

_retry_running = False  # duplicate-instance guard

BG_TIMEOUT = 25  # longer timeout for Netlify proxy chain


async def retry_stuck_orders():
    global _retry_running

    if _retry_running:
        print("RETRY JOB: already running, skipping duplicate")
        return

    _retry_running = True
    await asyncio.sleep(60)  # wait 60s after startup before first run

    while True:
        try:
            # =====================================
            # PART 1: RETRY ORDERS WITH NO PROVIDER REF
            # Orders stuck with no datamart_ref yet
            # =====================================
            print("RETRY JOB: scanning for stuck orders...")

            cutoff = (datetime.utcnow() - timedelta(hours=3)).isoformat()
            floor  = (datetime.utcnow() - timedelta(minutes=10)).isoformat()

            stuck = supabase.table("orders") \
                .select("*") \
                .in_("status", ["paid", "processing"]) \
                .is_("datamart_ref", None) \
                .gte("created_at", cutoff) \
                .lte("created_at", floor) \
                .execute()

            orders = stuck.data or []
            print(f"RETRY JOB: {len(orders)} stuck orders found")

            for order in orders:
                try:
                    provider = get_provider(order["network"])

                    if not provider:
                        print(f"RETRY JOB: no provider for order {order['id']}")
                        continue

                    print(f"RETRY JOB: retrying order {order['id']} via {provider}")

                    # =====================================
                    # DATAMART
                    # =====================================
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

                        if dm_data.get("orderReference"):
                            supabase.table("orders") \
                                .update({
                                    "status": "processing",
                                    "datamart_ref": dm_data.get("orderReference"),
                                    "datamart_order_id": dm_data.get("orderId")
                                }) \
                                .eq("id", order["id"]) \
                                .execute()

                            # Only process profit for Paystack orders, not agent self-orders
                            if order.get("paystack_ref") and not str(order["paystack_ref"]).startswith("EVOS-AGT-"):
                                process_agent_profit(order["id"], order["paystack_ref"])

                            print(f"RETRY JOB: order {order['id']} sent to DATAMART ✅")
                        else:
                            print(f"RETRY JOB: DATAMART rejected order {order['id']}: {dm}")

                    # =====================================
                    # BUNDLES GHANA
                    # =====================================
                    elif provider == "BUNDLES_GHANA":
                        import re as _re

                        BG_NETWORK_MAP = {
                            "MTN": "MTN",
                            "TELECEL": "Telecel",
                            "AIRTELTIGO": "AirtelTigo",
                            "AT": "AirtelTigo",
                        }
                        network_name = BG_NETWORK_MAP.get(order["network"].upper(), order["network"])

                        bg_bundles = call_bundles_ghana(f"/bundles?network={network_name}")

                        if not bg_bundles.get("success"):
                            print(f"RETRY JOB: BG bundle fetch failed for order {order['id']}")
                            continue

                        bundle_volume = order["bundle"].upper().replace(" ", "")
                        matched = next(
                            (b for b in bg_bundles.get("bundles", [])
                             if b.get("volume", "").upper().replace(" ", "") == bundle_volume
                             and b.get("status") == "active"),
                            None
                        )

                        if not matched:
                            print(f"RETRY JOB: no BG bundle match for order {order['id']}")
                            continue

                        # Use longer timeout for BG proxy to avoid false timeouts
                        try:
                            bg_order = call_bundles_ghana(
                                "/order",
                                method="POST",
                                body={
                                    "bundle_id": matched["id"],
                                    "phone": order["phone_number"],
                                    "webhook_url": "https://api.evosdata.xyz/webhook/bundlesghana"
                                }
                            )
                        except Exception as bg_err:
                            print(f"RETRY JOB: BG call error for order {order['id']}: {str(bg_err)}")
                            continue

                        if bg_order.get("success"):
                            supabase.table("orders") \
                                .update({
                                    "status": "processing",
                                    "datamart_ref": bg_order["order"]["reference"],
                                    "datamart_order_id": str(bg_order["order"]["id"])
                                }) \
                                .eq("id", order["id"]) \
                                .execute()

                            if order.get("paystack_ref") and not str(order["paystack_ref"]).startswith("EVOS-AGT-"):
                                process_agent_profit(order["id"], order["paystack_ref"])

                            print(f"RETRY JOB: order {order['id']} sent to BUNDLES_GHANA ✅")

                        else:
                            msg = bg_order.get("message", "")
                            order_type = bg_order.get("type", "")

                            # ── 409: order already exists on BG side ──
                            # Extract the BG ref from the message and save it
                            # so the retry loop stops hitting this order
                            if order_type == "ORDER_FAILED" and "Ref:" in msg:
                                match = _re.search(r'Ref:\s*([\w\-]+)', msg)
                                if match:
                                    existing_ref = match.group(1)
                                    supabase.table("orders") \
                                        .update({
                                            "status": "processing",
                                            "datamart_ref": existing_ref,
                                        }) \
                                        .eq("id", order["id"]) \
                                        .execute()
                                    print(f"RETRY JOB: order {order['id']} recovered from 409 — ref={existing_ref} ✅")
                                    continue

                            print(f"RETRY JOB: BG rejected order {order['id']}: {bg_order}")

                    # =====================================
                    # Mark failed after 3hrs still stuck with no ref
                    # =====================================
                    order_age = datetime.utcnow() - datetime.fromisoformat(
                        order["created_at"].replace("Z", "")
                    )
                    if order_age > timedelta(hours=3):
                        supabase.table("orders") \
                            .update({"status": "failed"}) \
                            .eq("id", order["id"]) \
                            .execute()
                        print(f"RETRY JOB: order {order['id']} marked failed after 3hrs")

                except Exception as e:
                    print(f"RETRY JOB: error on order {order.get('id')}: {str(e)}")

            # =====================================
            # PART 2: SYNC STATUS FOR PROCESSING ORDERS
            # Orders that have a ref but are still "processing"
            # =====================================
            print("STATUS SYNC: scanning for unresolved processing orders...")

            processing = supabase.table("orders") \
                .select("*") \
                .eq("status", "processing") \
                .not_.is_("datamart_ref", None) \
                .gte("created_at", cutoff) \
                .execute()

            proc_orders = processing.data or []
            print(f"STATUS SYNC: {len(proc_orders)} orders to check")

            for order in proc_orders:
                try:
                    provider = get_provider(order["network"])
                    ref = order.get("datamart_ref")
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
                        status = str(payload.get("data", {}).get("orderStatus", "")).lower()

                    elif provider == "BUNDLES_GHANA":
                        if not ref:
                            continue
                        bg = call_bundles_ghana(f"/order/status/{ref}")
                        status = str(bg.get("order", {}).get("status", "processing")).lower()

                    else:
                        continue

                    final_status = (
                        "successful"
                        if status in ["completed", "success", "delivered", "successful"]
                        else "failed"
                        if status in ["failed", "cancelled", "refunded"]
                        else None  # still processing — don't update
                    )

                    if final_status:
                        supabase.table("orders") \
                            .update({"status": final_status}) \
                            .eq("id", order["id"]) \
                            .execute()
                        print(f"STATUS SYNC: order {order['id']} → {final_status} ✅")

                except Exception as e:
                    print(f"STATUS SYNC: error on order {order.get('id')}: {str(e)}")

        except Exception as e:
            print("RETRY JOB ERROR:", str(e))

        await asyncio.sleep(300)  # run every 5 minutes

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(retry_stuck_orders())


# =========================
# ORDERS
# =========================

@app.get("/orders/me")
def get_user_orders(user_id: int = Query(...)):
    try:
        orders = supabase.table("orders") \
            .select("*") \
            .eq("user_id", user_id) \
            .execute()

        return {
            "status": "success",
            "orders": orders.data or []
        }

    except Exception as e:
        print("GET ORDERS ERROR:", str(e))
        raise HTTPException(status_code=500, detail="Failed to fetch orders")
 
 
# =========================
# ORDER TRACKING BY PHONE
# =========================
@app.get("/orders/track")
def track_orders(phone: str = Query(...)):
    try:
        cleaned = phone.strip()
        if not cleaned:
            raise HTTPException(400, "Phone number required")
 
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
        print("TRACK ERROR:", str(e))
        raise HTTPException(500, "Failed to fetch orders")
 

# =========================
# CREATE ORDER (PRODUCTION SAFE)
# =========================
@app.post("/orders/create")
def create_order(data: CreateOrderRequest):

    try:
        import uuid
        from datetime import datetime, timedelta

        # =========================
        # USE USER ID OR EMAIL FOR DUPLICATE CHECK
        # =========================
        buyer_key = data.user_id if data.user_id else data.email

        if buyer_key:
            query = supabase.table("orders") \
                .select("id, created_at, paystack_ref, network, bundle")

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

                created_at = datetime.fromisoformat(
                    order["created_at"].replace("Z", "")
                )

                if datetime.utcnow() - created_at < timedelta(minutes=10):
                    # ── Return existing payment URL instead of erroring ──
                    existing_ref    = order["paystack_ref"]
                    existing_network = order["network"]
                    existing_bundle  = order["bundle"]

                    return {
                        "status":      True,
                        "pending":     True,
                        "message":     f"Pending {existing_bundle} {existing_network} order found. Redirecting to payment...",
                        "reference":   existing_ref,
                        "payment_url": f"https://checkout.paystack.com/{existing_ref}",
                    }

        # =========================
        # GET PRICE
        # =========================
        price_res = supabase.table("prices") \
            .select("price") \
            .eq("network", data.network) \
            .eq("bundle", data.bundle) \
            .limit(1) \
            .execute()

        if not price_res.data:
            raise HTTPException(400, "Invalid bundle")

        price = float(price_res.data[0]["price"])

        # =========================
        # GET EMAIL
        # =========================
        customer_email = None

        if data.user_id:
            user_res = supabase.table("users") \
                .select("email") \
                .eq("id", data.user_id) \
                .limit(1) \
                .execute()

            if not user_res.data:
                raise HTTPException(404, "User not found")

            customer_email = user_res.data[0]["email"]
        else:
            customer_email = data.email

        if not customer_email:
            customer_email = "guest@evoshub.com"

        # =========================
        # PAYSTACK INIT
        # =========================
        callback_url = "https://evosdata.xyz/success"

        if hasattr(data, "agent_id") and data.agent_id:
            callback_url = f"https://evosdata.xyz/store/{data.agent_id}?success=true"

        try:
            paystack = requests.post(
                "https://api.paystack.co/transaction/initialize",
                headers={
                    "Authorization": f"Bearer {PAYSTACK_SECRET}",
                    "Content-Type": "application/json"
                },
                json={
                    "email": customer_email,
                    "amount": int(price * 100),
                    "callback_url": callback_url
                },
                timeout=REQUEST_TIMEOUT
            ).json()

        except requests.exceptions.RequestException:
            raise HTTPException(500, "Payment service error")

        if not paystack.get("status"):
            raise HTTPException(400, "Payment init failed")

        ref = paystack["data"]["reference"]

        # =========================
        # GENERATE ORDER REF
        # =========================
        evos_ref = f"EVOS-{uuid.uuid4().hex[:8].upper()}"

        # =========================
        # SAVE ORDER
        # =========================
        payload = {
            "user_id":     data.user_id,
            "guest_email": None if data.user_id else customer_email,
            "network":     data.network,
            "bundle":      data.bundle,
            "price":       price,
            "phone_number": data.phone,
            "paystack_ref": ref,
            "evosdata_ref": evos_ref,
            "status":      "pending_payment"
        }

        supabase.table("orders").insert(payload).execute()

        # =========================
        # RESPONSE
        # =========================
        return {
            "status":      True,
            "payment_url": paystack["data"]["authorization_url"],
            "reference":   ref
        }

    except HTTPException:
        raise

    except Exception as e:
        print("CREATE ORDER ERROR:", str(e))
        raise HTTPException(status_code=500, detail="Server error")

from decimal import Decimal

# =========================
# PAYSTACK HELPERS
# =========================

def process_agent_profit(order_id, reference):

    # =========================
    # DOUBLE CREDIT PROTECTION
    # =========================
    existing = supabase.table("agent_transactions") \
        .select("id") \
        .eq("reference", reference) \
        .limit(1) \
        .execute()

    if existing.data:
        return

    # =========================
    # GET ORDER
    # =========================
    order_res = supabase.table("orders") \
        .select("*") \
        .eq("id", order_id) \
        .limit(1) \
        .execute()

    if not order_res.data:
        return

    order = order_res.data[0]

    agent_id = order.get("agent_id")
    base_price = order.get("base_price")
    agent_price = order.get("agent_price")

    if not agent_id:
        return

    if base_price is None or agent_price is None:
        return

    profit = Decimal(agent_price) - Decimal(base_price)

    if profit <= 0:
        return

    # =========================
    # UPDATE WALLET
    # =========================
    wallet = supabase.table("agent_wallets") \
        .select("*") \
        .eq("agent_id", agent_id) \
        .limit(1) \
        .execute()

    if wallet.data:
        new_balance = Decimal(wallet.data[0]["balance"]) + profit

        supabase.table("agent_wallets") \
            .update({"balance": float(new_balance)}) \
            .eq("agent_id", agent_id) \
            .execute()
    else:
        supabase.table("agent_wallets") \
            .insert({
                "agent_id": agent_id,
                "balance": float(profit)
            }) \
            .execute()

    # =========================
    # TRANSACTION LOG
    # =========================
    supabase.table("agent_transactions") \
        .insert({
            "agent_id": agent_id,
            "order_id": order_id,
            "amount": float(profit),
            "type": "credit",
            "reference": reference
        }) \
        .execute()


# =========================
# USER STATS
# =========================

def calculate_rank(order_count: int):
    if order_count >= 50:
        return 5
    elif order_count >= 20:
        return 4
    elif order_count >= 10:
        return 3
    elif order_count >= 5:
        return 2
    return 1


def increment_user_orders(user_id: int):
    try:
        user = supabase.table("users") \
            .select("order_count") \
            .eq("id", user_id) \
            .limit(1) \
            .execute()

        if not user.data:
            return

        current = user.data[0].get("order_count") or 0
        new_count = current + 1

        supabase.table("users") \
            .update({
                "order_count": new_count,
                "rank": calculate_rank(new_count)
            }) \
            .eq("id", user_id) \
            .execute()

    except Exception as e:
        print("INCREMENT USER ERROR:", str(e))




# =========================
# PAYSTACK WEBHOOK
# =========================
@app.post("/webhook/paystack")
async def paystack_webhook(request: Request):

    try:
        body = await request.body()
        signature = request.headers.get("x-paystack-signature")

        if not signature or not verify_signature(body, signature, PAYSTACK_SECRET):
            return {"status": "invalid signature"}

        payload = await request.json()

        if payload.get("event") != "charge.success":
            return {"status": "ignored"}

        reference = payload["data"]["reference"]

        # =========================
        # GET ORDER
        # =========================
        order_res = supabase.table("orders") \
            .select("*") \
            .eq("paystack_ref", reference) \
            .limit(1) \
            .execute()

        if not order_res.data:
            return {"status": "not found"}

        order = order_res.data[0]

        if order["status"] != "pending_payment":
            return {"status": "already processed"}

        # =========================
        # MARK PAID
        # =========================
        supabase.table("orders") \
            .update({"status": "paid"}) \
            .eq("paystack_ref", reference) \
            .execute()

        # =========================
        # UPDATE USER STATS
        # =========================
        if order.get("user_id"):
            increment_user_orders(order["user_id"])

        # =========================
        # GET PROVIDER FROM SUPABASE
        # =========================
        provider = get_provider(order["network"])

        # =========================
        # PURCHASE FLOW
        # =========================
        try:

            # =====================================
            # DATAMART (MTN)
            # =====================================
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

                supabase.table("orders") \
                    .update({
                        "status": "processing",
                        "datamart_ref": dm_data.get("orderReference"),
                        "datamart_order_id": dm_data.get("orderId")
                    }) \
                    .eq("paystack_ref", reference) \
                    .execute()

                # ✅ FIXED: OUTSIDE CHAIN
                process_agent_profit(order["id"], reference)

            # =====================================
            # DATABOSS (TELECEL / AIRTELTIGO)
            # =====================================
            elif provider == "DATABOSS":

                endpoint = "telecel.php"

                network_name = order["network"].upper()

                if network_name in ["AIRTELTIGO", "AT"]:
                    endpoint = "at.php"

                elif network_name in ["MTN"]:
                    endpoint = "mtn.php"

                db_response = requests.post(
                    f"{DATABOSS_BASE}/{endpoint}",
                    json={
                        "api_key": DATABOSS_API_KEY,
                        "api_secret": DATABOSS_API_SECRET,
                        "network": network_name,
                        "package_gb": extract_capacity(order["bundle"]),
                        "phone_number": order["phone_number"]
                    },
                    timeout=REQUEST_TIMEOUT
                )

                db = db_response.json()

                if not db.get("success"):
                    raise Exception(db.get("message", "Databoss failed"))

                supabase.table("orders") \
                    .update({
                        "status": "successful",
                        "databoss_ref": str(db.get("order_id"))
                    }) \
                    .eq("paystack_ref", reference) \
                    .execute()

                # ✅ FIXED: OUTSIDE CHAIN
                process_agent_profit(order["id"], reference)

            # =====================================
            # BUNDLES GHANA (TELECEL / AIRTELTIGO)
            # =====================================
            elif provider == "BUNDLES_GHANA":

                # 1. Find the matching bundle_id from Bundles Ghana
                # Bundles Ghana expects exact casing: MTN, Telecel, AirtelTigo
                BG_NETWORK_MAP = {
                    "MTN": "MTN",
                    "TELECEL": "Telecel",
                    "AIRTELTIGO": "AirtelTigo",
                    "AT": "AirtelTigo",
                }
                network_name = BG_NETWORK_MAP.get(order["network"].upper(), order["network"])
                bg_bundles = call_bundles_ghana(f"/bundles?network={network_name}")

                if not bg_bundles.get("success"):
                    raise Exception(f"Bundles Ghana fetch failed: {bg_bundles.get('error')}")

                # Match by volume (bundle field e.g. "1GB", "2GB")
                bundle_volume = order["bundle"].upper().replace(" ", "")
                matched = next(
                    (b for b in bg_bundles.get("bundles", [])
                     if b.get("volume", "").upper().replace(" ", "") == bundle_volume
                     and b.get("status") == "active"),
                    None
                )

                if not matched:
                    raise Exception(f"No active Bundles Ghana bundle for {network_name} {bundle_volume}")

                # 2. Place the order
                bg_order = call_bundles_ghana("/order", method="POST", body={
                    "bundle_id": matched["id"],
                    "phone": order["phone_number"],
                    "webhook_url": "https://evos-business-hub.onrender.com/webhook/bundlesghana"
                })

                if not bg_order.get("success"):
                    raise Exception(f"Bundles Ghana order failed: {bg_order.get('error', bg_order.get('message'))}")

                bg_ref = bg_order["order"]["reference"]
                bg_order_id = str(bg_order["order"]["id"])

                supabase.table("orders") \
                    .update({
                        "status": "processing",
                        "datamart_ref": bg_ref,        # reuse column for BG reference
                        "datamart_order_id": bg_order_id
                    }) \
                    .eq("paystack_ref", reference) \
                    .execute()

                process_agent_profit(order["id"], reference)

            else:
                raise Exception("No provider assigned")

            return {"status": "success"}

        except Exception as e:
            print("PURCHASE ERROR:", str(e))

            supabase.table("orders") \
                .update({"status": "failed"}) \
                .eq("paystack_ref", reference) \
                .execute()

            return {"status": "purchase failed"}

    except Exception as e:
        print("PAYSTACK WEBHOOK ERROR:", str(e))
        return {"status": "error"}

# =========================
# DATAMART WEBHOOK
# =========================
@app.post("/webhook/datamart")
async def datamart_webhook(request: Request):
    try:
        body = await request.body()
        signature = request.headers.get("X-DataMart-Signature")
        event = request.headers.get("X-DataMart-Event", "")

        if not signature or not verify_datamart_signature(body, signature, DATAMART_WEBHOOK_SECRET):
            raise HTTPException(401, "Invalid signature")

        payload = await request.json()

        data = payload.get("data", {})
        order_ref = data.get("orderReference") or data.get("reference")
        order_id  = data.get("orderId")
        status    = str(data.get("status", "")).lower()

        print("DATAMART EVENT:", event)
        print("DATAMART REF:", order_ref)
        print("DATAMART ORDER ID:", order_id)
        print("DATAMART STATUS:", status)

        if not order_ref and not order_id:
            return {"received": True}

        final_status = (
            "successful" if status in ["completed", "success", "delivered"]
            else "failed" if status in ["failed", "cancelled", "refunded"]
            else "processing"
        )

        # ── Always use datamart_ref as primary — it's always stored ──
        if order_ref:
            supabase.table("orders") \
                .update({"status": final_status}) \
                .eq("datamart_ref", order_ref) \
                .execute()
            print(f"DATAMART WEBHOOK: updated by datamart_ref={order_ref} → {final_status}")

        elif order_id:
            supabase.table("orders") \
                .update({"status": final_status}) \
                .eq("datamart_order_id", str(order_id)) \
                .execute()
            print(f"DATAMART WEBHOOK: updated by order_id={order_id} → {final_status}")

        return {"received": True}

    except HTTPException as e:
        print("DATAMART WEBHOOK AUTH ERROR:", str(e.detail))
        raise e

    except Exception as e:
        print("DATAMART WEBHOOK ERROR:", str(e))
        return {"received": False}
# =========================
# BUNDLES GHANA WEBHOOK
# =========================
@app.post("/webhook/bundlesghana")
async def bundlesghana_webhook(request: Request):

    try:
        payload = await request.json()

        event = payload.get("event", "")
        reference = payload.get("reference")
        status = str(payload.get("status", "")).lower()

        print("BUNDLES GHANA EVENT:", event)
        print("BUNDLES GHANA REF:", reference)
        print("BUNDLES GHANA STATUS:", status)

        if not reference:
            return {"received": True}

        # Map Bundles Ghana statuses to internal statuses
        final_status = (
            "successful"
            if status in ["delivered"]
            else "processing"
            if status in ["placed", "processing"]
            else "failed"
            if status in ["failed", "cancelled", "refunded"]
            else "processing"
        )

        # datamart_ref column reused to store the BG reference
        supabase.table("orders") \
            .update({"status": final_status}) \
            .eq("datamart_ref", reference) \
            .execute()

        return {"received": True}

    except Exception as e:
        print("BUNDLES GHANA WEBHOOK ERROR:", str(e))
        return {"received": False}

# =========================
# SYNC ORDER
# =========================
@app.post("/orders/sync/{reference}")
def sync_order(reference: str):

    try:
        order_res = supabase.table("orders") \
            .select("*") \
            .eq("paystack_ref", reference) \
            .limit(1) \
            .execute()

        if not order_res.data:
            raise HTTPException(404, "Order not found")

        order = order_res.data[0]

        tracker = order.get("datamart_order_id") or order.get("datamart_ref")

        if not tracker:
            return {"status": "not processed yet"}

        provider = get_provider(order["network"])

        # =========================
        # DATAMART
        # =========================
        if provider == "DATAMART":

            dm = requests.get(
                f"{DATAMART_BASE}/order-status/{tracker}",
                headers={"X-API-Key": DATAMART_API_KEY},
                timeout=REQUEST_TIMEOUT
            )

            dm.raise_for_status()

            payload = dm.json()

            status = str(
                payload.get("data", {}).get("orderStatus", "")
            ).lower()

        # =========================
        # DATABOSS
        # =========================
        elif provider == "DATABOSS":

            # Databoss has no separate tracker endpoint currently.
            # Use existing DB status until manual/auto success logic added.
            status = order["status"].lower()

        # =========================
        # BUNDLES GHANA
        # =========================
        elif provider == "BUNDLES_GHANA":

            bg_ref = order.get("datamart_ref")

            if not bg_ref:
                status = order["status"].lower()
            else:
                bg = call_bundles_ghana(f"/order/status/{bg_ref}")
                status = str(bg.get("order", {}).get("status", "processing")).lower()

        else:
            status = "processing"

        # =========================
        # MAP STATUS
        # =========================
        final_status = (
            "successful"
            if status in ["completed", "success", "delivered", "successful"]
            else "failed"
            if status in ["failed", "cancelled", "refunded"]
            else "processing"
        )

        supabase.table("orders") \
            .update({"status": final_status}) \
            .eq("paystack_ref", reference) \
            .execute()

        return {"status": final_status}

    except HTTPException as e:
        raise e

    except Exception as e:
        print("SYNC ERROR:", str(e))
        raise HTTPException(500, "Sync failed")


# =========================
# USER PROFILE (FIXED)
# =========================
@app.get("/users/me")
def get_user(user_id: int):

    try:
        res = supabase.table("users") \
            .select("*") \
            .eq("id", user_id) \
            .single() \
            .execute()

        user = res.data

        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        # =========================
        # NORMALIZE FIELDS (IMPORTANT FIX)
        # =========================
        user_data = {
            "id": user.get("id"),
            "username": user.get("username"),
            "email": user.get("email"),
            "full_name": user.get("full_name"),

            # 🔥 CRITICAL FIX (DEFAULTS)
            "role": user.get("role", "user"),  # default fallback
            "agent_status": user.get("agent_status", "pending"),

            "rank": user.get("rank", 1),
            "referral_code": user.get("referral_code", ""),
        }

        return {
            "status": "success",
            "user": user_data
        }

    except Exception as e:
        print("GET USER ERROR:", str(e))
        raise HTTPException(status_code=500, detail="Failed to fetch user")


# =========================
# AGENT DASHBOARD
# =========================
@app.get("/agent/dashboard/{agent_id}")
async def agent_dashboard(agent_id: int):

    # =========================
    # VALIDATE AGENT
    # =========================
    user = supabase.table("users") \
        .select("role, agent_status") \
        .eq("id", agent_id) \
        .limit(1) \
        .execute()

    if not user.data:
        return {"error": "User not found"}

    u = user.data[0]

    if u["role"] != "agent" or u["agent_status"] != "approved":
        return {"error": "Not authorized"}

    # =========================
    # WALLET
    # =========================
    wallet = supabase.table("agent_wallets") \
        .select("*") \
        .eq("agent_id", agent_id) \
        .limit(1) \
        .execute()

    balance = wallet.data[0]["balance"] if wallet.data else 0

    # =========================
    # TOTAL TRANSACTIONS
    # =========================
    transactions = supabase.table("agent_transactions") \
        .select("*") \
        .eq("agent_id", agent_id) \
        .execute()

    total_earned = sum(t["amount"] for t in transactions.data) if transactions.data else 0

    # =========================
    # ORDERS COUNT
    # =========================
    orders = supabase.table("orders") \
        .select("id", count="exact") \
        .eq("agent_id", agent_id) \
        .execute()

    return {
        "wallet_balance": balance,
        "total_earned": total_earned,
        "total_sales": orders.count if hasattr(orders, "count") else len(orders.data or []),
        "transactions_count": len(transactions.data or [])
    }


# =========================
# AGENT WALLET AND TRANSACTION
# =========================
@app.get("/agent/wallet/{agent_id}")
async def get_wallet(agent_id: int):

    wallet = supabase.table("agent_wallets") \
        .select("*") \
        .eq("agent_id", agent_id) \
        .limit(1) \
        .execute()

    if not wallet.data:
        return {
            "agent_id": agent_id,
            "balance": 0
        }

    return wallet.data[0]


@app.get("/agent/transactions/{agent_id}")
async def agent_transactions(agent_id: int):

    res = supabase.table("agent_transactions") \
        .select("*") \
        .eq("agent_id", agent_id) \
        .order("created_at", desc=True) \
        .limit(50) \
        .execute()

    return {
        "transactions": res.data or []
    }

# =========================
# AGENT SALES
# =========================
@app.get("/agent/sales/{agent_id}")
async def agent_sales(agent_id: int):

    orders = supabase.table("orders") \
        .select("id, agent_price, base_price, created_at") \
        .eq("agent_id", agent_id) \
        .execute()

    data = orders.data or []

    total_profit = 0

    for o in data:
        if o.get("agent_price") and o.get("base_price"):
            total_profit += (o["agent_price"] - o["base_price"])

    return {
        "total_orders": len(data),
        "total_profit": total_profit
    }


# =========================
# AGENT WITHDRAW (AUTO via Moolre)
# =========================

@app.post("/agent/withdraw")
async def request_withdrawal(payload: dict):

    agent_id = payload.get("agent_id")
    amount = payload.get("amount")
    mobile_number = payload.get("mobile_number")
    network = payload.get("network")
    account_name = payload.get("account_name", "")

    if not agent_id or not amount:
        return {"error": "Missing fields"}

    if not mobile_number or not network:
        return {"error": "Mobile money number and network are required"}

    # =========================
    # CHECK WALLET
    # =========================
    wallet = supabase.table("agent_wallets") \
        .select("balance") \
        .eq("agent_id", agent_id) \
        .limit(1) \
        .execute()

    if not wallet.data:
        return {"error": "Wallet not found"}

    balance = float(wallet.data[0]["balance"])

    if float(amount) > balance:
        return {"error": "Insufficient balance"}

    if float(amount) < 5:
        return {"error": "Minimum withdrawal is GH₵5"}

    # =========================
    # DEDUCT WALLET IMMEDIATELY
    # =========================
    new_balance = balance - float(amount)
    supabase.table("agent_wallets") \
        .update({"balance": new_balance}) \
        .eq("agent_id", agent_id) \
        .execute()

    # =========================
    # GET MOOLRE CHANNEL
    # =========================
    channel = MOOLRE_CHANNEL_MAP.get(network) or MOOLRE_CHANNEL_MAP.get(network.upper())

    if not channel:
        supabase.table("agent_wallets") \
            .update({"balance": balance}) \
            .eq("agent_id", agent_id) \
            .execute()
        return {"error": f"Unsupported network: {network}"}

    # =========================
    # UNIQUE REF
    # =========================
    external_ref = f"EVOS-WD-{agent_id}-{uuid.uuid4().hex[:8].upper()}"

    # =========================
    # SAVE WITHDRAWAL RECORD
    # =========================
    wd = supabase.table("agent_withdrawals") \
        .insert({
            "agent_id": agent_id,
            "amount": float(amount),
            "account_name": account_name,
            "account_number": mobile_number,
            "bank_name": network,
            "status": "processing",
            "moolre_ref": external_ref,
        }) \
        .execute()

    if not wd.data:
        supabase.table("agent_wallets") \
            .update({"balance": balance}) \
            .eq("agent_id", agent_id) \
            .execute()
        return {"error": "Failed to create withdrawal record"}

    withdrawal_id = wd.data[0]["id"]

    # =========================
    # INITIATE MOOLRE TRANSFER
    # =========================
    try:
        moolre_res = call_moolre("transfer", {
            "type": 1,
            "channel": channel,
            "currency": "GHS",
            "amount": str(float(amount)),
            "receiver": mobile_number,
            "externalref": external_ref,
            "reference": f"EVOS Agent Withdrawal #{withdrawal_id}",
            "accountnumber": MOOLRE_ACCOUNT_NUMBER,
        })

        # ✅ FIX: Moolre returns status as string "1" not integer 1
        if str(moolre_res.get("status")) == "1":
            tx_data = moolre_res.get("data", {})
            tx_status = tx_data.get("txstatus", 0) if isinstance(tx_data, dict) else 0
            final_status = "paid" if tx_status == 1 else "processing"

            supabase.table("agent_withdrawals") \
                .update({"status": final_status}) \
                .eq("id", withdrawal_id) \
                .execute()

            # ✅ LOG TRANSACTION
            supabase.table("agent_transactions") \
                .insert({
                    "agent_id": agent_id,
                    "amount": -float(amount),
                    "type": "withdrawal",
                    "reference": external_ref
                }) \
                .execute()

            return {
                "status": "success",
                "message": "Transfer initiated. Funds will arrive shortly.",
                "withdrawal_id": withdrawal_id,
                "transfer_status": final_status,
            }
        else:
            # Moolre rejected — refund wallet
            supabase.table("agent_wallets") \
                .update({"balance": balance}) \
                .eq("agent_id", agent_id) \
                .execute()
            supabase.table("agent_withdrawals") \
                .update({"status": "failed"}) \
                .eq("id", withdrawal_id) \
                .execute()

            error_msg = moolre_res.get("message", "Transfer failed")
            if isinstance(error_msg, list):
                error_msg = " ".join(error_msg)
            return {"error": error_msg or "Moolre transfer failed"}

    except Exception as e:
        print("MOOLRE TRANSFER ERROR:", str(e))
        supabase.table("agent_wallets") \
            .update({"balance": balance}) \
            .eq("agent_id", agent_id) \
            .execute()
        supabase.table("agent_withdrawals") \
            .update({"status": "failed"}) \
            .eq("id", withdrawal_id) \
            .execute()
        return {"error": "Transfer service error. Funds refunded to wallet."}


# =========================
# WITHDRAWAL STATUS CHECK
# =========================
@app.get("/agent/withdrawal/status/{withdrawal_id}")
async def check_withdrawal_status(withdrawal_id: int):
    try:
        wd = supabase.table("agent_withdrawals") \
            .select("*") \
            .eq("id", withdrawal_id) \
            .limit(1) \
            .execute()

        if not wd.data:
            return {"error": "Withdrawal not found"}

        row = wd.data[0]
        moolre_ref = row.get("moolre_ref")

        if not moolre_ref or row.get("status") in ["paid", "failed", "rejected"]:
            return {"status": row.get("status"), "withdrawal": row}

        status_res = call_moolre("status", {
            "type": 1,
            "idtype": 1,
            "id": moolre_ref,
            "accountnumber": MOOLRE_ACCOUNT_NUMBER,
        })

        # ✅ FIX: Moolre returns status as string "1" not integer 1
        if str(status_res.get("status")) == "1":
            tx_status = status_res.get("data", {}).get("txstatus", 0)
            final_status = "paid" if tx_status == 1 else "failed" if tx_status == 2 else "processing"

            if final_status != row.get("status"):
                supabase.table("agent_withdrawals") \
                    .update({"status": final_status}) \
                    .eq("id", withdrawal_id) \
                    .execute()

                if final_status == "failed":
                    wlt = supabase.table("agent_wallets") \
                        .select("balance") \
                        .eq("agent_id", row["agent_id"]) \
                        .limit(1) \
                        .execute()
                    if wlt.data:
                        supabase.table("agent_wallets") \
                            .update({"balance": float(wlt.data[0]["balance"]) + float(row["amount"])}) \
                            .eq("agent_id", row["agent_id"]) \
                            .execute()

        return {"status": final_status, "withdrawal": row}

    except Exception as e:
        print("WITHDRAWAL STATUS ERROR:", str(e))
        return {"error": "Failed to check status"}


# =========================
# MOOLRE WEBHOOK
# =========================
@app.post("/webhook/moolre")
async def moolre_webhook(request: Request):
    try:
        payload = await request.json()
        print("MOOLRE WEBHOOK:", payload)

        # ✅ FIX: externalref and txstatus are nested inside "data" for transfer webhooks
        data = payload.get("data", {})
        external_ref = data.get("externalref") or payload.get("externalref")
        tx_status = data.get("txstatus") if isinstance(data, dict) else payload.get("txstatus")

        print("MOOLRE WEBHOOK EXTERNALREF:", external_ref)
        print("MOOLRE WEBHOOK TXSTATUS:", tx_status)

        if not external_ref:
            return {"received": True}

        # Only process EVOS withdrawal refs — ignore collection webhooks
        if not str(external_ref).startswith("EVOS-WD-"):
            print("MOOLRE WEBHOOK: ignoring non-withdrawal ref", external_ref)
            return {"received": True}

        wd = supabase.table("agent_withdrawals") \
            .select("*") \
            .eq("moolre_ref", external_ref) \
            .limit(1) \
            .execute()

        if not wd.data:
            print("MOOLRE WEBHOOK: withdrawal not found for ref", external_ref)
            return {"received": True}

        row = wd.data[0]

        # ✅ FIX: compare tx_status as integer
        final_status = (
            "paid" if tx_status == 1
            else "failed" if tx_status == 2
            else "processing"
        )

        supabase.table("agent_withdrawals") \
            .update({"status": final_status}) \
            .eq("moolre_ref", external_ref) \
            .execute()

        # ✅ LOG TRANSACTION on webhook confirmation
        if final_status == "paid" and row.get("status") != "paid":
            supabase.table("agent_transactions") \
                .insert({
                    "agent_id": row["agent_id"],
                    "amount": -float(row["amount"]),
                    "type": "withdrawal",
                    "reference": external_ref
                }) \
                .execute()

        # Refund wallet if failed
        if final_status == "failed" and row.get("status") != "failed":
            wlt = supabase.table("agent_wallets") \
                .select("balance") \
                .eq("agent_id", row["agent_id"]) \
                .limit(1) \
                .execute()
            if wlt.data:
                current = float(wlt.data[0]["balance"])
                supabase.table("agent_wallets") \
                    .update({"balance": current + float(row["amount"])}) \
                    .eq("agent_id", row["agent_id"]) \
                    .execute()
                print(f"MOOLRE WEBHOOK: refunded GH₵{row['amount']} to agent {row['agent_id']}")

        print(f"MOOLRE WEBHOOK: withdrawal {external_ref} updated to {final_status}")
        return {"received": True}

    except Exception as e:
        print("MOOLRE WEBHOOK ERROR:", str(e))
        return {"received": False}
        
# =========================
# ADMIN WITHDRAWALS
# =========================
@app.post("/admin/withdrawals/{withdrawal_id}/paid")
async def mark_paid(withdrawal_id: int):

    supabase.table("agent_withdrawals") \
        .update({
            "status": "paid"
        }) \
        .eq("id", withdrawal_id) \
        .execute()

    return {"status": "paid"}


# =========================
# ADMIN REJECT
# =========================
@app.post("/admin/withdrawals/{withdrawal_id}/reject")
async def reject_withdrawal(withdrawal_id: int):

    req = supabase.table("agent_withdrawals") \
        .select("*") \
        .eq("id", withdrawal_id) \
        .limit(1) \
        .execute()

    if not req.data:
        return {"error": "Not found"}

    row = req.data[0]

    if row["status"] != "pending":
        return {"error": "Already processed"}

    # refund wallet
    wallet = supabase.table("agent_wallets") \
        .select("balance") \
        .eq("agent_id", row["agent_id"]) \
        .limit(1) \
        .execute()

    current = float(wallet.data[0]["balance"])

    supabase.table("agent_wallets") \
        .update({"balance": current + float(row["amount"])}) \
        .eq("agent_id", row["agent_id"]) \
        .execute()

    supabase.table("agent_withdrawals") \
        .update({"status": "rejected"}) \
        .eq("id", withdrawal_id) \
        .execute()

    return {"status": "rejected"}


# =========================
# AGENT PRICING (PRODUCTION READY)
# =========================
@app.get("/agent/pricing/{agent_id}")
def get_agent_pricing(agent_id: str):

    try:
        # =========================
        # 1. GET BASE PRICES
        # =========================
        base_res = supabase.table("base_prices") \
            .select("*") \
            .execute()

        base_prices = base_res.data or []

        # =========================
        # 2. GET AGENT PRICES
        # =========================
        agent_res = supabase.table("agent_prices") \
            .select("*") \
            .eq("agent_id", agent_id) \
            .execute()

        agent_prices = agent_res.data or []

        # =========================
        # 3. MAP AGENT MARKUPS
        # =========================
        agent_map = {}

        for row in agent_prices:
            if not row:
                continue

            key = f"{row.get('network','').strip().lower()}-{row.get('bundle','').strip().lower()}"
            agent_map[key] = float(row.get("markup", 0) or 0)

        # =========================
        # 4. BUILD FINAL RESPONSE
        # =========================
        result = []

        for item in base_prices:
            if not item:
                continue

            network = item.get("network", "").strip()
            bundle = item.get("bundle", "").strip()
            base_price = float(item.get("cost_price", 0) or 0)

            key = f"{network.lower()}-{bundle.lower()}"
            markup = float(agent_map.get(key, 0) or 0)

            result.append({
                "network": network,
                "bundle": bundle,
                "base_price": base_price,
                "markup": markup,
                "final_price": base_price + markup
            })

        return {
            "status": "success",
            "prices": result
        }

    except Exception as e:
        print("AGENT PRICING ERROR:", str(e))
        return {
            "status": "error",
            "prices": []
        }

# =========================
# SAVE AGENT PRICING (UPDATED)
# =========================
@app.post("/agent/pricing/save")
def save_agent_pricing(payload: dict):

    try:
        agent_id = str(payload.get("agent_id", "")).strip()
        prices = payload.get("prices", [])

        if not agent_id:
            return {"status": "failed", "message": "agent_id required"}

        # =========================
        # DELETE OLD ROWS FIRST
        # =========================
        supabase.table("agent_prices") \
            .delete() \
            .eq("agent_id", agent_id) \
            .execute()

        rows = []

        for item in prices:
            network = str(item.get("network", "")).strip()
            bundle = str(item.get("bundle", "")).strip()

            try:
                markup = float(item.get("markup", 0) or 0)
            except:
                markup = 0

            rows.append({
                "agent_id": agent_id,
                "network": network,
                "bundle": bundle,
                "markup": markup
            })

        # =========================
        # BULK INSERT
        # =========================
        if rows:
            supabase.table("agent_prices") \
                .insert(rows) \
                .execute()

        return {"status": "success"}

    except Exception as e:
        print("SAVE AGENT PRICING ERROR:", str(e))
        return {
            "status": "failed",
            "message": "Unable to save pricing"
        }
        


# =========================
# AGENT WALLET DEPOSIT
# =========================
# Two endpoints:
#   POST /agent/deposit/initiate  → creates Paystack payment, returns payment_url
#   POST /agent/deposit/verify    → called from success page, verifies + credits wallet

import httpx
import os
import uuid

PAYSTACK_SECRET = os.getenv("PAYSTACK_SECRET_KEY")


# =========================
# INITIATE DEPOSIT
# =========================
@app.post("/agent/deposit/initiate")
async def initiate_deposit(payload: dict):
    try:
        agent_id     = payload.get("agent_id")
        amount       = float(payload.get("amount", 0))        # wallet credit amount
        total_charge = float(payload.get("total_charge", 0))  # what agent actually pays

        if not agent_id or amount < 1:
            return {"error": "agent_id and amount (min GH₵ 1) are required"}

        # Fetch agent email for Paystack
        user_res = supabase.table("users") \
            .select("email, username") \
            .eq("id", agent_id) \
            .limit(1) \
            .execute()

        if not user_res.data:
            return {"error": "Agent not found"}

        agent_email = user_res.data[0].get("email", "")
        reference   = f"EVOS-DEP-{agent_id}-{uuid.uuid4().hex[:10].upper()}"

        # Initiate Paystack first so we get the real Paystack reference
        async with httpx.AsyncClient() as client:
            res = await client.post(
                "https://api.paystack.co/transaction/initialize",
                headers={
                    "Authorization": f"Bearer {PAYSTACK_SECRET}",
                    "Content-Type": "application/json",
                },
                json={
                    "email":     agent_email,
                    "amount":    int(total_charge * 100),
                    "reference": reference,
                    "currency":  "GHS",
                    "metadata": {
                        "agent_id":     agent_id,
                        "type":         "wallet_deposit",
                        "credit_amount": amount,
                    },
                    "callback_url": f"{os.getenv('FRONTEND_URL', 'https://evosdata.xyz')}/success?type=deposit",
                },
            )
            data = res.json()

        if not data.get("status"):
            return {"error": data.get("message", "Paystack init failed")}

        paystack_ref = data["data"].get("reference", reference)

        # Save pending deposit record — includes both our ref and Paystack's ref
        supabase.table("wallet_deposits").insert({
            "agent_id":     agent_id,
            "reference":    reference,       # our EVOS-DEP- reference
            "paystack_ref": paystack_ref,    # Paystack's own reference
            "amount":       amount,          # wallet credit amount
            "total_charge": total_charge,    # what Paystack charged
            "status":       "pending",
        }).execute()

        return {
            "status":      "created",
            "reference":   reference,
            "payment_url": data["data"]["authorization_url"],
        }

    except Exception as e:
        print("DEPOSIT INITIATE ERROR:", str(e))
        return {"error": "Failed to initiate deposit"}


# =========================
# VERIFY + CREDIT WALLET
# =========================
@app.post("/agent/deposit/verify")
async def verify_deposit(payload: dict):
    try:
        reference = payload.get("reference", "").strip()

        if not reference:
            return {"error": "reference required"}

        # Accept both EVOS-DEP- refs and raw Paystack refs
        # Paystack callback can send either "reference" or "trxref"
        lookup_col = "reference" if reference.startswith("EVOS-DEP-") else "paystack_ref"

        existing = supabase.table("wallet_deposits") \
            .select("*") \
            .eq(lookup_col, reference) \
            .limit(1) \
            .execute()

        if not existing.data:
            return {"error": "Deposit record not found"}

        deposit = existing.data[0]

        # ── Already credited — idempotency guard ──
        if deposit.get("status") == "credited":
            wallet_res = supabase.table("agent_wallets") \
                .select("balance") \
                .eq("agent_id", deposit["agent_id"]) \
                .limit(1) \
                .execute()
            balance = float(wallet_res.data[0]["balance"]) if wallet_res.data else 0
            return {"status": "already_credited", "wallet_balance": balance}

        # ── Verify with Paystack ──
        verify_ref = deposit.get("paystack_ref") or deposit.get("reference")
        async with httpx.AsyncClient() as client:
            res = await client.get(
                f"https://api.paystack.co/transaction/verify/{verify_ref}",
                headers={"Authorization": f"Bearer {PAYSTACK_SECRET}"},
            )
            data = res.json()

        if not data.get("status") or data["data"].get("status") != "success":
            supabase.table("wallet_deposits") \
                .update({"status": "failed"}) \
                .eq("id", deposit["id"]) \
                .execute()
            return {
                "error": "Payment not successful",
                "paystack_status": data["data"].get("status"),
            }

        agent_id      = deposit["agent_id"]
        credit_amount = float(deposit["amount"])

        # ── Credit agent_wallets (not users) ──
        wallet_res = supabase.table("agent_wallets") \
            .select("balance") \
            .eq("agent_id", agent_id) \
            .limit(1) \
            .execute()

        if wallet_res.data:
            current_balance = float(wallet_res.data[0]["balance"] or 0)
            new_balance = round(current_balance + credit_amount, 2)
            supabase.table("agent_wallets") \
                .update({"balance": new_balance}) \
                .eq("agent_id", agent_id) \
                .execute()
        else:
            # No wallet row yet — create it
            new_balance = round(credit_amount, 2)
            supabase.table("agent_wallets") \
                .insert({"agent_id": agent_id, "balance": new_balance}) \
                .execute()

        # ── Mark deposit credited ──
        supabase.table("wallet_deposits") \
            .update({"status": "credited"}) \
            .eq("id", deposit["id"]) \
            .execute()

        # ── Log wallet transaction ──
        supabase.table("wallet_transactions").insert({
            "agent_id":  agent_id,
            "type":      "credit",
            "amount":    credit_amount,
            "reference": deposit.get("reference"),
            "note":      "Wallet top-up via Paystack",
        }).execute()

        return {
            "status":          "credited",
            "credited_amount": credit_amount,
            "wallet_balance":  new_balance,
        }

    except Exception as e:
        print("DEPOSIT VERIFY ERROR:", str(e))
        return {"error": "Verification failed"}

# =========================
# AGENT BUY DATA (WALLET DEDUCTION)
# =========================
# POST /agent/buy-data
# Agent buys at base/cost price, deducted from wallet balance.
# No Paystack — instant wallet deduction then provider dispatch.
@app.post("/agent/buy-data")
async def agent_buy_data(payload: dict):
    try:
        agent_id     = payload.get("agent_id")
        network      = str(payload.get("network", "")).strip()
        bundle       = str(payload.get("bundle", "")).strip()
        phone_number = str(payload.get("phone_number", "")).strip()

        if not all([agent_id, network, bundle, phone_number]):
            return {"status": "error", "message": "agent_id, network, bundle and phone_number are required"}

        if len(phone_number) < 9:
            return {"status": "error", "message": "Invalid phone number"}

        # ── Fetch base price ──
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

        # ── Verify agent from users table ──
        agent_res = supabase.table("users") \
            .select("username") \
            .eq("id", agent_id) \
            .eq("role", "agent") \
            .eq("agent_status", "approved") \
            .limit(1) \
            .execute()

        if not agent_res.data:
            return {"status": "error", "message": "Agent not found or not approved"}

        # ── Fetch wallet from agent_wallets ──
        wallet_res = supabase.table("agent_wallets") \
            .select("balance") \
            .eq("agent_id", agent_id) \
            .limit(1) \
            .execute()

        wallet_balance = float(wallet_res.data[0]["balance"]) if wallet_res.data else 0.0

        # ── Insufficient funds check ──
        if wallet_balance < cost_price:
            return {
                "status": "error",
                "message": f"Insufficient wallet balance. Need GH₵ {cost_price:.2f}, have GH₵ {wallet_balance:.2f}",
            }

        # ── Deduct wallet immediately (reserve funds) ──
        new_balance = round(wallet_balance - cost_price, 2)
        supabase.table("agent_wallets") \
            .update({"balance": new_balance}) \
            .eq("agent_id", agent_id) \
            .execute()

        # ── Generate reference ──
        reference = f"EVOS-AGT-{agent_id}-{uuid.uuid4().hex[:10].upper()}"

        # ── Create order record ──
        order_res = supabase.table("orders").insert({
            "agent_id":     agent_id,
            "network":      network,
            "bundle":       bundle,
            "phone_number": phone_number,
            "price":        cost_price,
            "evosdata_ref": reference,   # our agent ref
            "paystack_ref": reference,   # same ref — needed for retry job
            "status":       "processing",
        }).execute()

        if not order_res.data:
            # Rollback wallet deduction if order insert failed
            supabase.table("agent_wallets") \
                .update({"balance": wallet_balance}) \
                .eq("agent_id", agent_id) \
                .execute()
            return {"status": "error", "message": "Failed to create order"}

        order_id = order_res.data[0].get("id")

        # ── Log wallet debit transaction ──
        supabase.table("agent_transactions").insert({
            "agent_id":  agent_id,
            "type":      "debit",
            "amount":    cost_price,
            "reference": reference,
            "order_id":  order_id,           
        }).execute()

        # ── Dispatch to provider ──
        try:
            provider = get_provider(network)

            if provider == "DATAMART":
                dm_response = requests.post(
                    f"{DATAMART_BASE}/purchase",
                    headers={"X-API-Key": DATAMART_API_KEY},
                    json={
                        "phoneNumber": phone_number,
                        "network": NETWORK_MAP.get(network.upper()),
                        "capacity": extract_capacity(bundle),
                        "gateway": "wallet"
                    },
                    timeout=REQUEST_TIMEOUT
                )
                dm = dm_response.json()
                dm_data = dm.get("data", {})
                supabase.table("orders") \
                    .update({
                        "datamart_ref":      dm_data.get("orderReference"),
                        "datamart_order_id": dm_data.get("orderId"),
                        "status":            "processing"
                    }) \
                    .eq("id", order_id) \
                    .execute()

            elif provider == "BUNDLES_GHANA":
                BG_NETWORK_MAP = {
                    "MTN":       "MTN",
                    "TELECEL":   "Telecel",
                    "AIRTELTIGO": "AirtelTigo",
                }
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
                            "bundle_id": matched["id"],
                            "phone":     phone_number,
                            "webhook_url": "https://api.evosdata.xyz/webhook/bundlesghana"
                        })
                        if bg_order.get("success"):
                            supabase.table("orders") \
                                .update({
                                    "datamart_ref":      bg_order["order"]["reference"],
                                    "datamart_order_id": str(bg_order["order"]["id"]),
                                    "status":            "processing"
                                }) \
                                .eq("id", order_id) \
                                .execute()

            elif provider == "DATABOSS":
                endpoint = "telecel.php"
                if network.upper() in ["AIRTELTIGO", "AT"]:
                    endpoint = "at.php"
                elif network.upper() == "MTN":
                    endpoint = "mtn.php"

                db_response = requests.post(
                    f"{DATABOSS_BASE}/{endpoint}",
                    json={
                        "api_key":        DATABOSS_API_KEY,
                        "api_secret":     DATABOSS_API_SECRET,
                        "network":        network.upper(),
                        "package_gb":     extract_capacity(bundle),
                        "phone_number":   phone_number
                    },
                    timeout=REQUEST_TIMEOUT
                )
                db = db_response.json()
                if db.get("success"):
                    supabase.table("orders") \
                        .update({"status": "successful"}) \
                        .eq("id", order_id) \
                        .execute()

            else:
                print(f"AGENT BUY DATA: Unknown provider '{provider}' for {network}")

        except Exception as dispatch_err:
            print(f"AGENT BUY DATA DISPATCH ERROR: {str(dispatch_err)}")
            # Do NOT refund — retry system picks it up within 10 min

        return {
            "status":             "success",
            "message":            f"{bundle} queued for {phone_number}",
            "reference":          reference,
            "order_id":           order_id,
            "new_wallet_balance": new_balance,
        }

    except Exception as e:
        print("AGENT BUY DATA ERROR:", str(e))
        return {"status": "error", "message": "Something went wrong. Please try again."}

        
# =========================
# AGENT STORE (FULL CORRECTED + PRODUCTION READY)
# =========================
@app.get("/store/{agent_id}")
async def public_agent_store(agent_id: int):
    try:
        # =========================
        # VERIFY AGENT ACCOUNT
        # =========================
        user = supabase.table("users") \
            .select("id,username,full_name,store_name,role,agent_status") \
            .eq("id", agent_id) \
            .limit(1) \
            .execute()

        if not user.data:
            return {"status": "error", "message": "Store not found"}

        u = user.data[0]

        if u.get("role") != "agent" or u.get("agent_status") != "approved":
            return {"status": "error", "message": "Store unavailable"}

        # =========================
        # LOAD BASE PRICES
        # =========================
        prices = supabase.table("base_prices") \
            .select("*") \
            .order("network") \
            .execute()

        # =========================
        # LOAD AGENT MARKUPS
        # =========================
        markups = supabase.table("agent_prices") \
            .select("*") \
            .eq("agent_id", agent_id) \
            .execute()

        markup_map = {}
        for m in (markups.data or []):
            key = f"{m['network'].strip().lower()}::{m['bundle'].strip().lower()}"
            markup_map[key] = float(m.get("markup", 0) or 0)

        # =========================
        # BUILD STORE PRODUCTS
        # =========================
        bundles = []
        for row in (prices.data or []):
            network = row.get("network", "").strip()
            bundle = row.get("bundle", "").strip()
            key = f"{network.lower()}::{bundle.lower()}"
            base_price = float(row.get("cost_price", 0) or 0)
            markup = float(markup_map.get(key, 0))
            bundles.append({
                "network": network,
                "bundle": bundle,
                "base_price": base_price,
                "markup": markup,
                "final_price": round(base_price + markup, 2)
            })

        # =========================
        # RETURN STORE
        # Priority: store_name > username > full_name > "Agent"
        # =========================
        return {
            "status": "success",
            "agent_id": agent_id,
            "agent_name": (
                u.get("store_name")
                or u.get("username")
                or u.get("full_name")
                or "Agent"
            ),
            "prices": bundles
        }

    except Exception as e:
        print("STORE ERROR:", str(e))
        return {"status": "error", "message": "Failed to load store"}


# =========================
# SAVE STORE NAME
# =========================
@app.post("/agent/store-name")
async def save_store_name(payload: dict):
    try:
        agent_id = payload.get("agent_id")
        store_name = str(payload.get("store_name", "")).strip()

        if not agent_id:
            return {"error": "agent_id required"}

        if len(store_name) > 40:
            return {"error": "Store name must be 40 characters or less"}

        supabase.table("users") \
            .update({"store_name": store_name or None}) \
            .eq("id", agent_id) \
            .execute()

        return {"status": "success", "store_name": store_name}

    except Exception as e:
        print("SAVE STORE NAME ERROR:", str(e))
        return {"error": "Failed to save store name"}


# =========================
# GET STORE NAME
# =========================
@app.get("/agent/store-name/{agent_id}")
async def get_store_name(agent_id: int):
    try:
        res = supabase.table("users") \
            .select("store_name, username") \
            .eq("id", agent_id) \
            .limit(1) \
            .execute()

        if not res.data:
            return {"error": "Agent not found"}

        return {
            "store_name": res.data[0].get("store_name") or "",
            "username": res.data[0].get("username") or ""
        }

    except Exception as e:
        print("GET STORE NAME ERROR:", str(e))
        return {"error": "Failed to fetch store name"}
# =========================
# STORE ORDER (PAYSTACK READY + MATCHES DB)
# =========================
@app.post("/store/order")
async def create_store_order(payload: dict):

    try:
        import uuid
        import requests

        # =========================
        # INPUTS
        # =========================
        agent_id = int(payload["agent_id"])
        network = str(payload["network"]).strip()
        bundle = str(payload["bundle"]).strip()
        phone_number = str(payload["phone_number"]).strip()

        customer_email = str(
            payload.get("email", "customer@evoshub.store")
        ).strip()

        # =========================
        # VERIFY AGENT
        # =========================
        agent = supabase.table("users") \
            .select("id,role,agent_status,full_name,username") \
            .eq("id", agent_id) \
            .limit(1) \
            .execute()

        if not agent.data:
            return {
                "status": "error",
                "message": "Store not found"
            }

        user = agent.data[0]

        if (
            user.get("role") != "agent" or
            user.get("agent_status") != "approved"
        ):
            return {
                "status": "error",
                "message": "Store unavailable"
            }

        # =========================
        # GET BASE PRICE
        # =========================
        base = supabase.table("base_prices") \
            .select("cost_price") \
            .eq("network", network) \
            .eq("bundle", bundle) \
            .limit(1) \
            .execute()

        if not base.data:
            return {
                "status": "error",
                "message": "Bundle not found"
            }

        base_price = float(base.data[0]["cost_price"])

        # =========================
        # GET AGENT MARKUP
        # =========================
        markup = supabase.table("agent_prices") \
            .select("markup") \
            .eq("agent_id", agent_id) \
            .eq("network", network) \
            .eq("bundle", bundle) \
            .limit(1) \
            .execute()

        markup_price = 0.0

        if markup.data:
            markup_price = float(
                markup.data[0].get("markup", 0) or 0
            )

        # =========================
        # FINAL PRICE
        # =========================
        agent_price = round(
            base_price + markup_price, 2
        )

        # =========================
        # UNIQUE REFERENCE
        # =========================
        reference = f"STORE-{agent_id}-{uuid.uuid4().hex[:10].upper()}"

        # =========================
        # CREATE ORDER (MATCHES DB)
        # =========================
        order = supabase.table("orders") \
            .insert({
                "agent_id": agent_id,
                "email": customer_email,
                "network": network,
                "bundle": bundle,
                "price": agent_price,
                "phone_number": phone_number,
                "paystack_ref": reference,
                "status": "pending_payment",
                "base_price": base_price,
                "agent_price": agent_price,
                "profit": markup_price
            }) \
            .execute()

        if not order.data:
            return {
                "status": "error",
                "message": "Failed to create order"
            }

        order_id = order.data[0]["id"]

        # =========================
        # INITIALIZE PAYSTACK
        # =========================
        paystack_payload = {
            "email": customer_email,
            "amount": int(agent_price * 100),
            "reference": reference,
            "callback_url": f"https://evosdata.xyz/store/{agent_id}",
            "metadata": {
                "order_id": order_id,
                "agent_id": agent_id,
                "network": network,
                "bundle": bundle
            }
        }

        paystack_headers = {
            "Authorization": f"Bearer {PAYSTACK_SECRET}",
            "Content-Type": "application/json"
        }

        pay = requests.post(
            "https://api.paystack.co/transaction/initialize",
            json=paystack_payload,
            headers=paystack_headers,
            timeout=30
        )

        pay_data = pay.json()

        if not pay_data.get("status"):
            # optional cleanup if payment init fails
            supabase.table("orders") \
                .delete() \
                .eq("id", order_id) \
                .execute()

            return {
                "status": "error",
                "message": "Payment initialization failed"
            }

        auth_url = pay_data["data"]["authorization_url"]

        # =========================
        # SUCCESS
        # =========================
        return {
            "status": "created",
            "order_id": order_id,
            "reference": reference,
            "pay_amount": agent_price,
            "payment_url": auth_url
        }

    except Exception as e:
        print("STORE ORDER ERROR:", str(e))

        return {
            "status": "error",
            "message": "Failed to create order"
        }



# =========================
# AUTH (PRODUCTION SAFE)
# =========================


# =========================
# REGISTER ROUTE
# =========================
@app.post("/auth/register")
def register(data: RegisterRequest):

    try:
        import re

        # =========================
        # NORMALIZE INPUT
        # =========================
        username = (data.username or "").strip().lower()
        email = (data.email or "").strip().lower()
        phone = re.sub(r"\D", "", data.phone or "")

        if len(phone) < 10:
            raise HTTPException(status_code=400, detail="Invalid phone number")

        # =========================
        # CHECK USER EXISTS (FAST)
        # =========================
        existing_user = supabase.table("users") \
            .select("id") \
            .eq("username", username) \
            .limit(1) \
            .execute()

        if existing_user.data:
            return {"status": "username_taken"}

        existing_email = supabase.table("users") \
            .select("id") \
            .eq("email", email) \
            .limit(1) \
            .execute()

        if existing_email.data:
            return {"status": "email_taken"}

        # =========================
        # HASH PASSWORD (SAFE)
        # =========================
        try:
            hashed_password = pwd_context.hash(str(data.password))
        except Exception as e:
            print("HASH ERROR:", repr(e))
            raise HTTPException(status_code=500, detail="Password hashing failed")

        # =========================
        # REFERRAL CODE
        # =========================
        referral_code = f"{username}_{phone[-4:]}" if len(phone) >= 4 else username

        # =========================
        # INSERT USER
        # =========================
        insert = supabase.table("users").insert({
            "username": username,
            "full_name": data.full_name.strip(),
            "email": email,
            "phone": phone,
            "password": hashed_password,
            "referred_by": data.referred_by,
            "referral_code": referral_code,
            "order_count": 0,
            "rank": 1
        }).execute()

        if not insert.data:
            raise HTTPException(status_code=500, detail="User creation failed")

        return {
            "status": "created",
            "email": email,
            "username": username,
            "referral_code": referral_code
        }

    except HTTPException:
        raise

    except Exception as e:
        print("REGISTER ERROR:", str(e))
        raise HTTPException(status_code=500, detail="Server error")


# =========================
# LOGIN ROUTE
# =========================
# =========================
# LOGIN ROUTE (FIXED)
# =========================
@app.post("/auth/login")
def login(data: LoginRequest):

    try:
        username = (data.username or "").strip().lower()

        if not username:
            raise HTTPException(status_code=400, detail="Username required")

        # =========================
        # FETCH USER
        # =========================
        user_res = supabase.table("users") \
            .select("*") \
            .or_(f"username.eq.{username},email.eq.{username}") \
            .limit(1) \
            .execute()

        if not user_res.data:
            return {"status": "invalid_credentials"}

        user = user_res.data[0]

        # =========================
        # PASSWORD CHECK
        # =========================
        stored_password = user.get("password")

        if not stored_password:
            return {"status": "invalid_credentials"}

        try:
            if not pwd_context.verify(data.password, stored_password):
                return {"status": "invalid_credentials"}
        except Exception as e:
            print("PASSWORD VERIFY ERROR:", str(e))
            return {"status": "invalid_credentials"}

        # =========================
        # NORMALIZE USER (IMPORTANT FIX)
        # =========================
        user_data = {
            "id": user.get("id"),
            "username": user.get("username"),
            "email": user.get("email"),
            "full_name": user.get("full_name"),
            "referral_code": user.get("referral_code"),
            "rank": user.get("rank", 1),

            # 🔥 CRITICAL FIX FOR AGENT SYSTEM
            "role": user.get("role", "user"),
            "agent_status": user.get("agent_status", "pending"),
        }

        # =========================
        # SUCCESS RESPONSE
        # =========================
        return {
            "status": "ok",
            "user": user_data
        }

    except HTTPException:
        raise

    except Exception as e:
        print("LOGIN ERROR:", str(e))
        raise HTTPException(status_code=500, detail="Server error")




from fastapi import HTTPException



@app.get("/today/{user_id}")
def today_dashboard(user_id: int):

    try:
        # GLOBAL TOTAL ORDERS
        global_orders = supabase.table("orders") \
            .select("id", count="exact") \
            .execute()

        total_orders = global_orders.count or 0

        # USER ORDERS
        user_orders = supabase.table("orders") \
            .select("*") \
            .eq("user_id", user_id) \
            .order("created_at", desc=True) \
            .execute()

        my_orders = user_orders.data or []

        # SUCCESSFUL USER ORDERS
        success_status = [
            "processing",
            "successful",
            "delivered",
            "initiated"
        ]

        my_successful_orders = [
            order for order in my_orders
            if order["status"] in success_status
        ]

        # TRANSACTIONS
        transactions = [
            {
                "network": row["network"],
                "amount": f'{row["bundle"]} - GHS {row["price"]}',
                "phone_number": row["phone_number"],
                "evosdata_ref": row["evosdata_ref"],
                "paystack_ref": row["paystack_ref"],
                "datamart_ref": row["datamart_ref"],
                "status": row["status"],
                "created_at": row["created_at"]
            }
            for row in my_orders
        ]

        return {
            "global": {
                "total_orders": total_orders
            },
            "user": {
                "my_orders": len(my_orders),
                "my_successful_orders": len(my_successful_orders),
                "transactions": transactions
            }
        }

    except Exception as e:
        print("TODAY ERROR:", str(e))
        raise HTTPException(500, "Server error")




from fastapi import FastAPI, Request

# =========================
# EVOS USSD ENGINE
# =========================
@app.post("/ussd")
async def ussd(request: Request):
    data = await request.json()

    phone = data.get("phoneNumber")
    text = data.get("text", "")
    service_code = data.get("serviceCode", "*1590#")

    # split user input path
    user_input = text.split("*") if text else []

    # =========================
    # MAIN MENU
    # =========================
    if text == "":
        response = (
            "CON Welcome to EVOS Business Hub\n"
            "1. Buy Data\n"
            "2. My Orders\n"
            "3. Support\n"
        )
        return response

    # =========================
    # OPTION 1: BUY DATA
    # =========================
    if user_input[0] == "1":

        # STEP 1: network selection
        if len(user_input) == 1:
            return (
                "CON Select Network\n"
                "1. MTN\n"
                "2. Telecel\n"
                "3. AirtelTigo"
            )

        # STEP 2: map network
        network_map = {
            "1": "MTN",
            "2": "TELECEL",
            "3": "AIRTELTIGO"
        }

        network = network_map.get(user_input[1])

        if not network:
            return "END Invalid network selected"

        # STEP 3: bundle selection
        if len(user_input) == 2:
            return (
                f"CON {network} Bundles\n"
                "1. 1GB - GH₵5\n"
                "2. 2GB - GH₵10\n"
                "3. 5GB - GH₵20"
            )

        # STEP 4: map bundle
        bundle_map = {
            "1": ("1GB", 5),
            "2": ("2GB", 10),
            "3": ("5GB", 20)
        }

        bundle_data = bundle_map.get(user_input[2])

        if not bundle_data:
            return "END Invalid bundle selected"

        bundle, price = bundle_data

        # =========================
        # CREATE ORDER VIA YOUR EXISTING SYSTEM
        # =========================
        import requests

        try:
            res = requests.post(
                "https://evos-business-hub.onrender.com/orders/create",
                json={
                    "user_id": None,  # guest USSD user
                    "network": network,
                    "bundle": bundle,
                    "phone": phone
                },
                timeout=10
            )

            result = res.json()

            if res.status_code != 200:
                return "END Order failed. Try again."

            return (
                f"END Order Created Successfully\n"
                f"Network: {network}\n"
                f"Bundle: {bundle}\n"
                f"Pay via link sent to SMS or app"
            )

        except Exception as e:
            print("USSD ERROR:", str(e))
            return "END Service temporarily unavailable"

    # =========================
    # OPTION 2: MY ORDERS
    # =========================
    if user_input[0] == "2":
        return (
            "END Check your orders on EVOS App or Website:\n"
            "https://evosdata.netlify.app"
        )

    # =========================
    # OPTION 3: SUPPORT
    # =========================
    if user_input[0] == "3":
        return (
            "END EVOS Support:\n"
            "WhatsApp: +233208718943"
        )

    return "END Invalid request"




from fastapi import Request
from fastapi.responses import Response
import uuid
import requests

sessions = {}

# =========================
# HELPERS
# =========================
def get_session(phone: str):
    if phone not in sessions:
        sessions[phone] = {
            "step": "start",
            "network": None,
            "bundle": None,
            "price": None
        }
    return sessions[phone]


def fetch_price(network: str, bundle: str):
    res = supabase.table("prices") \
        .select("price") \
        .eq("network", network) \
        .eq("bundle", bundle) \
        .limit(1) \
        .execute()

    if not res.data:
        return None

    return float(res.data[0]["price"])


def init_paystack(email: str, amount: float):
    res = requests.post(
        "https://api.paystack.co/transaction/initialize",
        headers={
            "Authorization": f"Bearer {PAYSTACK_SECRET}",
            "Content-Type": "application/json"
        },
        json={
            "email": email,
            "amount": int(amount * 100),
            "callback_url": "https://evosdata.netlify.app/success"
        }
    )

    data = res.json()

    if not data.get("status"):
        return None

    return data["data"]


# =========================
# WHATSAPP WEBHOOK
# =========================
@app.post("/whatsapp/webhook")
async def whatsapp_webhook(request: Request):

    form = await request.form()

    message = form.get("Body", "").strip().lower()
    phone = form.get("From")

    session = get_session(phone)
    reply = ""

    # =========================
    # MENU
    # =========================
    if message in ["hi", "hello", "start", "menu"]:
        session["step"] = "menu"
        reply = (
            "👋 *EVOS DATA HUB*\n\n"
            "1️⃣ Buy Data\n"
            "2️⃣ Track Order\n"
            "3️⃣ Support"
        )

    # =========================
    # BUY DATA
    # =========================
    elif message == "1":
        session["step"] = "network"
        reply = (
            "📡 Select Network:\n\n"
            "1️⃣ MTN\n"
            "2️⃣ Telecel\n"
            "3️⃣ AirtelTigo"
        )

    # =========================
    # NETWORK
    # =========================
    elif message in ["1", "mtn"]:
        session["network"] = "MTN"
        session["step"] = "bundle"
        reply = "📦 Send MTN bundle (e.g. 1GB, 2GB)"

    elif message in ["2", "telecel"]:
        session["network"] = "TELECEL"
        session["step"] = "bundle"
        reply = "📦 Send Telecel bundle"

    elif message in ["3", "airteltigo"]:
        session["network"] = "AIRTELTIGO"
        session["step"] = "bundle"
        reply = "📦 Send AirtelTigo bundle"

    # =========================
    # BUNDLE
    # =========================
    elif session["step"] == "bundle":
        session["bundle"] = message.upper()

        price = fetch_price(session["network"], session["bundle"])

        if not price:
            reply = "❌ Bundle not found. Try again."
        else:
            session["price"] = price
            session["step"] = "confirm"

            reply = (
                f"📦 *ORDER SUMMARY*\n\n"
                f"Network: {session['network']}\n"
                f"Bundle: {session['bundle']}\n"
                f"Price: GHS {price}\n\n"
                "1️⃣ Confirm & Pay\n"
                "2️⃣ Cancel"
            )

    # =========================
    # CONFIRM + PAYSTACK INIT
    # =========================
    elif message == "1" and session["step"] == "confirm":

        evos_ref = f"EVOS-{uuid.uuid4().hex[:8].upper()}"

        paystack = init_paystack(
            email=f"{phone}@evosdata.com",
            amount=session["price"]
        )

        if not paystack:
            reply = "❌ Payment initialization failed."
        else:
            paystack_ref = paystack["reference"]

            supabase.table("orders").insert({
                "network": session["network"],
                "bundle": session["bundle"],
                "price": session["price"],
                "phone_number": phone,
                "status": "pending_payment",
                "evosdata_ref": evos_ref,
                "paystack_ref": paystack_ref
            }).execute()

            reply = (
                "💳 *PAYMENT READY*\n\n"
                f"Amount: GHS {session['price']}\n\n"
                f"Pay here:\n{paystack['authorization_url']}\n\n"
                "Once payment is completed, your data will be delivered automatically."
            )

            session["step"] = "done"

    # =========================
    # CANCEL
    # =========================
    elif message == "2":
        session["step"] = "menu"
        reply = "❌ Order cancelled. Type *menu* to restart."

    # =========================
    # SUPPORT
    # =========================
    elif message == "3":
        reply = "💬 Support: https://wa.me/233208718943"

    # =========================
    # DEFAULT
    # =========================
    else:
        reply = "❌ Invalid input. Type *menu*."

    # =========================
    # TWILIO RESPONSE
    # =========================
    xml = f"""
    <Response>
        <Message>{reply}</Message>
    </Response>
    """

    return Response(content=xml, media_type="application/xml")
