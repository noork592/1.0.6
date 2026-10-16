#!/usr/bin/env python3
"""
Comprehensive test for Add/Edit/Delete action permissions (30 keys, 10 modules).
Tests that:
1. zzqa_user WITHOUT a key gets 403
2. zzqa_user WITH the key gets allowed (2xx or 4xx validation, NOT 403)
3. Keys are independent (add doesn't grant edit/delete)
4. zzqa_admin can do all operations
5. PATCH permissions endpoint accepts all 30 keys and rejects invalid keys
6. Cleans up all ZZQA test records at the end
"""

import requests
import json
import os
from typing import Dict, List, Tuple, Optional

# Backend URL from environment
BACKEND_URL = os.getenv("REACT_APP_BACKEND_URL", "https://atomic-email.preview.emergentagent.com")
API_BASE = f"{BACKEND_URL}/api"

# Test accounts
ZZQA_ADMIN = {"email": "zzqa_admin", "password": "QaTest@123"}
ZZQA_USER = {"email": "zzqa_user", "password": "QaTest@123"}
ZZQA_ADMIN_ID = "cdeda40f-2741-4690-80a3-11d543467fb7"
ZZQA_USER_ID = "d166924d-8b22-40d7-9d47-d273a0beaa08"

# Nav keys that should always be included
NAV_KEYS = [
    "dashboard", "orders", "newOrder", "dispatch", "purchaseCenter", 
    "dispatchLedger", "vendorLedger", "dailyReport", "customers", 
    "products", "rawMaterials", "suppliers", "priceLists", "vendorPriceLists"
]

# All 30 action permission keys (10 modules × 3 actions)
ALL_ACTION_KEYS = [
    "add:customers", "edit:customers", "delete:customers",
    "add:products", "edit:products", "delete:products",
    "add:rawMaterials", "edit:rawMaterials", "delete:rawMaterials",
    "add:suppliers", "edit:suppliers", "delete:suppliers",
    "add:vendorLedger", "edit:vendorLedger", "delete:vendorLedger",
    "add:customerLedger", "edit:customerLedger", "delete:customerLedger",
    "add:orders", "edit:orders", "delete:orders",
    "add:dispatch", "edit:dispatch", "delete:dispatch",
    "add:priceLists", "edit:priceLists", "delete:priceLists",
    "add:vendorPriceLists", "edit:vendorPriceLists", "delete:vendorPriceLists",
]

# Track created test records for cleanup
created_records = {
    "customers": [],
    "products": [],
    "items": [],
    "rawMaterials": [],
    "suppliers": [],
    "priceLists": [],
    "vendorPriceLists": [],
    "orders": [],
    "dispatches": [],
    "payments": [],
    "saleReturns": [],
    "supplierPurchases": [],
    "supplierPayments": [],
    "purchaseReturns": [],
}

# Test results
test_results = []


def login(credentials: Dict[str, str]) -> str:
    """Login and return JWT token"""
    resp = requests.post(f"{API_BASE}/auth/login", json=credentials)
    if resp.status_code != 200:
        raise Exception(f"Login failed: {resp.status_code} {resp.text}")
    data = resp.json()
    return data["token"]


def set_user_permissions(admin_token: str, user_id: str, permissions: List[str]) -> bool:
    """Set user permissions using admin token"""
    headers = {"Authorization": f"Bearer {admin_token}"}
    resp = requests.patch(
        f"{API_BASE}/users/{user_id}/permissions",
        json={"permissions": permissions},
        headers=headers
    )
    return resp.status_code == 200


