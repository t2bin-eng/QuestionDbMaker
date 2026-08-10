import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  deleteLocalDocument,
  deleteLocalExamSet,
  deleteLocalQuestionCard,
  listLocalExamSets,
  listLocalDocuments,
  listLocalQuestionCards,
  saveLocalExamSet,
} from "@/lib/local-file-store";
import { WorkspacePage } from "./workspace-page";

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock("@/lib/local-file-store", () => ({
  getLocalFolderState: vi.fn().mockResolvedValue({
    supported: true,
    configured: false,
    name: null,
    permission: "prompt",
  }),
  deleteLocalDocument: vi.fn().mockResolvedValue(undefined),
  deleteLocalExamSet: vi.fn().mockResolvedValue(undefined),
  deleteLocalQuestionCard: vi.fn().mockResolvedValue(undefined),
  listLocalExamSets: vi.fn().mockResolvedValue([]),
  listLocalDocuments: vi.fn().mockResolvedValue([]),
  listLocalQuestionCards: vi.fn().mockResolvedValue([]),
  readClassificationLocally: vi.fn().mockResolvedValue(null),
  readSourcePdfLocally: vi.fn().mockRejectedValue(new Error("PDF preview is not loaded in this test.")),
  saveQuestionClassificationLocally: vi.fn(),
  saveLocalExamSet: vi.fn(),
  saveSourcePdfLocally: vi.fn(),
  selectLocalRootDirectory: vi.fn(),
}));

