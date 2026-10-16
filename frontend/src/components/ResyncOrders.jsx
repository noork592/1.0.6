import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { RefreshCw, CheckCircle2, Truck, Loader2, X } from "lucide-react";

const fmt = (d) => (d ? new Date(d).toLocaleDateString() : "");

function Stat({ label, value, testid, tone = "slate" }) {
  const cls = { slate: "text-slate-900", orange: "text-[#E65100]", green: "text-emerald-700" }[tone];
  return (
    <div className="border border-slate-200 rounded-sm p-3 bg-slate-50/60" data-testid={testid}>
      <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500">{label}</div>
      <div className={`font-mono-num text-xl font-extrabold ${cls}`}>{value}</div>
    </div>
  );
}

function ChangeRow({ c, t, selectable, checked, onToggle }) {
  const done = c.new_status === "Dispatched";
  return (
    <label className={`flex gap-3 py-3 border-b border-slate-100 last:border-0 ${selectable ? "cursor-pointer" : ""}`} data-testid={`resync-row-${c.order_id}`}>
      {selectable && (
        <input type="checkbox" checked={checked} onChange={onToggle}
               className="mt-1 w-4 h-4 accent-emerald-600 shrink-0" data-testid={`resync-check-${c.order_id}`} />
      )}
      <div className="min-w-0">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-bold text-sm text-slate-900">{c.customer_name}</span>
        <span className="text-xs text-slate-500 font-mono-num">#{c.order_id.slice(0, 8)} · {fmt(c.order_date)}</span>
        <span className={`text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded-sm border ${done ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-amber-50 text-amber-800 border-amber-200"}`}>
          {done ? t("resync.willClear") : t("resync.willReduce", { from: c.pending_before, to: c.pending_after })}
        </span>
      </div>
      <div className="mt-1.5 space-y-1">
        {c.slip_lines.map((s) => (
          <div key={s.slip_no} className="text-xs text-slate-700 flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1 font-bold text-indigo-700">
              <Truck className="w-3 h-3" /> {t("orders.slip", "Slip")} #{s.slip_no} · {fmt(s.date)}
            </span>
            {s.items.map((it, i) => (
              <span key={i} className="px-1.5 py-0.5 rounded-sm bg-indigo-50 border border-indigo-200 text-indigo-900">
                {it.item_name}: <b className="font-mono-num">{it.quantity}</b>
              </span>
            ))}
          </div>
        ))}
      </div>
      </div>
    </label>
  );
}

export default function ResyncOrders({ onApplied, className = "max-w-2xl" }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState(null);
  const [sel, setSel] = useState(new Set());

  const run = async (dryRun) => {
    if (!dryRun && (!sel.size || !window.confirm(t("resync.confirmApply", { n: sel.size })))) return;
    setBusy(true);
    try {
      const { data } = await api.post("/orders/reconcile", dryRun ? null : { order_ids: [...sel] }, { params: { dry_run: dryRun } });
      setRes(data);
      if (dryRun) setSel(new Set(data.changes.map((c) => c.order_id)));
      if (!dryRun) {
        toast.success(t("resync.applied", { n: data.count }));
        onApplied?.();
      }
    } catch (e) {
      toast.error(e?.response?.data?.detail || t("common.failed"));
    } finally {
      setBusy(false);
    }
  };

  const toggle = (id) => setSel((prev) => {
    const n = new Set(prev);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });
  const allOn = res && sel.size === res.changes.length;

  return (
    <div className={`bg-white border border-slate-200 rounded-sm ${className}`} data-testid="resync-card">
      <div className="p-5 border-b border-slate-200 flex items-center gap-3">
        <div className="w-10 h-10 rounded-sm bg-orange-50 border border-orange-200 grid place-items-center text-[#E65100]">
          <RefreshCw className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <div className="font-bold text-slate-900">{t("resync.title")}</div>
          <div className="text-xs text-slate-500">{t("resync.desc")}</div>
        </div>
      </div>
      <div className="p-5 space-y-4">
        <Button onClick={() => run(true)} disabled={busy} data-testid="resync-check-btn"
                className="bg-[#E65100] hover:bg-[#CC4800] text-white rounded-sm h-10 px-4 font-bold">
          {busy ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1.5" />}
          {t("resync.checkBtn")}
        </Button>

        {res && (
          <div className="space-y-3" data-testid="resync-result">
            <div className="grid grid-cols-3 gap-2">
              <Stat label={t("resync.statPending")} value={res.pending_orders} testid="resync-stat-pending" />
              <Stat label={res.dry_run ? t("resync.statToFix") : t("resync.statFixed")} value={res.count} tone="orange" testid="resync-stat-count" />
              <Stat label={t("resync.statPcs")} value={res.total_pcs} tone="green" testid="resync-stat-pcs" />
            </div>
            {res.count === 0 ? (
              <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700" data-testid="resync-all-good">
                <CheckCircle2 className="w-4 h-4" /> {t("resync.allGood")}
              </div>
            ) : (
              <>
                {res.dry_run && (
                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer">
                    <input type="checkbox" checked={allOn} className="w-4 h-4 accent-emerald-600"
                           onChange={() => setSel(allOn ? new Set() : new Set(res.changes.map((c) => c.order_id)))}
                           data-testid="resync-select-all" />
                    {t("discResync.selectAll", { n: sel.size, total: res.changes.length })}
                  </label>
                )}
                <div className="max-h-96 overflow-y-auto border border-slate-200 rounded-sm px-3" data-testid="resync-list">
                  {res.changes.map((c) => (
                    <ChangeRow key={c.order_id} c={c} t={t} selectable={res.dry_run}
                               checked={sel.has(c.order_id)} onToggle={() => toggle(c.order_id)} />
                  ))}
                </div>
                {res.dry_run && (
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setRes(null)} disabled={busy} data-testid="resync-cancel-btn"
                            className="rounded-sm h-10 px-4 font-bold">
                      <X className="w-4 h-4 mr-1.5" /> {t("common.cancel", "Cancel")}
                    </Button>
                    <Button onClick={() => run(false)} disabled={busy || !sel.size} data-testid="resync-apply-btn"
                            className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-sm h-10 px-4 font-bold">
                      <CheckCircle2 className="w-4 h-4 mr-1.5" /> {t("resync.applyBtn", { n: sel.size })}
                    </Button>
                  </div>
                )}
              </>
            )}
            <div className="text-[11px] text-slate-400">{t("resync.checkedAt", { at: new Date(res.checked_at).toLocaleString() })}</div>
          </div>
        )}
      </div>
    </div>
  );
}
