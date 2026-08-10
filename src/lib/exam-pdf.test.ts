import { describe, expect, it } from "vitest";
import { calculateQuestionSlots } from "./exam-pdf";

describe("calculateQuestionSlots", () => {
  it("fills the left column top-to-bottom before the right column", () => {
    const slots = calculateQuestionSlots(4);
    expect(slots).toHaveLength(4);
    expect(slots[0].x).toBe(slots[1].x);
    expect(slots[2].x).toBe(slots[3].x);
    expect(slots[0].y).toBe(slots[2].y);
    expect(slots[1].y).toBe(slots[3].y);
    expect(slots[1].y).toBeGreaterThan(slots[0].y);
    expect(slots[2].x).toBeGreaterThan(slots[0].x);
  });

  it("fills three rows vertically before moving to the second column", () => {
    const slots = calculateQuestionSlots(6);
    expect(slots).toHaveLength(6);
    expect(new Set(slots.map((slot) => slot.x)).size).toBe(2);
    expect(new Set(slots.map((slot) => slot.y)).size).toBe(3);
    expect(slots[0].x).toBe(slots[1].x);
    expect(slots[1].x).toBe(slots[2].x);
    expect(slots[3].x).toBeGreaterThan(slots[2].x);
    expect(slots[0].y).toBe(slots[3].y);
    slots.forEach((slot) => {
      expect(slot.width).toBeGreaterThan(650);
      expect(slot.height).toBeGreaterThan(550);
    });
  });
});
