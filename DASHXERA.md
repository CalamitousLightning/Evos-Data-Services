# DashXera — internal admin operations dashboard

DashXera lives inside EVOS Data Services as an admin layer over the existing
ordering engine. It reads the existing schema and reuses `main.py`'s own
provider functions. It is not a second ordering system.

---

## Install

**1. Database.** Run both migrations in the EVOSDATA Supabase SQL editor, in
order. Both are idempotent and purely additive — no column is dropped, no
existing value is rewritten.

```
supabase/migrations/20260915_dashxera_v1.sql
supabase/migrations/20260915_dashxera_v2.sql
```

**2. Backend.** Already wired. `main.py` ends with:

```python
try:
    import dashxera
    dashxera.install(app)
except Exception as _dashxera_err:
    logger.error("DASHXERA: failed to mount (%s) — API continues without it", _dashxera_err)
```

Nothing above that line was modified. The try/except is deliberate: a dashboard
must never be able to take the ordering API down with it.

**3. Frontend.** Already wired into `App.jsx` — route `/dashxera`, sidebar entry
gated on the existing `isAdmin` flag. `public/_redirects` already has the `/*`
catch-all, so the route resolves on Netlify unchanged.

**4. Tests.** `python3 test_dashxera.py` — 191 checks, no database, no network.

---

## The three money figures

This is the part worth reading carefully.

| Field | Column | Meaning |
|---|---|---|
| **Sold** | `orders.price` | What the customer was charged. The revenue figure. |
| **Base cost** | `orders.base_price` | What the bundle cost us, recorded on the order. |
| **Agent price** | `orders.agent_price` | What the agent's tier priced it at. |

They are never substituted for one another. `Total Sold` is always
`SUM(orders.price)`; it is never computed from base price. `Agent sales` is the
selling price of agent orders — `agent_price` is reported alongside it as its
own column, never in place of it.

Orders still at `pending_payment` are excluded from every money figure. Those
are abandoned Paystack checkouts, not takings.

### Historical cost is protected

Agent store checkouts write `base_price` onto the order. Direct customer orders
currently do not. So some historical orders have no recorded cost.

DashXera does **not** paper over this by looking up today's `base_prices` and
treating the result as history. Instead every order gets a cost *source*:

- `recorded` — `base_price` on the order. Historically accurate.
- `estimated` — today's `base_prices` value. The order predates cost capture.
- `missing` — the bundle isn't in `base_prices` either. Counted as no cost, and
  margin shows as `—` rather than an inflated number.

The Financials page reports **Recorded base cost** and **Estimated base cost**
as separate lines, plus a coverage percentage. `recorded_margin` is the figure
grounded entirely in history; `gross_margin` includes the estimate and is
labelled accordingly.

If you want the estimate to disappear entirely, add `base_price` to the customer
order insert in `main.py` (around the `create_order` payload). Coverage then
climbs to 100% for all new orders. DashXera needs no change for that.

### Rounding

Currency never goes through Python's `round()`. Built-in `round()` is banker's
rounding — `round(12.155, 2)` gives `12.15`, not `12.16` — which quietly biases
every average and margin downward over a reporting period. `_money()` uses
`Decimal` with `ROUND_HALF_UP`.

---

## Reporting periods

7, 14, 30, 60 or 90 days. Anything below 7 clamps to 7; anything above 90 clamps
to 90; anything in between snaps to the nearest supported window. Every
financial and order figure respects the selection.

---

## Provider health

Health is derived from real signals only:

- **Dispatch outcomes** — success and failure counts per provider, from
  `orders.dispatch_provider`.
- **Persisted incidents** — captured provider rejections.

| State | Meaning |
|---|---|
| `LOW` | A `low_balance` incident is open for this provider |
| `ERROR` | A critical incident is open, or failure rate ≥ 25% |
| `DEGRADED` | Open incidents, but nothing critical |
| `HEALTHY` | Dispatching with no open incidents |
| `IDLE` | No dispatches in this window |

**No provider balance is fabricated.** Paystack publishes `GET /balance`, so
that figure is real and is the only balance DashXera calls. DataMart, Bundles
Ghana, Swift Data Link and Agyekumdata expose no balance endpoint in this
integration, so their cards read "Not published". Their low-balance signal comes
from the rejection message itself — when DataMart replies "insufficient wallet
balance", that text is classified as a `low_balance` incident and the provider
flips to `LOW`.

The provider list comes from `provider_routes` where `active = true`. Retired
routes don't appear.

### Provider attribution

`orders` records `provider_priority` (a tier index) but has never recorded the
provider *name*. The v2 migration adds `dispatch_provider`, which the reprocess
path now writes. Historical orders can only be *inferred* from the network's
current chain, and the UI labels those "inferred" rather than presenting them as
fact. The Providers page reports how many orders in the window are unattributed.

---

## Incidents

`main.py` already logs every provider rejection. Those lines were transient. A
`logging.Handler` attached at install time reads the same stream, classifies the
message, and persists it to `provider_incidents`, deduplicated by a fingerprint
that strips order numbers — a bad hour is one row with `occurrences: 214`, not
214 rows.

