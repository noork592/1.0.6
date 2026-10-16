import React, { useCallback, useEffect, useRef, useState } from "react";
import { Bell, X, PackageCheck, AlertTriangle, CheckCheck, Inbox, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";

function timeAgo(iso) {
  if (!iso) return "";
  try {
    const then = new Date(iso).getTime();
    const diff = Math.max(0, Date.now() - then);
    const m = Math.floor(diff / 60000);
    if (m < 1) return "just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    return `${d}d ago`;
  } catch {
    return "";
  }
}

const ICON = {
  pending_dispatch: PackageCheck,
  low_stock: AlertTriangle,
};

const SEVERITY_STYLE = {
  critical: "bg-rose-50 border-rose-200 text-rose-600",
  warning: "bg-amber-50 border-amber-200 text-amber-600",
  info: "bg-sky-50 border-sky-200 text-sky-600",
};

export default function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);

  // Pull-down gesture bookkeeping
  const touchStartY = useRef(null);
  const touchTracking = useRef(false);

  const fetchCount = useCallback(async () => {
    try {
      const { data } = await api.get("/notifications/unread-count");
      setUnread(Number(data?.unread_count || 0));
    } catch {
      /* silent — badge poll shouldn't spam errors */
    }
  }, []);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/notifications");
      setItems(data?.items || []);
      setUnread(Number(data?.unread_count || 0));
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, []);

  // Poll unread badge every 60s (and once on mount).
  useEffect(() => {
    fetchCount();
    const id = setInterval(fetchCount, 60000);
    return () => clearInterval(id);
  }, [fetchCount]);

  // Load the full list whenever the panel opens.
  useEffect(() => {
    if (open) fetchList();
  }, [open, fetchList]);

  // Pull-down-from-top gesture opens the panel (mobile-native feel).
  useEffect(() => {
    const onStart = (e) => {
      if (open) return;
      const y = e.touches?.[0]?.clientY ?? 0;
      // Only arm when the gesture begins right at the very top edge.
      if (y <= 24 && window.scrollY <= 0) {
        touchStartY.current = y;
        touchTracking.current = true;
      } else {
        touchTracking.current = false;
      }
    };
    const onMove = (e) => {
      if (!touchTracking.current || open) return;
      const y = e.touches?.[0]?.clientY ?? 0;
      if (y - (touchStartY.current ?? 0) > 70) {
        touchTracking.current = false;
        setOpen(true);
      }
    };
    const onEnd = () => { touchTracking.current = false; };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
    };
  }, [open]);

  // Close on Escape
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const markAll = async () => {
    try {
      const { data } = await api.post("/notifications/mark-read", { all: true });
      setUnread(Number(data?.unread_count || 0));
      setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch {
      /* silent */
    }
  };

  const markOne = async (n) => {
    if (n.read) return;
    try {
      const { data } = await api.post("/notifications/mark-read", { ids: [n.id] });
      setUnread(Number(data?.unread_count || 0));
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
    } catch {
      /* silent */
    }
  };

  const clearOne = async (n) => {
    try {
      const { data } = await api.post("/notifications/clear", { ids: [n.id] });
      setUnread(Number(data?.unread_count || 0));
      setItems((prev) => prev.filter((x) => x.id !== n.id));
    } catch {
      /* silent */
    }
  };

  const clearAll = async () => {
    try {
      const { data } = await api.post("/notifications/clear", { all: true });
      setUnread(Number(data?.unread_count || 0));
      setItems([]);
    } catch {
      /* silent */
    }
  };

  return (
    <>
      {/* Bell button */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        data-testid="notif-bell-btn"
        aria-label="Notifications"
        className="relative p-2 rounded-sm text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
      >
        <Bell className="w-5 h-5" />
        {unread > 0 && (
          <span
            data-testid="notif-unread-badge"
            className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 grid place-items-center text-[10px] font-bold text-white bg-[#E65100] rounded-full leading-none"
          >
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/30"
          onClick={() => setOpen(false)}
          data-testid="notif-backdrop"
        />
      )}

      {/* Slide-down panel */}
      <div
        data-testid="notif-panel"
        className={`fixed top-0 left-0 right-0 z-50 bg-white border-b border-slate-200 shadow-xl transition-transform duration-300 ease-out ${
          open ? "translate-y-0" : "-translate-y-full"
        }`}
        style={{ maxHeight: "80vh" }}
      >
        <div className="pt-[env(safe-area-inset-top)]">
          <div className="flex items-center gap-3 px-4 sm:px-6 h-14 border-b border-slate-100">
            <Bell className="w-5 h-5 text-[#E65100]" />
            <div className="font-heading font-bold text-slate-900">Notifications</div>
            {unread > 0 && (
              <span className="text-[11px] font-bold text-[#E65100] bg-orange-50 border border-orange-200 rounded-full px-2 py-0.5">
                {unread} new
              </span>
            )}
            <div className="ml-auto flex items-center gap-1.5">
              <Button
                variant="ghost"
                size="sm"
                onClick={markAll}
                disabled={unread === 0}
                data-testid="notif-mark-all"
                className="rounded-sm h-9 text-slate-600 hover:text-slate-900"
              >
                <CheckCheck className="w-4 h-4 mr-1.5" /> Mark all read
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearAll}
                disabled={items.length === 0}
                data-testid="notif-clear-all"
                className="rounded-sm h-9 text-slate-600 hover:text-rose-700"
              >
                <Trash2 className="w-4 h-4 mr-1.5" /> Clear all
              </Button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                data-testid="notif-close"
                className="p-2 rounded-sm text-slate-500 hover:text-slate-900 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="overflow-y-auto" style={{ maxHeight: "calc(80vh - 3.5rem)" }}>
            {loading && (
              <div className="px-6 py-10 text-center text-slate-500 text-sm">Loading…</div>
            )}
            {!loading && items.length === 0 && (
              <div className="px-6 py-12 text-center" data-testid="notif-empty">
                <Inbox className="w-10 h-10 mx-auto text-slate-300" />
                <div className="mt-3 text-slate-500 text-sm">You're all caught up. No notifications.</div>
              </div>
            )}
            {!loading &&
              items.map((n) => {
                const Icon = ICON[n.type] || Bell;
                const sev = SEVERITY_STYLE[n.severity] || SEVERITY_STYLE.info;
                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => markOne(n)}
                    data-testid={`notif-item-${n.id}`}
                    className={`w-full text-left flex items-start gap-3 px-4 sm:px-6 py-3 border-b border-slate-100 transition-colors ${
                      n.read ? "bg-white hover:bg-slate-50" : "bg-orange-50/40 hover:bg-orange-50"
                    }`}
                  >
                    <span className={`shrink-0 w-9 h-9 rounded-sm border grid place-items-center ${sev}`}>
                      <Icon className="w-4.5 h-4.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <div className="font-bold text-slate-900 text-sm break-words">{n.title}</div>
                        {!n.read && <span className="shrink-0 w-2 h-2 rounded-full bg-[#E65100]" />}
                      </div>
                      <div className="text-xs text-slate-600 mt-0.5 break-words">{n.message}</div>
                      <div className="text-[10px] text-slate-400 mt-1 font-mono-num">{timeAgo(n.created_at)}</div>
                    </div>
                    <span
                      role="button"
                      tabIndex={0}
                      aria-label="Clear notification"
                      title="Clear this notification"
                      onClick={(e) => { e.stopPropagation(); clearOne(n); }}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); clearOne(n); } }}
                      data-testid={`notif-clear-${n.id}`}
                      className="shrink-0 p-1.5 rounded-sm text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </span>
                  </button>
                );
              })}
          </div>
        </div>
      </div>
    </>
  );
}