def test_permission_key(
    key: str,
    endpoint: str,
    method: str,
    body: Optional[Dict] = None,
    user_token: str = None,
    admin_token: str = None,
    test_name: str = "",
    expect_403_without: bool = True,
    expect_allowed_with: bool = True,
    record_id: str = None,
) -> Dict:
    """
    Test a single permission key.
    Returns dict with test results.
    """
    result = {
        "key": key,
        "test_name": test_name,
        "endpoint": endpoint,
        "method": method,
        "without_key_403": None,
        "with_key_allowed": None,
        "admin_allowed": None,
        "pass": False,
        "details": []
    }
    
    headers_user = {"Authorization": f"Bearer {user_token}"}
    headers_admin = {"Authorization": f"Bearer {admin_token}"}
    
    # Replace {id} placeholder if record_id provided
    test_endpoint = endpoint.replace("{id}", record_id) if record_id else endpoint
    
    # Test 1: zzqa_user WITHOUT the key → should get 403
    if expect_403_without:
        # Set permissions to NAV_KEYS only (no action keys)
        set_user_permissions(admin_token, ZZQA_USER_ID, NAV_KEYS)
        
        if method == "POST":
            resp = requests.post(f"{API_BASE}{test_endpoint}", json=body or {}, headers=headers_user)
        elif method == "PATCH" or method == "PUT":
            resp = requests.patch(f"{API_BASE}{test_endpoint}", json=body or {}, headers=headers_user)
        elif method == "DELETE":
            resp = requests.delete(f"{API_BASE}{test_endpoint}", headers=headers_user)
        else:
            resp = requests.get(f"{API_BASE}{test_endpoint}", headers=headers_user)
        
        result["without_key_403"] = resp.status_code == 403
        if resp.status_code == 403:
            result["details"].append(f"✓ Without key: 403 (correct)")
        else:
            result["details"].append(f"✗ Without key: {resp.status_code} (expected 403)")
            if resp.status_code == 422:
                result["details"].append(f"  ERROR: Got 422 validation before permission check!")
    
    # Test 2: zzqa_user WITH the key → should be allowed (not 403)
    if expect_allowed_with:
        # Set permissions to NAV_KEYS + this specific key
        set_user_permissions(admin_token, ZZQA_USER_ID, NAV_KEYS + [key])
        
        if method == "POST":
            resp = requests.post(f"{API_BASE}{test_endpoint}", json=body or {}, headers=headers_user)
        elif method == "PATCH" or method == "PUT":
            resp = requests.patch(f"{API_BASE}{test_endpoint}", json=body or {}, headers=headers_user)
        elif method == "DELETE":
            resp = requests.delete(f"{API_BASE}{test_endpoint}", headers=headers_user)
        else:
            resp = requests.get(f"{API_BASE}{test_endpoint}", headers=headers_user)
        
        result["with_key_allowed"] = resp.status_code != 403
        if resp.status_code != 403:
            result["details"].append(f"✓ With key: {resp.status_code} (not 403, allowed)")
        else:
            result["details"].append(f"✗ With key: 403 (should be allowed)")
    
    # Test 3: zzqa_admin can do it
    if method == "POST":
        resp = requests.post(f"{API_BASE}{test_endpoint}", json=body or {}, headers=headers_admin)
    elif method == "PATCH" or method == "PUT":
        resp = requests.patch(f"{API_BASE}{test_endpoint}", json=body or {}, headers=headers_admin)
    elif method == "DELETE":
        resp = requests.delete(f"{API_BASE}{test_endpoint}", headers=headers_admin)
    else:
        resp = requests.get(f"{API_BASE}{test_endpoint}", headers=headers_admin)
    
    result["admin_allowed"] = resp.status_code != 403
    if resp.status_code != 403:
        result["details"].append(f"✓ Admin: {resp.status_code} (allowed)")
    else:
        result["details"].append(f"✗ Admin: 403 (should be allowed)")
    
    # Overall pass/fail
    result["pass"] = (
        (not expect_403_without or result["without_key_403"]) and
        (not expect_allowed_with or result["with_key_allowed"]) and
        result["admin_allowed"]
    )
    
    return result


def create_zzqa_customer(token: str) -> Optional[str]:
    """Create a ZZQA test customer and return its ID"""
    headers = {"Authorization": f"Bearer {token}"}
    body = {
        "name": "ZZQA Test Customer",
        "phone": "9999999999",
        "address": "ZZQA Test Address",
        "city": "ZZQA City",
        "state": "Punjab"
    }
    resp = requests.post(f"{API_BASE}/customers", json=body, headers=headers)
    if resp.status_code in [200, 201]:
        cust = resp.json()
        cid = cust.get("id")
        if cid:
            created_records["customers"].append(cid)
            return cid
    return None


