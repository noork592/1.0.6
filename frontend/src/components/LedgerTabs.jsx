import React from "react";
import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ScrollText, Building2 } from "lucide-react";
import { useAuth } from "@/lib/auth";

// Combined "Ledger" section: one sidebar entry, with Customer / Vendor tabs
// on top of the existing ledger pages (routes are unchanged so deep links
// like /dispatch-ledger?customer_id=… and /admin/suppliers/:id keep working).
export default function LedgerTabs({ children }) {
  const { can } = useAuth();
  const { t } = useTranslation();
  const tabs = [
    { to: "/dispatch-ledger", key: "dispatchLedger", icon: ScrollText, testid: "ledger-tab-customer" },
    { to: "/admin/suppliers", key: "vendorLedger", icon: Building2, testid: "ledger-tab-vendor" },
  ].filter((tab) => can(tab.key));

  return (
    <div className="space-y-5">
      {tabs.length > 1 && (
        <div className="inline-flex p-1 bg-slate-100 border border-slate-200 rounded-sm gap-1" data-testid="ledger-tabs">
          {tabs.map(({ to, key, icon: Icon, testid }) => (
            <NavLink
              key={to}
              to={to}
              data-testid={testid}
              className={({ isActive }) =>
                `inline-flex items-center gap-2 px-4 h-9 rounded-sm text-sm font-bold transition-colors ${
                  isActive ? "bg-[#E65100] text-white shadow-sm" : "text-slate-600 hover:bg-white hover:text-slate-900"
                }`
              }
            >
              <Icon className="w-4 h-4" />
              {t(`nav.${key}`)}
            </NavLink>
          ))}
        </div>
      )}
      {children}
    </div>
  );
}
