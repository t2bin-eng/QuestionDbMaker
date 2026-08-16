import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  deleteLocalDocument,
  deleteLocalExamSet,
  deleteLocalQuestionCard,
  listLocalExamSets,
  listLocalDocuments,
  listLocalQuestionCards,
  saveLocalExamSet,
  saveQuestionClassificationsLocally,
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
  exportLocalDatabaseBackup: vi.fn(),
  importLocalDatabaseBackup: vi.fn(),
  listLocalExamSets: vi.fn().mockResolvedValue([]),
  listLocalDocuments: vi.fn().mockResolvedValue([]),
  listLocalQuestionCards: vi.fn().mockResolvedValue([]),
  readClassificationLocally: vi.fn().mockResolvedValue(null),
  readSourcePdfLocally: vi.fn().mockRejectedValue(new Error("PDF preview is not loaded in this test.")),
  saveQuestionClassificationLocally: vi.fn(),
  saveQuestionClassificationsLocally: vi.fn(),
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
    expect(screen.getByRole("heading", { name: "문항 DB 백업 및 이동" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "DB 백업 내보내기" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "DB 백업 불러오기" })).toBeDisabled();
    expect(screen.getByLabelText("문항 DB 백업 파일")).toHaveAttribute("accept", ".zip,application/zip");
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

  it("opens a full preview and shows answer and explanation availability", async () => {
    vi.mocked(listLocalQuestionCards).mockResolvedValueOnce([{
      id: "doc-1:q-1",
      documentId: "doc-1",
      questionKey: "q-1",
      sourceQuestionNumber: "1",
      sourceName: "한국사.pdf",
      updatedAt: "2026-07-25T00:00:00.000Z",
      classification: null,
      regions: [{ pageNumber: 1, xRatio: 0.05, yRatio: 0.1, widthRatio: 0.4, heightRatio: 0.3, sortOrder: 0 }],
      answerRegions: [{ pageNumber: 1, xRatio: 0.05, yRatio: 0.42, widthRatio: 0.4, heightRatio: 0.05, sortOrder: 0 }],
      explanationRegions: [{ pageNumber: 1, xRatio: 0.05, yRatio: 0.48, widthRatio: 0.4, heightRatio: 0.2, sortOrder: 0 }],
    }]);

    render(<WorkspacePage view="questions" />);
    expect(await screen.findByText("정답 있음")).toBeInTheDocument();
    expect(screen.getByText("해설 있음")).toBeInTheDocument();

    fireEvent.mouseEnter(screen.getByRole("button", { name: "1번 문항 전체 미리보기" }));
    expect(screen.queryByRole("dialog", { name: "1번 문항" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "1번 문항 전체 미리보기" }));
    expect(screen.getByRole("dialog", { name: "1번 문항" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "미리보기 닫기" }));
    expect(screen.queryByRole("dialog", { name: "1번 문항" })).not.toBeInTheDocument();
  });

  it("filters question cards by multiple categories and difficulties", async () => {
    const categoryIds = [
      "category-history-1-1",
      "category-history-1-1-middle-1",
      "category-history-1-3",
      "category-history-1-1",
    ];
    const difficultyIds = ["difficulty-low", "difficulty-mid", "difficulty-high", "difficulty-high"];
    vi.mocked(listLocalQuestionCards).mockResolvedValueOnce(categoryIds.map((categoryId, index) => ({
      id: `doc-1:q-${index + 1}`,
      documentId: "doc-1",
      questionKey: `q-${index + 1}`,
      sourceQuestionNumber: String(index + 1),
      sourceName: "한국사.pdf",
      updatedAt: "2026-07-25T00:00:00.000Z",
      classification: {
        subjectId: "subject-history-1",
        categoryId,
        difficultyOptionId: difficultyIds[index],
        questionTypeOptionId: "type-choice",
        tagIds: [],
        updatedAt: "2026-07-25T00:00:00.000Z",
      },
      regions: [{ pageNumber: 1, xRatio: 0.05, yRatio: 0.1, widthRatio: 0.4, heightRatio: 0.5, sortOrder: 0 }],
    })));

    render(<WorkspacePage view="questions" />);
    await screen.findByText("1번 문항");
    fireEvent.change(screen.getByRole("combobox", { name: "과목 필터" }), { target: { value: "subject-history-1" } });

    const categoryFilter = screen.getByRole("group", { name: "단원 필터" });
    fireEvent.click(within(categoryFilter).getByText("전체 단원"));
    const majorOption = within(categoryFilter).getByRole("checkbox", { name: "근대 이전 한국사의 이해" }).closest("label");
    const middleOption = within(categoryFilter).getByRole("checkbox", { name: "고대 국가의 성장" }).closest("label");
    expect(majorOption).not.toBeNull();
    expect(middleOption).not.toBeNull();
    expect(within(majorOption as HTMLElement).getByText("대단원")).toBeInTheDocument();
    expect(within(majorOption as HTMLElement).getByText("(3)")).toBeInTheDocument();
    expect(within(middleOption as HTMLElement).getByText("중단원")).toBeInTheDocument();
    expect(within(middleOption as HTMLElement).getByText("(1)")).toBeInTheDocument();
    fireEvent.click(within(categoryFilter).getByRole("checkbox", { name: "근대 이전 한국사의 이해" }));
    fireEvent.click(within(categoryFilter).getByRole("checkbox", { name: "근대 국가 수립의 노력" }));

    expect(screen.getByText("1번 문항")).toBeInTheDocument();
    expect(screen.getByText("2번 문항")).toBeInTheDocument();
    expect(screen.getByText("3번 문항")).toBeInTheDocument();
    expect(screen.getByText("4번 문항")).toBeInTheDocument();

    const difficultyFilter = screen.getByRole("group", { name: "난이도 필터" });
    fireEvent.click(within(difficultyFilter).getByText("전체 난이도"));
    fireEvent.click(within(difficultyFilter).getByRole("checkbox", { name: "하" }));

    expect(screen.getByText("1번 문항")).toBeInTheDocument();
    expect(screen.queryByText("3번 문항")).not.toBeInTheDocument();
    expect(screen.queryByText("4번 문항")).not.toBeInTheDocument();

    fireEvent.click(within(difficultyFilter).getByRole("checkbox", { name: "상" }));
    expect(screen.getByText("1번 문항")).toBeInTheDocument();
    expect(screen.getByText("3번 문항")).toBeInTheDocument();
    expect(screen.getByText("4번 문항")).toBeInTheDocument();
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

  it("applies one classification to all selected question cards", async () => {
    vi.mocked(listLocalQuestionCards).mockResolvedValueOnce([
      {
        id: "doc-1:q-1",
        documentId: "doc-1",
        questionKey: "q-1",
        sourceQuestionNumber: "1",
        sourceName: "한국사.pdf",
        updatedAt: "2026-07-25T00:00:00.000Z",
        classification: null,
        regions: [{ pageNumber: 1, xRatio: 0.05, yRatio: 0.1, widthRatio: 0.4, heightRatio: 0.5, sortOrder: 0 }],
      },
      {
        id: "doc-1:q-2",
        documentId: "doc-1",
        questionKey: "q-2",
        sourceQuestionNumber: "2",
        sourceName: "한국사.pdf",
        updatedAt: "2026-07-25T00:00:00.000Z",
        classification: null,
        regions: [{ pageNumber: 1, xRatio: 0.55, yRatio: 0.1, widthRatio: 0.4, heightRatio: 0.5, sortOrder: 0 }],
      },
    ]);
    const savedClassification = {
      subjectId: "subject-history-1",
      categoryId: "category-history-1-1",
      difficultyOptionId: "difficulty-mid",
      questionTypeOptionId: "type-choice",
      tagIds: ["tag-source"],
      updatedAt: "2026-07-25T01:00:00.000Z",
    };
    vi.mocked(saveQuestionClassificationsLocally).mockResolvedValueOnce({
      "doc-1:q-1": savedClassification,
      "doc-1:q-2": savedClassification,
    });

    render(<WorkspacePage view="questions" />);
    fireEvent.click(await screen.findByRole("checkbox", { name: "검색 결과 전체 선택" }));
    fireEvent.click(screen.getByRole("button", { name: "일괄 분류" }));

    const dialog = screen.getByRole("dialog", { name: "선택 문항 일괄 분류" });
    expect(dialog).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: "일괄 분류 단원" }), { target: { value: "category-history-1-1" } });
    fireEvent.change(screen.getByRole("combobox", { name: "일괄 분류 난이도" }), { target: { value: "difficulty-mid" } });
    fireEvent.change(screen.getByRole("combobox", { name: "일괄 분류 문항 유형" }), { target: { value: "type-choice" } });
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "사료 분석" }));
    fireEvent.click(screen.getByRole("button", { name: "2개 문항에 적용" }));

    await waitFor(() => expect(saveQuestionClassificationsLocally).toHaveBeenCalledWith(
      ["doc-1:q-1", "doc-1:q-2"],
      {
        subjectId: "subject-history-1",
        categoryId: "category-history-1-1",
        difficultyOptionId: "difficulty-mid",
        questionTypeOptionId: "type-choice",
        tagIds: ["tag-source"],
      },
    ));
    expect(screen.queryByRole("dialog", { name: "선택 문항 일괄 분류" })).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("2개 문항의 분류를 저장했습니다.");
    const firstCard = screen.getByText("1번 문항").closest("article");
    const secondCard = screen.getByText("2번 문항").closest("article");
    expect(firstCard).not.toBeNull();
    expect(secondCard).not.toBeNull();
    expect(within(firstCard as HTMLElement).getByText("한국사1")).toBeInTheDocument();
    expect(within(secondCard as HTMLElement).getByText("한국사1")).toBeInTheDocument();
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
