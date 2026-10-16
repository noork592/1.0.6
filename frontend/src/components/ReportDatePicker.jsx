import React, { useState, useEffect, memo } from "react";
import { Calendar as CalendarUI } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Calendar } from "lucide-react";

// "YYYY-MM-DD" -> Date (local midnight, no TZ shift). Falls back to today.
function ymdToDate(s) {
  const [y, m, d] = (s || "").split("-").map(Number);
  return y ? new Date(y, m - 1, d) : new Date();
}
function toYmd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

/**
 * Self-contained date picker for the Dispatch Report.
 *
 * WHY THIS EXISTS: the report page can render a very large DOM. Previously the
 * calendar's open/month state lived in the DailyReport component, so every time
 * the calendar opened or a month was navigated, the ENTIRE report re-rendered —
 * making the picker feel sluggish on long reports. By owning the popover + month
 * state here (and being wrapped in React.memo), opening/navigating the calendar
 * only re-renders this small component, never the big report list.
 *
 * The displayed month always snaps back to the selected date whenever the
 * popover opens (fixes "reopen shows current month, not the selected month").
 */
function ReportDatePickerBase({ value, onSelect, testIdPrefix = "report-date" }) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(ymdToDate(value));

  useEffect(() => {
    if (open) setMonth(ymdToDate(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          data-testid={`${testIdPrefix}-input`}
          className="h-10 rounded-sm border-slate-300 bg-white font-mono-num text-slate-900 pl-9 pr-3 justify-start relative min-w-[150px]"
        >
          <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          {value}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto p-0 rounded-sm"
        align="start"
        data-testid={`${testIdPrefix}-popover`}
      >
        <CalendarUI
          mode="single"
          size="lg"
          month={month}
          onMonthChange={setMonth}
          selected={ymdToDate(value)}
          onSelect={(d) => {
            if (!d) return;
            const ok = onSelect(toYmd(d));
            // onSelect may return false to reject (e.g. end < start); keep open.
            if (ok !== false) setOpen(false);
          }}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}

export default memo(ReportDatePickerBase);
