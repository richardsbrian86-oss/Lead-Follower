import { useState, useCallback, useEffect, useRef } from "react";

const STORAGE_KEY = "dismissedLeads";

/**
 * Returns today's date as "YYYY-MM-DD" in the **local** timezone.
 * Using local date means the reset occurs at the staff member's local midnight,
 * not UTC midnight.
 */
function getTodayKey(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/** Milliseconds until the next local midnight. */
function msUntilLocalMidnight(): number {
  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  return midnight.getTime() - now.getTime();
}

function readStorage(): Set<number> {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as { date: string; ids: number[] };
    // Stale date → treat as empty (covers page load on a new day)
    if (parsed.date !== getTodayKey()) return new Set();
    return new Set(parsed.ids);
  } catch {
    return new Set();
  }
}

function writeStorage(ids: Set<number>): void {
  try {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ date: getTodayKey(), ids: [...ids] }),
    );
  } catch {
    // sessionStorage unavailable in some contexts; fail silently
  }
}

function clearStorage(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/**
 * Call this from any page (e.g. lead-detail) to persist a dismissal without
 * needing the React hook. The ActionQueue picks it up on next mount/re-render.
 */
export function dismissLeadForToday(leadId: number): void {
  const ids = readStorage();
  ids.add(leadId);
  writeStorage(ids);
}

/**
 * React hook for the ActionQueue component.
 *
 * - Initialises dismissed set from sessionStorage on mount.
 * - Schedules a timer to clear the set at the next **local** midnight so a
 *   dashboard left open overnight doesn't carry yesterday's dismissals forward.
 * - Guards `dismiss()` against a rare midnight race: if the calendar date has
 *   changed since the last write, it starts fresh instead of re-persisting
 *   stale IDs under the new date key.
 */
export function useDismissedLeads() {
  const [dismissed, setDismissed] = useState<Set<number>>(() => readStorage());
  // Track the date key that corresponds to the current in-memory dismissed set.
  const activeDateKey = useRef(getTodayKey());

  useEffect(() => {
    // Recursively schedule a reset at each successive local midnight.
    let timer: ReturnType<typeof setTimeout>;

    const scheduleReset = () => {
      timer = setTimeout(() => {
        // Clear in-memory state and sessionStorage so yesterday's dismissals
        // don't bleed into the new day.
        setDismissed(new Set());
        clearStorage();
        activeDateKey.current = getTodayKey();
        scheduleReset(); // arm the next midnight
      }, msUntilLocalMidnight());
    };

    scheduleReset();
    return () => clearTimeout(timer);
  }, []);

  const dismiss = useCallback((leadId: number) => {
    setDismissed((prev) => {
      const today = getTodayKey();

      // If the calendar has rolled past midnight while the component was mounted
      // (rare race), start a fresh set rather than merging yesterday's IDs.
      if (activeDateKey.current !== today) {
        activeDateKey.current = today;
        const fresh = new Set<number>([leadId]);
        writeStorage(fresh);
        return fresh;
      }

      const next = new Set(prev);
      next.add(leadId);
      writeStorage(next);
      return next;
    });
  }, []);

  const undoDismiss = useCallback((leadId: number) => {
    setDismissed((prev) => {
      const today = getTodayKey();

      // If the calendar has rolled past midnight, yesterday's set is already
      // invalid. Clear it instead of writing an empty set under today's key.
      if (activeDateKey.current !== today) {
        activeDateKey.current = today;
        clearStorage();
        return new Set<number>();
      }

      const next = new Set(prev);
      next.delete(leadId);
      if (next.size === 0) {
        clearStorage();
      } else {
        writeStorage(next);
      }
      return next;
    });
  }, []);

  return { dismissed, dismiss, undoDismiss };
}
