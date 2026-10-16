import React from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { X, Printer, FileText } from "lucide-react";
import ShareDocumentButtons from "@/components/ShareDocumentButtons";

const fmtINR = (v) => Number(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });

function fmtDateOnly(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    return `${dd}/${mm}/${d.getFullYear()}`;
  } catch { return iso; }
}

// Printable dispatch slip preview. slipRow = { id, when, raw: dispatch }, party = customer.
export default function SlipPreviewDialog({ slipRow, party, onClose }) {
  return (
        <Dialog open={!!slipRow} onOpenChange={(o) => { if (!o) onClose(); }}>
          <DialogContent
            className="rounded-sm max-w-2xl max-h-[90vh] overflow-y-auto p-0"
            data-testid="slip-preview-dialog"
          >
            <DialogHeader className="px-5 pt-5 pb-3 border-b border-slate-200 no-print">
              <DialogTitle className="font-heading flex items-center gap-2 text-slate-900">
                <FileText className="w-5 h-5 text-[#E65100]" /> Dispatch Slip
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Preview · Tap <span className="font-bold">Print</span> to save / print this slip.
                Long-press a row in the ledger to Edit or Delete it instead.
              </DialogDescription>
            </DialogHeader>

            {slipRow && (() => {
              const _hay = `${slipRow.raw.customer_city || ""} | ${party?.city || ""} | ${party?.location || ""} | ${party?.address || ""}`.toLowerCase();
              const isLudhianaSlip = /\bludhiana\b/.test(_hay);
              return (
              <div id="slip-print-area" className="px-6 py-5 print-target bg-white">
                {/* Slip header */}
                <div className="flex items-start justify-between border-b-2 border-slate-900 pb-3 mb-3">
                  <div>
                    <div className="font-heading text-xl font-extrabold text-slate-900 leading-tight">Dispatch Slip</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">Two-wheeler spare parts</div>
                  </div>
                  <div className="text-right text-[11px] text-slate-700">
                    <div><span className="font-bold">Slip #:</span> <span className="font-mono">{slipRow.raw.slip_no ?? slipRow.id.slice(0,8).toUpperCase()}</span></div>
                    <div><span className="font-bold">Date:</span> {fmtDateOnly(slipRow.when)}</div>
                    {slipRow.raw.gr_number && !isLudhianaSlip && (
                      <div><span className="font-bold">GR No.:</span> <span className="font-mono">{slipRow.raw.gr_number}</span></div>
                    )}
                  </div>
                </div>

                {/* Party info */}
                <div className="grid grid-cols-2 gap-3 text-[12px] text-slate-800 mb-4">
                  <div>
                    <div className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">Party</div>
                    <div className="font-bold text-slate-900">{slipRow.raw.customer_name || party?.name || "—"}</div>
                    {party?.phone && <div className="text-[11px]">📞 {party.phone}</div>}
                    {party?.city && <div className="text-[11px]">📍 {[party.city, party.location].filter(Boolean).join(", ")}</div>}
                    {party?.address && <div className="text-[11px] text-slate-500">{party.address}</div>}
                  </div>
                  <div className="text-right">
                    <div className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">Transport</div>
                    <div className="font-bold text-slate-900">{slipRow.raw.transport_name || party?.transport_name || "—"}</div>
                    {slipRow.raw.dispatched_by && (
                      <div className="text-[11px] text-slate-500 mt-1">Dispatched by · {slipRow.raw.dispatched_by}</div>
                    )}
                  </div>
                </div>

                {/* Items table */}
                <table className="w-full text-[12px] border border-slate-300 mb-3">
                  <thead>
                    <tr className="bg-slate-100 text-[10px] uppercase tracking-wider text-slate-700 font-bold">
                      <th className="border border-slate-300 px-2 py-1.5 text-left">Item</th>
                      <th className="border border-slate-300 px-2 py-1.5 text-right w-14">Qty</th>
                      <th className="border border-slate-300 px-2 py-1.5 text-right w-20">Net ₹</th>
                      <th className="border border-slate-300 px-2 py-1.5 text-right w-24">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(slipRow.raw.items || []).map((it, i) => {
                      const qty = Number(it.quantity || 0);
                      const unit = Number(it.unit_price || 0);
                      const net = Number(it.net_unit_price || unit);
                      const line = Number(it.line_value || (net * qty));
                      return (
                        <tr key={i} className="align-top">
                          <td className="border border-slate-300 px-2 py-1.5">
                            <div className="font-bold text-slate-900">{it.item_name}</div>
                            {it.description && (
                              <div className="font-bold text-slate-900 uppercase mt-0.5" data-testid={`slip-item-desc-${i}`}>
                                {it.description}
                              </div>
                            )}
                          </td>
                          <td className="border border-slate-300 px-2 py-1.5 text-right tabular-nums font-bold">{qty}</td>
                          <td className="border border-slate-300 px-2 py-1.5 text-right tabular-nums font-bold">{fmtINR(net)}</td>
                          <td className="border border-slate-300 px-2 py-1.5 text-right tabular-nums font-bold text-[#E65100]">{fmtINR(line)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {(() => {
                    const billAmount = Number(slipRow.raw.total_value || 0);
                    const lineAmount = (slipRow.raw.items || []).reduce((s, it) => {
                      const qty = Number(it.quantity || 0);
                      const net = Number(it.net_unit_price || it.unit_price || 0);
                      return s + (Number(it.line_value) || net * qty);
                    }, 0);
                    // GST is the 18% portion of a GST-inclusive bill amount.
                    // Using exact ratio (18/118) instead of the truncated 0.1526 approximation
                    // avoids the ~₹16 drift on ~₹2.8L bills.
                    const gst = Math.round((billAmount * 18) / 118);
                    const grandTotal = Math.round(lineAmount + gst);
                    return (
                      <tfoot>
                        <tr className="bg-slate-50 border-t border-slate-300">
                          <td className="border border-slate-300 px-2 py-1.5 text-xs font-bold uppercase tracking-wider text-slate-700" colSpan={3}>
                            Total amount
                          </td>
                          <td className="border border-slate-300 px-2 py-1.5 text-right tabular-nums font-bold text-slate-900">
                            ₹{fmtINR(lineAmount)}
                          </td>
                        </tr>
                        <tr className="bg-slate-50">
                          <td className="border border-slate-300 px-2 py-1.5 text-xs font-bold uppercase tracking-wider text-slate-700" colSpan={3}>
                            GST
                          </td>
                          <td className="border border-slate-300 px-2 py-1.5 text-right tabular-nums font-bold text-slate-900">
                            ₹{gst.toLocaleString("en-IN")}
                          </td>
                        </tr>
                        <tr className="bg-orange-50 border-t-2 border-orange-300">
                          <td className="border border-slate-300 px-2 py-2 text-xs font-bold uppercase tracking-wider">Grand Total</td>
                          <td className="border border-slate-300 px-2 py-2 text-right tabular-nums font-extrabold">{slipRow.raw.total_pcs || 0}</td>
                          <td className="border border-slate-300"></td>
                          <td className="border border-slate-300 px-2 py-2 text-right tabular-nums font-extrabold text-[#E65100] text-base">
                            ₹{grandTotal.toLocaleString("en-IN")}/-
                          </td>
                        </tr>
                      </tfoot>
                    );
                  })()}
                </table>

                {/* Bill amount + Cash amount grouped in a single bordered box */}
                {(() => {
                  const billAmount = Number(slipRow.raw.total_value || 0);
                  const lineAmount = (slipRow.raw.items || []).reduce((s, it) => {
                    const qty = Number(it.quantity || 0);
                    const net = Number(it.net_unit_price || it.unit_price || 0);
                    return s + (Number(it.line_value) || net * qty);
                  }, 0);
                  const gst = Math.round((billAmount * 18) / 118);
                  const grandTotal = Math.round(lineAmount + gst);
                  const cashAmount = Math.max(0, grandTotal - billAmount);
                  const privateMark = party?.private_mark || "";
                  const billMode = !!party?.bill_number_mode;
                  const billNo = slipRow.raw.bill_number || "";
                  const bagCount = Number(slipRow.raw.bag_count || 0);
                  return (
                    <div className="flex flex-wrap items-start gap-3 mb-3">
                      <div className="inline-block border-2 border-slate-400 rounded-sm divide-y divide-slate-300">
                        <div className="px-3 py-2 flex items-center justify-between gap-6">
                          <span className="text-xs font-bold uppercase tracking-wider text-slate-700">Bill amount</span>
                          <span className="tabular-nums font-bold text-slate-900">₹{fmtINR(billAmount)}/-</span>
                        </div>
                        {/* Hide "Cash amount" when it is nil — i.e. when the bill
                            amount already equals (or covers) total + 18% GST, so
                            there is no cash component to print (±₹2 tolerance). */}
                        {cashAmount > 2 && (
                          <div className="px-3 py-2 flex items-center justify-between gap-6">
                            <span className="text-xs font-bold uppercase tracking-wider text-slate-700">Cash amount</span>
                            <span className="tabular-nums font-bold text-slate-900">₹{cashAmount.toLocaleString("en-IN")}/-</span>
                          </div>
                        )}
                      </div>
                      {/* Private Mark (or Bill Number) + No. of Bags — hidden for Ludhiana parties */}
                      {!isLudhianaSlip && (
                        <div className="inline-block border-2 border-slate-400 rounded-sm divide-y divide-slate-300" data-testid="slip-mark-bags-box">
                          <div className="px-3 py-2 flex items-center justify-between gap-6">
                            <span className="text-xs font-bold uppercase tracking-wider text-slate-700">{billMode ? "Bill number" : "Private mark"}</span>
                            <span className="font-bold text-slate-900" data-testid="slip-private-mark">{(billMode ? billNo : privateMark) || "—"}</span>
                          </div>
                          <div className="px-3 py-2 flex items-center justify-between gap-6">
                            <span className="text-xs font-bold uppercase tracking-wider text-slate-700">No. of bags</span>
                            <span className="tabular-nums font-bold text-slate-900" data-testid="slip-bag-count">{bagCount > 0 ? bagCount : "—"}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {slipRow.raw.notes && (
                  <div className="text-[11px] text-slate-600 italic border-t border-slate-200 pt-2">
                    <span className="font-bold not-italic">Notes:</span> {slipRow.raw.notes}
                  </div>
                )}

                <div className="mt-6 pt-3 border-t border-dashed border-slate-300 flex justify-between text-[10px] text-slate-500">
                  <div>Customer signature: ____________________</div>
                </div>
              </div>
              );
            })()}

            <DialogFooter className="px-5 py-3 border-t border-slate-200 bg-slate-50 no-print gap-2 flex-wrap sm:flex-nowrap">
              <Button
                variant="outline"
                onClick={() => onClose()}
                data-testid="slip-close-btn"
                className="rounded-sm"
              >
                <X className="w-4 h-4 mr-1" /> Close
              </Button>
              {slipRow && (() => {
                const billAmount = Number(slipRow.raw.total_value || 0);
                const lineAmount = (slipRow.raw.items || []).reduce((s, it) => {
                  const qty = Number(it.quantity || 0);
                  const net = Number(it.net_unit_price || it.unit_price || 0);
                  return s + (Number(it.line_value) || net * qty);
                }, 0);
                const gst = Math.round((billAmount * 18) / 118);
                const grandTotal = Math.round(lineAmount + gst);
                const cashAmount = Math.max(0, grandTotal - billAmount);
                const partyName = slipRow.raw.customer_name || party?.name || "party";
                const _hay2 = `${slipRow.raw.customer_city || ""} | ${party?.city || ""} | ${party?.location || ""} | ${party?.address || ""}`.toLowerCase();
                const isLudhianaShare = /\bludhiana\b/.test(_hay2);
                return (
                  <ShareDocumentButtons
                    endpointBase="/slip"
                    documentLabel="Dispatch Slip"
                    testIdPrefix="slip-share"
                    partyName={partyName}
                    defaultEmail={party?.email || ""}
                    defaultPhone={party?.phone || ""}
                    payload={{
                      slip_no: slipRow.raw.slip_no != null
                        ? String(slipRow.raw.slip_no)
                        : String(slipRow.id || "").slice(0, 8).toUpperCase(),
                      date: slipRow.when || null,
                      gr_number: isLudhianaShare
                        ? null
                        : (slipRow.raw.gr_number
                          ? String(slipRow.raw.gr_number)
                          : null),
                      party: {
                        name: partyName,
                        phone: party?.phone || null,
                        city: party?.city || null,
                        location: party?.location || null,
                        address: party?.address || null,
                      },
                      transport_name:
                        slipRow.raw.transport_name ||
                        party?.transport_name ||
                        null,
                      dispatched_by: slipRow.raw.dispatched_by || null,
                      items: (slipRow.raw.items || []).map((it) => ({
                        item_name: it.item_name != null ? String(it.item_name) : null,
                        description:
                          it.description != null && it.description !== ""
                            ? String(it.description)
                            : null,
                        quantity: Number(it.quantity) || 0,
                        unit_price: Number(it.unit_price) || 0,
                        net_unit_price:
                          Number(it.net_unit_price || it.unit_price) || 0,
                        line_value:
                          Number(it.line_value) ||
                          (Number(it.net_unit_price || it.unit_price) || 0) *
                            (Number(it.quantity) || 0),
                      })),
                      bill_amount: billAmount,
                      cash_amount: cashAmount,
                      line_amount: lineAmount,
                      gst,
                      grand_total: grandTotal,
                      total_pcs: Number(slipRow.raw.total_pcs || 0),
                      private_mark: isLudhianaShare
                        ? null
                        : (party?.bill_number_mode
                            ? (slipRow.raw.bill_number || null)
                            : (party?.private_mark || null)),
                      bag_count: isLudhianaShare ? 0 : Number(slipRow.raw.bag_count || 0),
                      notes: slipRow.raw.notes != null && slipRow.raw.notes !== ""
                        ? String(slipRow.raw.notes)
                        : null,
                    }}
                  />
                );
              })()}
              <Button
                onClick={() => {
                  document.body.classList.add("printing-slip");
                  const cleanup = () => {
                    document.body.classList.remove("printing-slip");
                    window.removeEventListener("afterprint", cleanup);
                  };
                  window.addEventListener("afterprint", cleanup);
                  setTimeout(() => window.print(), 50);
                }}
                data-testid="slip-print-btn"
                className="bg-[#E65100] hover:bg-[#CC4800] text-white rounded-sm"
              >
                <Printer className="w-4 h-4 mr-1.5" /> Print
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
  );
}
