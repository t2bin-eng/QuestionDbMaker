import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { EditableRegion } from "@/lib/question-detection";
import { ReviewRegionList } from "./pdf-review-editor";

const regions: EditableRegion[] = [
  {
    id: "question-1",
    questionKey: "question-1",
    questionNumber: "1",
    pageNumber: 1,
    xRatio: 0.1,
    yRatio: 0.1,
    widthRatio: 0.4,
    heightRatio: 0.2,
    regionType: "question",
    sortOrder: 0,
    status: "needs_review",
  },
  {
    id: "answer-1",
    questionKey: "question-1",
    questionNumber: "1",
    pageNumber: 1,
    xRatio: 0.1,
    yRatio: 0.32,
    widthRatio: 0.4,
    heightRatio: 0.06,
    regionType: "answer",
    sortOrder: 0,
    status: "reviewed",
  },
];

describe("ReviewRegionList", () => {
  it("deletes the exact region when its minus button is clicked", () => {
    const onSelect = vi.fn();
    const onDelete = vi.fn();

    render(
      <ReviewRegionList
        regions={regions}
        selectedId="question-1"
        onSelect={onSelect}
        onDelete={onDelete}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "1번 문제 영역 삭제" }));

    expect(onDelete).toHaveBeenCalledOnce();
    expect(onDelete).toHaveBeenCalledWith("question-1");
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("keeps card selection separate from the delete button", () => {
    const onSelect = vi.fn();
    const onDelete = vi.fn();

    render(
      <ReviewRegionList
        regions={regions}
        selectedId={null}
        onSelect={onSelect}
        onDelete={onDelete}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "1번 정답 영역 선택" }));

    expect(onSelect).toHaveBeenCalledWith(regions[1]);
    expect(onDelete).not.toHaveBeenCalled();
  });
});
