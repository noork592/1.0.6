import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  MapContainer, TileLayer, Marker, Popup, Polyline, useMap, useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  MapPin, Factory, Plus, Trash2, Route as RouteIcon, Save, Loader2, ListChecks,
  Map as MapIcon, Satellite, Pencil, Check, X, Crosshair, Truck, Navigation, Copy, ExternalLink, Search,
  Package, CalendarDays, Printer, TrainFront, Milestone, AlertTriangle,
} from "lucide-react";
import DatePicker from "@/components/DatePicker";
import { todayIso } from "@/lib/dates";
import {
  DndContext, closestCenter, PointerSensor, TouchSensor, KeyboardSensor, useSensor, useSensors,
} from "@dnd-kit/core";
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove, sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";

// Drag-to-reorder row wrapper. Only the grip handle starts a drag so the
// checkbox / edit / delete buttons keep working normally.
function SortableTransportRow({ id, disabled, className, children, ...rest }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 20 : undefined,
    position: "relative",
  };
  return (
    <div ref={setNodeRef} style={style}
         className={`${className} ${isDragging ? "shadow-lg ring-2 ring-[#E65100] opacity-95" : ""}`} {...rest}>
      <button
        type="button"
        {...attributes}
        {...listeners}
        disabled={disabled}
        aria-label="Drag to reorder"
        title={disabled ? "Search clear karo to reorder" : "Drag karke serial number badlo"}
        className={`mt-0.5 -ml-1 p-0.5 rounded-sm touch-none ${disabled ? "text-slate-300 cursor-not-allowed" : "text-slate-400 hover:text-[#E65100] hover:bg-orange-50 cursor-grab active:cursor-grabbing"}`}
        data-testid={`tr-drag-${id}`}
      >
        <GripVertical className="w-4 h-4" />
      </button>
      {children}
    </div>
  );
}

// Marker icon default asset shim (react-leaflet's defaults 404 without this).
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

// A labeled marker — shows the transport name inside a pill so operators
// can identify each stop at a glance (no more "1/2/3" ambiguity). The
// caller can pass an optional visit-order badge that renders as a small
// circle on the pill's left edge.
const labelIcon = (name, order = null, color = "#E65100") => {
  const safe = String(name || "").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const badge = order != null
    ? `<span style="display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;background:white;color:${color};border-radius:50%;font-weight:900;font-size:11px;margin-right:6px;box-shadow:inset 0 0 0 2px ${color}">${order}</span>`
    : "";
  const html = `
    <div style="position:relative;display:inline-flex;align-items:center;">
      <div style="background:${color};color:white;padding:4px 10px 4px 6px;border-radius:14px;box-shadow:0 2px 6px rgba(0,0,0,.35);border:2px solid white;font-family:system-ui;font-weight:700;font-size:11px;letter-spacing:.2px;white-space:nowrap;display:inline-flex;align-items:center;">
        ${badge}<span>${safe}</span>
      </div>
      <div style="position:absolute;left:50%;bottom:-6px;width:0;height:0;transform:translateX(-50%);border-left:6px solid transparent;border-right:6px solid transparent;border-top:6px solid ${color};"></div>
    </div>`;
  // Width is fluid; anchor at bottom-centre so the pointer tail lands on the coordinate.
  return L.divIcon({
    className: "tr-label-marker",
    html,
    // Rough width guess so Leaflet gives the icon enough room — actual pill is auto-width.
    iconSize: [Math.max(60, Math.min(200, 20 + safe.length * 7)), 30],
    iconAnchor: [Math.max(30, Math.min(100, 10 + safe.length * 3.5)), 30],
  });
};

const dotIcon = (color = "#0369a1") =>
  L.divIcon({
    className: "",
    html: `<div style="background:${color};width:14px;height:14px;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,.35);border:2px solid white"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });

// A cluster pill for groups of transports at the same coordinate. Shows a
// count badge + the label "N transports". Click to expand names in popup.
const clusterIcon = (count, color = "#0369a1") => {
  const html = `
    <div style="position:relative;display:inline-flex;align-items:center;">
      <div style="background:${color};color:white;padding:4px 10px 4px 6px;border-radius:14px;box-shadow:0 2px 6px rgba(0,0,0,.35);border:2px solid white;font-family:system-ui;font-weight:700;font-size:11px;letter-spacing:.2px;white-space:nowrap;display:inline-flex;align-items:center;">
        <span style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;background:white;color:${color};border-radius:50%;font-weight:900;font-size:11px;margin-right:6px;box-shadow:inset 0 0 0 2px ${color}">${count}</span>
        <span>transports here</span>
      </div>
      <div style="position:absolute;left:50%;bottom:-6px;width:0;height:0;transform:translateX(-50%);border-left:6px solid transparent;border-right:6px solid transparent;border-top:6px solid ${color};"></div>
    </div>`;
  return L.divIcon({
    className: "tr-cluster-marker",
    html,
    iconSize: [150, 30],
    iconAnchor: [75, 30],
  });
};

// A cluster pill for selected transports at the same coordinate (uses the
// route colour). Shows count + list preview (up to 2 names) as a hint.
const selectedClusterIcon = (items, orders, color = "#E65100") => {
  const count = items.length;
  const preview = items.slice(0, 2).map((t) => t.name).join(", ")
    + (items.length > 2 ? ` +${items.length - 2}` : "");
  const safe = preview.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const orderStr = orders.join("/");
  const html = `
    <div style="position:relative;display:inline-flex;align-items:center;">
      <div style="background:${color};color:white;padding:4px 10px 4px 6px;border-radius:14px;box-shadow:0 2px 6px rgba(0,0,0,.35);border:2px solid white;font-family:system-ui;font-weight:700;font-size:11px;letter-spacing:.2px;white-space:nowrap;display:inline-flex;align-items:center;max-width:240px;">
        <span style="display:inline-flex;align-items:center;justify-content:center;padding:0 6px;height:20px;background:white;color:${color};border-radius:10px;font-weight:900;font-size:10px;margin-right:6px;box-shadow:inset 0 0 0 2px ${color}">${orderStr}</span>
        <span style="overflow:hidden;text-overflow:ellipsis;">${count} here · ${safe}</span>
      </div>
      <div style="position:absolute;left:50%;bottom:-6px;width:0;height:0;transform:translateX(-50%);border-left:6px solid transparent;border-right:6px solid transparent;border-top:6px solid ${color};"></div>
    </div>`;
  return L.divIcon({
    className: "tr-cluster-selected-marker",
    html,
    iconSize: [Math.max(140, Math.min(260, 40 + safe.length * 7)), 30],
    iconAnchor: [Math.max(70, Math.min(130, 20 + safe.length * 3.5)), 30],
  });
};

const factoryIcon = L.divIcon({
  className: "",
  html: `<div style="background:#111827;color:white;width:34px;height:34px;border-radius:6px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,.4);border:2px solid #fbbf24"><span style="font-weight:900;font-size:11px;letter-spacing:.5px">JK</span></div>`,
  iconSize: [34, 34],
  iconAnchor: [17, 17],
});

// User-marked railway phatak — red crossbuck disc (the railway-crossing sign).
const phatakIcon = L.divIcon({
  className: "",
  html: `<div style="background:#b91c1c;color:white;width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 5px rgba(0,0,0,.45);border:2px solid white;font-weight:900;font-size:13px;line-height:1">✕</div>`,
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

// User-marked flyover / road-over-bridge — green bridge disc. The "Avoid
// railway crossing" route is forced through these, treating that rail crossing
// as grade-separated (over the flyover) instead of an at-grade phatak.
const flyoverIcon = L.divIcon({
  className: "",
  html: `<div style="background:#047857;color:white;width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 5px rgba(0,0,0,.45);border:2px solid white;font-weight:900;font-size:12px;line-height:1">⤴</div>`,
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

// Decode a Google-style encoded polyline (OSRM's default format).
function decodePolyline(str, precision = 5) {
  if (!str) return [];
  let index = 0, lat = 0, lng = 0;
  const out = [];
  const factor = Math.pow(10, precision);
  while (index < str.length) {
    let result = 0, shift = 0, b;
    do { b = str.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    result = 0; shift = 0;
    do { b = str.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    out.push([lat / factor, lng / factor]);
  }
  return out;
}

function FitBounds({ points }) {
  const map = useMap();
  useEffect(() => {
    if (!points || points.length === 0) return;
    const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng]));
    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], 12);
    } else {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 13 });
    }
  }, [points, map]);
  return null;
}

// Click on the map (while "pick mode" is on) to drop a pin — feeds the
// Add-transport form so operators can add a point without typing coordinates.
function ClickToPick({ enabled, onPick }) {
  useMapEvents({
    click(e) {
      if (!enabled) return;
      onPick({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
}

const emptyDraft = { name: "", lat: "", lng: "", serial: "" };

// Build a Google Maps directions URL that opens the app on mobile (or the
// web version on desktop) and pre-fills factory → waypoints → last stop.
// We use the officially-documented `?api=1&…` universal URL so Google Maps
// reliably renders the route. Note: without a paid Google Maps API key +
// Place IDs, Google labels waypoints A/B/C — this is a hard limitation of
// the free URL API. The transport names still show inside our own app
// (label pills on the map + saved-route card).
// Docs: https://developers.google.com/maps/documentation/urls/get-started
function buildGoogleMapsUrl(factory, orderedStops) {
  if (!orderedStops || orderedStops.length === 0) return "";
  const pts = orderedStops.map((s) => `${Number(s.lat).toFixed(6)},${Number(s.lng).toFixed(6)}`);
  const origin = `${Number(factory.lat).toFixed(6)},${Number(factory.lng).toFixed(6)}`;
  const destination = pts[pts.length - 1];
  const waypoints = pts.slice(0, -1).join("|");
  const params = new URLSearchParams({
    api: "1",
    origin,
    destination,
    travelmode: "driving",
  });
  if (waypoints) params.set("waypoints", waypoints);
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

// Group items whose coordinates share the same rounded key (~11m). Returns
// an array of clusters — each cluster carries the source items so we can
// render a single marker per group and show the underlying names.
function clusterByLocation(items, precision = 4) {
  if (!Array.isArray(items) || items.length === 0) return [];
  // Skip transports that have no coordinate yet (needs_location) — they can't
  // be placed on the map until the user sets their location.
  const placeable = items.filter((it) => it && it.lat != null && it.lng != null);
  const groups = new Map();
  placeable.forEach((it, idx) => {
    const key = `${Number(it.lat).toFixed(precision)},${Number(it.lng).toFixed(precision)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ ...it, _idx: idx });
  });
  return Array.from(groups.entries()).map(([key, arr]) => ({
    key,
    lat: arr[0].lat,
    lng: arr[0].lng,
    items: arr,
  }));
}

