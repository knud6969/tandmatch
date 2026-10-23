import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startVisiblePolling, type VisibilitySource } from "@/platform/ui-utils/polling";

function fakeDoc(state: string) {
  let listener: (() => void) | null = null;
  const doc: VisibilitySource = {
    visibilityState: state,
    addEventListener: (_t, l) => {
      listener = l;
    },
    removeEventListener: () => {
      listener = null;
    },
  };
  return {
    doc,
    set: (s: string) => {
      doc.visibilityState = s;
      listener?.();
    },
    hasListener: () => listener !== null,
  };
}

describe("startVisiblePolling", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("kalder med interval, mens fanen er synlig", () => {
    const tick = vi.fn();
    const d = fakeDoc("visible");
    startVisiblePolling(tick, 1000, d.doc);
    vi.advanceTimersByTime(3000);
    expect(tick).toHaveBeenCalledTimes(3);
  });

  it("poller ikke, når fanen er skjult, og henter straks ved synlig", () => {
    const tick = vi.fn();
    const d = fakeDoc("visible");
    startVisiblePolling(tick, 1000, d.doc);
    d.set("hidden");
    vi.advanceTimersByTime(5000);
    expect(tick).not.toHaveBeenCalled();
    d.set("visible");
    expect(tick).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1000);
    expect(tick).toHaveBeenCalledTimes(2);
  });

  it("starter ikke, hvis fanen er skjult fra start, og stopper ved oprydning", () => {
    const tick = vi.fn();
    const d = fakeDoc("hidden");
    const stop = startVisiblePolling(tick, 1000, d.doc);
    vi.advanceTimersByTime(3000);
    expect(tick).not.toHaveBeenCalled();
    d.set("visible");
    stop();
    vi.advanceTimersByTime(3000);
    expect(tick).toHaveBeenCalledTimes(1);
    expect(d.hasListener()).toBe(false);
  });
});