describe("WorkspacePage local storage UI", () => {
  beforeEach(() => {
    localStorage.clear();
    pushMock.mockClear();
    vi.mocked(deleteLocalDocument).mockClear();
    vi.mocked(deleteLocalExamSet).mockClear();
    vi.mocked(deleteLocalQuestionCard).mockClear();
    vi.mocked(listLocalExamSets).mockResolvedValue([]);
    vi.mocked(saveLocalExamSet).mockClear();
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  it("shows the local storage settings", async () => {
    render(<WorkspacePage view="settings" />);
    expect(screen.getByRole("heading", { name: "PC 로컬 파일 저장소" })).toBeInTheDocument();
    expect(await screen.findByText("선택되지 않음")).toBeInTheDocument();
    expect(screen.getByText(/Firebase Storage와 Blaze 결제 등록은 필요하지 않습니다/)).toBeInTheDocument();
  });

  it("opens the PDF upload dialog with local folder controls", () => {
    render(<WorkspacePage view="documents" />);
    fireEvent.click(screen.getByRole("button", { name: "PDF 업로드" }));
    expect(screen.getByRole("dialog", { name: "PDF 문서 업로드" })).toBeInTheDocument();
    expect(screen.getByText("PC 저장 폴더")).toBeInTheDocument();
    expect(screen.getByText(/원본 PDF는 선택한 PC 폴더에만 저장됩니다/)).toBeInTheDocument();
  });

  it("shows the saved review status from the local draft", async () => {
    vi.mocked(listLocalDocuments).mockResolvedValueOnce([{
      documentId: "doc-1",
      fileName: "한국사.pdf",
      pageCount: 41,
      regionCount: 100,
      pendingReviewCount: 0,
      updatedAt: "2026-07-25T00:00:00.000Z",
    }]);

    render(<WorkspacePage view="documents" />);

    expect(await screen.findByRole("link", { name: "한국사.pdf" })).toHaveAttribute("href", "/documents/doc-1/review");
    expect(screen.getByText("완료")).toBeInTheDocument();
    expect(screen.queryByText(/검토 필요/)).not.toBeInTheDocument();
  });

  it("deletes a PDF document after confirmation", async () => {
    vi.mocked(listLocalDocuments).mockResolvedValueOnce([{
      documentId: "doc-1",
      fileName: "한국사.pdf",
      pageCount: 41,
      regionCount: 100,
      pendingReviewCount: 0,
      updatedAt: "2026-07-25T00:00:00.000Z",
    }]);

    render(<WorkspacePage view="documents" />);
    fireEvent.click(await screen.findByRole("button", { name: "한국사.pdf 삭제" }));

    await waitFor(() => expect(deleteLocalDocument).toHaveBeenCalledWith("doc-1"));
    expect(screen.queryByRole("link", { name: "한국사.pdf" })).not.toBeInTheDocument();
  });

  it("shows reviewed local questions as question cards", async () => {
    vi.mocked(listLocalQuestionCards).mockResolvedValueOnce([{
      id: "doc-1:q-1",
      documentId: "doc-1",
      questionKey: "q-1",
      sourceQuestionNumber: "1",
      sourceName: "한국사.pdf",
      updatedAt: "2026-07-25T00:00:00.000Z",
      classification: null,
      regions: [{
        pageNumber: 1,
        xRatio: 0.05,
        yRatio: 0.1,
        widthRatio: 0.4,
        heightRatio: 0.5,
        sortOrder: 0,
      }],
    }]);

    render(<WorkspacePage view="questions" />);

    expect(await screen.findByText("1번 문항")).toBeInTheDocument();
    expect(screen.getByText("한국사.pdf")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "영역 편집" })).toHaveAttribute("href", "/documents/doc-1/review");

    fireEvent.click(screen.getByRole("checkbox", { name: "1번 문항" }));
    fireEvent.click(screen.getByRole("button", { name: "1개 문제지에 담기" }));
    expect(JSON.parse(localStorage.getItem("question-card-studio:exam-selection") ?? "[]")).toEqual(["doc-1:q-1"]);
    expect(pushMock).toHaveBeenCalledWith("/exam-sets");
  });

  it("deletes a question card without deleting its source document", async () => {
    vi.mocked(listLocalQuestionCards).mockResolvedValueOnce([{
      id: "doc-1:q-1",
      documentId: "doc-1",
      questionKey: "q-1",
      sourceQuestionNumber: "1",
      sourceName: "한국사.pdf",
      updatedAt: "2026-07-25T00:00:00.000Z",
      classification: null,
      regions: [{
        pageNumber: 1,
        xRatio: 0.05,
        yRatio: 0.1,
        widthRatio: 0.4,
        heightRatio: 0.5,
        sortOrder: 0,
      }],
    }]);

    render(<WorkspacePage view="questions" />);
    fireEvent.click(await screen.findByRole("button", { name: "삭제" }));

    await waitFor(() => expect(deleteLocalQuestionCard).toHaveBeenCalledWith("doc-1", "q-1", "doc-1:q-1"));
    expect(screen.queryByText("1번 문항")).not.toBeInTheDocument();
  });

  it("selects all filtered question cards and deletes them in bulk", async () => {
    vi.mocked(listLocalQuestionCards).mockResolvedValueOnce([
      {
        id: "doc-1:q-1",
        documentId: "doc-1",
        questionKey: "q-1",
        sourceQuestionNumber: "1",
        sourceName: "한국사.pdf",
        updatedAt: "2026-07-25T00:00:00.000Z",
        classification: null,
        regions: [{
          pageNumber: 1,
          xRatio: 0.05,
          yRatio: 0.1,
          widthRatio: 0.4,
          heightRatio: 0.5,
          sortOrder: 0,
        }],
      },
      {
        id: "doc-1:q-2",
        documentId: "doc-1",
        questionKey: "q-2",
        sourceQuestionNumber: "2",
        sourceName: "한국사.pdf",
        updatedAt: "2026-07-25T00:00:00.000Z",
        classification: null,
        regions: [{
          pageNumber: 1,
          xRatio: 0.55,
          yRatio: 0.1,
          widthRatio: 0.4,
          heightRatio: 0.5,
          sortOrder: 0,
        }],
      },
    ]);

    render(<WorkspacePage view="questions" />);
    const selectAll = await screen.findByRole("checkbox", { name: "검색 결과 전체 선택" });
    fireEvent.click(selectAll);
    expect(screen.getByRole("checkbox", { name: "1번 문항" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "2번 문항" })).toBeChecked();

    fireEvent.click(screen.getByRole("button", { name: "선택 삭제" }));

    await waitFor(() => expect(deleteLocalQuestionCard).toHaveBeenCalledTimes(2));
    expect(deleteLocalQuestionCard).toHaveBeenNthCalledWith(1, "doc-1", "q-1", "doc-1:q-1");
    expect(deleteLocalQuestionCard).toHaveBeenNthCalledWith(2, "doc-1", "q-2", "doc-1:q-2");
    expect(screen.queryByText("1번 문항")).not.toBeInTheDocument();
    expect(screen.queryByText("2번 문항")).not.toBeInTheDocument();
  });

  it("removes a question from the current exam without deleting the card", async () => {
    const card = {
      id: "doc-1:q-1",
      documentId: "doc-1",
      questionKey: "q-1",
      sourceQuestionNumber: "1",
      sourceName: "한국사.pdf",
      updatedAt: "2026-07-25T00:00:00.000Z",
      classification: null,
      regions: [{
        pageNumber: 1,
        xRatio: 0.05,
        yRatio: 0.1,
        widthRatio: 0.4,
        heightRatio: 0.5,
        sortOrder: 0,
      }],
    };
    localStorage.setItem("question-card-studio:exam-selection", JSON.stringify([card.id]));
    vi.mocked(listLocalQuestionCards).mockResolvedValueOnce([card]);

    render(<WorkspacePage view="exam-sets" />);
    fireEvent.click(await screen.findByRole("button", { name: "1번 문항 문제지에서 제거" }));

    await waitFor(() => {
      expect(JSON.parse(localStorage.getItem("question-card-studio:exam-selection") ?? "[]")).toEqual([]);
    });
    expect(deleteLocalQuestionCard).not.toHaveBeenCalled();
  });

  it("lists, loads, and deletes saved exam sets", async () => {
    vi.mocked(listLocalExamSets).mockResolvedValueOnce([
      {
        id: "exam-1",
        name: "1학기 중간고사",
        school: "한빛고",
        subject: "한국사1",
        grade: "1학년",
        examName: "1학기 중간고사",
        examDate: "2026-07-25",
        questionsPerPage: 4,
        showStudentFields: true,
        showScores: true,
        questionIds: [],
        scores: {},
        createdAt: "2026-07-25T00:00:00.000Z",
        updatedAt: "2026-07-25T01:00:00.000Z",
      },
    ]);

    render(<WorkspacePage view="exam-sets" />);
    expect(await screen.findByText("1학기 중간고사")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "불러오기" }));
    expect(screen.getByText("편집 중")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "1학기 중간고사 문제지 삭제" }));
    await waitFor(() => expect(deleteLocalExamSet).toHaveBeenCalledWith("exam-1"));
    expect(screen.queryByRole("button", { name: "1학기 중간고사 문제지 삭제" })).not.toBeInTheDocument();
  });
});