Writes go through a bounded queue on a background thread, so an incident write
can never slow down or break a purchase.

**Capture begins when DashXera is installed.** Render logs written before that
are not recoverable, and the UI says so rather than implying otherwise.

---

## Paid but not dispatched

Orders where payment was taken but no provider reference was ever written. One
eligibility function (`_is_eligible`) serves the listing, single reprocess and
bulk reprocess, so the three can never disagree about what's safe to re-send.

Ineligible rows still appear, greyed, with the reason stated — an admin should
be able to see why an order can't be reprocessed, not just that it's absent.

---

## Reprocessing and duplicate protection

Every reprocess:

1. Acquires a non-blocking per-order lock. Two admins clicking at once → the
   second is refused, not queued.
2. Re-reads the order and checks eligibility.
3. Verifies the reference against Paystack. Agent wallet orders
   (`EVOS-AGT-…`) skip this — they were debited directly, never charged.
4. Sets status to `paid` before dispatching, so a crash mid-flight leaves a
   recoverable row rather than one stuck at `pending_payment`.
5. Resolves the provider from `get_provider_chain()` at the order's tier. An
   explicitly requested provider outside that chain is refused.
6. **Re-reads `datamart_ref` and `status` one last time** immediately before the
   provider call, catching the background retry job claiming the order while we
   were talking to Paystack.
7. Dispatches through `main.py`'s own helpers.
8. On success: writes `datamart_ref`, `dispatch_provider`, status `processing`,
   and credits agent margin via `process_agent_profit()` — same as the webhook.
9. On failure: writes `last_error` and records an incident.
10. Writes an audit row either way.

`force: true` bypasses **payment verification only**. It can never re-send an
order that already has a provider reference or is already fulfilled — that's the
path that sends a customer two bundles, so it stays closed regardless.

Bulk reprocessing re-runs all of the above per order, so a long batch never acts
on a snapshot taken when the batch started. Capped at 50, 250ms apart.

---

## Audit trail

Every admin action lands in `dashxera_actions`: actor, order, action, previous
status, new status, provider, provider reference, outcome, error, timestamp.
Viewable under Reprocessing / Audit.

---

## Ecosystem sales

| Product | Source | Exact? |
|---|---|---|
| EVOSDATA | `orders.price` | Yes |
| EVOSGPT | `evosgpt_purchases` | Estimated — stores a tier, not an amount |
| EVOSHUB | `website_requests` | Estimated — no amount column |
| XERA | `xera_purchases` | Yes, when the table is reachable |

XERA is optional by design. If `xera_purchases` isn't present in this project the
card reads "Not connected", revenue counts as zero, and the totals exclude it.
No fabricated revenue, no crash. When the table appears it's picked up
automatically with no code change.

Estimated figures are labelled in the UI with the reason.

---

## Security

- Every endpoint requires `X-Admin-Secret`, compared with `hmac.compare_digest`.
  Verified in tests: all 14 routes return 403 without it.
- No provider key, Paystack secret or Supabase credential is ever returned to
  the frontend. Balance figures are returned; the key that fetched them is not.
- The admin label (`X-Admin-Label`) is regex-sanitised and truncated to 80 chars
  before it reaches the audit table.
- Search input is stripped of PostgREST filter metacharacters before reaching
  `or_()`. Values are parameterised, never concatenated into SQL.
- `page_size` is capped at 200, `page` at ≥ 1, both enforced by FastAPI.
- The aggregate functions are `security definer` with `search_path = public` and
  `revoke all ... from public, anon, authenticated` — only the service role can
  call them.
- Both new tables have RLS enabled with no policies. The service-role key the
  backend uses bypasses RLS; nothing else can read them.
- The secret lives in `sessionStorage`, not `localStorage` — closing the tab
  signs you out.

---

## Environment variables

All optional.

| Variable | Default | Effect |
|---|---|---|
| `PAYSTACK_LOW_BALANCE_GHS` | `300` | Paystack low-balance threshold |
| `PROVIDER_FAILURE_THRESHOLD` | `0.25` | Failure rate that flips a provider to ERROR |
| `EVOSGPT_TIER_PRICES` | `{"Pro":20,"Core":70}` | JSON tier price map |
| `EVOSHUB_PACKAGE_PRICES` | `{"starter":800,...}` | JSON package price map |
| `DASHXERA_MAIN_MODULE` | `main` | Only if your app module isn't `main.py` |

---

## Performance

Summary, series, agent rollup and provider activity run as Postgres functions,
so a 90-day report is one aggregate query rather than a full table pull into the
API process. If the v2 migration hasn't been applied, each falls back to paging
rows in Python — slower, same numbers, no error. A half-applied migration
degrades rather than breaks.

Orders, undispatched, incidents and audit are all paginated with exact counts.

---

## Before you use bulk reprocess

Reprocessing sends real bundles and spends real provider wallet balance. Do a
single known order first and confirm the customer received it.
