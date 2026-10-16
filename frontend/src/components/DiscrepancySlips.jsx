import React from "react";
import { useTranslation } from "react-i18next";
import { Truck } from "lucide-react";

const fmt = (d) => (d ? new Date(d).toLocaleDateString() : "");

export default function DiscrepancySlips({ disc, orderId, onOpenSlip }) {
  const { t } = useTranslation();
  const slips = disc.slips || [];
  return (
    <div className="mt-1.5 space-y-1.5" data-testid={`disc-slips-${orderId}`}>
      {slips.length > 1 && (
        <div className="text-[10px] uppercase tracking-wider font-bold text-amber-800">
          {t("orders.discSlipsCount", { n: slips.length })}
        </div>
      )}
      {slips.map((sl) => {
        const usable = sl.usable || [];
        const usablePcs = usable.reduce((a, it) => a + (Number(it.quantity) || 0), 0);
        return (
          <div key={sl.dispatch_id} className="rounded-sm bg-white/70 border border-amber-200 px-2 py-1.5"
               data-testid={`disc-slip-${orderId}-${sl.slip_no}`}>
            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
              <Truck className="w-3 h-3 text-indigo-500" />
              <button type="button" onClick={() => onOpenSlip?.(sl.slip_no)}
                      className="font-bold text-indigo-700 underline underline-offset-2 decoration-dotted hover:text-[#E65100]">
                {t("orders.slip", "Slip")} #{sl.slip_no}
              </button>
              <span className="text-slate-500">· {fmt(sl.dispatched_at)}</span>
              <span className={`ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-sm border ${usablePcs ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-100 text-slate-500 border-slate-200"}`}>
                {usablePcs ? t("orders.discUsable", { n: usablePcs }) : t("orders.discUsed")}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap gap-1">
              {sl.items.map((it, i) => {
                const u = usable.find((x) => x.item_name === it.item_name);
                return (
                  <span key={i} className={`text-[11px] px-1.5 py-0.5 rounded-sm border ${u ? "bg-emerald-50 border-emerald-200 text-emerald-900" : "bg-slate-50 border-slate-200 text-slate-500 line-through decoration-slate-300"}`}>
                    {it.item_name}: <b className="font-mono-num">{u ? u.quantity : it.quantity}</b>
                    {u && u.quantity !== it.quantity && <span className="text-slate-400"> / {it.quantity}</span>}
                  </span>
                );
              })}
            </div>
          </div>
        );
      })}
      <div className={`text-[11px] font-semibold ${disc.usable_pcs ? "text-emerald-800" : "text-slate-500"}`}
           data-testid={`disc-usable-total-${orderId}`}>
        {disc.usable_pcs
          ? t("orders.discUsableTotal", { n: disc.usable_pcs, after: disc.pending_after })
          : t("orders.discNoneUsable")}
      </div>
    </div>
  );
}