// Sort transports by their master-list serial (ascending). Transports without
// a serial (not in the uploaded list) sort AFTER, alphabetically by name.
function bySerial(a, b) {
  const sa = typeof a.serial === "number" ? a.serial : Infinity;
  const sb = typeof b.serial === "number" ? b.serial : Infinity;
  if (sa !== sb) return sa - sb;
  return (a.name || "").localeCompare(b.name || "");
}


export default function TransportRoutes() {
  const [factory, setFactory] = useState({ lat: 30.8978257, lng: 75.8528076, label: "JK Products Factory" });
  const [transports, setTransports] = useState([]);      // master list
  const [selected, setSelected] = useState({});          // {[id]: true}
  const [routes, setRoutes] = useState([]);              // saved multi-stop routes
  const [routeName, setRouteName] = useState("");
  const [draft, setDraft] = useState({ ...emptyDraft });
  const [editingId, setEditingId] = useState(null);
  const [editingDraft, setEditingDraft] = useState({ ...emptyDraft });
  const [pickMode, setPickMode] = useState(false);
  const [phataks, setPhataks] = useState([]);            // user-marked railway crossings
  const [phatakMode, setPhatakMode] = useState(false);
  const [flyovers, setFlyovers] = useState([]);          // user-marked flyovers / ROBs
  const [flyoverMode, setFlyoverMode] = useState(false);
  const [factoryMode, setFactoryMode] = useState(false); // set route start point (factory)
  const [busy, setBusy] = useState({ adding: false, optimizing: false, saving: false });
  const [result, setResult] = useState(null);            // {order, total_distance_km, total_duration_min, geometry, engine}
  const [mapStyle, setMapStyle] = useState("map");
  const [searchQ, setSearchQ] = useState("");
  // Route date — bags per transport are pulled from the Daily Dispatch Report
  // for this IST day and shown next to each transport in the sequence.
  const [routeDate, setRouteDate] = useState(todayIso());
  const [bagsByTransport, setBagsByTransport] = useState({}); // {lowercased name: {total_bags, dispatch_count, customers}}
  const [bagsLoading, setBagsLoading] = useState(false);
  const autoTimer = useRef(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setBagsLoading(true);
        const r = await api.get("/transport/bags-by-date", { params: { date: routeDate } });
        if (cancelled) return;
        const map = {};
        (r.data?.by_transport || []).forEach((row) => {
          map[(row.transport_name || "").trim().toLowerCase()] = row;
        });
        setBagsByTransport(map);
      } catch (e) {
        if (!cancelled) setBagsByTransport({});
      } finally {
        if (!cancelled) setBagsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [routeDate]);

  const bagsFor = (t) => bagsByTransport[(t?.name || "").trim().toLowerCase()] || null;

  // ── Print the route sequence as a clean driver route sheet. Rendered into a
  // hidden iframe (same technique as the Dispatch Report) so it works in
  // Chrome, Safari and iOS/Android PWA standalone mode.
  const printRouteSheet = () => {
    if (orderedStops.length === 0) { toast.error("Select at least one transport first."); return; }
    const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    const prettyDate = (() => {
      const [y, m, d] = routeDate.split("-").map((x) => parseInt(x, 10));
      return new Date(y, m - 1, d).toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
    })();
    const totalBags = orderedStops.reduce((s, t) => s + (bagsFor(t)?.total_bags || 0), 0);
    const totalDispatches = orderedStops.reduce((s, t) => s + (bagsFor(t)?.dispatch_count || 0), 0);
    const rows = orderedStops.map((t, i) => {
      const b = bagsFor(t);
      const n = b?.total_bags || 0;
      return `<tr>
        <td class="num"><span class="badge">${i + 1}</span></td>
        <td class="name">${esc(t.name)}${i === orderedStops.length - 1 ? '<span class="final">Final stop</span>' : ""}</td>
        <td class="bags ${n > 0 ? "hot" : "zero"}">${n}</td>
        <td class="parties">${b?.customers?.length ? esc(b.customers.join(", ")) : '<span class="muted">—</span>'}${b?.dispatch_count ? `<div class="muted small">${b.dispatch_count} dispatch${b.dispatch_count > 1 ? "es" : ""}</div>` : ""}</td>
        <td class="coords">${Number(t.lat).toFixed(4)}, ${Number(t.lng).toFixed(4)}</td>
        <td class="tick"></td>
      </tr>`;
    }).join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Route Sheet · ${esc(routeDate)}</title>
<style>
  @page { margin: 10mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; color: #0f172a; }
  body { padding: 8mm; font-family: "IBM Plex Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-size: 12px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .head { display: flex; align-items: flex-start; justify-content: space-between; border-bottom: 3px solid #0f172a; padding-bottom: 8px; margin-bottom: 12px; }
  .brand { font-size: 18px; font-weight: 900; letter-spacing: .02em; }
  .brand small { display: block; font-size: 9px; letter-spacing: .18em; text-transform: uppercase; color: #64748b; font-weight: 700; margin-top: 2px; }
  .title { text-align: right; }
  .title .t { font-size: 10px; letter-spacing: .18em; text-transform: uppercase; color: #E65100; font-weight: 800; }
  .title .d { font-size: 16px; font-weight: 800; margin-top: 2px; }
  .kpis { display: flex; gap: 8px; margin-bottom: 12px; }
  .kpi { flex: 1; border: 1px solid #e2e8f0; padding: 6px 10px; }
  .kpi .l { font-size: 9px; letter-spacing: .14em; text-transform: uppercase; color: #64748b; font-weight: 700; }
  .kpi .v { font-size: 18px; font-weight: 900; font-family: "IBM Plex Mono", Menlo, monospace; }
  .kpi .v.hot { color: #E65100; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 9px; letter-spacing: .14em; text-transform: uppercase; color: #334155; background: #f1f5f9; border: 1px solid #cbd5e1; padding: 6px 8px; }
  td { border: 1px solid #cbd5e1; padding: 8px; vertical-align: top; }
  tr { break-inside: avoid; }
  td.num { width: 34px; text-align: center; }
  .badge { display: inline-flex; width: 22px; height: 22px; border-radius: 50%; background: #E65100; color: #fff; font-weight: 900; font-size: 11px; align-items: center; justify-content: center; }
  .badge.start { border-radius: 3px; background: #0f172a; color: #fcd34d; font-size: 9px; }
  td.name { font-size: 14px; font-weight: 800; }
  .final { display: inline-block; margin-left: 8px; font-size: 8px; letter-spacing: .12em; text-transform: uppercase; color: #E65100; border: 1px solid #E65100; padding: 1px 5px; vertical-align: middle; font-weight: 800; }
  td.bags { width: 70px; text-align: center; font-family: "IBM Plex Mono", Menlo, monospace; font-size: 18px; font-weight: 900; }
  td.bags.hot { background: #fff7ed; color: #E65100; }
  td.bags.zero { color: #94a3b8; }
  td.parties { font-size: 11px; }
  td.coords { width: 120px; font-family: "IBM Plex Mono", Menlo, monospace; font-size: 10px; color: #475569; }
  td.tick { width: 56px; }
  .muted { color: #94a3b8; } .small { font-size: 10px; margin-top: 2px; }
  tr.start td { background: #fffbeb; }
  .foot { display: flex; justify-content: space-between; gap: 24px; margin-top: 28px; }
  .sig { flex: 1; border-top: 1px solid #0f172a; padding-top: 4px; font-size: 9px; letter-spacing: .14em; text-transform: uppercase; color: #64748b; font-weight: 700; }
  .gen { margin-top: 10px; font-size: 9px; color: #94a3b8; }
</style></head><body>
  <div class="head">
    <div class="brand">JK PRODUCTS<small>Factory Order Management · Transport Route Sheet</small></div>
    <div class="title"><div class="t">Route sequence</div><div class="d">${esc(prettyDate)}</div>${routeName.trim() ? `<div class="muted">${esc(routeName.trim())}</div>` : ""}</div>
  </div>
  <div class="kpis">
    <div class="kpi"><div class="l">Stops</div><div class="v">${orderedStops.length}</div></div>
    <div class="kpi"><div class="l">Total bags</div><div class="v hot">${totalBags}</div></div>
    <div class="kpi"><div class="l">Dispatches</div><div class="v">${totalDispatches}</div></div>
    <div class="kpi"><div class="l">Distance</div><div class="v">${result?.total_distance_km != null ? `${result.total_distance_km} km` : "—"}</div></div>
    <div class="kpi"><div class="l">Est. time</div><div class="v">${result?.total_duration_min ? `~${Math.round(result.total_duration_min)} min` : "—"}</div></div>
  </div>
  <table>
    <thead><tr><th>#</th><th>Transport</th><th style="text-align:center">Bags</th><th>Parties (from Dispatch Report)</th><th>Coordinates</th><th>Done</th></tr></thead>
    <tbody>
      <tr class="start"><td class="num"><span class="badge start">JK</span></td><td class="name">Start · Factory</td><td class="bags zero">—</td><td class="parties muted">${esc(factory.label || "JK Products Factory")}</td><td class="coords">${Number(factory.lat).toFixed(4)}, ${Number(factory.lng).toFixed(4)}</td><td class="tick"></td></tr>
      ${rows}
    </tbody>
  </table>
  <div class="foot"><div class="sig">Driver signature</div><div class="sig">Vehicle no.</div><div class="sig">Dispatched by</div></div>
  <div class="gen">Generated ${new Date().toLocaleString("en-IN")} · Bags are linked from the Daily Dispatch Report for ${esc(routeDate)}</div>
</body></html>`;

    let iframe = document.getElementById("__route_print_iframe__");
    if (iframe) iframe.remove();
    iframe = document.createElement("iframe");
    iframe.id = "__route_print_iframe__";
    iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;";
    document.body.appendChild(iframe);
    iframe.onload = () => {
      try {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
      } catch (err) {
        toast.error("Couldn't open the print dialog. Open this page in your browser and try again.");
      } finally {
        setTimeout(() => { try { iframe.remove(); } catch (_) { void 0; } }, 1500);
      }
    };
    const doc = iframe.contentDocument || iframe.contentWindow.document;
    doc.open();
    doc.write(html);
    doc.close();
  };

  const loadAll = async () => {
    try {
      const [fac, tr, sv, ph, fo] = await Promise.all([
        api.get("/transport/factory"),
        api.get("/transports"),
        api.get("/transport/routes"),
        api.get("/rail-crossings"),
        api.get("/flyovers"),
      ]);
      if (fac?.data) setFactory(fac.data);
      setTransports(tr.data || []);
      setRoutes(sv.data || []);
      setPhataks(ph.data || []);
      setFlyovers(fo.data || []);
    } catch (e) {
      // Silent — page loads even if one call fails.
    }
  };
  useEffect(() => { loadAll(); }, []);

  const selectedTransports = useMemo(
    () => transports.filter((t) => selected[t.id]),
    [transports, selected]
  );

  // Filter for the search box in the "Select transports" panel. Case-insensitive,
  // matches name and coordinate substrings so operators can find "30.9" too.
  const filteredTransports = useMemo(() => {
    const q = searchQ.trim().toLowerCase();
    if (!q) return transports;
    return transports.filter((t) => {
      const hay = `${t.name} ${t.lat} ${t.lng}`.toLowerCase();
      return hay.includes(q);
    });
  }, [transports, searchQ]);

  // ── Auto-optimize whenever the selection changes (debounced 400ms). ─────
  useEffect(() => {
    if (autoTimer.current) clearTimeout(autoTimer.current);
    if (selectedTransports.length === 0) {
      setResult(null);
      return;
    }
    autoTimer.current = setTimeout(async () => {
      try {
        setBusy((b) => ({ ...b, optimizing: true }));
        const stops = selectedTransports.map((t) => ({
          transport_id: t.id, name: t.name, lat: t.lat, lng: t.lng,
        }));
        const r = await api.post("/transport/optimize", { stops });
        setResult(r.data);
      } catch (e) {
        toast.error(e?.response?.data?.detail || "Could not calculate route");
      } finally {
        setBusy((b) => ({ ...b, optimizing: false }));
      }
    }, 400);
    return () => autoTimer.current && clearTimeout(autoTimer.current);
     
  }, [selectedTransports.map((t) => t.id).join("|")]);

  const isValidLatLng = (lat, lng) => {
    const la = Number(lat), lo = Number(lng);
    return Number.isFinite(la) && Number.isFinite(lo)
      && la >= -90 && la <= 90 && lo >= -180 && lo <= 180;
  };

  // Mark / remove a railway phatak. Marked phataks are always avoided by the
  // "Avoid railway crossing" option — even if OpenStreetMap doesn't know them.
  const addPhatak = async (lat, lng) => {
    try {
      const r = await api.post("/rail-crossings", { lat, lng });
      setPhataks((prev) => [...prev, r.data]);
      toast.success("Phatak marked. Avoid-route ab isse flyover se skip karega.");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not mark phatak");
    }
  };

  const deletePhatak = async (p) => {
    if (!window.confirm("Delete this phatak marker?")) return;
    try {
      await api.delete(`/rail-crossings/${p.id}`);
      setPhataks((prev) => prev.filter((x) => x.id !== p.id));
      toast.success("Phatak removed.");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Delete failed");
    }
  };

  // Mark / remove a flyover (ROB). The "Avoid railway crossing" route is FORCED
  // through marked flyovers and treats that crossing as grade-separated, so the
  // route uses the flyover instead of the at-grade phatak.
  const addFlyover = async (lat, lng) => {
    try {
      const r = await api.post("/flyovers", { lat, lng });
      setFlyovers((prev) => [...prev, r.data]);
      toast.success("Flyover marked. Avoid-route ab isse hokar jaayega.");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not mark flyover");
    }
  };

  const deleteFlyover = async (f) => {
    if (!window.confirm("Delete this flyover marker?")) return;
    try {
      await api.delete(`/flyovers/${f.id}`);
      setFlyovers((prev) => prev.filter((x) => x.id !== f.id));
      toast.success("Flyover removed.");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Delete failed");
    }
  };

  // Change the route START POINT (factory location). Saved to the backend and
  // used as the origin for every optimised route.
  const setFactoryLocation = async (lat, lng) => {
    try {
      const r = await api.put("/transport/factory", { lat, lng, label: factory.label || "JK Products Factory" });
      setFactory(r.data);
      toast.success("Start point updated. Route ab yahan se banega.");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not update start point");
    }
  };

  // Re-fetch after add/edit/delete: inserting or moving a serial shifts others.
  const refreshTransports = async () => {
    try {
      const r = await api.get("/transports");
      setTransports((r.data || []).slice().sort(bySerial));
    } catch { /* keep current list */ }
  };
  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onTransportDragEnd = async ({ active, over }) => {
    if (!over || active.id === over.id) return;
    const moved = transports.find((t) => t.id === active.id);
    const target = transports.find((t) => t.id === over.id);
    if (!moved || !target) return;
    const maxSerial = transports.reduce((m, t) => (typeof t.serial === "number" && t.serial > m ? t.serial : m), 0);
    const newSerial = typeof target.serial === "number" ? target.serial : maxSerial + (typeof moved.serial === "number" ? 0 : 1);
    // Optimistic: reorder locally and renumber the serialised block 1..N.
    const oldIdx = transports.findIndex((t) => t.id === active.id);
    const newIdx = transports.findIndex((t) => t.id === over.id);
    const prevList = transports;
    const reordered = arrayMove(transports, oldIdx, newIdx);
    const serialCount = maxSerial + (typeof moved.serial === "number" ? 0 : 1);
    setTransports(reordered.map((t, i) => (i < serialCount ? { ...t, serial: i + 1 } : t)));
    try {
      const r = await api.patch(`/transports/${moved.id}`, { name: moved.name, serial: newSerial });
      toast.success(`"${moved.name}" ab serial #${r.data.serial} par hai.`);
    } catch (e) {
      setTransports(prevList);
      toast.error(e?.response?.data?.detail || "Could not reorder");
    } finally {
      refreshTransports();
    }
  };
  const nextSerial = transports.reduce(
    (m, t) => (typeof t.serial === "number" && t.serial > m ? t.serial : m), 0) + 1;

  const addTransport = async () => {
    const name = draft.name.trim();
    if (!name) { toast.error("Enter a transport name."); return; }
    const serialNum = String(draft.serial).trim() === "" ? nextSerial : Number(draft.serial);
    if (!Number.isInteger(serialNum) || serialNum < 1) {
      toast.error("Enter a valid serial number (1, 2, 3…).");
      return;
    }
    if (!isValidLatLng(draft.lat, draft.lng)) {
      toast.error("Enter valid coordinates or click on the map.");
      return;
    }
    try {
      setBusy((b) => ({ ...b, adding: true }));
      const r = await api.post("/transports", {
        name, lat: Number(draft.lat), lng: Number(draft.lng), serial: serialNum,
      });
      await refreshTransports();
      setDraft({ ...emptyDraft });
      setPickMode(false);
      toast.success(`Added "${r.data.name}" at serial #${r.data.serial}.`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not add transport");
    } finally {
      setBusy((b) => ({ ...b, adding: false }));
    }
  };

  const startEdit = (t) => {
    setEditingId(t.id);
    setEditingDraft({
      name: t.name,
      serial: typeof t.serial === "number" ? String(t.serial) : "",
      lat: t.lat != null ? String(t.lat) : "",
      lng: t.lng != null ? String(t.lng) : "",
    });
  };
  const cancelEdit = () => { setEditingId(null); setEditingDraft({ ...emptyDraft }); };
  const saveEdit = async () => {
    const nm = editingDraft.name.trim();
    if (!nm) { toast.error("Name cannot be empty."); return; }
    if (!isValidLatLng(editingDraft.lat, editingDraft.lng)) {
      toast.error("Enter valid coordinates.");
      return;
    }
    const es = String(editingDraft.serial ?? "").trim();
    if (es !== "" && (!Number.isInteger(Number(es)) || Number(es) < 1)) {
      toast.error("Enter a valid serial number (1, 2, 3…).");
      return;
    }
    try {
      await api.patch(`/transports/${editingId}`, {
        name: nm, lat: Number(editingDraft.lat), lng: Number(editingDraft.lng),
        ...(es !== "" ? { serial: Number(es) } : {}),
      });
      await refreshTransports();
      toast.success("Updated.");
      cancelEdit();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Update failed");
    }
  };

  const deleteTransport = async (t) => {
    if (!window.confirm(`Delete transport "${t.name}"?`)) return;
    try {
      await api.delete(`/transports/${t.id}`);
      await refreshTransports();
      setSelected((prev) => { const n = { ...prev }; delete n[t.id]; return n; });
      toast.success("Deleted");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Delete failed");
    }
  };

  const toggleSelect = (id, on) => setSelected((prev) => {
    const next = { ...prev };
    if (on) next[id] = true; else delete next[id];
    return next;
  });
  const selectAll = () => setSelected(Object.fromEntries(
    transports.filter((t) => !t.needs_location && t.lat != null && t.lng != null).map((t) => [t.id, true])
  ));
  const clearSelection = () => setSelected({});

  const orderedStops = useMemo(() => {
    if (!result?.order || result.order.length !== selectedTransports.length) return selectedTransports;
    return result.order.map((i) => selectedTransports[i]);
  }, [selectedTransports, result]);

  const geometry = useMemo(() => decodePolyline(result?.geometry || ""), [result?.geometry]);

  // Switch the active route to one of the alternative options returned by
  // the optimiser. Keeps the `options` list intact so the user can toggle
  // freely between choices without re-fetching.
  const selectRouteOption = (opt) => {
    setResult((prev) => ({
      ...(prev || {}),
      engine: opt.engine,
      order: opt.order,
      total_distance_km: opt.total_distance_km,
      total_duration_min: opt.total_duration_min,
      geometry: opt.geometry,
      _activeLabel: opt.label,
    }));
  };

  const mapPoints = useMemo(() => {
    if (selectedTransports.length > 0) return [factory, ...selectedTransports];
    const placeable = transports.filter((t) => t.lat != null && t.lng != null);
    if (placeable.length > 0) return [factory, ...placeable];
    return [factory];
  }, [factory, transports, selectedTransports]);

  const saveRoute = async () => {
    if (!routeName.trim()) { toast.error("Give this route a name to save it."); return; }
    if (selectedTransports.length === 0) { toast.error("Select at least one transport."); return; }
    try {
      setBusy((b) => ({ ...b, saving: true }));
      const payload = {
        name: routeName.trim(),
        stops: selectedTransports.map((t) => ({
          transport_id: t.id, name: t.name, lat: t.lat, lng: t.lng,
        })),
        optimized_order: result?.order || null,
        total_distance_km: result?.total_distance_km ?? null,
        total_duration_min: result?.total_duration_min ?? null,
        geometry: result?.geometry || null,
      };
      await api.post("/transport/routes", payload);
      toast.success("Route saved.");
      setRouteName("");
      const sv = await api.get("/transport/routes");
      setRoutes(sv.data || []);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Save failed");
    } finally {
      setBusy((b) => ({ ...b, saving: false }));
    }
  };

  const loadSavedRoute = (r) => {
    const ids = (r.stops || []).map((s) => s.transport_id).filter(Boolean);
    if (ids.length === 0) {
      toast.error("This saved route has no linked transports.");
      return;
    }
    setSelected(Object.fromEntries(ids.map((id) => [id, true])));
    setRouteName(r.name);
    toast.success(`Loaded "${r.name}"`);
  };

  const deleteSavedRoute = async (r) => {
    if (!window.confirm(`Delete route "${r.name}"?`)) return;
    try {
      await api.delete(`/transport/routes/${r.id}`);
      setRoutes((prev) => prev.filter((x) => x.id !== r.id));
      toast.success("Deleted");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Delete failed");
    }
  };

  return (
    <div className="space-y-4" data-testid="transport-routes-page">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Add transport panel */}
        <div className="bg-white border border-slate-200 rounded-sm p-4">
          <div className="flex items-center justify-between mb-1">
            <div className="text-[10px] uppercase tracking-[0.15em] text-[#E65100] font-bold">
              Add a transport
            </div>
            <button
              type="button"
              onClick={() => { setPickMode((v) => !v); setPhatakMode(false); }}
              className={`inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider px-2 py-1 rounded-sm border ${pickMode ? "bg-[#E65100] text-white border-[#E65100]" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"}`}
              data-testid="tr-pick-mode"
              title="Click anywhere on the map to drop a pin"
            >
              <Crosshair className="w-3.5 h-3.5" /> {pickMode ? "Picking… click map" : "Pick on map"}
            </button>
          </div>
          <div className="grid grid-cols-[1fr_120px] gap-3">
            <div>
              <Label className="text-xs font-bold uppercase">Transport name</Label>
              <Input
                value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                placeholder="e.g. Sharma Transport"
                className="h-10 rounded-sm mt-1"
                data-testid="tr-name"
              />
            </div>
            <div>
              <Label className="text-xs font-bold uppercase">Serial no.</Label>
              <Input
                type="number"
                min={1}
                max={nextSerial}
                value={draft.serial}
                onChange={(e) => setDraft((d) => ({ ...d, serial: e.target.value }))}
                placeholder={String(nextSerial)}
                className="h-10 rounded-sm mt-1 font-mono-num"
                data-testid="tr-serial"
              />
            </div>
          </div>
          <p className="text-[11px] text-slate-500 mt-1" data-testid="tr-serial-hint">
            Kis serial number par add karna hai? Khaali chhodne par <b>#{nextSerial}</b> (last) par add hoga.
            Pehle se bhara number doge toh baaki transports ek number aage khisak jayenge.
          </p>
          <div className="grid grid-cols-2 gap-3 mt-3">
            <div>
              <Label className="text-xs font-bold uppercase">Latitude</Label>
              <Input
                value={draft.lat}
                onChange={(e) => setDraft((d) => ({ ...d, lat: e.target.value }))}
                placeholder="e.g. 30.8978"
                className="h-10 rounded-sm mt-1 font-mono-num"
                data-testid="tr-lat"
              />
            </div>
            <div>
              <Label className="text-xs font-bold uppercase">Longitude</Label>
              <Input
                value={draft.lng}
                onChange={(e) => setDraft((d) => ({ ...d, lng: e.target.value }))}
                placeholder="e.g. 75.8528"
                className="h-10 rounded-sm mt-1 font-mono-num"
                data-testid="tr-lng"
              />
            </div>
          </div>
          <div className="mt-3 flex justify-end">
            <Button
              onClick={addTransport}
              disabled={busy.adding}
              className="h-10 rounded-sm bg-[#E65100] hover:bg-[#c94500] text-white"
              data-testid="tr-add"
            >
              {busy.adding ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Plus className="w-4 h-4 mr-1.5" />}
              Add transport
            </Button>
          </div>
          <p className="text-[11px] text-slate-500 mt-2">
            Tip: turn on <b>Pick on map</b> then click any point to fill in the coordinates automatically.
          </p>
        </div>

        {/* Select transports panel */}
        <div className="bg-white border border-slate-200 rounded-sm p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[10px] uppercase tracking-[0.15em] text-[#E65100] font-bold">
              Select transports for this route
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button" onClick={selectAll}
                className="text-[11px] font-bold uppercase tracking-wider text-slate-700 hover:text-[#E65100]"
                data-testid="tr-select-all"
              >
                Select all
              </button>
              <span className="text-slate-300">·</span>
              <button
                type="button" onClick={clearSelection}
                className="text-[11px] font-bold uppercase tracking-wider text-slate-700 hover:text-[#E65100]"
                data-testid="tr-clear"
              >
                Clear
              </button>
            </div>
          </div>
          {transports.length === 0 ? (
            <div className="text-sm text-slate-400 text-center py-8 border border-dashed border-slate-200 rounded-sm">
              No transports yet — add one on the left.
            </div>
          ) : (
            <>
              {/* Task 1 — quick search over the transport master */}
              <div className="relative mb-2">
                <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <Input
                  value={searchQ}
                  onChange={(e) => setSearchQ(e.target.value)}
                  placeholder="Search transports by name…"
                  className="h-9 rounded-sm pl-9 pr-8"
                  data-testid="tr-search"
                />
                {searchQ && (
                  <button
                    type="button"
                    onClick={() => setSearchQ("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                    aria-label="Clear search"
                    data-testid="tr-search-clear"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              <p className="text-[11px] text-slate-500 mb-1.5 flex items-center gap-1" data-testid="tr-drag-hint">
                <GripVertical className="w-3 h-3" />
                {searchQ.trim() ? "Reorder karne ke liye search clear karo." : "Upar-neeche drag karke serial number badlo."}
              </p>
              <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={onTransportDragEnd}>
              <SortableContext items={filteredTransports.map((t) => t.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-1.5 max-h-80 overflow-auto pr-1" data-testid="tr-list">
                {filteredTransports.length === 0 ? (
                  <div className="text-sm text-slate-400 text-center py-6" data-testid="tr-search-empty">
                    No transports match "{searchQ}".
                  </div>
                ) : filteredTransports.map((t) => {
                const isEditing = editingId === t.id;
                const noLoc = !!t.needs_location || t.lat == null || t.lng == null;
                return (
                  <SortableTransportRow
                    key={t.id}
                    id={t.id}
                    disabled={!!searchQ.trim() || !!editingId}
                    className={`flex items-start gap-2 border rounded-sm px-2.5 py-2 ${noLoc ? "border-red-300 bg-red-50" : "border-slate-200 bg-slate-50"}`}
                    data-testid={`tr-row-${t.id}`}
                    data-needs-location={noLoc ? "yes" : "no"}
                  >
                    <Checkbox
                      checked={!!selected[t.id]}
                      disabled={noLoc}
                      onCheckedChange={(v) => toggleSelect(t.id, !!v)}
                      className="mt-1 data-[state=checked]:bg-[#E65100] data-[state=checked]:border-[#E65100] disabled:opacity-40"
                      data-testid={`tr-check-${t.id}`}
                    />
                    <div className="flex-1 min-w-0">
                      {isEditing ? (
                        <div className="grid grid-cols-1 sm:grid-cols-[64px_1fr_1fr_1fr] gap-1.5">
                          <Input
                            type="number"
                            min={1}
                            value={editingDraft.serial ?? ""}
                            placeholder="S.No"
                            onChange={(e) => setEditingDraft((d) => ({ ...d, serial: e.target.value }))}
                            className="h-8 rounded-sm text-sm font-mono-num"
                            data-testid="tr-edit-serial"
                          />
                          <Input
                            value={editingDraft.name}
                            onChange={(e) => setEditingDraft((d) => ({ ...d, name: e.target.value }))}
                            className="h-8 rounded-sm text-sm"
                          />
                          <Input
                            value={editingDraft.lat}
                            placeholder="lat"
                            onChange={(e) => setEditingDraft((d) => ({ ...d, lat: e.target.value }))}
                            className="h-8 rounded-sm text-sm font-mono-num"
                          />
                          <Input
                            value={editingDraft.lng}
                            placeholder="lng"
                            onChange={(e) => setEditingDraft((d) => ({ ...d, lng: e.target.value }))}
                            className="h-8 rounded-sm text-sm font-mono-num"
                          />
                        </div>
                      ) : (
                        <>
                          <div className="text-sm font-bold text-slate-900 truncate flex items-center gap-1.5">
                            {typeof t.serial === "number" && (
                              <span className="shrink-0 inline-flex items-center justify-center min-w-[22px] h-[18px] px-1 rounded-sm bg-slate-900 text-white text-[10px] font-black font-mono-num">
                                {t.serial}
                              </span>
                            )}
                            <span className="truncate">{t.name}</span>
                          </div>
                          {noLoc ? (
                            <div className="text-[11px] font-bold text-red-600 flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" />
                              Location missing — click edit to set
                            </div>
                          ) : (
                            <div className="text-[11px] text-slate-500 font-mono-num">
                              {Number(t.lat).toFixed(4)}, {Number(t.lng).toFixed(4)}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {isEditing ? (
                        <>
                          <button type="button" onClick={saveEdit} className="text-emerald-600 hover:text-emerald-700 p-1" aria-label="Save">
                            <Check className="w-4 h-4" />
                          </button>
                          <button type="button" onClick={cancelEdit} className="text-slate-400 hover:text-slate-600 p-1" aria-label="Cancel">
                            <X className="w-4 h-4" />
                          </button>
                        </>
                      ) : (
                        <>
                          <button type="button" onClick={() => startEdit(t)} className="text-slate-400 hover:text-slate-700 p-1" aria-label="Edit" data-testid={`tr-edit-${t.id}`}>
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button type="button" onClick={() => deleteTransport(t)} className="text-slate-400 hover:text-red-600 p-1" aria-label="Delete" data-testid={`tr-del-${t.id}`}>
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </SortableTransportRow>
                );
              })}
              </div>
              </SortableContext>
              </DndContext>
            </>
          )}

        </div>
      </div>

      {/* Task 2 — Route sequence list: shows the order of stops (factory → 1 → 2 → …)
          before the map so the operator can see the visit sequence at a glance. */}
      {orderedStops.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-sm p-4" data-testid="tr-sequence">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <ListChecks className="w-4 h-4 text-[#E65100]" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Route sequence
            </span>
            <div className="flex items-center gap-1.5 ml-1" data-testid="tr-route-date">
              <CalendarDays className="w-3.5 h-3.5 text-slate-500" />
              <DatePicker
                value={routeDate}
                onChange={(v) => v && setRouteDate(v)}
                max={todayIso()}
                buttonClassName="h-7 text-[11px] px-2"
                testId="tr-route-date-picker"
              />
              {bagsLoading && <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />}
            </div>
            <span
              className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-800 bg-amber-50 border border-amber-200 rounded-sm px-2 py-0.5"
              data-testid="tr-sequence-total-bags"
              title="Total bags across selected transports (from Daily Dispatch Report)"
            >
              <Package className="w-3.5 h-3.5 text-[#E65100]" />
              <span className="font-mono-num">{orderedStops.reduce((s, t) => s + (bagsFor(t)?.total_bags || 0), 0)}</span> bags
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={printRouteSheet}
              className="h-7 px-2.5 text-[11px] font-bold uppercase tracking-wider rounded-sm border-slate-300 text-slate-800 hover:bg-slate-100 hover:border-slate-400"
              data-testid="tr-sequence-print"
            >
              <Printer className="w-3.5 h-3.5 mr-1" /> Print
            </Button>
            {result?.total_distance_km != null && (
              <span className="ml-auto text-[11px] font-bold text-slate-700">
                Total: <span className="text-[#E65100] font-mono-num">{result.total_distance_km} km</span>
                {result.total_duration_min ? (
                  <> · <span className="font-mono-num">~{Math.round(result.total_duration_min)} min</span></>
                ) : null}
              </span>
            )}
          </div>
          <ol className="space-y-1.5" data-testid="tr-sequence-list">
            <li className="flex items-center gap-3 border border-slate-200 rounded-sm px-2.5 py-2 bg-amber-50">
              <span className="shrink-0 w-7 h-7 rounded-sm bg-slate-900 text-amber-300 text-[10px] font-black flex items-center justify-center">JK</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-slate-900">Start · Factory</div>
                <div className="text-[11px] text-slate-500 font-mono-num">
                  {Number(factory.lat).toFixed(4)}, {Number(factory.lng).toFixed(4)}
                </div>
              </div>
            </li>
            {orderedStops.map((t, i) => (
              <li
                key={`seq-${t.id || t.transport_id || i}`}
                className="flex items-center gap-3 border border-slate-200 rounded-sm px-2.5 py-2 bg-slate-50"
                data-testid={`tr-sequence-row-${i}`}
              >
                <span className="shrink-0 w-7 h-7 rounded-full bg-[#E65100] text-white text-[12px] font-black flex items-center justify-center">
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="text-sm font-bold text-slate-900 truncate">{t.name}</div>
                    {(() => {
                      const b = bagsFor(t);
                      const n = b?.total_bags || 0;
                      return (
                        <span
                          className={`shrink-0 inline-flex items-center gap-1 text-[11px] font-bold rounded-sm px-1.5 py-0.5 border ${
                            n > 0
                              ? "bg-[#E65100] text-white border-[#E65100]"
                              : "bg-white text-slate-400 border-slate-200"
                          }`}
                          data-testid={`tr-sequence-bags-${i}`}
                          title={b ? `${b.dispatch_count} dispatch(es) · ${(b.customers || []).join(", ")}` : "No dispatches for this transport on this date"}
                        >
                          <Package className="w-3 h-3" />
                          <span className="font-mono-num">{n}</span> bags
                        </span>
                      );
                    })()}
                  </div>
                  <div className="text-[11px] text-slate-500 font-mono-num">
                    {Number(t.lat).toFixed(4)}, {Number(t.lng).toFixed(4)}
                    {bagsFor(t)?.customers?.length ? (
                      <span className="font-sans text-slate-500"> · {bagsFor(t).customers.slice(0, 3).join(", ")}{bagsFor(t).customers.length > 3 ? ` +${bagsFor(t).customers.length - 3}` : ""}</span>
                    ) : null}
                  </div>
                </div>
                {i === orderedStops.length - 1 && (
                  <span className="text-[10px] uppercase font-bold text-[#E65100] px-2 py-0.5 rounded-sm border border-[#E65100]">
                    Final stop
                  </span>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Map */}
      <div className="bg-white border border-slate-200 rounded-sm overflow-hidden">
        <div className="px-4 py-2 border-b border-slate-200 flex items-center gap-2 flex-wrap">
          <Factory className="w-4 h-4 text-slate-700" />
          <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
            Map · Factory + transports
          </span>
          <span className="text-[10px] text-slate-400 font-mono-num">
            {factory.lat.toFixed(4)}, {factory.lng.toFixed(4)}
          </span>
          <button
            type="button"
            onClick={() => { setPhatakMode((v) => !v); setPickMode(false); setFlyoverMode(false); }}
            className={`inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider px-2 py-1 rounded-sm border ${phatakMode ? "bg-[#b91c1c] text-white border-[#b91c1c]" : "bg-white text-[#b91c1c] border-red-200 hover:bg-red-50"}`}
            data-testid="tr-phatak-mode"
            title="Map par railway phatak par click karke mark karein — Avoid route usse flyover se skip karega"
          >
            <TrainFront className="w-3.5 h-3.5" /> {phatakMode ? "Click phatak on map…" : "Mark phatak"}
          </button>
          <button
            type="button"
            onClick={() => { setFlyoverMode((v) => !v); setPickMode(false); setPhatakMode(false); }}
            className={`inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider px-2 py-1 rounded-sm border ${flyoverMode ? "bg-[#047857] text-white border-[#047857]" : "bg-white text-[#047857] border-emerald-200 hover:bg-emerald-50"}`}
            data-testid="tr-flyover-mode"
            title="Map par flyover/pul par click karke mark karein — Avoid route isse hokar jaayega (railway line cross nahi karega)"
          >
            <Milestone className="w-3.5 h-3.5" /> {flyoverMode ? "Click flyover on map…" : "Mark flyover"}
          </button>
          <button
            type="button"
            onClick={() => { setFactoryMode((v) => !v); setPickMode(false); setPhatakMode(false); setFlyoverMode(false); }}
            className={`inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider px-2 py-1 rounded-sm border ${factoryMode ? "bg-[#111827] text-white border-[#111827]" : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"}`}
            data-testid="tr-factory-mode"
            title="Route ka start point (factory) badlein — map par nayi location par click karein"
          >
            <Crosshair className="w-3.5 h-3.5" /> {factoryMode ? "Click start point on map…" : "Set start point"}
          </button>
          <div className="ml-auto inline-flex rounded-sm border border-slate-200 overflow-hidden">
            <button
              type="button" onClick={() => setMapStyle("map")}
              className={`px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider inline-flex items-center gap-1 ${mapStyle === "map" ? "bg-[#E65100] text-white" : "bg-white text-slate-700 hover:bg-slate-50"}`}
              data-testid="tr-map-style-map"
            >
              <MapIcon className="w-3.5 h-3.5" /> Map
            </button>
            <button
              type="button" onClick={() => setMapStyle("satellite")}
              className={`px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider inline-flex items-center gap-1 border-l border-slate-200 ${mapStyle === "satellite" ? "bg-[#E65100] text-white" : "bg-white text-slate-700 hover:bg-slate-50"}`}
              data-testid="tr-map-style-satellite"
            >
              <Satellite className="w-3.5 h-3.5" /> Satellite
            </button>
          </div>
        </div>
        <div style={{ height: 480 }} data-testid="tr-map">
          <MapContainer
            center={[factory.lat, factory.lng]}
            zoom={10}
            style={{ height: "100%", width: "100%", cursor: pickMode || phatakMode || flyoverMode || factoryMode ? "crosshair" : "" }}
            scrollWheelZoom
          >
            {mapStyle === "map" ? (
              <TileLayer
                key="osm-standard"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
                maxZoom={19}
              />
            ) : (
              <>
                <TileLayer
                  key="esri-imagery"
                  attribution="Tiles &copy; Esri"
                  url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                  maxZoom={19}
                />
                <TileLayer
                  key="esri-ref"
                  url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
                  maxZoom={19}
                />
              </>
            )}
            <ClickToPick
              enabled={pickMode || phatakMode || flyoverMode || factoryMode}
              onPick={({ lat, lng }) => {
                if (phatakMode) {
                  addPhatak(lat, lng);
                  return;
                }
                if (flyoverMode) {
                  addFlyover(lat, lng);
                  return;
                }
                if (factoryMode) {
                  setFactoryLocation(lat, lng);
                  setFactoryMode(false);
                  return;
                }
                setDraft((d) => ({ ...d, lat: lat.toFixed(6), lng: lng.toFixed(6) }));
                setPickMode(false);
                toast.success("Coordinates captured — give it a name and Add.");
              }}
            />

            <Marker position={[factory.lat, factory.lng]} icon={factoryIcon}>
              <Popup>
                <b>Start point (Factory)</b><br />{factory.label}<br />
                <span style={{ fontFamily: "monospace" }}>
                  {Number(factory.lat).toFixed(5)}, {Number(factory.lng).toFixed(5)}
                </span><br />
                <span style={{ color: "#111827" }}>Badalne ke liye "Set start point" par click karein.</span>
              </Popup>
            </Marker>

            {/* User-marked railway phataks (red ✕) — always avoided by the
                "Avoid railway crossing" option. Click a marker to delete it. */}
            {phataks.map((p) => (
              <Marker
                key={`phatak-${p.id}`}
                position={[p.lat, p.lng]}
                icon={phatakIcon}
                eventHandlers={{ click: () => deletePhatak(p) }}
              >
                <Popup>
                  <b>{p.label || "Railway phatak"}</b><br />
                  Avoid-route isse flyover se skip karta hai.<br />
                  <span style={{ color: "#b91c1c" }}>Delete karne ke liye marker par click karein.</span>
                </Popup>
              </Marker>
            ))}

            {/* User-marked flyovers (green ⤴) — the "Avoid railway crossing"
                option is forced through these. Click a marker to delete it. */}
            {flyovers.map((f) => (
              <Marker
                key={`flyover-${f.id}`}
                position={[f.lat, f.lng]}
                icon={flyoverIcon}
                eventHandlers={{ click: () => deleteFlyover(f) }}
              >
                <Popup>
                  <b>{f.label || "Flyover"}</b><br />
                  Avoid-route isse hokar jaayega (railway cross nahi karega).<br />
                  <span style={{ color: "#047857" }}>Delete karne ke liye marker par click karein.</span>
                </Popup>
              </Marker>
            ))}

            {/* Unselected transports: group co-located ones into a cluster pill
                that says "N transports here" so overlap collapses into a single
                marker rather than a pile of pills. */}
            {clusterByLocation(transports.filter((t) => !selected[t.id])).map((grp) => (
              grp.items.length === 1 ? (
                <Marker key={`dot-${grp.items[0].id}`} position={[grp.lat, grp.lng]} icon={dotIcon()}>
                  <Popup>
                    <b>{grp.items[0].name}</b><br />
                    <span style={{ fontFamily: "monospace" }}>
                      {Number(grp.items[0].lat).toFixed(4)}, {Number(grp.items[0].lng).toFixed(4)}
                    </span>
                  </Popup>
                </Marker>
              ) : (
                <Marker key={`cluster-${grp.key}`} position={[grp.lat, grp.lng]} icon={clusterIcon(grp.items.length)}>
                  <Popup>
                    <b>{grp.items.length} transports at this spot</b>
                    <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                      {grp.items.map((t) => (<li key={t.id}>{t.name}</li>))}
                    </ul>
                  </Popup>
                </Marker>
              )
            ))}

            {/* Selected transports: same cluster-if-overlapping approach, but
                labels use the route colour and carry the visit-order badge(s). */}
            {(() => {
              // Attach visit order to each stop so cluster labels can display it.
              const withOrder = orderedStops.map((t, i) => ({ ...t, _order: i + 1 }));
              return clusterByLocation(withOrder).map((grp) => {
                if (grp.items.length === 1) {
                  const t = grp.items[0];
                  return (
                    <Marker
                      key={`pin-${t.id || t.transport_id || t._order}`}
                      position={[grp.lat, grp.lng]}
                      icon={labelIcon(t.name || `Stop ${t._order}`, t._order)}
                      zIndexOffset={1000 + t._order}
                    >
                      <Popup>
                        <b>#{t._order} · {t.name}</b><br />
                        <span style={{ fontFamily: "monospace" }}>
                          {Number(t.lat).toFixed(4)}, {Number(t.lng).toFixed(4)}
                        </span>
                      </Popup>
                    </Marker>
                  );
                }
                const orders = grp.items.map((x) => x._order);
                return (
                  <Marker
                    key={`sel-cluster-${grp.key}`}
                    position={[grp.lat, grp.lng]}
                    icon={selectedClusterIcon(grp.items, orders)}
                    zIndexOffset={2000}
                  >
                    <Popup>
                      <b>{grp.items.length} transports at this spot</b>
                      <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                        {grp.items.map((t) => (
                          <li key={t.id}>#{t._order} · {t.name}</li>
                        ))}
                      </ul>
                    </Popup>
                  </Marker>
                );
              });
            })()}

            {geometry.length > 1 && (
              <Polyline positions={geometry} pathOptions={{ color: "#E65100", weight: 5, opacity: 0.9 }} />
            )}
            {geometry.length === 0 && orderedStops.length > 0 && (
              <Polyline
                positions={[[factory.lat, factory.lng], ...orderedStops.map((t) => [t.lat, t.lng])]}
                pathOptions={{ color: "#E65100", weight: 3, opacity: 0.6, dashArray: "6 6" }}
              />
            )}
            <FitBounds points={mapPoints} />
          </MapContainer>
        </div>
      </div>

      {/* Route summary + save — shown below the map */}
      <div className="bg-white border border-slate-200 rounded-sm p-4 flex flex-wrap items-center gap-2">
        <div className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5" data-testid="tr-summary">
          <Truck className="w-4 h-4 text-slate-500" />
          {selectedTransports.length === 0 ? (
            <span className="text-slate-400">Pick transports to auto-generate the shortest route</span>
          ) : busy.optimizing ? (
            <span className="inline-flex items-center gap-1"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Optimising route…</span>
          ) : result ? (
            <>
              <span>{selectedTransports.length} stop{selectedTransports.length > 1 ? "s" : ""}</span>
              <span className="text-slate-300">·</span>
              <span className="text-[#E65100] font-mono-num">{result.total_distance_km} km</span>
              {result.total_duration_min ? (
                <>
                  <span className="text-slate-300">·</span>
                  <span className="font-mono-num">~{Math.round(result.total_duration_min)} min</span>
                </>
              ) : null}
              <span className="text-slate-400 text-[10px]">({result.engine})</span>
            </>
          ) : null}
        </div>
        {/* Alternative route options — pick a different route */}
        {result?.options && result.options.length > 1 && (
          <div className="w-full flex flex-wrap items-center gap-1.5" data-testid="tr-route-options">
            <span className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mr-0.5">
              Route options:
            </span>
            {result.options.map((opt, i) => {
              const activeLabel = result._activeLabel || result.options[0].label;
              const active = opt.label === activeLabel;
              return (
                <button
                  key={`${opt.label}-${i}`}
                  type="button"
                  onClick={() => selectRouteOption(opt)}
                  data-testid={`tr-route-option-${i}`}
                  className={`inline-flex items-center gap-1.5 h-8 px-2.5 rounded-sm border text-[11px] font-bold transition-colors ${
                    active
                      ? "bg-[#E65100] text-white border-[#E65100]"
                      : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  <RouteIcon className="w-3.5 h-3.5" />
                  <span>{opt.label}</span>
                  {opt.total_distance_km != null && (
                    <span className={`font-mono-num ${active ? "text-white/90" : "text-[#E65100]"}`}>
                      {opt.total_distance_km} km
                    </span>
                  )}
                  {opt.crossings != null && (
                    <span
                      className={`inline-flex items-center gap-0.5 font-mono-num rounded-sm px-1 ${
                        active
                          ? "text-white/90"
                          : opt.crossings === 0
                          ? "text-emerald-600"
                          : "text-amber-600"
                      }`}
                      data-testid={`tr-route-option-crossings-${i}`}
                      title={opt.crossings === 0 ? "No railway crossings on this route" : `${opt.crossings} railway crossing(s) on this route`}
                    >
                      <TrainFront className="w-3 h-3" />
                      {opt.crossings}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
        <div className="flex-1 min-w-[160px]">
          <Input
            value={routeName}
            onChange={(e) => setRouteName(e.target.value)}
            placeholder="Name this route (to save)"
            className="h-9 rounded-sm"
            data-testid="tr-route-name"
          />
        </div>
        <Button
          onClick={saveRoute}
          disabled={busy.saving || selectedTransports.length === 0 || !routeName.trim()}
          variant="outline"
          className="h-9 rounded-sm border-slate-300"
          data-testid="tr-save"
        >
          {busy.saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Save className="w-4 h-4 mr-1.5" />}
          Save route
        </Button>

        {/* Google Maps deep link for the current selection */}
        {orderedStops.length > 0 && (
          <div className="w-full mt-2 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2">
            <span className="text-[10px] uppercase tracking-wider font-bold text-slate-500">
              Navigate on phone:
            </span>
            <a
              href={buildGoogleMapsUrl(factory, orderedStops)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-sm bg-[#1a73e8] hover:bg-[#155ab5] text-white text-[11px] font-bold uppercase tracking-wider"
              data-testid="tr-open-gmaps"
            >
              <Navigation className="w-3.5 h-3.5" /> Open in Google Maps
              <ExternalLink className="w-3 h-3 opacity-70" />
            </a>
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(buildGoogleMapsUrl(factory, orderedStops));
                  toast.success("Link copied — paste it in WhatsApp or SMS.");
                } catch (e) {
                  toast.error("Copy failed. Long-press the Open button to copy the link.");
                }
              }}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-sm border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 text-[11px] font-bold uppercase tracking-wider"
              data-testid="tr-copy-gmaps"
            >
              <Copy className="w-3.5 h-3.5" /> Copy link
            </button>
            <span className="text-[10px] text-slate-400">
              Opens the Google Maps app on mobile, web on desktop.
            </span>
          </div>
        )}
      </div>

      {/* Saved routes */}
      <div className="bg-white border border-slate-200 rounded-sm p-4">
        <div className="flex items-center gap-2 mb-2">
          <ListChecks className="w-4 h-4 text-slate-700" />
          <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
            Saved routes ({routes.length})
          </span>
        </div>
        {routes.length === 0 ? (
          <div className="text-sm text-slate-400 py-4">Nothing saved yet.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {routes.map((r) => {
              // Recompute the stops in the saved-optimised order so the
              // Google Maps link uses the same sequence as the map polyline.
              const rStops = r.stops || [];
              const ord = Array.isArray(r.optimized_order) && r.optimized_order.length === rStops.length
                ? r.optimized_order.map((i) => rStops[i])
                : rStops;
              const gUrl = buildGoogleMapsUrl(factory, ord);
              return (
              <div key={r.id} className="border border-slate-200 rounded-sm px-3 py-2 flex items-start gap-2" data-testid={`tr-saved-${r.id}`}>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-slate-900 truncate">{r.name}</div>
                  <div className="text-[11px] text-slate-500">
                    {(r.stops || []).length} stops
                    {r.total_distance_km != null && <> · {r.total_distance_km} km</>}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">{(r.created_at || "").slice(0, 16).replace("T", " ")}</div>
                  {gUrl && (
                    <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                      <a
                        href={gUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 h-6 px-2 rounded-sm bg-[#1a73e8] hover:bg-[#155ab5] text-white text-[10px] font-bold uppercase tracking-wider"
                        data-testid={`tr-gmaps-${r.id}`}
                      >
                        <Navigation className="w-3 h-3" /> Google Maps
                      </a>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(gUrl);
                            toast.success("Link copied.");
                          } catch (e) {
                            toast.error("Copy failed");
                          }
                        }}
                        className="inline-flex items-center gap-1 h-6 px-2 rounded-sm border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 text-[10px] font-bold uppercase tracking-wider"
                        data-testid={`tr-gmaps-copy-${r.id}`}
                        title="Copy Google Maps link"
                      >
                        <Copy className="w-3 h-3" /> Copy
                      </button>
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <Button size="sm" variant="outline" className="h-7 rounded-sm text-[11px] px-2"
                          onClick={() => loadSavedRoute(r)} data-testid={`tr-load-${r.id}`}>
                    Load
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 rounded-sm text-[11px] px-2 text-red-600 border-red-200 hover:bg-red-50"
                          onClick={() => deleteSavedRoute(r)} data-testid={`tr-delete-${r.id}`}>
                    Delete
                  </Button>
                </div>
              </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
