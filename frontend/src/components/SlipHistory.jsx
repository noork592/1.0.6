import React from "react";
import { useTranslation } from "react-i18next";
import { Truck } from "lucide-react";

const fmt = (d) => (d ? new Date(d).toLocaleDateString() : "");
const pcsOf = (g) => g.pcs ?? (g.items || []).reduce((s, it) => s + (Number(it.quantity) || 0), 0);

export default function SlipHistory({ order, showSlips = true, onOpenSlip }) {
  const { t } = useTranslation();
  const slips = order.dispatch_summary || [];
  const done = order.completed_pcs ?? slips.reduce((s, g) => s + pcsOf(g), 0);
  const pending = order.pending_pcs ?? 0;
  const total = done + pending;
  if (!total) return null;
  const pct = Math.round((done / total) * 100);
  return (
    <div className="mt-2 space-y-1.5" data-testid={`slip-history-${order.id}`}>
      <div className="flex items-center gap-2 max-w-md">
        <div className="flex-1 h-1.5 rounded-full bg-slate-200 overflow-hidden">
          <div className="h-full bg-emerald-500 transition-[width] duration-500" style={{ width: `${pct}%` }} />
        </div>
        <span className="text-[11px] font-semibold text-slate-600 whitespace-nowrap" data-testid={`slip-progress-${order.id}`}>
          {t("orders.progress", { done, total, pending })}
        </span>
      </div>
      {showSlips && slips.map((g, i) => (
        <div key={`${g.slip_no}-${i}`} className="text-[11px] text-slate-600 flex flex-wrap items-center gap-1"
             data-testid={`slip-history-row-${order.id}-${i}`}>
          <Truck className="w-3 h-3 text-indigo-500" />
          <button type="button" onClick={() => onOpenSlip?.(g.slip_no)} disabled={!onOpenSlip || g.slip_no == null}
                  data-testid={`slip-history-link-${order.id}-${i}`}
                  className="font-bold text-indigo-700 underline underline-offset-2 decoration-dotted hover:text-[#E65100] transition-colors">
            {t("orders.slip", "Slip")} #{g.slip_no}
          </button>
          <span className="text-slate-400">· {fmt(g.date)} ·</span>
          <span>{t("orders.slipCompleted", { pcs: pcsOf(g) })}</span>
          <span className="text-slate-400">
            ({(g.items || []).map((it) => `${it.item_name || it.product_name}: ${it.quantity}`).join(", ")})
          </span>
        </div>
      ))}
    </div>
  );
}