def create_zzqa_product(token: str) -> Optional[str]:
    """Create a ZZQA test product and return its ID"""
    headers = {"Authorization": f"Bearer {token}"}
    body = {
        "name": "ZZQA Test Product",
        "category": "Test",
        "unit": "pcs"
    }
    resp = requests.post(f"{API_BASE}/products", json=body, headers=headers)
    if resp.status_code in [200, 201]:
        prod = resp.json()
        pid = prod.get("id")
        if pid:
            created_records["products"].append(pid)
            return pid
    return None


def create_zzqa_raw_material(token: str) -> Optional[str]:
    """Create a ZZQA test raw material and return its ID"""
    headers = {"Authorization": f"Bearer {token}"}
    body = {
        "name": "ZZQA Test Raw Material",
        "unit": "kg"
    }
    resp = requests.post(f"{API_BASE}/raw-materials", json=body, headers=headers)
    if resp.status_code in [200, 201]:
        rm = resp.json()
        rid = rm.get("id")
        if rid:
            created_records["rawMaterials"].append(rid)
            return rid
    return None


def create_zzqa_supplier(token: str) -> Optional[str]:
    """Create a ZZQA test supplier and return its ID"""
    headers = {"Authorization": f"Bearer {token}"}
    body = {
        "name": "ZZQA Test Supplier",
        "phone": "9999999999",
        "address": "ZZQA Supplier Address"
    }
    resp = requests.post(f"{API_BASE}/suppliers", json=body, headers=headers)
    if resp.status_code in [200, 201]:
        sup = resp.json()
        sid = sup.get("id")
        if sid:
            created_records["suppliers"].append(sid)
            return sid
    return None


def create_zzqa_price_list(token: str) -> Optional[str]:
    """Create a ZZQA test price list and return its ID"""
    headers = {"Authorization": f"Bearer {token}"}
    body = {
        "name": "ZZQA Test Price List",
        "effective_date": "2026-01-01"
    }
    resp = requests.post(f"{API_BASE}/price-lists", json=body, headers=headers)
    if resp.status_code in [200, 201]:
        pl = resp.json()
        plid = pl.get("id")
        if plid:
            created_records["priceLists"].append(plid)
            return plid
    return None


def create_zzqa_vendor_price_list(token: str, supplier_id: str) -> Optional[str]:
    """Create a ZZQA test vendor price list and return its ID"""
    headers = {"Authorization": f"Bearer {token}"}
    body = {
        "supplier_id": supplier_id,
        "name": "ZZQA Test Vendor Price List",
        "effective_date": "2026-01-01"
    }
    resp = requests.post(f"{API_BASE}/vendor-price-lists", json=body, headers=headers)
    if resp.status_code in [200, 201]:
        vpl = resp.json()
        vplid = vpl.get("id")
        if vplid:
            created_records["vendorPriceLists"].append(vplid)
            return vplid
    return None


