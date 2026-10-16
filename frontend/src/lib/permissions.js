// Centralised permission catalog. Must stay in sync with backend
// ALL_PERMISSION_KEYS and DEFAULT_USER_PERMISSIONS.

// Every nav key that can be granted / revoked.
export const ALL_PERMISSION_KEYS = [
  "dashboard", "orders", "newOrder", "dispatch", "purchaseCenter", "dispatchLedger", "vendorLedger", "dailyReport",
  "estimates",
  "customers", "products", "rawMaterials", "suppliers",
  "priceLists", "vendorPriceLists",
  "adminUsers", "adminSettings", "loginAudit",
];

// Default allowlist for non-admin users when `permissions` is unset (null).
export const DEFAULT_USER_PERMISSIONS = [
  "dashboard", "orders", "dispatch", "dispatchLedger", "dailyReport",
  "estimates",
  "customers", "products",
  "add:orders", "add:dispatch", "add:customerLedger",
];

// Friendly labels for the Manage-access dialog.
export const PERMISSION_LABELS = {  dashboard: "Dashboard",
  orders: "Orders",
  newOrder: "Add New Order",
  dispatch: "Dispatch Center",
  dispatchLedger: "Customer Ledger",
  vendorLedger: "Vendor Ledger",
  dailyReport: "Dispatch Report",
  estimates: "Estimates",
  purchaseCenter: "Purchase Center",
  customers: "Customers (Party Directory)",
  products: "Products",
  rawMaterials: "Raw Materials",
  suppliers: "Vendors (master)",
  priceLists: "Customer Price Lists",
  vendorPriceLists: "Vendor Price Lists",
  adminUsers: "Users (admin)",
  adminSettings: "Workflow Rules (admin)",
  loginAudit: "Login Audit (admin)",
};

// ---- Fine-grained edit / delete action permissions ----
// SEPARATE toggles for add / edit / delete, one triple per module. Stored in the same
// `permissions` array as nav keys; the distinct `edit:` / `delete:` prefixes
// keep them from clashing. Must stay in sync with backend ACTION_PERMISSION_KEYS.
export const ACTION_PERMISSION_KEYS = [
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
];

export const ACTION_PERMISSION_LABELS = {
  "add:customers": "Add customer list",
  "edit:customers": "Edit customer list",
  "delete:customers": "Delete customer list",
  "add:products": "Add products list",
  "edit:products": "Edit products list",
  "delete:products": "Delete products list",
  "add:rawMaterials": "Add raw material",
  "edit:rawMaterials": "Edit raw material",
  "delete:rawMaterials": "Delete raw material",
  "add:suppliers": "Add vendor list",
  "edit:suppliers": "Edit vendor list",
  "delete:suppliers": "Delete vendor list",
  "add:vendorLedger": "Add vendor ledger",
  "edit:vendorLedger": "Edit vendor ledger",
  "delete:vendorLedger": "Delete vendor ledger",
  "add:customerLedger": "Add customer ledger",
  "edit:customerLedger": "Edit customer ledger",
  "delete:customerLedger": "Delete customer ledger",
  "add:orders": "Add orders",
  "edit:orders": "Edit all orders",
  "delete:orders": "Delete all orders",
  "add:dispatch": "Add dispatch report",
  "edit:dispatch": "Edit dispatch report",
  "delete:dispatch": "Delete dispatch report",
  "add:priceLists": "Add customer price list",
  "edit:priceLists": "Edit customer price list",
  "delete:priceLists": "Delete customer price list",
  "add:vendorPriceLists": "Add vendor price list",
  "edit:vendorPriceLists": "Edit vendor price list",
  "delete:vendorPriceLists": "Delete vendor price list",
};

// Resolve a user's effective set of allowed keys.
// - admin role  → null  (means "all"; callers should treat as a wildcard)
// - permissions field is an array → that exact set
// - otherwise → DEFAULT_USER_PERMISSIONS
export function effectivePermissions(user) {
  if (!user) return [];
  if (user.role === "admin") return null;
  if (Array.isArray(user.permissions)) return user.permissions;
  return DEFAULT_USER_PERMISSIONS;
}

// Demo accounts that must be blocked from specific admin areas even though
// they carry the admin role. JK1 is a read-only demo login and must NOT be
// able to open the Users management page (where all users are listed).
export const DEMO_USERNAMES = ["JK1"];
export const DEMO_DENIED_KEYS = ["adminUsers"];

export function isDemoDenied(user, key) {
  if (!user) return false;
  const uname = String(user.username || "").trim().toUpperCase();
  return (
    DEMO_USERNAMES.map((u) => u.toUpperCase()).includes(uname) &&
    DEMO_DENIED_KEYS.includes(key)
  );
}

// True if the user can access the given nav key.
export function hasPermission(user, key) {
  if (!user) return false;
  // Hard denials (demo accounts) override the admin wildcard.
  if (isDemoDenied(user, key)) return false;
  if (user.role === "admin") return true;
  const perms = effectivePermissions(user);
  return Array.isArray(perms) && perms.includes(key);
}
