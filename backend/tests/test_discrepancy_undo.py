"""Backend tests for discrepancy resolve + undo workflow.

Scenario per iteration:
  1. Create QA customer.
  2. Create off-order dispatch dated YESTERDAY with item A qty 50.
  3. Create order dated TODAY with items A qty 50 + B qty 20.
  4. GET /api/orders -> order has non-null `discrepancy`.
  5. Resolve with action; verify side-effects.
  6. Undo; verify order restored to original state and dispatch.order_ids reverted.
Each test cleans up its own QA data; conftest provides a session-wide final sweep.
"""
import os
import uuid
import datetime as dt
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://preview-116.preview.emergentagent.com").rstrip("/")

QA_PREFIX = "QA TEST DISC"


# ------------------------------- fixtures ------------------------------------
@pytest.fixture(scope="session")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": "qa_tester", "password": "QaTest#2026"})
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="session")
def client(token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    return s


@pytest.fixture
def seed(client):
    """Create customer + off-order dispatch(YESTERDAY) + order(TODAY).

    Returns (customer, dispatch, order, item_a, item_b)
    """
    # Pick two distinct existing products (we'll use the first two returned).
    r = client.get(f"{BASE_URL}/api/items")
    assert r.status_code == 200
    items_all = r.json()
    assert len(items_all) >= 2, "Need at least 2 items in DB for test"
    pa, pb = items_all[0], items_all[1]

    today = dt.date.today()
    yesterday = today - dt.timedelta(days=1)

    cust_name = f"{QA_PREFIX} {uuid.uuid4().hex[:6]}"
    r = client.post(f"{BASE_URL}/api/customers", json={"name": cust_name, "city": "QA City"})
    assert r.status_code in (200, 201), r.text
    cust = r.json()
    cid = cust["id"]

    disp_items = [{"item_id": pa["id"], "item_name": pa["name"], "quantity": 50}]
    r = client.post(f"{BASE_URL}/api/dispatch/off-order", json={
        "customer_id": cid,
        "items": disp_items,
        "dispatched_at": yesterday.isoformat(),
    })
    assert r.status_code in (200, 201), r.text
    disp_resp = r.json()
    disp = disp_resp.get("dispatch") or disp_resp

    order_items = [
        {"item_id": pa["id"], "item_name": pa["name"], "product_name": pa.get("product_name", ""), "quantity": 50},
        {"item_id": pb["id"], "item_name": pb["name"], "product_name": pb.get("product_name", ""), "quantity": 20},
    ]
    r = client.post(f"{BASE_URL}/api/orders", json={
        "customer_id": cid,
        "order_date": today.isoformat(),
        "items": order_items,
    })
    assert r.status_code in (200, 201), r.text
    order = r.json()
    oid = order["id"]

    # Fetch orders list — discrepancy must be present.
    r = client.get(f"{BASE_URL}/api/orders")
    assert r.status_code == 200
    full = next((o for o in r.json() if o["id"] == oid), None)
    assert full is not None, "order missing from list"
    assert full.get("discrepancy"), f"Expected discrepancy on order, got: {full.get('discrepancy')}"
    assert full["discrepancy"].get("dispatch_id") == disp["id"]

    yield {"customer": cust, "dispatch": disp, "order": full, "pa": pa, "pb": pb}

    # Cleanup
    try:
        client.delete(f"{BASE_URL}/api/orders/{oid}")
    except Exception:
        pass
    try:
        client.delete(f"{BASE_URL}/api/dispatches/{disp['id']}")
    except Exception:
        pass
    try:
        client.delete(f"{BASE_URL}/api/customers/{cid}")
    except Exception:
        pass
    # Also drop any lingering undo doc
    try:
        requests.post(f"{BASE_URL}/api/_test/noop")
    except Exception:
        pass


# ------------------------------- helpers -------------------------------------
def _get_order(client, oid):
    r = client.get(f"{BASE_URL}/api/orders")
    assert r.status_code == 200
    return next((o for o in r.json() if o["id"] == oid), None)


def _get_dispatch(client, did):
    r = client.get(f"{BASE_URL}/api/dispatches")
    assert r.status_code == 200
    data = r.json()
    rows = data if isinstance(data, list) else data.get("items") or data.get("dispatches") or []
    return next((d for d in rows if d["id"] == did), None)


# ------------------------------- tests ---------------------------------------
class TestResolveClearAndUndo:
    def test_clear_then_undo(self, client, seed):
        oid = seed["order"]["id"]
        did = seed["dispatch"]["id"]
        original_items = seed["order"]["items"]
        assert len(original_items) == 2

        # Resolve: clear
        r = client.post(f"{BASE_URL}/api/orders/{oid}/resolve-discrepancy",
                        json={"action": "clear", "dispatch_id": did})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["action"] == "clear"
        # Only item A was on the slip (qty 50) → B remains Pending.
        o_after = _get_order(client, oid)
        assert o_after is not None
        assert o_after["status"] == "Pending"
        assert len(o_after["items"]) == 1
        assert o_after["items"][0]["item_id"] == seed["pb"]["id"]
        assert o_after.get("discrepancy_undo") and o_after["discrepancy_undo"]["action"] == "clear"
        # Dispatch now references this order.
        d_after = _get_dispatch(client, did)
        assert oid in (d_after.get("order_ids") or [])

        # Undo
        r = client.post(f"{BASE_URL}/api/orders/{oid}/undo-discrepancy")
        assert r.status_code == 200, r.text
        o_restored = _get_order(client, oid)
        assert o_restored["status"] == "Pending"
        assert len(o_restored["items"]) == 2
        got_qty = {it["item_id"]: it["quantity"] for it in o_restored["items"]}
        assert got_qty[seed["pa"]["id"]] == 50
        assert got_qty[seed["pb"]["id"]] == 20
        assert o_restored.get("discrepancy"), "Discrepancy should re-appear after undo"
        assert o_restored.get("discrepancy_undo") in (None, {})
        d_restored = _get_dispatch(client, did)
        assert oid not in (d_restored.get("order_ids") or [])


class TestResolveUpdateDateAndUndo:
    def test_update_date_then_undo(self, client, seed):
        oid = seed["order"]["id"]
        did = seed["dispatch"]["id"]
        orig_date = seed["order"]["order_date"]
        slip_date = seed["dispatch"]["dispatched_at"][:10]

        r = client.post(f"{BASE_URL}/api/orders/{oid}/resolve-discrepancy",
                        json={"action": "update_date", "dispatch_id": did})
        assert r.status_code == 200, r.text
        o_after = _get_order(client, oid)
        assert (o_after["order_date"] or "")[:10] == slip_date
        assert o_after.get("discrepancy_undo", {}).get("action") == "update_date"

        r = client.post(f"{BASE_URL}/api/orders/{oid}/undo-discrepancy")
        assert r.status_code == 200
        o_restored = _get_order(client, oid)
        assert (o_restored["order_date"] or "")[:10] == orig_date[:10]
        assert o_restored.get("discrepancy"), "Discrepancy card should re-appear"


class TestResolveKeepAndUndo:
    def test_keep_then_undo(self, client, seed):
        oid = seed["order"]["id"]
        did = seed["dispatch"]["id"]
        r = client.post(f"{BASE_URL}/api/orders/{oid}/resolve-discrepancy",
                        json={"action": "keep", "dispatch_id": did})
        assert r.status_code == 200, r.text
        o_after = _get_order(client, oid)
        assert o_after.get("discrepancy_dismissed") is True
        # Discrepancy card suppressed
        assert not o_after.get("discrepancy")
        assert o_after.get("discrepancy_undo", {}).get("action") == "keep"

        r = client.post(f"{BASE_URL}/api/orders/{oid}/undo-discrepancy")
        assert r.status_code == 200
        o_restored = _get_order(client, oid)
        assert not o_restored.get("discrepancy_dismissed")
        assert o_restored.get("discrepancy"), "Discrepancy card should re-appear after undo"


class TestResolveDeleteAndUndo:
    def test_delete_then_undo(self, client, seed):
        oid = seed["order"]["id"]
        did = seed["dispatch"]["id"]
        r = client.post(f"{BASE_URL}/api/orders/{oid}/resolve-discrepancy",
                        json={"action": "delete", "dispatch_id": did})
        assert r.status_code == 200
        assert r.json().get("deleted") is True
        assert _get_order(client, oid) is None

        # Undo re-creates the order with same id
        r = client.post(f"{BASE_URL}/api/orders/{oid}/undo-discrepancy")
        assert r.status_code == 200, r.text
        o_restored = _get_order(client, oid)
        assert o_restored is not None, "Order should be re-created with same id"
        assert o_restored["id"] == oid
        assert len(o_restored["items"]) == 2
        assert o_restored.get("discrepancy"), "Discrepancy card should re-appear"


class TestUndoWithoutAction:
    def test_undo_without_prior_resolution_returns_404(self, client, seed):
        oid = seed["order"]["id"]
        r = client.post(f"{BASE_URL}/api/orders/{oid}/undo-discrepancy")
        assert r.status_code == 404, r.text
        assert "Nothing to undo" in r.text