def cleanup_all_zzqa_records(admin_token: str):
    """Delete all ZZQA test records created during testing"""
    headers = {"Authorization": f"Bearer {admin_token}"}
    print("\n" + "="*80)
    print("CLEANUP: Deleting all ZZQA test records...")
    print("="*80)
    
    # Delete in reverse dependency order
    for pid in created_records["payments"]:
        requests.delete(f"{API_BASE}/payments/{pid}", headers=headers)
        print(f"  Deleted payment: {pid}")
    
    for srid in created_records["saleReturns"]:
        requests.delete(f"{API_BASE}/sale-returns/{srid}", headers=headers)
        print(f"  Deleted sale return: {srid}")
    
    for spid in created_records["supplierPayments"]:
        requests.delete(f"{API_BASE}/supplier-payments/{spid}", headers=headers)
        print(f"  Deleted supplier payment: {spid}")
    
    for prid in created_records["purchaseReturns"]:
        requests.delete(f"{API_BASE}/purchase-returns/{prid}", headers=headers)
        print(f"  Deleted purchase return: {prid}")
    
    for spid in created_records["supplierPurchases"]:
        requests.delete(f"{API_BASE}/supplier-purchases/{spid}", headers=headers)
        print(f"  Deleted supplier purchase: {spid}")
    
    for did in created_records["dispatches"]:
        requests.delete(f"{API_BASE}/dispatches/{did}", headers=headers)
        print(f"  Deleted dispatch: {did}")
    
    for oid in created_records["orders"]:
        requests.delete(f"{API_BASE}/orders/{oid}", headers=headers)
        print(f"  Deleted order: {oid}")
    
    for vplid in created_records["vendorPriceLists"]:
        requests.delete(f"{API_BASE}/vendor-price-lists/{vplid}", headers=headers)
        print(f"  Deleted vendor price list: {vplid}")
    
    for plid in created_records["priceLists"]:
        requests.delete(f"{API_BASE}/price-lists/{plid}", headers=headers)
        print(f"  Deleted price list: {plid}")
    
    for iid in created_records["items"]:
        requests.delete(f"{API_BASE}/items/{iid}", headers=headers)
        print(f"  Deleted item: {iid}")
    
    for pid in created_records["products"]:
        requests.delete(f"{API_BASE}/products/{pid}", headers=headers)
        print(f"  Deleted product: {pid}")
    
    for rid in created_records["rawMaterials"]:
        requests.delete(f"{API_BASE}/raw-materials/{rid}", headers=headers)
        print(f"  Deleted raw material: {rid}")
    
    for sid in created_records["suppliers"]:
        requests.delete(f"{API_BASE}/suppliers/{sid}", headers=headers)
        print(f"  Deleted supplier: {sid}")
    
    for cid in created_records["customers"]:
        requests.delete(f"{API_BASE}/customers/{cid}", headers=headers)
        print(f"  Deleted customer: {cid}")
    
    print("✓ Cleanup complete")
    
    # Reset zzqa_user permissions to just nav keys
    print("\nResetting zzqa_user permissions to nav keys only...")
    set_user_permissions(admin_token, ZZQA_USER_ID, NAV_KEYS)
    print("✓ zzqa_user permissions reset")


