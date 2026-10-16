"""Tests for new fields exposed by GET /api/orders and POST /api/orders/reconcile.

Covers:
 - completed_pcs & pending_pcs on every order
 - dispatch_summary groups contain `pcs`
 - For slips with order_alloc, per-order group reflects only allocated qty
   (RUNECHA order f0304185 — slip 938 should show 200 pcs Boxer only, NOT the
   full 800-pcs slip which includes 600 Splendor A for another order)
 - Partial case: 100-order, 30 off-order slip → completed_pcs=30, pending_pcs=70,
   dispatch_summary group pcs=30
 - Reconcile response schema (pending_orders, count, total_pcs, checked_at)
"""
import os
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://preview-116.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
QA_PREFIX = "QA TEST"


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
    items = r.json() if isinstance(r.json(), list) else r.json().get("items", [])
    assert items
    return items[0]


_created = {"customers": set(), "orders": set(), "dispatches": set()}


@pytest.fixture(scope="session", autouse=True)
def _cleanup(client):
    yield
    for did in list(_created["dispatches"]):
        try: client.delete(f"{API}/dispatches/{did}", timeout=20)
        except Exception: pass
    for oid in list(_created["orders"]):
        try: client.delete(f"{API}/orders/{oid}", timeout=20)
        except Exception: pass
    for cid in list(_created["customers"]):
        try: client.delete(f"{API}/customers/{cid}", timeout=20)
        except Exception: pass


def _mk_customer(client, label=""):
    name = f"{QA_PREFIX} {label} {uuid.uuid4().hex[:6]}".strip()
    r = client.post(f"{API}/customers", json={"name": name, "phone": "", "address": ""}, timeout=30)
    assert r.status_code in (200, 201), r.text
    cid = r.json()["id"]
    _created["customers"].add(cid)
    return cid


def _iso_days_ago(days: int) -> str:
    d = datetime.now(timezone.utc) - timedelta(days=days)
    return d.replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _ymd_days_ago(days: int) -> str:
    d = datetime.now(timezone.utc) - timedelta(days=days)
    return d.strftime("%Y-%m-%d")


def _get_order(client, oid):
    r = client.get(f"{API}/orders", timeout=60)
    assert r.status_code == 200
    arr = r.json() if isinstance(r.json(), list) else r.json().get("orders", [])
    for o in arr:
        if o.get("id") == oid:
            return o
    return None


# --- New fields on every order ----------------------------------------------
class TestOrderShape:
    def test_every_order_has_completed_and_pending_pcs(self, client):
        r = client.get(f"{API}/orders", timeout=60)
        assert r.status_code == 200
        arr = r.json() if isinstance(r.json(), list) else r.json().get("orders", [])
        assert arr, "need some orders"
        for o in arr[:50]:
            assert "completed_pcs" in o, f"missing completed_pcs on {o.get('id')}"
            assert "pending_pcs" in o, f"missing pending_pcs on {o.get('id')}"
            assert isinstance(o["completed_pcs"], int)
            assert isinstance(o["pending_pcs"], int)
            for g in (o.get("dispatch_summary") or []):
                assert "pcs" in g, f"dispatch_summary group missing pcs: {g}"


# --- RUNECHA order_alloc attribution ----------------------------------------
class TestRunechaAllocation:
    def test_runecha_order_shows_only_allocated_qty(self, client):
        r = client.get(f"{API}/orders", timeout=60)
        assert r.status_code == 200
        arr = r.json() if isinstance(r.json(), list) else r.json().get("orders", [])
        hit = [o for o in arr if str(o.get("id", "")).startswith("f0304185")]
        assert hit, "RUNECHA order f0304185 not found"
        o = hit[0]
        assert o.get("status") == "Dispatched"
        assert o["completed_pcs"] == 200, f"expected 200 completed, got {o['completed_pcs']}"
        assert o["pending_pcs"] == 0, f"expected 0 pending, got {o['pending_pcs']}"
        ds = o.get("dispatch_summary") or []
        assert len(ds) == 1, f"expected exactly 1 slip group, got {len(ds)}: {ds}"
        g = ds[0]
        assert g.get("slip_no") == 938, f"expected slip 938, got {g.get('slip_no')}"
        assert g.get("pcs") == 200, f"expected 200 pcs allocated to this order, got {g.get('pcs')}"
        # should NOT leak the 600 Splendor A line from the same slip
        names = [(it.get("item_name") or "").lower() for it in (g.get("items") or [])]
        assert not any("splendor" in n for n in names), f"splendor leaked into RUNECHA order: {names}"


# --- Partial QA case --------------------------------------------------------
class TestPartialCompletedPending:
    def test_30_of_100(self, client, any_item):
        cid = _mk_customer(client, "SlipHist")
        # 30 off-order first (today) then back-dated 100 order (yesterday) → late-entry reconcile
        r = client.post(f"{API}/dispatch/off-order", json={
            "customer_id": cid,
            "items": [{"item_id": any_item["id"], "quantity": 30}],
            "dispatched_at": _ymd_days_ago(0),
        }, timeout=30)
        assert r.status_code in (200, 201), r.text
        d = r.json()
        did = d.get("id") or d.get("dispatch", {}).get("id")
        _created["dispatches"].add(did)
        r = client.post(f"{API}/orders", json={
            "customer_id": cid,
            "items": [{
                "item_id": any_item["id"],
                "item_name": any_item.get("name") or "x",
                "product_name": any_item.get("product_name") or any_item.get("name") or "x",
                "quantity": 100,
            }],
            "order_date": _iso_days_ago(1),
        }, timeout=30)
        assert r.status_code in (200, 201), r.text
        oid = r.json().get("id")
        _created["orders"].add(oid)

        o = _get_order(client, oid)
        assert o is not None
        assert o["status"] == "Pending"
        assert o["completed_pcs"] == 30, f"expected 30 completed, got {o['completed_pcs']}"
        assert o["pending_pcs"] == 70, f"expected 70 pending, got {o['pending_pcs']}"
        ds = o.get("dispatch_summary") or []
        assert len(ds) == 1, f"expected 1 slip group, got {ds}"
        assert ds[0].get("pcs") == 30, f"expected slip group pcs=30, got {ds[0].get('pcs')}"


# --- Reconcile endpoint response schema -------------------------------------
class TestReconcileEndpoint:
    def test_dry_run_response_shape(self, client):
        r = client.post(f"{API}/orders/reconcile?dry_run=true", timeout=120)
        assert r.status_code == 200, r.text
        js = r.json()
        for k in ("dry_run", "count", "changes", "total_pcs", "fully_cleared", "pending_orders", "checked_at"):
            assert k in js, f"missing key {k}"
        assert js["dry_run"] is True
        assert isinstance(js["count"], int)
        assert isinstance(js["changes"], list)
        assert isinstance(js["pending_orders"], int)
