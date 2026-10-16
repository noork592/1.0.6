# Smoke tests for cloned JK Products ERP: health, auth, core list APIs
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")


def _login(ident, pw):
    return requests.post(f"{BASE_URL}/api/auth/login", json={"email": ident, "password": pw}, timeout=30)


@pytest.fixture(scope="module")
def admin_headers():
    r = _login("admin", "admin123")
    if r.status_code != 200 or "token" not in r.json():
        pytest.skip(f"admin login failed {r.status_code} {r.text[:200]}")
    return {"Authorization": f"Bearer {r.json()['token']}"}


# Health
@pytest.mark.parametrize("path", ["/health", "/api/health", "/api/pwa/health"])
def test_health(path):
    r = requests.get(f"{BASE_URL}{path}", timeout=30)
    assert r.status_code == 200, r.text[:200]


# Auth
@pytest.mark.parametrize("ident,pw", [
    ("admin", "admin123"), ("admin@factory.com", "admin123"),
    ("user@factory.com", "user123"), ("user", "user123"),
    ("jk1@factory.com", "jk1123"),
])
def test_login_ok(ident, pw):
    r = _login(ident, pw)
    assert r.status_code == 200, r.text[:200]
    d = r.json()
    assert isinstance(d.get("token"), str) and d["token"]
    assert "user" in d and "password" not in d["user"]


def test_login_bad():
    r = _login("admin", "wrong")
    assert r.status_code == 401


def test_me(admin_headers):
    r = requests.get(f"{BASE_URL}/api/auth/me", headers=admin_headers, timeout=30)
    assert r.status_code == 200
    assert r.json().get("role") == "admin"


def test_unauth_orders():
    r = requests.get(f"{BASE_URL}/api/orders", timeout=30)
    assert r.status_code in (401, 403)


# Core lists
@pytest.mark.parametrize("path", [
    "/api/orders", "/api/customers", "/api/items", "/api/products", "/api/users",
    "/api/settings", "/api/dashboard/summary", "/api/dispatches", "/api/admin/dispatch-ledger",
    "/api/estimates", "/api/price-lists", "/api/reports/daily-dispatch",
    "/api/notifications/unread-count", "/api/permissions/catalog",
])
def test_lists(admin_headers, path):
    r = requests.get(f"{BASE_URL}{path}", headers=admin_headers, timeout=60)
    assert r.status_code == 200, f"{path}: {r.status_code} {r.text[:300]}"
    assert "_id" not in r.text[:5000] or '"_id"' not in r.text
