"""Tests for the pending-order reconciliation fix.

Covers scenarios in review request:
1) Read-only check on real RUNECHA AUTOMOBILES order id prefix f0304185
2) Late-entry: off-order slip first, then back-dated order -> Dispatched
3) Partial: slip < order qty -> order Pending with remaining
4) Order dated AFTER slip must NOT be consumed
5) Normal FIFO still works; reconcile idempotent
6) Slip reassignment between QA customers (A -> B and reverse)
7) Delete slip that cleared QA order -> order back to Pending
"""
import os
import time
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://preview-116.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

QA_PREFIX = "QA TEST"


# -------------------------- Fixtures --------------------------
@pytest.fixture(scope="session")
def token():
    r = requests.post(f"{API}/auth/login", json={"email": "qa_tester", "password": "QaTest#2026"}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="session")
def client(token):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json", "Authorization": f"Bearer {token}"})
    return s


@pytest.fixture(scope="session")
def any_item(client):
    r = client.get(f"{API}/items", timeout=30)
    assert r.status_code == 200
    items = r.json()
    if isinstance(items, dict):
        items = items.get("items", [])
    assert items, "need at least 1 item in catalog"
    return items[0]


# Track created resources for teardown
_created = {"customers": set(), "orders": set(), "dispatches": set()}


@pytest.fixture(scope="session", autouse=True)
def _cleanup(client):
    yield
    # delete dispatches first, then orders, then customers
    for did in list(_created["dispatches"]):
        try:
            client.delete(f"{API}/dispatches/{did}", timeout=20)
        except Exception:
            pass
    for oid in list(_created["orders"]):
        try:
            client.delete(f"{API}/orders/{oid}", timeout=20)
        except Exception:
            pass
    for cid in list(_created["customers"]):
        try:
            client.delete(f"{API}/customers/{cid}", timeout=20)
        except Exception:
            pass


def _mk_customer(client, label=""):
    name = f"{QA_PREFIX} {label} {uuid.uuid4().hex[:6]}".strip()
    r = client.post(f"{API}/customers", json={"name": name, "phone": "", "address": ""}, timeout=30)
    assert r.status_code in (200, 201), r.text
    cid = r.json()["id"]
    _created["customers"].add(cid)
    return cid, name


def _iso_days_ago(days: int) -> str:
    d = datetime.now(timezone.utc) - timedelta(days=days)
    return d.replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _ymd_days_ago(days: int) -> str:
    d = datetime.now(timezone.utc) - timedelta(days=days)
    return d.strftime("%Y-%m-%d")


def _mk_off_order(client, cid, item, qty, dispatched_at=None):
    body = {
        "customer_id": cid,
        "items": [{"item_id": item["id"], "quantity": qty}],
    }
    if dispatched_at is not None:
        body["dispatched_at"] = dispatched_at
    r = client.post(f"{API}/dispatch/off-order", json=body, timeout=30)
    assert r.status_code in (200, 201), r.text
    d = r.json()
    did = d.get("id") or d.get("dispatch", {}).get("id")
    assert did, f"no dispatch id in {d}"
    _created["dispatches"].add(did)
    return d, did


def _mk_order(client, cid, item, qty, order_date_iso=None):
    body = {
        "customer_id": cid,
        "items": [{
            "product_name": item.get("product_name") or item.get("name") or "x",
            "item_id": item["id"],
            "item_name": item.get("name") or item.get("product_name") or "x",
            "quantity": qty,
        }],
    }
    if order_date_iso:
        body["order_date"] = order_date_iso
    r = client.post(f"{API}/orders", json=body, timeout=30)
    assert r.status_code in (200, 201), r.text
    o = r.json()
    oid = o.get("id") or o.get("order", {}).get("id")
    _created["orders"].add(oid)
    return o, oid


def _get_order(client, oid):
    r = client.get(f"{API}/orders", timeout=30)
    assert r.status_code == 200
    data = r.json()
    orders = data if isinstance(data, list) else data.get("orders", [])
    for o in orders:
        if o.get("id") == oid:
            return o
    return None


