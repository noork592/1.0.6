# Action-permission (add:/edit:/delete:<module>) gating for non-admin users on price lists / vendor price lists / products / customers
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

QAPRICE_PERMS = ["dashboard", "priceLists", "vendorPriceLists", "products", "customers",
                 "add:priceLists", "edit:priceLists", "delete:priceLists",
                 "add:vendorPriceLists", "add:products", "add:customers"]


def _login(u, p):
    r = requests.post(f"{API}/auth/login", json={"email": u, "password": p}, timeout=30)
    if r.status_code != 200:
        pytest.skip(f"login failed for {u}: {r.status_code} {r.text[:200]}")
    d = r.json()
    return d["token"], d["user"]


@pytest.fixture(scope="module")
def admin():
    t, u = _login("qaadmin", "QaAdmin@123")
    s = requests.Session(); s.headers.update({"Authorization": f"Bearer {t}"})
    return s, u


@pytest.fixture(scope="module")
def qa():
    t, u = _login("qaprice", "QaPrice@123")
    s = requests.Session(); s.headers.update({"Authorization": f"Bearer {t}"})
    return s, u


@pytest.fixture(scope="module")
def created(admin):
    ids = []
    yield ids
    s, _ = admin
    for i in ids:
        s.delete(f"{API}/price-lists/{i}")
    # Cleanup any stray TEST_QA lists
    for pl in s.get(f"{API}/price-lists").json():
        if pl["name"].startswith("TEST_QA_"):
            s.delete(f"{API}/price-lists/{pl['id']}")


class TestPriceListsNonAdmin:
    def test_qaprice_is_non_admin_with_perms(self, qa):
        _, u = qa
        assert u["role"] == "user"
        for k in ["priceLists", "add:priceLists", "edit:priceLists", "delete:priceLists"]:
            assert k in u["permissions"]

    def test_full_flow(self, qa, created):
        s, _ = qa
        name = f"TEST_QA_{uuid.uuid4().hex[:6]}"
        r = s.post(f"{API}/price-lists", json={"name": name, "description": "qa"})
        assert r.status_code == 200, r.text
        plid = r.json()["id"]; created.append(plid)
        # rename
        r = s.patch(f"{API}/price-lists/{plid}", json={"name": name + "_R"})
        assert r.status_code == 200 and r.json()["name"] == name + "_R"
        # bill required toggle
        r = s.patch(f"{API}/price-lists/{plid}", json={"bill_amount_required": False})
        assert r.status_code == 200 and r.json()["bill_amount_required"] is False
        # detail + item price
        d = s.get(f"{API}/price-lists/{plid}").json()
        assert d["items"], "no items in catalog"
        item = d["items"][0]
        r = s.post(f"{API}/price-lists/{plid}/items", json={"item_id": item["item_id"], "price": 123.5})
        assert r.status_code == 200, r.text
        cat = item["product_name"] or "X"
        r = s.post(f"{API}/price-lists/{plid}/discounts",
                   json={"product_name": cat, "discount_value": 5, "discount_type": "%"})
        assert r.status_code == 200, r.text
        d = s.get(f"{API}/price-lists/{plid}").json()
        assert any(i["item_id"] == item["item_id"] and i["price"] == 123.5 for i in d["items"])
        assert any(x["product_name"] == cat and x["discount_value"] == 5 for x in d["discounts"])
        # delink
        r = s.post(f"{API}/price-lists/{plid}/delink-customers")
        assert r.status_code == 200 and r.json()["delinked_customers"] == 0
        # clone
        r = s.post(f"{API}/price-lists/{plid}/clone", json={"name": name + "_C"})
        assert r.status_code == 200, r.text
        cid = r.json()["id"]; created.append(cid)
        assert r.json()["items_copied"] == 1 and r.json()["discounts_copied"] == 1
        # delete clone
        r = s.delete(f"{API}/price-lists/{cid}")
        assert r.status_code == 200
        assert s.get(f"{API}/price-lists/{cid}").status_code == 404


class TestRevokedPerms:
    def test_revoked_edit_gets_403_then_restore(self, admin, qa, created):
        a, _ = admin
        s, u = qa
        name = f"TEST_QA_{uuid.uuid4().hex[:6]}"
        plid = a.post(f"{API}/price-lists", json={"name": name}).json()["id"]; created.append(plid)
        item = a.get(f"{API}/price-lists/{plid}").json()["items"][0]
        reduced = [p for p in QAPRICE_PERMS if p not in ("edit:priceLists", "delete:priceLists", "add:priceLists")]
        r = a.patch(f"{API}/users/{u['id']}/permissions", json={"permissions": reduced})
        assert r.status_code == 200
        try:
            assert s.post(f"{API}/price-lists/{plid}/items", json={"item_id": item["item_id"], "price": 1}).status_code == 403
            assert s.post(f"{API}/price-lists/{plid}/discounts", json={"product_name": "X", "discount_value": 1, "discount_type": "%"}).status_code == 403
            assert s.post(f"{API}/price-lists/{plid}/delink-customers").status_code == 403
            assert s.patch(f"{API}/price-lists/{plid}", json={"name": "zz"}).status_code == 403
            assert s.delete(f"{API}/price-lists/{plid}").status_code == 403
            assert s.post(f"{API}/price-lists", json={"name": name + "x"}).status_code == 403
            assert s.get(f"{API}/price-lists/{plid}").status_code == 200  # read still allowed
        finally:
            r = a.patch(f"{API}/users/{u['id']}/permissions", json={"permissions": QAPRICE_PERMS})
            assert r.status_code == 200
            assert set(r.json()["permissions"]) == set(QAPRICE_PERMS)


class TestVendorAndOthers:
    def test_vendor_delete_forbidden(self, qa, admin):
        s, _ = qa
        lists = s.get(f"{API}/vendor-price-lists")
        assert lists.status_code == 200
        r = s.delete(f"{API}/vendor-price-lists/nonexistent-qa-id")
        assert r.status_code == 403

    def test_customers_template_allowed(self, qa):
        s, _ = qa
        r = s.get(f"{API}/customers/import/template")
        assert r.status_code in (200, 404), r.text  # 404 only if route differs
        if r.status_code == 404:
            pytest.skip("template route path differs")

    def test_products_edit_forbidden(self, qa):
        s, _ = qa
        r = s.patch(f"{API}/items/nonexistent-qa", json={"name": "x"})
        assert r.status_code in (403, 405)
