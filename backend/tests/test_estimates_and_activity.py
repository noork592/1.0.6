"""Backend tests for:
  1. POST /api/estimates/compute price_override behaviour
  2. POST /api/estimates (save) + DELETE /api/estimates/{id}
  3. GET /api/orders/{id}/activity logs for all order-mutating endpoints
Uses only QA TEST data; cleans everything up at the end.
"""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://preview-116.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

QA_PREFIX = f"QA TEST {uuid.uuid4().hex[:6]}"


# ----------------------- fixtures -----------------------
@pytest.fixture(scope="session")
def token():
    r = requests.post(f"{API}/auth/login",
                      json={"email": "qa_tester", "password": "QaTest#2026"},
                      timeout=20)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="session")
def client(token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {token}",
                      "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def qa_product(client):
    """Create a QA parent product; delete on teardown."""
    r = client.post(f"{API}/products",
                    json={"name": f"{QA_PREFIX} PRODUCT",
                          "min_per_bag": 10, "max_per_bag": 100})
    assert r.status_code in (200, 201), r.text
    prod = r.json()
    yield prod
    client.delete(f"{API}/products/{prod['id']}")


@pytest.fixture(scope="session")
def qa_items(client, qa_product):
    """Create 2 QA items under qa_product; delete on teardown."""
    created = []
    for name in (f"{QA_PREFIX} SKU A", f"{QA_PREFIX} SKU B"):
        payload = {"name": name, "product_id": qa_product["id"]}
        r = client.post(f"{API}/items", json=payload)
        assert r.status_code in (200, 201), r.text
        created.append(r.json())
    yield created
    for it in created:
        client.delete(f"{API}/items/{it['id']}")


@pytest.fixture(scope="session")
def qa_customer(client):
    payload = {"name": f"{QA_PREFIX} CUSTOMER", "phone": "9999999999",
               "city": "QA", "address": "QA Addr"}
    r = client.post(f"{API}/customers", json=payload)
    assert r.status_code in (200, 201), r.text
    cust = r.json()
    yield cust
    client.delete(f"{API}/customers/{cust['id']}")


# ----------------------- Estimates: price_override -----------------------
class TestEstimateCompute:
    def test_compute_without_override_uses_list_price(self, client, qa_customer, qa_items):
        body = {"customer_id": qa_customer["id"],
                "items": [{"item_id": qa_items[0]["id"], "quantity": 2}]}
        r = client.post(f"{API}/estimates/compute", json=body)
        assert r.status_code == 200, r.text
        data = r.json()
        line = data["lines"][0]
        assert line["found"] is True
        # No price-list assigned to QA customer, list price falls back to 0
        assert line["price_override"] is False
        # net_unit_price equals list_net_unit_price when no override
        assert line["net_unit_price"] == line["list_net_unit_price"]
        assert line["line_value"] == round(line["net_unit_price"] * 2, 2)

    def test_compute_with_override_uses_typed_price(self, client, qa_customer, qa_items):
        body = {"customer_id": qa_customer["id"],
                "items": [{"item_id": qa_items[0]["id"], "quantity": 3,
                           "price_override": 90}]}
        r = client.post(f"{API}/estimates/compute", json=body)
        assert r.status_code == 200, r.text
        line = r.json()["lines"][0]
        assert line["price_override"] is True
        assert line["net_unit_price"] == 90.0
        assert line["line_value"] == 270.0
        # list_net_unit_price must still carry the price-list rate (0 for QA cust)
        assert "list_net_unit_price" in line

    def test_save_estimate_persists_override_and_cleanup(self, client, qa_customer, qa_items):
        body = {"customer_id": qa_customer["id"],
                "items": [{"item_id": qa_items[0]["id"], "quantity": 2,
                           "price_override": 90}]}
        r = client.post(f"{API}/estimates", json=body)
        assert r.status_code in (200, 201), r.text
        est = r.json()
        assert est.get("estimate_no")
        line = est["lines"][0]
        assert line["net_unit_price"] == 90.0
        assert line["price_override"] is True
        assert line["line_value"] == 180.0
        # Fetch and verify persistence
        rg = client.get(f"{API}/estimates/{est['id']}")
        assert rg.status_code == 200
        assert rg.json()["lines"][0]["net_unit_price"] == 90.0
        # cleanup
        rd = client.delete(f"{API}/estimates/{est['id']}")
        assert rd.status_code in (200, 204)
        # verify deletion
        assert client.get(f"{API}/estimates/{est['id']}").status_code == 404


# ----------------------- Order Activity logging -----------------------
class TestOrderActivity:
    @pytest.fixture(scope="class")
    def order_ctx(self, client, qa_customer, qa_items):
        # Create an order with one item
        body = {"customer_id": qa_customer["id"],
                "items": [{"item_id": qa_items[0]["id"],
                           "item_name": qa_items[0]["name"],
                           "product_name": qa_items[0]["name"],
                           "quantity": 10}]}
        r = client.post(f"{API}/orders", json=body)
        assert r.status_code in (200, 201), r.text
        order = r.json()
        yield {"order": order}
        # cleanup leftover order if still present
        client.delete(f"{API}/orders/{order['id']}")

    def _activity(self, client, oid):
        r = client.get(f"{API}/orders/{oid}/activity")
        assert r.status_code == 200, r.text
        return r.json()

    def test_01_created_logged(self, client, order_ctx):
        acts = self._activity(client, order_ctx["order"]["id"])
        actions = [a["action"] for a in acts]
        assert "created" in actions, f"actions={actions}"

    def test_02_status_change_logged(self, client, order_ctx):
        oid = order_ctx["order"]["id"]
        r = client.patch(f"{API}/orders/{oid}/status", json={"status": "Pending"})
        assert r.status_code == 200
        acts = self._activity(client, oid)
        a = next((x for x in acts if x["action"] == "status_changed"), None)
        assert a is not None
        assert a.get("note") == "Pending"

    def test_03_admin_edit_logged(self, client, order_ctx, qa_items):
        oid = order_ctx["order"]["id"]
        new_items = [{"item_id": qa_items[0]["id"],
                      "item_name": qa_items[0]["name"],
                      "product_name": qa_items[0]["name"],
                      "quantity": 8}]
        r = client.patch(f"{API}/orders/{oid}", json={"items": new_items, "notes": "edited"})
        assert r.status_code == 200, r.text
        acts = self._activity(client, oid)
        assert any(a["action"] == "edited" for a in acts)

    def test_04_off_order_dispatch_logs_slip_linked(self, client, order_ctx, qa_customer, qa_items):
        oid = order_ctx["order"]["id"]
        body = {"customer_id": qa_customer["id"],
                "items": [{"item_id": qa_items[0]["id"], "quantity": 3,
                           "description": ""}]}
        r = client.post(f"{API}/dispatch/off-order", json=body)
        assert r.status_code in (200, 201), r.text
        disp = r.json().get("dispatch", r.json())
        order_ctx["disp"] = disp
        time.sleep(0.5)
        acts = self._activity(client, oid)
        linked = next((a for a in acts if a["action"] == "slip_linked"), None)
        assert linked is not None, f"no slip_linked in {[a['action'] for a in acts]}"
        assert linked.get("slip_no") == disp.get("slip_no")
        assert any(it.get("quantity") == 3 for it in linked.get("items", []))

    def test_05_dispatch_edit_logs_slip_edited(self, client, order_ctx, qa_items):
        oid = order_ctx["order"]["id"]
        disp = order_ctx.get("disp")
        assert disp, "need prior dispatch"
        # Reduce qty from 3 → 1
        new_items = [{"item_id": qa_items[0]["id"],
                      "item_name": qa_items[0]["name"],
                      "product_name": qa_items[0]["name"],
                      "quantity": 1}]
        r = client.patch(f"{API}/dispatches/{disp['id']}", json={"items": new_items})
        assert r.status_code == 200, r.text
        time.sleep(0.3)
        acts = self._activity(client, oid)
        assert any(a["action"] == "slip_edited" for a in acts), \
               f"actions={[a['action'] for a in acts]}"

    def test_06_dispatch_delete_logs_slip_deleted(self, client, order_ctx):
        oid = order_ctx["order"]["id"]
        disp = order_ctx.get("disp")
        r = client.delete(f"{API}/dispatches/{disp['id']}")
        assert r.status_code in (200, 204), r.text
        time.sleep(0.3)
        acts = self._activity(client, oid)
        assert any(a["action"] == "slip_deleted" for a in acts), \
               f"actions={[a['action'] for a in acts]}"

    def test_07_discrepancy_clear_and_undo_logged(self, client, order_ctx, qa_customer, qa_items):
        # Create a NEW order + an earlier off-order dispatch to trigger
        # discrepancy, then resolve+undo
        import datetime
        yday = (datetime.datetime.utcnow() - datetime.timedelta(days=1)).isoformat()
        # pre-dispatch yesterday
        rd = client.post(f"{API}/dispatch/off-order", json={
            "customer_id": qa_customer["id"],
            "items": [{"item_id": qa_items[1]["id"], "quantity": 1}],
            "dispatch_date": yday,
        })
        assert rd.status_code in (200, 201), rd.text
        disp2 = rd.json().get("dispatch", rd.json())
        # Create order today
        ro = client.post(f"{API}/orders", json={
            "customer_id": qa_customer["id"],
            "items": [{"item_id": qa_items[1]["id"],
                       "item_name": qa_items[1]["name"],
                       "product_name": qa_items[1]["name"],
                       "quantity": 1}]
        })
        assert ro.status_code in (200, 201), ro.text
        o2 = ro.json()
        try:
            # Resolve clear
            rc = client.post(f"{API}/orders/{o2['id']}/resolve-discrepancy",
                             json={"action": "clear", "dispatch_id": disp2["id"]})
            assert rc.status_code == 200, rc.text
            acts = self._activity(client, o2["id"])
            assert any(a["action"] == "discrepancy_clear" for a in acts), \
                   f"actions={[a['action'] for a in acts]}"
            # Undo
            ru = client.post(f"{API}/orders/{o2['id']}/undo-discrepancy")
            assert ru.status_code == 200, ru.text
            acts = self._activity(client, o2["id"])
            assert any(a["action"] == "discrepancy_undo" for a in acts), \
                   f"actions={[a['action'] for a in acts]}"
        finally:
            client.delete(f"{API}/orders/{o2['id']}")
            client.delete(f"{API}/dispatches/{disp2['id']}")

    def test_08_order_delete_logged(self, client, order_ctx):
        oid = order_ctx["order"]["id"]
        r = client.delete(f"{API}/orders/{oid}")
        assert r.status_code in (200, 204)
        # The order is deleted — activity may still be fetchable
        acts = self._activity(client, oid)
        assert any(a["action"] == "deleted" for a in acts), \
               f"actions={[a['action'] for a in acts]}"
