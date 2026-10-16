"""Validate multi-slip discrepancy detection, quantity-aware clear, undo, and
dry_run resync restriction (QA TEST customers only — real data untouched)."""
import os, uuid, time
from datetime import datetime, timedelta, timezone
import pymongo, requests, pytest
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
load_dotenv("/app/frontend/.env")
BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
MONGO = pymongo.MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]

ITEM_A_ID = "0414ad96-47ba-4876-bd00-120e285de89d"
ITEM_A_NAME = "SIDE STAND HONDA SHINE BS6"
ITEM_B_ID = "9e0e76c8-35c8-4b4e-bc81-171f6f4cce5e"
ITEM_B_NAME = "SIDE STAND BAJAJ BOXER, KB-4S, CT-100"
PRODUCT_NAME = "Side Stand"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE}/api/auth/login",
                      json={"email": "qa_tester", "password": "QaTest#2026"})
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def h(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# Collect created ids so we can clean up at session end.
_created = {"customers": [], "orders": [], "dispatches": []}


@pytest.fixture(scope="module", autouse=True)
def cleanup():
    yield
    for oid in _created["orders"]:
        MONGO.orders.delete_one({"id": oid})
        MONGO.discrepancy_undo.delete_one({"order_id": oid})
        MONGO.order_activity.delete_many({"order_id": oid})
    for did in _created["dispatches"]:
        MONGO.dispatches.delete_one({"id": did})
    for cid in _created["customers"]:
        MONGO.customers.delete_one({"id": cid})
    # restore counter to pre-test value
    MONGO.counters.update_one({"_id": "dispatch_slip"}, {"$set": {"seq": 1043}})


def _mk_customer(h):
    tag = f"QA TEST MULTI {uuid.uuid4().hex[:6]}"
    r = requests.post(f"{BASE}/api/customers",
                      json={"name": tag, "phone": "9000000000"}, headers=h)
    assert r.status_code in (200, 201), r.text
    cid = r.json()["id"]
    _created["customers"].append(cid)
    return cid, tag


def _mk_dispatch(h, customer_id, days_ago, item_id, item_name, qty):
    dt = (datetime.now(timezone.utc) - timedelta(days=days_ago)).isoformat()
    body = {
        "customer_id": customer_id,
        "dispatched_at": dt,
        "items": [{"item_id": item_id, "item_name": item_name,
                   "product_name": PRODUCT_NAME, "quantity": qty}],
    }
    r = requests.post(f"{BASE}/api/dispatch/off-order", json=body, headers=h)
    assert r.status_code in (200, 201), r.text
    d = r.json().get("dispatch", r.json())
    _created["dispatches"].append(d["id"])
    return d


def _mk_order(h, customer_id, items):
    body = {
        "customer_id": customer_id,
        "order_date": datetime.now(timezone.utc).date().isoformat(),
        "items": [{"item_id": it[0], "item_name": it[1],
                   "product_name": PRODUCT_NAME, "quantity": it[2]} for it in items],
    }
    r = requests.post(f"{BASE}/api/orders", json=body, headers=h)
    assert r.status_code in (200, 201), r.text
    oid = r.json()["id"]
    _created["orders"].append(oid)
    return oid


def _get_order(h, oid):
    r = requests.get(f"{BASE}/api/orders?status_filter=Pending", headers=h)
    assert r.status_code == 200
    for o in r.json():
        if o["id"] == oid:
            return o
    # try all status
    r = requests.get(f"{BASE}/api/orders", headers=h)
    for o in r.json():
        if o["id"] == oid:
            return o
    return None


# ---------- Real NIKAVI order (read-only verification) ----------
def test_nikavi_order_shows_all_four_slips(h):
    r = requests.get(f"{BASE}/api/orders?status_filter=Pending", headers=h)
    assert r.status_code == 200
    nik = next((o for o in r.json() if o["id"].startswith("3ebf5a1b")), None)
    assert nik, "NIKAVI order 3ebf5a1b not in Pending list"
    d = nik.get("discrepancy")
    assert d, "NIKAVI order should have a discrepancy"
    slip_nos = sorted(sl["slip_no"] for sl in d["slips"])
    assert slip_nos == [707, 723, 754, 766]
    s723 = next(sl for sl in d["slips"] if sl["slip_no"] == 723)
    usable_names = {u["item_name"]: u["quantity"] for u in s723["usable"]}
    assert usable_names.get("SIDE STAND HONDA SHINE BS6") == 150
    assert d["usable_pcs"] > 0
    assert "pending_after" in d


# ---------- Dry-run resync is read-only and reports multi-slip ----------
def test_resync_dry_run_is_readonly_and_shows_multi_slip(h):
    import hashlib, json
    def snap():
        docs = sorted([{k: v for k, v in o.items() if k != "_id"}
                       for o in MONGO.orders.find()], key=lambda x: x["id"])
        return hashlib.md5(json.dumps(docs, default=str, sort_keys=True).encode()).hexdigest()
    before = snap()
    r = requests.post(f"{BASE}/api/orders/discrepancy-resync?dry_run=true", headers=h)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("dry_run") is True
    assert body.get("count") >= 1
    nik = next((c for c in body["changes"] if c["order_id"].startswith("3ebf5a1b")), None)
    assert nik and nik["action"] == "clear"
    assert sorted(sl["slip_no"] for sl in nik.get("slip_lines", [])) == [707, 723, 754, 766]
    assert snap() == before, "dry_run must not mutate orders"


# ---------- Full QA flow: 2 slips, quantity-aware clear, undo ----------
def test_qa_multi_slip_clear_and_undo(h):
    cid, _ = _mk_customer(h)
    old = _mk_dispatch(h, cid, days_ago=5, item_id=ITEM_A_ID,
                       item_name=ITEM_A_NAME, qty=40)
    new = _mk_dispatch(h, cid, days_ago=3, item_id=ITEM_B_ID,
                       item_name=ITEM_B_NAME, qty=30)
    time.sleep(1)
    oid = _mk_order(h, cid, [(ITEM_A_ID, ITEM_A_NAME, 100),
                             (ITEM_B_ID, ITEM_B_NAME, 30)])
    o = _get_order(h, oid)
    assert o and o.get("discrepancy"), "Order must be flagged"
    slip_nos = sorted(sl["slip_no"] for sl in o["discrepancy"]["slips"])
    assert len(slip_nos) == 2, f"expected both slips, got {slip_nos}"
    # usable per slip
    per = {sl["slip_no"]: {u["item_name"]: u["quantity"] for u in sl["usable"]}
           for sl in o["discrepancy"]["slips"]}
    old_slip_no = old["slip_no"]
    new_slip_no = new["slip_no"]
    assert per[old_slip_no].get(ITEM_A_NAME) == 40
    assert per[new_slip_no].get(ITEM_B_NAME) == 30

    # Clear with BOTH dispatch ids
    r = requests.post(f"{BASE}/api/orders/{oid}/resolve-discrepancy",
                      json={"action": "clear", "dispatch_id": new["id"],
                            "dispatch_ids": [old["id"], new["id"]]}, headers=h)
    assert r.status_code == 200, r.text

    o2 = _get_order(h, oid)
    assert o2["status"] == "Pending"
    item_map = {it["item_name"]: it["quantity"] for it in o2["items"]}
    assert ITEM_B_NAME not in item_map, "Item B fully consumed should be removed"
    assert item_map.get(ITEM_A_NAME) == 60, f"Item A should be 100-40=60, got {item_map}"

    # Both slips should now carry this order id in order_ids
    for did in (old["id"], new["id"]):
        d = MONGO.dispatches.find_one({"id": did})
        assert oid in (d.get("order_ids") or []), f"slip {d.get('slip_no')} missing order id"

    # Undo
    r = requests.post(f"{BASE}/api/orders/{oid}/undo-discrepancy", headers=h)
    assert r.status_code == 200, r.text
    o3 = _get_order(h, oid)
    item_map3 = {it["item_name"]: it["quantity"] for it in o3["items"]}
    assert item_map3.get(ITEM_A_NAME) == 100
    assert item_map3.get(ITEM_B_NAME) == 30
    for did in (old["id"], new["id"]):
        d = MONGO.dispatches.find_one({"id": did})
        assert oid not in (d.get("order_ids") or [])
    # discrepancy flagged again with both slips
    assert o3.get("discrepancy")
    assert len(o3["discrepancy"]["slips"]) == 2


# ---------- discrepancy-resync dry_run=false scoped to order_ids ----------
def test_resync_apply_scoped_to_qa_order(h):
    cid, _ = _mk_customer(h)
    disp = _mk_dispatch(h, cid, days_ago=4, item_id=ITEM_A_ID,
                        item_name=ITEM_A_NAME, qty=25)
    time.sleep(1)
    oid = _mk_order(h, cid, [(ITEM_A_ID, ITEM_A_NAME, 100)])
    o = _get_order(h, oid)
    assert o.get("discrepancy")

    # Capture pre-state of unrelated real order (NIKAVI)
    pre_nik = MONGO.orders.find_one({"id": {"$regex": "^3ebf5a1b"}}, {"_id": 0, "items": 1})

    r = requests.post(f"{BASE}/api/orders/discrepancy-resync?dry_run=false",
                      json={"order_ids": [oid]}, headers=h)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("dry_run") is False
    assert body.get("count") == 1
    assert body["changes"][0]["order_id"] == oid

    # Our QA order should now have A reduced by 25 (100-25=75)
    o2 = _get_order(h, oid)
    item_map = {it["item_name"]: it["quantity"] for it in o2["items"]}
    assert item_map.get(ITEM_A_NAME) == 75, f"expected 75 got {item_map}"

    # NIKAVI untouched
    post_nik = MONGO.orders.find_one({"id": {"$regex": "^3ebf5a1b"}}, {"_id": 0, "items": 1})
    assert pre_nik == post_nik, "Real order must not be modified by scoped resync"

    # cleanup — undo so cleanup sees consistent state
    requests.post(f"{BASE}/api/orders/{oid}/undo-discrepancy", headers=h)
