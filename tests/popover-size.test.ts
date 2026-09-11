import { afterEach, describe, expect, it, vi } from "vitest";
import { popoverHeight } from "../src/renderer/popover-size";

afterEach(() => vi.unstubAllGlobals());

type Box = {
  className: string;
  offsetHeight: number;
  scrollHeight: number;
  children: Box[];
};

function box(className: string, offsetHeight: number, children: Box[] = []): Box {
  return { className, offsetHeight, scrollHeight: offsetHeight, children };
}

function measure(list: Box, frame = box("events-popover", 0)) {
  vi.stubGlobal("getComputedStyle", (element: Box) => {
    if (element.className.includes("events-popover")) {
      return { paddingTop: "8px", paddingBottom: "8px", marginTop: "0", marginBottom: "0" };
    }
    return { paddingTop: "0", paddingBottom: "0", marginTop: "0", marginBottom: "0" };
  });
  const root = {
    querySelector: (selector: string) => {
      if (selector === ".events-popover") return frame;
      return null;
    },
  };
  return popoverHeight(list as unknown as HTMLElement, root as unknown as ParentNode);
}

describe("events popover height", () => {
  it("sizes from the rows, not the stretched list that already fills the window", () => {
    const rows = [box("section-label", 16), box("event", 24)];
    const list = box("list", 400, rows);
    list.scrollHeight = 400;
    // 16 + 24 rows, 8 + 8 padding, 1px slack
    expect(measure(list)).toBe(57);
  });

  it("stays put when the same rows are measured after the window has grown", () => {
    const rows = [box("section-label", 16), box("event", 24), box("event", 24)];
    const first = box("list", 64, rows);
    first.scrollHeight = 64;
    const again = box("list", 300, rows);
    again.scrollHeight = 300;
    expect(measure(again)).toBe(measure(first));
  });
});
