# Iteration 7: clone copies bill_amount_required; vendor edit/delete perms grant/revoke; qaprice perms restore
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
QAPRICE_PERMS = ["dashboard", "priceLists", "vendorPriceLists", "products", "customers",
                 "add:priceLists", "edit:priceLists", "delete:priceLists",
                 "add:vendorPriceLists", "add:products", "add:customers"]


def _sess(u, p):
    r = requests.post(f"{API}/auth/login", json={"email": u, "password": p}, timeout=30)
    if r.status_code != 200:
        pytest.skip(f"login failed {u}")
    s = requests.Session(); s.headers.update({"Authorization": f"Bearer {r.json()['token']}"})
    return s, r.json()["user"]


@pytest.fixture(scope="module")
def admin():
    s, u = _sess("qaadmin", "QaAdmin@123")
    yield s, u
    for pl in s.get(f"{API}/price-lists").json():
        if pl["name"].startswith("TEST_QA7_"):
            s.delete(f"{API}/price-lists/{pl['id']}")


@pytest.fixture(scope="module")
def qa():
    return _sess("qaprice", "QaPrice@123")


# Clone: bill_amount_required False and True are both copied
@pytest.mark.parametrize("flag", [False, True])
def test_clone_copies_bill_flag(admin, flag):
    s, _ = admin
    n = f"TEST_QA7_{uuid.uuid4().hex[:6]}"
    pid = s.post(f"{API}/price-lists", json={"name": n}).json()["id"]
    r = s.patch(f"{API}/price-lists/{pid}", json={"bill_amount_required": flag})
    assert r.status_code == 200 and r.json()["bill_amount_required"] is flag
    r = s.post(f"{API}/price-lists/{pid}/clone", json={"name": n + "_C"})
    assert r.status_code == 200, r.text
    cid = r.json()["id"]
    got = s.get(f"{API}/price-lists/{cid}").json()
    bar = got.get("bill_amount_required", got.get("price_list", {}).get("bill_amount_required"))
    if bar is None:
        bar = next(p for p in s.get(f"{API}/price-lists").json() if p["id"] == cid)["bill_amount_required"]
    assert bar is flag
    s.delete(f"{API}/price-lists/{cid}"); s.delete(f"{API}/price-lists/{pid}")


# Customer price list: without edit:priceLists item save is 403; with it, 200
def test_price_item_edit_gating(admin, qa):
    a, _ = admin
    s, u = qa
    pid = a.post(f"{API}/price-lists", json={"name": f"TEST_QA7_{uuid.uuid4().hex[:6]}"}).json()["id"]
    item = a.get(f"{API}/price-lists/{pid}").json()["items"][0]
    reduced = [p for p in QAPRICE_PERMS if p != "edit:priceLists"]
    try:
        assert a.patch(f"{API}/users/{u['id']}/permissions", json={"permissions": reduced}).status_code == 200
        assert s.post(f"{API}/price-lists/{pid}/items", json={"item_id": item["item_id"], "price": 9}).status_code == 403
    finally:
        r = a.patch(f"{API}/users/{u['id']}/permissions", json={"permissions": QAPRICE_PERMS})
        assert set(r.json()["permissions"]) == set(QAPRICE_PERMS)
    assert s.post(f"{API}/price-lists/{pid}/items", json={"item_id": item["item_id"], "price": 55}).status_code == 200
    d = a.get(f"{API}/price-lists/{pid}").json()
    assert any(i["item_id"] == item["item_id"] and i["price"] == 55 for i in d["items"])
    a.delete(f"{API}/price-lists/{pid}")


def test_qaprice_final_perms(admin, qa):
    a, _ = admin
    _, u = qa
    users = a.get(f"{API}/users").json()
    me = next(x for x in users if x["id"] == u["id"])
    assert set(me["permissions"]) == set(QAPRICE_PERMS)