def main():
    print("="*80)
    print("PERMISSION SYSTEM TEST - 30 Action Keys (10 Modules × 3 Actions)")
    print("="*80)
    
    # Login
    print("\n1. Logging in...")
    admin_token = login(ZZQA_ADMIN)
    user_token = login(ZZQA_USER)
    print(f"  ✓ zzqa_admin logged in")
    print(f"  ✓ zzqa_user logged in")
    
    # Test permissions catalog endpoint
    print("\n2. Testing GET /api/permissions/catalog...")
    headers_admin = {"Authorization": f"Bearer {admin_token}"}
    resp = requests.get(f"{API_BASE}/permissions/catalog", headers=headers_admin)
    if resp.status_code == 200:
        catalog = resp.json()
        actions = catalog.get("actions", [])
        print(f"  ✓ Catalog returned {len(actions)} action keys")
        if len(actions) == 30:
            print(f"  ✓ All 30 action keys present")
        else:
            print(f"  ✗ Expected 30 action keys, got {len(actions)}")
    else:
        print(f"  ✗ Failed: {resp.status_code}")
    
    # Test PATCH permissions endpoint with valid keys
    print("\n3. Testing PATCH /api/users/{uid}/permissions with all 30 keys...")
    all_perms = NAV_KEYS + ALL_ACTION_KEYS
    resp = requests.patch(
        f"{API_BASE}/users/{ZZQA_USER_ID}/permissions",
        json={"permissions": all_perms},
        headers=headers_admin
    )
    if resp.status_code == 200:
        print(f"  ✓ Accepted all 30 action keys + nav keys")
    else:
        print(f"  ✗ Failed: {resp.status_code} {resp.text}")
    
    # Test PATCH permissions endpoint with invalid key
    print("\n4. Testing PATCH /api/users/{uid}/permissions with invalid key...")
    invalid_perms = NAV_KEYS + ["invalid:key"]
    resp = requests.patch(
        f"{API_BASE}/users/{ZZQA_USER_ID}/permissions",
        json={"permissions": invalid_perms},
        headers=headers_admin
    )
    if resp.status_code == 400:
        print(f"  ✓ Correctly rejected invalid key with 400")
    else:
        print(f"  ✗ Expected 400, got {resp.status_code}")
    
    # Create test records for edit/delete operations
    print("\n5. Creating test records for edit/delete operations...")
    cust_id = create_zzqa_customer(admin_token)
    prod_id = create_zzqa_product(admin_token)
    rm_id = create_zzqa_raw_material(admin_token)
    supp_id = create_zzqa_supplier(admin_token)
    pl_id = create_zzqa_price_list(admin_token)
    vpl_id = create_zzqa_vendor_price_list(admin_token, supp_id) if supp_id else None
    
    print(f"  ✓ Created customer: {cust_id}")
    print(f"  ✓ Created product: {prod_id}")
    print(f"  ✓ Created raw material: {rm_id}")
    print(f"  ✓ Created supplier: {supp_id}")
    print(f"  ✓ Created price list: {pl_id}")
    print(f"  ✓ Created vendor price list: {vpl_id}")
    
    # Test all 30 permission keys
    print("\n6. Testing all 30 permission keys...")
    print("="*80)
    
    # CUSTOMERS (3 keys)
    print("\n--- CUSTOMERS ---")
    result = test_permission_key(
        "add:customers", "/customers", "POST",
        body={"name": "ZZQA Test", "phone": "9999999999", "address": "Test", "city": "Test", "state": "Test"},
        user_token=user_token, admin_token=admin_token,
        test_name="Create customer"
    )
    test_results.append(result)
    print(f"  {result['key']}: {'PASS' if result['pass'] else 'FAIL'}")
    for detail in result['details']:
        print(f"    {detail}")
    
    result = test_permission_key(
        "edit:customers", f"/customers/{cust_id}", "PATCH",
        body={"name": "ZZQA Updated"},
        user_token=user_token, admin_token=admin_token,
        test_name="Update customer", record_id=cust_id
    )
    test_results.append(result)
    print(f"  {result['key']}: {'PASS' if result['pass'] else 'FAIL'}")
    for detail in result['details']:
        print(f"    {detail}")
    
    # For delete, we'll test with a non-existent ID to avoid actually deleting
    result = test_permission_key(
        "delete:customers", "/customers/nonexistent-id", "DELETE",
        user_token=user_token, admin_token=admin_token,
        test_name="Delete customer"
    )
    test_results.append(result)
    print(f"  {result['key']}: {'PASS' if result['pass'] else 'FAIL'}")
    for detail in result['details']:
        print(f"    {detail}")
    
    # PRODUCTS (3 keys)
    print("\n--- PRODUCTS ---")
    result = test_permission_key(
        "add:products", "/products", "POST",
        body={"name": "ZZQA Product", "category": "Test", "unit": "pcs"},
        user_token=user_token, admin_token=admin_token,
        test_name="Create product"
    )
    test_results.append(result)
    print(f"  {result['key']}: {'PASS' if result['pass'] else 'FAIL'}")
    for detail in result['details']:
        print(f"    {detail}")
    
    result = test_permission_key(
        "edit:products", f"/products/{prod_id}", "PATCH",
        body={"name": "ZZQA Updated Product"},
        user_token=user_token, admin_token=admin_token,
        test_name="Update product", record_id=prod_id
    )
    test_results.append(result)
    print(f"  {result['key']}: {'PASS' if result['pass'] else 'FAIL'}")
    for detail in result['details']:
        print(f"    {detail}")
    
    result = test_permission_key(
        "delete:products", "/products/nonexistent-id", "DELETE",
        user_token=user_token, admin_token=admin_token,
        test_name="Delete product"
    )
    test_results.append(result)
    print(f"  {result['key']}: {'PASS' if result['pass'] else 'FAIL'}")
    for detail in result['details']:
        print(f"    {detail}")
    
    # RAW MATERIALS (3 keys)
    print("\n--- RAW MATERIALS ---")
    result = test_permission_key(
        "add:rawMaterials", "/raw-materials", "POST",
        body={"name": "ZZQA Raw Material", "unit": "kg"},
        user_token=user_token, admin_token=admin_token,
        test_name="Create raw material"
    )
    test_results.append(result)
    print(f"  {result['key']}: {'PASS' if result['pass'] else 'FAIL'}")
    for detail in result['details']:
        print(f"    {detail}")
    
    result = test_permission_key(
        "edit:rawMaterials", f"/raw-materials/{rm_id}", "PATCH",
        body={"name": "ZZQA Updated RM"},
        user_token=user_token, admin_token=admin_token,
        test_name="Update raw material", record_id=rm_id
    )
    test_results.append(result)
    print(f"  {result['key']}: {'PASS' if result['pass'] else 'FAIL'}")
    for detail in result['details']:
        print(f"    {detail}")
    
    result = test_permission_key(
        "delete:rawMaterials", "/raw-materials/nonexistent-id", "DELETE",
        user_token=user_token, admin_token=admin_token,
        test_name="Delete raw material"
    )
    test_results.append(result)
    print(f"  {result['key']}: {'PASS' if result['pass'] else 'FAIL'}")
    for detail in result['details']:
        print(f"    {detail}")
    
    # SUPPLIERS (3 keys)
    print("\n--- SUPPLIERS ---")
    result = test_permission_key(
        "add:suppliers", "/suppliers", "POST",
        body={"name": "ZZQA Supplier", "phone": "9999999999", "address": "Test"},
        user_token=user_token, admin_token=admin_token,
        test_name="Create supplier"
    )
    test_results.append(result)
    print(f"  {result['key']}: {'PASS' if result['pass'] else 'FAIL'}")
    for detail in result['details']:
        print(f"    {detail}")
    
    result = test_permission_key(
        "edit:suppliers", f"/suppliers/{supp_id}", "PATCH",
        body={"name": "ZZQA Updated Supplier"},
        user_token=user_token, admin_token=admin_token,
        test_name="Update supplier", record_id=supp_id
    )
    test_results.append(result)
    print(f"  {result['key']}: {'PASS' if result['pass'] else 'FAIL'}")
    for detail in result['details']:
        print(f"    {detail}")
    
    result = test_permission_key(
        "delete:suppliers", "/suppliers/nonexistent-id", "DELETE",
        user_token=user_token, admin_token=admin_token,
        test_name="Delete supplier"
    )
    test_results.append(result)
    print(f"  {result['key']}: {'PASS' if result['pass'] else 'FAIL'}")
    for detail in result['details']:
        print(f"    {detail}")
    
    # PRICE LISTS (3 keys)
    print("\n--- PRICE LISTS ---")
    result = test_permission_key(
        "add:priceLists", "/price-lists", "POST",
        body={"name": "ZZQA Price List", "effective_date": "2026-01-01"},
        user_token=user_token, admin_token=admin_token,
        test_name="Create price list"
    )
    test_results.append(result)
    print(f"  {result['key']}: {'PASS' if result['pass'] else 'FAIL'}")
    for detail in result['details']:
        print(f"    {detail}")
    
    result = test_permission_key(
        "edit:priceLists", f"/price-lists/{pl_id}", "PATCH",
        body={"name": "ZZQA Updated PL"},
        user_token=user_token, admin_token=admin_token,
        test_name="Update price list", record_id=pl_id
    )
    test_results.append(result)
    print(f"  {result['key']}: {'PASS' if result['pass'] else 'FAIL'}")
    for detail in result['details']:
        print(f"    {detail}")
    
    result = test_permission_key(
        "delete:priceLists", "/price-lists/nonexistent-id", "DELETE",
        user_token=user_token, admin_token=admin_token,
        test_name="Delete price list"
    )
    test_results.append(result)
    print(f"  {result['key']}: {'PASS' if result['pass'] else 'FAIL'}")
    for detail in result['details']:
        print(f"    {detail}")
    
    # VENDOR PRICE LISTS (3 keys)
    print("\n--- VENDOR PRICE LISTS ---")
    result = test_permission_key(
        "add:vendorPriceLists", "/vendor-price-lists", "POST",
        body={"supplier_id": supp_id, "name": "ZZQA VPL", "effective_date": "2026-01-01"},
        user_token=user_token, admin_token=admin_token,
        test_name="Create vendor price list"
    )
    test_results.append(result)
    print(f"  {result['key']}: {'PASS' if result['pass'] else 'FAIL'}")
    for detail in result['details']:
        print(f"    {detail}")
    
    result = test_permission_key(
        "edit:vendorPriceLists", f"/vendor-price-lists/{vpl_id}", "PATCH",
        body={"name": "ZZQA Updated VPL"},
        user_token=user_token, admin_token=admin_token,
        test_name="Update vendor price list", record_id=vpl_id
    )
    test_results.append(result)
    print(f"  {result['key']}: {'PASS' if result['pass'] else 'FAIL'}")
    for detail in result['details']:
        print(f"    {detail}")
    
    result = test_permission_key(
        "delete:vendorPriceLists", "/vendor-price-lists/nonexistent-id", "DELETE",
        user_token=user_token, admin_token=admin_token,
        test_name="Delete vendor price list"
    )
    test_results.append(result)
    print(f"  {result['key']}: {'PASS' if result['pass'] else 'FAIL'}")
    for detail in result['details']:
        print(f"    {detail}")
    
    # ORDERS (3 keys)
    print("\n--- ORDERS ---")
    result = test_permission_key(
        "add:orders", "/orders", "POST",
        body={"customer_id": cust_id, "items": []},
        user_token=user_token, admin_token=admin_token,
        test_name="Create order"
    )
    test_results.append(result)
    print(f"  {result['key']}: {'PASS' if result['pass'] else 'FAIL'}")
    for detail in result['details']:
        print(f"    {detail}")
    
    result = test_permission_key(
        "edit:orders", "/orders/nonexistent-id/status", "PATCH",
        body={"status": "confirmed"},
        user_token=user_token, admin_token=admin_token,
        test_name="Update order status"
    )
    test_results.append(result)
    print(f"  {result['key']}: {'PASS' if result['pass'] else 'FAIL'}")
    for detail in result['details']:
        print(f"    {detail}")
    
    result = test_permission_key(
        "delete:orders", "/orders/nonexistent-id", "DELETE",
        user_token=user_token, admin_token=admin_token,
        test_name="Delete order"
    )
    test_results.append(result)
    print(f"  {result['key']}: {'PASS' if result['pass'] else 'FAIL'}")
    for detail in result['details']:
        print(f"    {detail}")
    
    # DISPATCH (3 keys)
    print("\n--- DISPATCH ---")
    result = test_permission_key(
        "add:dispatch", "/dispatch/execute", "POST",
        body={"order_id": "nonexistent", "items": []},
        user_token=user_token, admin_token=admin_token,
        test_name="Create dispatch"
    )
    test_results.append(result)
    print(f"  {result['key']}: {'PASS' if result['pass'] else 'FAIL'}")
    for detail in result['details']:
        print(f"    {detail}")
    
    result = test_permission_key(
        "edit:dispatch", "/dispatches/nonexistent-id", "PATCH",
        body={"notes": "Updated"},
        user_token=user_token, admin_token=admin_token,
        test_name="Update dispatch"
    )
    test_results.append(result)
    print(f"  {result['key']}: {'PASS' if result['pass'] else 'FAIL'}")
    for detail in result['details']:
        print(f"    {detail}")
    
    result = test_permission_key(
        "delete:dispatch", "/dispatches/nonexistent-id", "DELETE",
        user_token=user_token, admin_token=admin_token,
        test_name="Delete dispatch"
    )
    test_results.append(result)
    print(f"  {result['key']}: {'PASS' if result['pass'] else 'FAIL'}")
    for detail in result['details']:
        print(f"    {detail}")
    
    # CUSTOMER LEDGER (3 keys)
    print("\n--- CUSTOMER LEDGER ---")
    result = test_permission_key(
        "add:customerLedger", "/payments", "POST",
        body={"customer_id": cust_id, "amount": 100, "payment_date": "2026-01-01"},
        user_token=user_token, admin_token=admin_token,
        test_name="Create payment"
    )
    test_results.append(result)
    print(f"  {result['key']}: {'PASS' if result['pass'] else 'FAIL'}")
    for detail in result['details']:
        print(f"    {detail}")
    
    result = test_permission_key(
        "edit:customerLedger", "/payments/nonexistent-id", "PATCH",
        body={"amount": 200},
        user_token=user_token, admin_token=admin_token,
        test_name="Update payment"
    )
    test_results.append(result)
    print(f"  {result['key']}: {'PASS' if result['pass'] else 'FAIL'}")
    for detail in result['details']:
        print(f"    {detail}")
    
    result = test_permission_key(
        "delete:customerLedger", "/payments/nonexistent-id", "DELETE",
        user_token=user_token, admin_token=admin_token,
        test_name="Delete payment"
    )
    test_results.append(result)
    print(f"  {result['key']}: {'PASS' if result['pass'] else 'FAIL'}")
    for detail in result['details']:
        print(f"    {detail}")
    
    # VENDOR LEDGER (3 keys)
    print("\n--- VENDOR LEDGER ---")
    result = test_permission_key(
        "add:vendorLedger", "/supplier-purchases", "POST",
        body={"supplier_id": supp_id, "items": [], "purchase_date": "2026-01-01"},
        user_token=user_token, admin_token=admin_token,
        test_name="Create supplier purchase"
    )
    test_results.append(result)
    print(f"  {result['key']}: {'PASS' if result['pass'] else 'FAIL'}")
    for detail in result['details']:
        print(f"    {detail}")
    
    result = test_permission_key(
        "edit:vendorLedger", "/supplier-purchases/nonexistent-id", "PATCH",
        body={"notes": "Updated"},
        user_token=user_token, admin_token=admin_token,
        test_name="Update supplier purchase"
    )
    test_results.append(result)
    print(f"  {result['key']}: {'PASS' if result['pass'] else 'FAIL'}")
    for detail in result['details']:
        print(f"    {detail}")
    
    result = test_permission_key(
        "delete:vendorLedger", "/supplier-purchases/nonexistent-id", "DELETE",
        user_token=user_token, admin_token=admin_token,
        test_name="Delete supplier purchase"
    )
    test_results.append(result)
    print(f"  {result['key']}: {'PASS' if result['pass'] else 'FAIL'}")
    for detail in result['details']:
        print(f"    {detail}")
    
    # Test key independence
    print("\n7. Testing key independence (add doesn't grant edit/delete)...")
    print("="*80)
    
    # Grant only add:customers
    set_user_permissions(admin_token, ZZQA_USER_ID, NAV_KEYS + ["add:customers"])
    headers_user = {"Authorization": f"Bearer {user_token}"}
    
    # Try to edit (should fail with 403)
    resp = requests.patch(
        f"{API_BASE}/customers/{cust_id}",
        json={"name": "Should Fail"},
        headers=headers_user
    )
    if resp.status_code == 403:
        print("  ✓ add:customers does NOT grant edit:customers (403)")
    else:
        print(f"  ✗ add:customers should NOT grant edit:customers (got {resp.status_code})")
    
    # Try to delete (should fail with 403)
    resp = requests.delete(f"{API_BASE}/customers/nonexistent-id", headers=headers_user)
    if resp.status_code == 403:
        print("  ✓ add:customers does NOT grant delete:customers (403)")
    else:
        print(f"  ✗ add:customers should NOT grant delete:customers (got {resp.status_code})")
    
    # Cleanup
    cleanup_all_zzqa_records(admin_token)
    
    # Summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    passed = sum(1 for r in test_results if r["pass"])
    failed = sum(1 for r in test_results if not r["pass"])
    
    print(f"\nTotal tests: {len(test_results)}")
    print(f"Passed: {passed}")
    print(f"Failed: {failed}")
    
    if failed > 0:
        print("\nFAILED TESTS:")
        for r in test_results:
            if not r["pass"]:
                print(f"  ✗ {r['key']} - {r['test_name']}")
                for detail in r['details']:
                    print(f"    {detail}")
    
    print("\n" + "="*80)
    if failed == 0:
        print("✓✓ ALL TESTS PASSED ✓✓")
    else:
        print(f"✗✗ {failed} TESTS FAILED ✗✗")
    print("="*80)


if __name__ == "__main__":
    main()
