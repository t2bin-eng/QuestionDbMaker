import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { UploadPanel } from "@/components/pdf/upload-panel";

describe("UploadPanel", () => {
  it("accepts a PDF file", () => {
    render(<UploadPanel />);
    const input = screen.getByLabelText("문제지 PDF", { selector: "input" });
    const file = new File(["pdf"], "시험지.pdf", { type: "application/pdf" });
    fireEvent.change(input, { target: { files: [file] } });
    expect(screen.getByText("시험지.pdf")).toBeInTheDocument();
  });
});