def _get_dispatch(client, did):
    r = client.get(f"{API}/dispatches/{did}", timeout=30)
    if r.status_code == 200:
        return r.json()
    # fallback list
    r = client.get(f"{API}/dispatches", timeout=30)
    if r.status_code == 200:
        for d in (r.json() if isinstance(r.json(), list) else r.json().get("dispatches", [])):
            if d.get("id") == did:
                return d
    return None


# -------------------------- Tests --------------------------

# [1] Read-only: real RUNECHA order
class TestRealRunecha:
    def test_runecha_order_dispatched(self, client):
        r = client.get(f"{API}/orders", timeout=60)
        assert r.status_code == 200
        orders = r.json() if isinstance(r.json(), list) else r.json().get("orders", [])
        hit = [o for o in orders if str(o.get("id", "")).startswith("f0304185")]
        assert hit, "RUNECHA order with id prefix f0304185 not found"
        o = hit[0]
        assert o.get("status") == "Dispatched", f"status={o.get('status')} items={o.get('items')}"
        assert (o.get("items") or []) == [], f"expected empty items, got {o.get('items')}"

    def test_reconcile_idempotent(self, client):
        r = client.post(f"{API}/orders/reconcile?dry_run=true", timeout=120)
        assert r.status_code == 200, r.text
        js = r.json()
        assert js.get("count") == 0, f"expected 0 changes, got {js.get('count')}: {js.get('changes')}"


# [2] Late-entry (core bug)
class TestLateEntry:
    def test_late_entered_order_becomes_dispatched(self, client, any_item):
        cid, _ = _mk_customer(client, "LateEntry")
        _, did = _mk_off_order(client, cid, any_item, 50, dispatched_at=_ymd_days_ago(0))
        _, oid = _mk_order(client, cid, any_item, 50, order_date_iso=_iso_days_ago(1))
        o = _get_order(client, oid)
        assert o is not None
        assert o.get("status") == "Dispatched", f"status={o.get('status')} items={o.get('items')}"
        assert (o.get("items") or []) == []
        d = _get_dispatch(client, did)
        assert d is not None
        oids = set(d.get("order_ids") or [])
        if d.get("order_id"):
            oids.add(d["order_id"])
        assert oid in oids, f"slip order_ids={oids} missing {oid}"


# [3] Partial consumption
class TestPartial:
    def test_slip_less_than_order_leaves_remaining(self, client, any_item):
        cid, _ = _mk_customer(client, "Partial")
        _mk_off_order(client, cid, any_item, 30, dispatched_at=_ymd_days_ago(0))
        _, oid = _mk_order(client, cid, any_item, 100, order_date_iso=_iso_days_ago(1))
        o = _get_order(client, oid)
        assert o is not None
        assert o.get("status") == "Pending", f"status={o.get('status')}"
        remaining = sum(int(i.get("quantity") or 0) for i in (o.get("items") or []) if i.get("item_id") == any_item["id"])
        assert remaining == 70, f"expected 70 remaining, got {remaining}"


# [4] Order AFTER slip must NOT consume slip
class TestOrderAfterSlip:
    def test_order_today_slip_two_days_ago(self, client, any_item):
        cid, _ = _mk_customer(client, "AfterSlip")
        _mk_off_order(client, cid, any_item, 25, dispatched_at=_ymd_days_ago(2))
        _, oid = _mk_order(client, cid, any_item, 25, order_date_iso=_iso_days_ago(0))
        o = _get_order(client, oid)
        assert o is not None
        assert o.get("status") == "Pending", f"status={o.get('status')}"
        remaining = sum(int(i.get("quantity") or 0) for i in (o.get("items") or []) if i.get("item_id") == any_item["id"])
        assert remaining == 25


