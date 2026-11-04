import { useEffect, useState } from "react";
import { isCalendarAvailable } from "~/utils/calendar";

// Om enhedens kalender kan bruges (13.11). Falsk, indtil svaret er kommet, så knappen ikke blinker frem og forsvinder.
export function useCalendarAvailable(): boolean {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void isCalendarAvailable().then((ok) => {
      if (!cancelled) setAvailable(ok);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return available;
}
