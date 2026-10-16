import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { History, Plus, Pencil, Trash2, Truck, Undo2, CheckCircle2, AlertTriangle, RotateCcw, Link2 } from "lucide-react";

const ICONS = {
  created: Plus, items_added: Plus, edited: Pencil, deleted: Trash2, status_changed: CheckCircle2,
  slip_linked: Truck, slip_auto_linked: Link2, slip_edited: RotateCcw, slip_deleted: RotateCcw,
  slip_reassigned: RotateCcw, slip_qty_restored: RotateCcw, discrepancy_undo: Undo2,
};
const TONE = {
  slip_linked: "text-indigo-600 bg-indigo-50 border-indigo-200",
  slip_auto_linked: "text-indigo-600 bg-indigo-50 border-indigo-200",
  deleted: "text-red-600 bg-red-50 border-red-200",
  discrepancy_undo: "text-[#E65100] bg-orange-50 border-orange-200",
};

function Entry({ a, t, onOpenSlip }) {
  const Icon = ICONS[a.action] || (a.action.startsWith("discrepancy_") ? AlertTriangle : Pencil);
  const tone = TONE[a.action] || (a.action.startsWith("discrepancy_") ? "text-amber-700 bg-amber-50 border-amber-200" : "text-slate-600 bg-slate-50 border-slate-200");
  return (
    <li className="relative pl-10 pb-4 last:pb-0" data-testid={`activity-entry-${a.id}`}>
      <span className={`absolute left-0 top-0 w-7 h-7 rounded-full border grid place-items-center ${tone}`}>
        <Icon className="w-3.5 h-3.5" />
      </span>
      <div className="text-sm font-bold text-slate-900 flex flex-wrap items-center gap-1.5">
        {t(`activity.${a.action}`, a.action)}
        {a.slip_no != null && (
          <button type="button" onClick={() => onOpenSlip?.(a.slip_no)}
                  className="text-indigo-700 underline underline-offset-2 decoration-dotted hover:text-[#E65100]"
                  data-testid={`activity-slip-${a.id}`}>
            {t("orders.slip", "Slip")} #{a.slip_no}
          </button>
        )}
        {a.note && a.note !== "backfill" && <span className="text-xs font-semibold text-slate-500">· {a.action === "discrepancy_undo" ? t(`orders.discActName.${a.note}`, a.note) : a.note}</span>}
      </div>
      <div className="text-[11px] text-slate-500">
        {new Date(a.at).toLocaleString()} · {a.by}
      </div>
      {a.items?.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {a.items.map((it, i) => (
            <span key={i} className="text-[11px] px-1.5 py-0.5 rounded-sm border border-slate-200 bg-white text-slate-700">
              {it.item_name}: <b className="font-mono-num">{it.quantity}</b>
            </span>
          ))}
        </div>
      )}
    </li>
  );
}

export default function OrderActivityDialog({ order, onClose, onOpenSlip }) {
  const { t } = useTranslation();
  const [rows, setRows] = useState(null);

  useEffect(() => {
    if (!order) return;
    setRows(null);
    api.get(`/orders/${order.id}/activity`).then((r) => setRows(r.data || [])).catch(() => setRows([]));
  }, [order]);

  return (
    <Dialog open={!!order} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="rounded-sm max-w-lg max-h-[85vh] overflow-y-auto" data-testid="order-activity-dialog">
        <DialogHeader>
          <DialogTitle className="font-heading flex items-center gap-2">
            <History className="w-5 h-5 text-[#E65100]" /> {t("activity.title")}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {order?.customer_name} · #{order?.id?.slice(0, 8)}
          </DialogDescription>
        </DialogHeader>
        {rows === null ? (
          <div className="py-8 text-center text-slate-400 text-sm">{t("common.loading")}</div>
        ) : rows.length === 0 ? (
          <div className="py-8 text-center text-slate-400 text-sm" data-testid="activity-empty">{t("activity.empty")}</div>
        ) : (
          <ol className="relative mt-2 before:absolute before:left-3.5 before:top-2 before:bottom-2 before:w-px before:bg-slate-200">
            {rows.map((a) => <Entry key={a.id} a={a} t={t} onOpenSlip={onOpenSlip} />)}
          </ol>
        )}
      </DialogContent>
    </Dialog>
  );
}