# [5] Normal FIFO + reconcile does not double-count
class TestNormalFIFO:
    def test_order_then_slip_then_reconcile_no_change(self, client, any_item):
        cid, _ = _mk_customer(client, "FIFO")
        _, oid = _mk_order(client, cid, any_item, 100, order_date_iso=_iso_days_ago(1))
        _mk_off_order(client, cid, any_item, 100, dispatched_at=_ymd_days_ago(0))
        o = _get_order(client, oid)
        assert o is not None
        assert o.get("status") == "Dispatched", f"status={o.get('status')}"
        # Reconcile dry run - must not propose extra changes for this customer
        r = client.post(f"{API}/orders/reconcile?dry_run=true", timeout=120)
        assert r.status_code == 200
        changes = r.json().get("changes", [])
        for ch in changes:
            assert ch.get("order_id") != oid, f"unexpected reconcile change for {oid}: {ch}"


# [6] Slip reassignment
class TestReassignment:
    def test_reassign_slip_a_to_b(self, client, any_item):
        cidA, _ = _mk_customer(client, "ReassignA")
        cidB, _ = _mk_customer(client, "ReassignB")
        # Pending order on B dated BEFORE slip
        _, oidB = _mk_order(client, cidB, any_item, 40, order_date_iso=_iso_days_ago(2))
        # Slip currently under A, dated today
        _, did = _mk_off_order(client, cidA, any_item, 40, dispatched_at=_ymd_days_ago(0))
        # Reassign slip to B
        r = client.patch(f"{API}/dispatches/{did}", json={"customer_id": cidB}, timeout=30)
        assert r.status_code == 200, r.text
        oB = _get_order(client, oidB)
        assert oB is not None
        assert oB.get("status") == "Dispatched", f"B status={oB.get('status')} items={oB.get('items')}"

    def test_reverse_reassign_restores_a(self, client, any_item):
        # A has an older order; slip punched under A clears it, then reassigned to B -> A restored
        cidA, _ = _mk_customer(client, "RevA")
        cidB, _ = _mk_customer(client, "RevB")
        _, oidA = _mk_order(client, cidA, any_item, 20, order_date_iso=_iso_days_ago(2))
        _, did = _mk_off_order(client, cidA, any_item, 20, dispatched_at=_ymd_days_ago(0))
        # Confirm A dispatched
        oA = _get_order(client, oidA)
        assert oA and oA.get("status") == "Dispatched", f"pre-reassign A status={oA.get('status') if oA else None}"
        # Reassign slip to B
        r = client.patch(f"{API}/dispatches/{did}", json={"customer_id": cidB}, timeout=30)
        assert r.status_code == 200, r.text
        oA2 = _get_order(client, oidA)
        assert oA2 is not None
        assert oA2.get("status") == "Pending", f"A should be restored to Pending, got {oA2.get('status')}"
        remaining = sum(int(i.get("quantity") or 0) for i in (oA2.get("items") or []) if i.get("item_id") == any_item["id"])
        assert remaining == 20, f"expected 20 restored, got {remaining}"


# [7] Delete slip that cleared QA order -> back to Pending
class TestDeleteSlipRestore:
    def test_delete_clearing_slip_restores_order(self, client, any_item):
        cid, _ = _mk_customer(client, "DelSlip")
        _, oid = _mk_order(client, cid, any_item, 15, order_date_iso=_iso_days_ago(1))
        _, did = _mk_off_order(client, cid, any_item, 15, dispatched_at=_ymd_days_ago(0))
        o = _get_order(client, oid)
        assert o and o.get("status") == "Dispatched"
        r = client.delete(f"{API}/dispatches/{did}", timeout=30)
        assert r.status_code in (200, 204), r.text
        _created["dispatches"].discard(did)
        o2 = _get_order(client, oid)
        assert o2 is not None
        assert o2.get("status") == "Pending", f"expected restored Pending, got {o2.get('status')}"
        remaining = sum(int(i.get("quantity") or 0) for i in (o2.get("items") or []) if i.get("item_id") == any_item["id"])
        assert remaining == 15
