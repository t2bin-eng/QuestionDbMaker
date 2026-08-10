"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist/types/src/display/api";
import {
  BookOpen, CircleUserRound, Eye, FileOutput, FileText, Filter, FolderTree,
  FolderOpen, HardDrive, Heart, Home, LayoutGrid, LoaderCircle, Plus, Search,
  RotateCcw, Settings, Sparkles, Tags, Trash2, Upload, X,
} from "lucide-react";
import { validatePdfFile } from "@/lib/files";
import {
  getLocalFolderState,
  deleteLocalDocument,
  deleteLocalExamSet,
  deleteLocalQuestionCard,
  listLocalExamSets,
  listLocalDocuments,
  listLocalQuestionCards,
  readClassificationLocally,
  readSourcePdfLocally,
  saveGeneratedPdfLocally,
  saveGeneratedHwpxLocally,
  saveLocalExamSet,
  saveQuestionClassificationLocally,
  saveQuestionClassificationsLocally,
  saveSourcePdfLocally,
  selectLocalRootDirectory,
  type LocalDocumentSummary,
  type LocalExamSet,
  type LocalFolderState,
  type LocalQuestionCardSummary,
  type QuestionClassification,
} from "@/lib/local-file-store";
import { createHwpxPackage, type HwpxQuestionImage } from "@/lib/hwpx";
import { CategoriesManager } from "@/components/categories-manager";
import { createExamPdf, type ExamPdfQuestion } from "@/lib/exam-pdf";
import {
  createDefaultClassificationData,
  mergeDefaultClassificationData,
  sortByOrder,
  flattenCategoryTree,
  type ClassificationData,
  type SubjectDefinition,
} from "@/lib/classification";

type View = "dashboard" | "documents" | "questions" | "exam-sets" | "categories" | "settings";
const EXAM_SELECTION_KEY = "question-card-studio:exam-selection";

const nav = [
  { id: "dashboard", label: "대시보드", href: "/dashboard", icon: Home },
  { id: "documents", label: "PDF 문서", href: "/documents", icon: FileText },
  { id: "questions", label: "문항 카드", href: "/questions", icon: LayoutGrid },
  { id: "exam-sets", label: "문제지 제작", href: "/exam-sets", icon: BookOpen },
  { id: "categories", label: "분류 체계", href: "/categories", icon: FolderTree },
  { id: "settings", label: "설정", href: "/settings", icon: Settings },
] as const;

const questionPdfCache = new Map<string, Promise<PDFDocumentProxy>>();

function trimCanvasWhitespace(source: HTMLCanvasElement, padding = 18) {
  const context = source.getContext("2d", { willReadFrequently: true });
  if (!context || !source.width || !source.height) return source;
  const pixels = context.getImageData(0, 0, source.width, source.height).data;
  let minX = source.width;
  let minY = source.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      const offset = (y * source.width + x) * 4;
      const red = pixels[offset];
      const green = pixels[offset + 1];
      const blue = pixels[offset + 2];
      const alpha = pixels[offset + 3];
      const darkest = Math.min(red, green, blue);
      const lightest = Math.max(red, green, blue);
      const isInk = alpha > 20 && (darkest < 238 || (lightest - darkest > 18 && darkest < 248));
      if (!isInk) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < minX || maxY < minY) return source;
  minX = Math.max(0, minX - padding);
  minY = Math.max(0, minY - padding);
  maxX = Math.min(source.width - 1, maxX + padding);
  maxY = Math.min(source.height - 1, maxY + padding);
  if (minX === 0 && minY === 0 && maxX === source.width - 1 && maxY === source.height - 1) return source;

  const trimmed = document.createElement("canvas");
  trimmed.width = maxX - minX + 1;
  trimmed.height = maxY - minY + 1;
  const trimmedContext = trimmed.getContext("2d");
  if (!trimmedContext) return source;
  trimmedContext.fillStyle = "#ffffff";
  trimmedContext.fillRect(0, 0, trimmed.width, trimmed.height);
  trimmedContext.drawImage(
    source,
    minX,
    minY,
    trimmed.width,
    trimmed.height,
    0,
    0,
    trimmed.width,
    trimmed.height,
  );
  return trimmed;
}

function getQuestionPdf(documentId: string) {
  const cached = questionPdfCache.get(documentId);
  if (cached) return cached;
  const loading = (async () => {
    const [file, pdfjs] = await Promise.all([
      readSourcePdfLocally(documentId),
      import("pdfjs-dist"),
    ]);
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
    return pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  })();
  questionPdfCache.set(documentId, loading);
  return loading;
}

async function renderQuestionCardPreview(
  card: LocalQuestionCardSummary,
  output: HTMLCanvasElement,
  scale = 1.35,
) {
  const pdf = await getQuestionPdf(card.documentId);
  const gap = Math.max(12, Math.round(scale * 9));
  const segments: HTMLCanvasElement[] = [];

  for (const region of card.regions) {
    const page = await pdf.getPage(region.pageNumber);
    const viewport = page.getViewport({ scale });
    const pageCanvas = document.createElement("canvas");
    pageCanvas.width = Math.ceil(viewport.width);
    pageCanvas.height = Math.ceil(viewport.height);
    const pageContext = pageCanvas.getContext("2d");
    if (!pageContext) throw new Error("문항 카드 미리보기를 만들 수 없습니다.");
    await page.render({ canvas: pageCanvas, canvasContext: pageContext, viewport }).promise;

    const sourceX = Math.max(0, Math.floor(region.xRatio * viewport.width));
    const sourceY = Math.max(0, Math.floor(region.yRatio * viewport.height));
    const sourceWidth = Math.max(1, Math.min(
      pageCanvas.width - sourceX,
      Math.ceil(region.widthRatio * viewport.width),
    ));
    const sourceHeight = Math.max(1, Math.min(
      pageCanvas.height - sourceY,
      Math.ceil(region.heightRatio * viewport.height),
    ));
    const segment = document.createElement("canvas");
    segment.width = sourceWidth;
    segment.height = sourceHeight;
    segment.getContext("2d")?.drawImage(
      pageCanvas,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      0,
      0,
      sourceWidth,
      sourceHeight,
    );
    segments.push(trimCanvasWhitespace(segment, Math.max(12, Math.round(scale * 8))));
  }

  output.width = Math.max(...segments.map((segment) => segment.width));
  output.height = segments.reduce((height, segment) => height + segment.height, 0) + gap * Math.max(0, segments.length - 1);
  const outputContext = output.getContext("2d");
  if (!outputContext) throw new Error("문항 카드 캔버스를 만들 수 없습니다.");
  outputContext.fillStyle = "#ffffff";
  outputContext.fillRect(0, 0, output.width, output.height);
  let top = 0;
  for (const segment of segments) {
    outputContext.drawImage(segment, Math.floor((output.width - segment.width) / 2), top);
    top += segment.height + gap;
  }
}

async function renderQuestionCardCanvas(card: LocalQuestionCardSummary, score: number | null) {
  const renderedCanvas = document.createElement("canvas");
  await renderQuestionCardPreview(card, renderedCanvas, 2.6);
  const canvas = score === null ? renderedCanvas : document.createElement("canvas");
  if (score !== null) {
    const scoreBarHeight = Math.max(36, Math.round(renderedCanvas.width * 0.045));
    canvas.width = renderedCanvas.width;
    canvas.height = renderedCanvas.height + scoreBarHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("배점을 문항 이미지에 표시하지 못했습니다.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#202622";
    context.font = `600 ${Math.max(24, Math.round(scoreBarHeight * 0.62))}px sans-serif`;
    context.textAlign = "right";
    context.textBaseline = "middle";
    context.fillText(`[${score}점]`, canvas.width - 8, scoreBarHeight / 2);
    context.drawImage(renderedCanvas, 0, scoreBarHeight);
  }
  return canvas;
}

async function renderQuestionCardPng(card: LocalQuestionCardSummary, score: number | null) {
  const canvas = await renderQuestionCardCanvas(card, score);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => {
      if (result) resolve(result);
      else reject(new Error("문항 이미지를 PNG로 변환하지 못했습니다."));
    }, "image/png");
  });
  return {
    data: new Uint8Array(await blob.arrayBuffer()),
    width: canvas.width,
    height: canvas.height,
  };
}

function QuestionCardPreview({ card }: { card: LocalQuestionCardSummary }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setVisible(true);
        observer.disconnect();
      }
    }, { rootMargin: "300px" });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || !canvasRef.current) return;
    let cancelled = false;
    void renderQuestionCardPreview(card, canvasRef.current).catch(() => {
      if (!cancelled) setError(true);
    });
    return () => { cancelled = true; };
  }, [card, visible]);

  return (
    <div ref={containerRef} className="grid h-64 place-items-center overflow-hidden border-b border-[#e3e8e4] bg-[#f1f3ef] p-3">
      {!visible && <LoaderCircle className="animate-spin text-[#84918a]" size={22} />}
      {error
        ? <p className="px-4 text-center text-xs text-[#8a5d22]">미리보기를 불러오지 못했습니다.<br />PC 폴더 권한을 확인해 주세요.</p>
        : <canvas ref={canvasRef} className={`max-h-full max-w-full bg-white shadow-sm ${visible ? "block" : "hidden"}`} />}
    </div>
  );
}

function Button({ children, disabled = false, onClick, variant = "default", type = "button" }: {
  children: React.ReactNode; disabled?: boolean; onClick?: () => void; variant?: "default" | "primary" | "soft"; type?: "button" | "submit";
}) {
  const palette = variant === "primary"
    ? "border-[#1f6b4f] bg-[#1f6b4f] text-white hover:bg-[#18553f]"
    : variant === "soft"
      ? "border-transparent bg-[#dcefe5] text-[#1f6b4f] hover:bg-[#cde6d7]"
      : "border-[#e3e8e4] bg-white text-[#18201d] hover:bg-[#fafbf9]";
  return <button type={type} disabled={disabled} onClick={onClick} className={`focus-ring inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-45 ${palette}`}>{children}</button>;
}

function UploadModal({ onClose }: { onClose: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [copyright, setCopyright] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [folder, setFolder] = useState<LocalFolderState | null>(null);
  const [savedDocumentId, setSavedDocumentId] = useState<string | null>(null);

  useEffect(() => {
    void getLocalFolderState().then(setFolder);
  }, []);

  async function chooseFolder() {
    try {
      await selectLocalRootDirectory();
      setFolder(await getLocalFolderState());
      setMessage("로컬 저장 폴더가 연결되었습니다.");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setMessage(error instanceof Error ? error.message : "저장 폴더를 연결하지 못했습니다.");
    }
  }

  async function start() {
    if (!file) return setMessage("PDF 파일을 먼저 선택해 주세요.");
    const result = validatePdfFile(file);
    if (!result.ok) return setMessage(result.message);
    if (!copyright) return setMessage("자료 이용 권한을 확인해 주세요.");
    setMessage("");
    setBusy(true);
    try {
      const saved = await saveSourcePdfLocally(file);
      setFolder(await getLocalFolderState());
      setSavedDocumentId(saved.documentId);
      setMessage(`저장 완료: ${saved.rootName}/${saved.relativePath}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "PDF를 로컬 폴더에 저장하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="upload-title" className="fixed inset-0 z-50 grid place-items-center bg-[#0b1c15]/55 p-4">
      <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between">
          <div><h2 id="upload-title" className="text-xl font-bold">PDF 문서 업로드</h2><p className="mt-1 text-sm text-[#6d7772]">분석 결과는 저장 전 검토 단계를 거칩니다.</p></div>
          <button aria-label="닫기" className="focus-ring rounded-lg p-2 hover:bg-[#f2f4f1]" onClick={onClose}><X size={19} /></button>
        </div>
        <button onClick={() => input.current?.click()} className="focus-ring mt-6 w-full rounded-2xl border-2 border-dashed border-[#bfd0c6] bg-[#f8fbf9] px-5 py-10 text-center">
          <Upload className="mx-auto mb-3 text-[#1f6b4f]" />
          <span className="block font-semibold">{file?.name ?? "PDF 파일을 선택하세요"}</span>
          <span className="mt-1 block text-xs text-[#6d7772]">PDF만 가능 · 최대 50MB</span>
        </button>
        <input ref={input} hidden type="file" accept="application/pdf" onChange={(e) => {
          setFile(e.target.files?.[0] ?? null);
          setSavedDocumentId(null);
        }} />
        <div className="mt-4 flex items-center justify-between rounded-xl border border-[#e3e8e4] bg-[#f8fbf9] p-3">
          <div className="flex min-w-0 items-center gap-3">
            <HardDrive className="shrink-0 text-[#1f6b4f]" size={19} />
            <div className="min-w-0">
              <p className="text-xs text-[#6d7772]">PC 저장 폴더</p>
              <p className="truncate text-sm font-semibold">{folder?.configured ? folder.name : "선택되지 않음"}</p>
            </div>
          </div>
          <Button variant="soft" onClick={() => void chooseFolder()}><FolderOpen size={16} />폴더 선택</Button>
        </div>
        <label className="mt-5 flex items-start gap-2 text-sm"><input className="mt-1 accent-[#1f6b4f]" type="checkbox" checked={copyright} onChange={(e) => setCopyright(e.target.checked)} /><span>업로드 자료의 이용 권한을 확인했습니다.</span></label>
        <div className="mt-4 rounded-xl bg-[#fff4e5] p-3 text-xs leading-relaxed text-[#845918]">원본 PDF는 선택한 PC 폴더에만 저장됩니다. Firestore에는 이후 문항 좌표와 분류 같은 작은 메타데이터만 저장합니다.</div>
        {message && <p className="mt-3 text-sm font-medium text-[#1f6b4f]" role="status">{message}</p>}
        <div className="mt-6 flex justify-end gap-2">
          <Button onClick={onClose}>닫기</Button>
          {savedDocumentId
            ? <Link href={`/documents/${savedDocumentId}/review`} className="focus-ring inline-flex items-center justify-center gap-2 rounded-xl border border-[#1f6b4f] bg-[#1f6b4f] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#18553f]"><Sparkles size={16} />검수 편집기 열기</Link>
            : <Button variant="primary" onClick={() => void start()}>{busy ? <LoaderCircle className="animate-spin" size={16} /> : <Upload size={16} />}저장 및 분석</Button>}
        </div>
      </div>
    </div>
  );
}

function Shell({ view, children, onUpload }: { view: View; children: React.ReactNode; onUpload: () => void }) {
  return (
    <div className="min-h-screen bg-[#f5f6f2] lg:grid lg:grid-cols-[248px_1fr]">
      <aside className="hidden min-h-screen bg-[#173b30] px-4 py-6 text-white lg:flex lg:flex-col">
        <Link href="/dashboard" className="focus-ring flex items-center gap-3 rounded-xl px-2 pb-7">
          <span className="grid size-10 place-items-center rounded-xl bg-white text-lg font-black text-[#1f6b4f]">Q</span>
          <span><b className="block text-sm">문항 카드 스튜디오</b><small className="text-[#a9c8bb]">Question Studio</small></span>
        </Link>
        <nav className="space-y-1">
          {nav.map(({ id, label, href, icon: Icon }) => <Link key={id} href={href} className={`focus-ring flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${view === id ? "bg-[#285243] text-white" : "text-[#bcd2c8] hover:bg-[#214a3c] hover:text-white"}`}><Icon size={18} />{label}</Link>)}
        </nav>
        <div className="mt-auto border-t border-[#31594b] px-2 pt-5"><span className="text-xs text-[#9dbbae]">현재 작업 공간</span><strong className="mt-1 block text-sm">내 개인 공간</strong></div>
      </aside>
      <div className="min-w-0">
        <header className="flex items-center justify-between border-b border-[#e3e8e4] bg-white px-5 py-3 lg:px-10">
          <div className="flex items-center gap-2 text-sm text-[#6d7772]"><Sparkles size={16} className="text-[#1f6b4f]" />검토 중심 문항 워크플로</div>
          <div className="flex items-center gap-2"><Button onClick={onUpload} variant="primary"><Plus size={16} />PDF 업로드</Button><button aria-label="사용자 메뉴" className="focus-ring rounded-full p-1.5 text-[#1f6b4f] hover:bg-[#eef5f0]"><CircleUserRound /></button></div>
        </header>
        <main className="mx-auto max-w-[1500px] p-5 lg:p-10">{children}</main>
      </div>
    </div>
  );
}

function Heading({ title, subtitle }: { title: string; subtitle: string }) {
  return <div className="mb-7"><h1 className="text-2xl font-bold tracking-[-.03em] lg:text-3xl">{title}</h1><p className="mt-2 text-sm text-[#6d7772]">{subtitle}</p></div>;
}

function useLocalDocuments() {
  const [documents, setDocuments] = useState<LocalDocumentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void listLocalDocuments()
      .then((result) => {
        if (!cancelled) setDocuments(result);
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "문서 목록을 불러오지 못했습니다.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  return {
    documents,
    loading,
    error,
    removeDocument: (documentId: string) =>
      setDocuments((current) => current.filter((document) => document.documentId !== documentId)),
  };
}

function Documents({ documents, loading, error, onDelete }: {
  documents: LocalDocumentSummary[];
  loading: boolean;
  error: string;
  onDelete?: (document: LocalDocumentSummary) => Promise<void>;
}) {
  const [term, setTerm] = useState("");
  const [deletingDocumentId, setDeletingDocumentId] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const filtered = documents.filter((document) =>
    document.fileName.toLocaleLowerCase().includes(term.trim().toLocaleLowerCase()),
  );

  async function confirmDeleteDocument(document: LocalDocumentSummary) {
    if (!onDelete || deletingDocumentId) return;
    const confirmed = window.confirm(
      `"${document.fileName}" 문서를 삭제할까요?\n원본 PDF와 검수 영역, 연결된 문항카드가 함께 삭제됩니다.`,
    );
    if (!confirmed) return;
    setDeletingDocumentId(document.documentId);
    setDeleteError("");
    try {
      await onDelete(document);
    } catch (reason) {
      setDeleteError(reason instanceof Error ? reason.message : "PDF 문서를 삭제하지 못했습니다.");
    } finally {
      setDeletingDocumentId("");
    }
  }

  return <section className="rounded-2xl border border-[#e3e8e4] bg-white p-5">
    <div className="mb-4 flex flex-wrap gap-2">
      <label className="relative min-w-64 flex-1">
        <Search className="absolute left-3 top-3 text-[#85908a]" size={17} />
        <input value={term} onChange={(event) => setTerm(event.target.value)} aria-label="문서 검색" className="focus-ring w-full rounded-xl border border-[#e3e8e4] py-2.5 pl-10 pr-3 text-sm" placeholder="파일명 검색" />
      </label>
      <select aria-label="과목" className="focus-ring rounded-xl border border-[#e3e8e4] bg-white px-3 text-sm"><option>전체 과목</option><option>한국사</option></select>
    </div>
    {loading && <div className="grid min-h-32 place-items-center text-[#6d7772]"><LoaderCircle className="animate-spin" size={22} /></div>}
    {!loading && error && <p className="rounded-xl bg-[#fff4e5] p-4 text-sm text-[#845918]">{error}</p>}
    {deleteError && <p role="alert" className="mb-3 rounded-xl bg-[#fff0ed] p-3 text-xs text-[#9a3f32]">{deleteError}</p>}
    {!loading && !error && !filtered.length && <p className="rounded-xl border border-dashed border-[#d6ddd8] p-8 text-center text-sm text-[#6d7772]">PC 폴더에 저장된 PDF 문서가 없습니다.</p>}
    <div>{filtered.map((document) => {
      const completed = document.regionCount > 0 && document.pendingReviewCount === 0;
      const status = completed
        ? "완료"
        : document.regionCount
          ? `검토 필요 ${document.pendingReviewCount}`
          : "분석 전";
      const meta = [
        document.pageCount ? `${document.pageCount}페이지` : null,
        new Date(document.updatedAt).toLocaleDateString("ko-KR"),
      ].filter(Boolean).join(" · ");
      return (
        <div key={document.documentId} className="grid grid-cols-[44px_1fr_auto] items-center gap-3 border-t border-[#edf0ee] py-3 first:border-0">
          <span className="grid h-12 w-10 place-items-center rounded-lg bg-[#fbe8e6] text-[10px] font-black text-[#a1433b]">PDF</span>
          <div>
            <Link href={`/documents/${document.documentId}/review`} className="text-sm font-bold hover:text-[#1f6b4f] hover:underline">{document.fileName}</Link>
            <p className="mt-1 text-xs text-[#6d7772]">{meta}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-2.5 py-1 text-[11px] ${completed ? "bg-[#dcefe5] text-[#1f6b4f]" : document.regionCount ? "bg-[#fff1dd] text-[#9a641c]" : "bg-[#eef1ef] text-[#627069]"}`}>{status}</span>
            {onDelete && (
              <button
                type="button"
                aria-label={`${document.fileName} 삭제`}
                title="PDF 문서 삭제"
                disabled={Boolean(deletingDocumentId)}
                onClick={() => void confirmDeleteDocument(document)}
                className="focus-ring grid size-9 place-items-center rounded-lg text-[#a34b40] transition hover:bg-[#fff0ed] disabled:opacity-40"
              >
                {deletingDocumentId === document.documentId
                  ? <LoaderCircle className="animate-spin" size={16} />
                  : <Trash2 size={16} />}
              </button>
            )}
          </div>
        </div>
      );
    })}</div>
  </section>;
}

function Dashboard() {
  const documentState = useLocalDocuments();
  const totalRegions = documentState.documents.reduce((sum, document) => sum + document.regionCount, 0);
  const pendingReviews = documentState.documents.reduce((sum, document) => sum + document.pendingReviewCount, 0);
  const totalPages = documentState.documents.reduce((sum, document) => sum + (document.pageCount ?? 0), 0);
  return <><Heading title="안녕하세요, 선생님" subtitle="문항 자료를 정리하고 새 문제지를 만들어 보세요." />
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[["전체 영역",String(totalRegions),"저장된 검수 영역"],["검토 필요",String(pendingReviews),"실제 검수 상태"],["PDF 문서",String(documentState.documents.length),`총 ${totalPages}페이지`],["제작 문제지","0","아직 생성되지 않음"]].map(([label,value,delta]) => <div key={label} className="rounded-2xl border border-[#e3e8e4] bg-white p-5"><span className="text-xs text-[#6d7772]">{label}</span><b className="mt-2 block font-mono text-3xl">{value}</b><small className="mt-1 block text-[#1f6b4f]">{delta}</small></div>)}</div>
    <div className="mt-5 grid gap-5 xl:grid-cols-[1.5fr_1fr]"><Documents {...documentState} /><section className="rounded-2xl border border-[#e3e8e4] bg-white p-5"><h2 className="font-bold">최근 작업</h2><div className="mt-4 space-y-5 text-sm">{[["한국사 문항 32개를 저장했습니다.","18분 전"],["1학기 중간고사 HWPX 생성을 완료했습니다.","어제 오후 4:21"],["수학Ⅰ 쪽지시험 순서를 변경했습니다.","3일 전"]].map(([text,time])=><div key={text} className="flex gap-3"><span className="mt-1 size-2 rounded-full bg-[#1f6b4f]" /><div><p>{text}</p><time className="mt-1 block text-xs text-[#6d7772]">{time}</time></div></div>)}</div></section></div></>;
}

function DocumentsView() {
  const documentState = useLocalDocuments();

  async function handleDelete(document: LocalDocumentSummary) {
    await deleteLocalDocument(document.documentId);
    documentState.removeDocument(document.documentId);
    try {
      const stored = JSON.parse(localStorage.getItem(EXAM_SELECTION_KEY) ?? "[]") as string[];
      localStorage.setItem(
        EXAM_SELECTION_KEY,
        JSON.stringify(stored.filter((id) => !id.startsWith(`${document.documentId}:`))),
      );
    } catch {
      localStorage.removeItem(EXAM_SELECTION_KEY);
    }
  }

  return <Documents {...documentState} onDelete={handleDelete} />;
}

function QuestionCards() {
  const router = useRouter();
  const [term, setTerm] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [difficultyFilter, setDifficultyFilter] = useState("");
  const [questionTypeFilter, setQuestionTypeFilter] = useState("");
  const [tagFilters, setTagFilters] = useState<string[]>([]);
  const [classificationStatusFilter, setClassificationStatusFilter] = useState<"" | "classified" | "unclassified">("");
  const [selected, setSelected] = useState<string[]>([]);
  const [cards, setCards] = useState<LocalQuestionCardSummary[]>([]);
  const [classificationData, setClassificationData] = useState<ClassificationData>(() => createDefaultClassificationData());
  const [editingCardId, setEditingCardId] = useState("");
  const [classificationDraft, setClassificationDraft] = useState<Omit<QuestionClassification, "updatedAt"> | null>(null);
  const [bulkClassificationDraft, setBulkClassificationDraft] = useState<Omit<QuestionClassification, "updatedAt"> | null>(null);
  const [savingCardId, setSavingCardId] = useState("");
  const [savingBulkClassification, setSavingBulkClassification] = useState(false);
  const [deletingCardId, setDeletingCardId] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      listLocalQuestionCards(),
      readClassificationLocally<ClassificationData>(),
    ])
      .then(([result, storedClassification]) => {
        if (cancelled) return;
        setCards(result);
        setClassificationData(storedClassification?.version === 1
          ? mergeDefaultClassificationData(storedClassification)
          : createDefaultClassificationData());
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "문항 카드를 불러오지 못했습니다.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const activeSubjects = useMemo(
    () => sortByOrder(classificationData.subjects.filter((subjectItem) => subjectItem.isActive)),
    [classificationData],
  );
  const categoryFilterOptions = subjectFilter
    ? flattenCategoryTree(classificationData.categories, subjectFilter).filter((category) => category.isActive)
    : activeSubjects.flatMap((subjectItem) =>
        flattenCategoryTree(classificationData.categories, subjectItem.id)
          .filter((category) => category.isActive)
          .map((category) => ({ ...category, subjectName: subjectItem.name })),
      );

  function classificationLabels(card: LocalQuestionCardSummary) {
    const value = card.classification;
    if (!value) return [];
    const subjectName = classificationData.subjects.find((item) => item.id === value.subjectId)?.name ?? "";
    const categoryName = classificationData.categories.find((item) => item.id === value.categoryId)?.name ?? "";
    const difficulty = classificationData.options.find((item) => item.id === value.difficultyOptionId)?.name ?? "";
    const questionType = classificationData.options.find((item) => item.id === value.questionTypeOptionId)?.name ?? "";
    const tags = value.tagIds.map((id) => classificationData.tags.find((item) => item.id === id)?.name ?? "");
    return [subjectName, categoryName, difficulty, questionType, ...tags].filter(Boolean);
  }

  function classificationText(card: LocalQuestionCardSummary) {
    return classificationLabels(card).join(" ");
  }

  const normalizedTerm = term.trim().toLocaleLowerCase();
  const filtered = cards.filter((card) => {
    if (subjectFilter && card.classification?.subjectId !== subjectFilter) return false;
    if (categoryFilter && card.classification?.categoryId !== categoryFilter) return false;
    if (difficultyFilter && card.classification?.difficultyOptionId !== difficultyFilter) return false;
    if (questionTypeFilter && card.classification?.questionTypeOptionId !== questionTypeFilter) return false;
    if (tagFilters.length && !tagFilters.every((tagId) => card.classification?.tagIds.includes(tagId))) return false;
    if (classificationStatusFilter === "classified" && !card.classification) return false;
    if (classificationStatusFilter === "unclassified" && card.classification) return false;
    if (!normalizedTerm) return true;
    return `${card.sourceName} ${card.sourceQuestionNumber ?? ""} ${classificationText(card)}`
      .toLocaleLowerCase()
      .includes(normalizedTerm);
  });
  const filteredIds = filtered.map((card) => card.id);
  const allFilteredSelected = filteredIds.length > 0 &&
    filteredIds.every((cardId) => selected.includes(cardId));

  function resetClassificationFilters() {
    setTerm("");
    setSubjectFilter("");
    setCategoryFilter("");
    setDifficultyFilter("");
    setQuestionTypeFilter("");
    setTagFilters([]);
    setClassificationStatusFilter("");
  }

  function beginClassification(card: LocalQuestionCardSummary) {
    const firstSubjectId = activeSubjects[0]?.id ?? "";
    setEditingCardId(card.id);
    setMessage("");
    setClassificationDraft(card.classification
      ? {
          subjectId: card.classification.subjectId,
          categoryId: card.classification.categoryId,
          difficultyOptionId: card.classification.difficultyOptionId,
          questionTypeOptionId: card.classification.questionTypeOptionId,
          tagIds: [...card.classification.tagIds],
        }
      : {
          subjectId: firstSubjectId,
          categoryId: null,
          difficultyOptionId: null,
          questionTypeOptionId: null,
          tagIds: [],
        });
  }

  function beginBulkClassification() {
    const selectedCards = cards.filter((card) => selected.includes(card.id));
    if (!selectedCards.length) return;
    const firstClassification = selectedCards[0].classification;
    const sharedClassification = firstClassification && selectedCards.every((card) => {
      const current = card.classification;
      return current &&
        current.subjectId === firstClassification.subjectId &&
        current.categoryId === firstClassification.categoryId &&
        current.difficultyOptionId === firstClassification.difficultyOptionId &&
        current.questionTypeOptionId === firstClassification.questionTypeOptionId &&
        current.tagIds.length === firstClassification.tagIds.length &&
        current.tagIds.every((tagId) => firstClassification.tagIds.includes(tagId));
    });

    setEditingCardId("");
    setClassificationDraft(null);
    setMessage("");
    setBulkClassificationDraft(sharedClassification && firstClassification
      ? {
          subjectId: firstClassification.subjectId,
          categoryId: firstClassification.categoryId,
          difficultyOptionId: firstClassification.difficultyOptionId,
          questionTypeOptionId: firstClassification.questionTypeOptionId,
          tagIds: [...firstClassification.tagIds],
        }
      : {
          subjectId: activeSubjects[0]?.id ?? "",
          categoryId: null,
          difficultyOptionId: null,
          questionTypeOptionId: null,
          tagIds: [],
        });
  }

  async function saveBulkClassification() {
    if (!bulkClassificationDraft?.subjectId || savingBulkClassification) return;
    const selectedCardIds = cards
      .filter((card) => selected.includes(card.id))
      .map((card) => card.id);
    if (!selectedCardIds.length) return;

    setSavingBulkClassification(true);
    setError("");
    try {
      const saved = await saveQuestionClassificationsLocally(selectedCardIds, bulkClassificationDraft);
      setCards((current) => current.map((card) =>
        saved[card.id] ? { ...card, classification: saved[card.id] } : card,
      ));
      setBulkClassificationDraft(null);
      setMessage(`${selectedCardIds.length}개 문항의 분류를 저장했습니다.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "일괄 분류를 저장하지 못했습니다.");
    } finally {
      setSavingBulkClassification(false);
    }
  }

  async function saveCardClassification(cardId: string) {
    if (!classificationDraft?.subjectId || savingCardId) return;
    setSavingCardId(cardId);
    setError("");
    try {
      const saved = await saveQuestionClassificationLocally(cardId, classificationDraft);
      setCards((current) => current.map((card) =>
        card.id === cardId ? { ...card, classification: saved } : card,
      ));
      setEditingCardId("");
      setClassificationDraft(null);
      setMessage("문항 분류를 저장했습니다.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "문항 분류를 저장하지 못했습니다.");
    } finally {
      setSavingCardId("");
    }
  }

  function addSelectedToExam() {
    if (!selected.length) return;
    localStorage.setItem(EXAM_SELECTION_KEY, JSON.stringify(selected));
    router.push("/exam-sets");
  }

  async function confirmDeleteCard(card: LocalQuestionCardSummary) {
    if (deletingCardId) return;
    const label = card.sourceQuestionNumber
      ? `${card.sourceQuestionNumber}번 문항`
      : "이 문항카드";
    const confirmed = window.confirm(
      `${label}을 삭제할까요?\n원본 PDF는 유지되며 이 문항의 검수 영역과 분류 정보가 삭제됩니다.`,
    );
    if (!confirmed) return;
    setDeletingCardId(card.id);
    setError("");
    setMessage("");
    try {
      await deleteLocalQuestionCard(card.documentId, card.questionKey, card.id);
      setCards((current) => current.filter((item) => item.id !== card.id));
      setSelected((current) => current.filter((id) => id !== card.id));
      if (editingCardId === card.id) {
        setEditingCardId("");
        setClassificationDraft(null);
      }
      try {
        const stored = JSON.parse(localStorage.getItem(EXAM_SELECTION_KEY) ?? "[]") as string[];
        localStorage.setItem(
          EXAM_SELECTION_KEY,
          JSON.stringify(stored.filter((id) => id !== card.id)),
        );
      } catch {
        localStorage.removeItem(EXAM_SELECTION_KEY);
      }
      setMessage(`${label}을 삭제했습니다.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "문항카드를 삭제하지 못했습니다.");
    } finally {
      setDeletingCardId("");
    }
  }

  function toggleSelectAllFiltered() {
    setSelected((current) => {
      if (allFilteredSelected) {
        const filteredIdSet = new Set(filteredIds);
        return current.filter((id) => !filteredIdSet.has(id));
      }
      return Array.from(new Set([...current, ...filteredIds]));
    });
  }

  async function confirmDeleteSelectedCards() {
    if (!selected.length || deletingCardId) return;
    const selectedCards = cards.filter((card) => selected.includes(card.id));
    if (!selectedCards.length) return;
    const confirmed = window.confirm(
      `선택한 문항카드 ${selectedCards.length}개를 삭제할까요?\n원본 PDF는 유지되며 해당 문항의 검수 영역과 분류 정보가 삭제됩니다.`,
    );
    if (!confirmed) return;

    setDeletingCardId("bulk");
    setError("");
    setMessage("");
    const deletedIds: string[] = [];
    try {
      for (let index = 0; index < selectedCards.length; index += 1) {
        const card = selectedCards[index];
        setMessage(`${index + 1}/${selectedCards.length} 문항카드를 삭제하고 있습니다.`);
        await deleteLocalQuestionCard(card.documentId, card.questionKey, card.id);
        deletedIds.push(card.id);
      }
      setMessage(`${deletedIds.length}개 문항카드를 삭제했습니다.`);
    } catch (reason) {
      setError(
        `${deletedIds.length}개 삭제 후 중단되었습니다. ${
          reason instanceof Error ? reason.message : "일괄 삭제를 완료하지 못했습니다."
        }`,
      );
    } finally {
      if (deletedIds.length) {
        const deletedIdSet = new Set(deletedIds);
        setCards((current) => current.filter((card) => !deletedIdSet.has(card.id)));
        setSelected((current) => current.filter((id) => !deletedIdSet.has(id)));
        try {
          const stored = JSON.parse(localStorage.getItem(EXAM_SELECTION_KEY) ?? "[]") as string[];
          localStorage.setItem(
            EXAM_SELECTION_KEY,
            JSON.stringify(stored.filter((id) => !deletedIdSet.has(id))),
          );
        } catch {
          localStorage.removeItem(EXAM_SELECTION_KEY);
        }
      }
      setDeletingCardId("");
    }
  }

  return <>
    <div className="mb-4 flex flex-wrap gap-2">
      <label className="relative min-w-64 flex-1">
        <Search className="absolute left-3 top-3 text-[#85908a]" size={17}/>
        <input value={term} onChange={(event) => setTerm(event.target.value)} className="focus-ring w-full rounded-xl border border-[#e3e8e4] bg-white py-2.5 pl-10 pr-3 text-sm" placeholder="문항 번호, 출처, 단원, 태그 검색" />
      </label>
      <select aria-label="과목 필터" className="focus-ring rounded-xl border border-[#e3e8e4] bg-white px-3 text-sm" value={subjectFilter} onChange={(event) => {
        setSubjectFilter(event.target.value);
        setCategoryFilter("");
      }}>
        <option value="">전체 과목</option>
        {activeSubjects.map((subjectItem) => <option key={subjectItem.id} value={subjectItem.id}>{subjectItem.name}</option>)}
      </select>
      <Button variant="soft" disabled={!selected.length} onClick={addSelectedToExam}>{selected.length}개 문제지에 담기</Button>
    </div>
    <section aria-label="상세 분류 검색" className="mb-4 rounded-2xl border border-[#dfe6e2] bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2"><Filter size={16} className="text-[#1f6b4f]" /><b className="text-sm">분류 상세 검색</b><span className="text-xs text-[#7a8580]">검색 결과 {filtered.length}개</span></div>
        <button className="focus-ring inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-[#607068] hover:bg-[#f1f5f2]" onClick={resetClassificationFilters}><RotateCcw size={13} />초기화</button>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        <select aria-label="단원 필터" className="focus-ring rounded-xl border border-[#e3e8e4] bg-white px-3 py-2 text-xs" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
          <option value="">전체 단원</option>
          {categoryFilterOptions.map((category) => (
            <option key={category.id} value={category.id}>
              {"subjectName" in category ? `${category.subjectName} · ` : ""}{"　".repeat(category.depth)}{category.name}
            </option>
          ))}
        </select>
        <select aria-label="난이도 필터" className="focus-ring rounded-xl border border-[#e3e8e4] bg-white px-3 py-2 text-xs" value={difficultyFilter} onChange={(event) => setDifficultyFilter(event.target.value)}>
          <option value="">전체 난이도</option>
          {sortByOrder(classificationData.options.filter((option) => option.kind === "difficulty" && option.isActive)).map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
        </select>
        <select aria-label="문항 유형 필터" className="focus-ring rounded-xl border border-[#e3e8e4] bg-white px-3 py-2 text-xs" value={questionTypeFilter} onChange={(event) => setQuestionTypeFilter(event.target.value)}>
          <option value="">전체 문항 유형</option>
          {sortByOrder(classificationData.options.filter((option) => option.kind === "questionType" && option.isActive)).map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
        </select>
        <select aria-label="분류 상태 필터" className="focus-ring rounded-xl border border-[#e3e8e4] bg-white px-3 py-2 text-xs" value={classificationStatusFilter} onChange={(event) => setClassificationStatusFilter(event.target.value as "" | "classified" | "unclassified")}>
          <option value="">전체 분류 상태</option>
          <option value="classified">분류 완료</option>
          <option value="unclassified">분류 미지정</option>
        </select>
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#e3e8e4] px-3 py-2">
          {sortByOrder(classificationData.tags.filter((tag) => tag.isActive)).map((tag) => (
            <label key={tag.id} className="flex items-center gap-1 text-[11px]">
              <input type="checkbox" className="accent-[#1f6b4f]" checked={tagFilters.includes(tag.id)} onChange={(event) => setTagFilters((current) => event.target.checked ? [...current, tag.id] : current.filter((id) => id !== tag.id))} />
              {tag.name}
            </label>
          ))}
        </div>
      </div>
    </section>
    {!loading && !error && cards.length > 0 && (
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#dfe6e2] bg-white px-4 py-3">
        <label className="flex items-center gap-2 text-sm font-semibold text-[#34423c]">
          <input
            type="checkbox"
            aria-label="검색 결과 전체 선택"
            className="size-4 accent-[#1f6b4f]"
            checked={allFilteredSelected}
            disabled={!filteredIds.length || deletingCardId === "bulk"}
            onChange={toggleSelectAllFiltered}
          />
          검색 결과 전체 선택
          <span className="font-normal text-[#77817c]">({filteredIds.length}개)</span>
        </label>
        <div className="flex items-center gap-3">
          <span className="text-xs text-[#6d7772]">선택 {selected.length}개</span>
          <button
            type="button"
            disabled={!selected.length || Boolean(deletingCardId) || savingBulkClassification}
            onClick={beginBulkClassification}
            className="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-[#bcd7c8] bg-[#eef7f1] px-3 py-2 text-xs font-semibold text-[#1f6b4f] transition hover:bg-[#e2f1e8] disabled:opacity-40"
          >
            <Tags size={14} />
            일괄 분류
          </button>
          <button
            type="button"
            disabled={!selected.length || Boolean(deletingCardId)}
            onClick={() => void confirmDeleteSelectedCards()}
            className="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-[#e8c9c4] bg-[#fff7f5] px-3 py-2 text-xs font-semibold text-[#a34b40] transition hover:bg-[#fff0ed] disabled:opacity-40"
          >
            {deletingCardId === "bulk"
              ? <LoaderCircle className="animate-spin" size={14} />
              : <Trash2 size={14} />}
            선택 삭제
          </button>
        </div>
      </div>
    )}
    {bulkClassificationDraft && (
      <div className="fixed inset-0 z-50 grid place-items-center bg-[#102019]/45 p-4" role="presentation">
        <section
          role="dialog"
          aria-modal="true"
          aria-labelledby="bulk-classification-title"
          className="w-full max-w-xl rounded-2xl bg-white p-5 shadow-2xl"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id="bulk-classification-title" className="text-lg font-bold text-[#18201d]">선택 문항 일괄 분류</h2>
              <p className="mt-1 text-xs leading-5 text-[#6d7772]">
                선택한 {selected.length}개 문항의 기존 분류를 아래 설정으로 교체합니다.
              </p>
            </div>
            <button
              type="button"
              aria-label="일괄 분류 닫기"
              disabled={savingBulkClassification}
              onClick={() => setBulkClassificationDraft(null)}
              className="focus-ring rounded-lg p-1.5 text-[#6d7772] hover:bg-[#f1f5f2] disabled:opacity-40"
            >
              <X size={18} />
            </button>
          </div>
          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-xs font-medium text-[#65716b]">과목
              <select aria-label="일괄 분류 과목" className="focus-ring mt-1.5 w-full rounded-lg border border-[#dbe2de] bg-white px-3 py-2.5 text-sm text-[#18201d]" value={bulkClassificationDraft.subjectId} onChange={(event) => setBulkClassificationDraft((current) => current ? { ...current, subjectId: event.target.value, categoryId: null } : current)}>
                {activeSubjects.map((subjectItem) => <option key={subjectItem.id} value={subjectItem.id}>{subjectItem.name}</option>)}
              </select>
            </label>
            <label className="text-xs font-medium text-[#65716b]">단원
              <select aria-label="일괄 분류 단원" className="focus-ring mt-1.5 w-full rounded-lg border border-[#dbe2de] bg-white px-3 py-2.5 text-sm text-[#18201d]" value={bulkClassificationDraft.categoryId ?? ""} onChange={(event) => setBulkClassificationDraft((current) => current ? { ...current, categoryId: event.target.value || null } : current)}>
                <option value="">미지정</option>
                {flattenCategoryTree(classificationData.categories, bulkClassificationDraft.subjectId).filter((category) => category.isActive).map((category) => (
                  <option key={category.id} value={category.id}>{"　".repeat(category.depth)}{category.name}</option>
                ))}
              </select>
            </label>
            <label className="text-xs font-medium text-[#65716b]">난이도
              <select aria-label="일괄 분류 난이도" className="focus-ring mt-1.5 w-full rounded-lg border border-[#dbe2de] bg-white px-3 py-2.5 text-sm text-[#18201d]" value={bulkClassificationDraft.difficultyOptionId ?? ""} onChange={(event) => setBulkClassificationDraft((current) => current ? { ...current, difficultyOptionId: event.target.value || null } : current)}>
                <option value="">미지정</option>
                {sortByOrder(classificationData.options.filter((option) => option.kind === "difficulty" && option.isActive)).map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
              </select>
            </label>
            <label className="text-xs font-medium text-[#65716b]">문항 유형
              <select aria-label="일괄 분류 문항 유형" className="focus-ring mt-1.5 w-full rounded-lg border border-[#dbe2de] bg-white px-3 py-2.5 text-sm text-[#18201d]" value={bulkClassificationDraft.questionTypeOptionId ?? ""} onChange={(event) => setBulkClassificationDraft((current) => current ? { ...current, questionTypeOptionId: event.target.value || null } : current)}>
                <option value="">미지정</option>
                {sortByOrder(classificationData.options.filter((option) => option.kind === "questionType" && option.isActive)).map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
              </select>
            </label>
          </div>
          <fieldset className="mt-4">
            <legend className="text-xs font-medium text-[#65716b]">태그</legend>
            <div className="mt-2 flex flex-wrap gap-3 rounded-xl border border-[#e3e8e4] bg-[#f8faf9] p-3">
              {sortByOrder(classificationData.tags.filter((tag) => tag.isActive)).map((tag) => (
                <label key={tag.id} className="flex items-center gap-1.5 text-xs text-[#34423c]">
                  <input type="checkbox" className="accent-[#1f6b4f]" checked={bulkClassificationDraft.tagIds.includes(tag.id)} onChange={(event) => setBulkClassificationDraft((current) => current ? {
                    ...current,
                    tagIds: event.target.checked ? [...current.tagIds, tag.id] : current.tagIds.filter((id) => id !== tag.id),
                  } : current)} />
                  {tag.name}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" disabled={savingBulkClassification} onClick={() => setBulkClassificationDraft(null)} className="focus-ring rounded-lg border border-[#dbe2de] px-4 py-2.5 text-sm font-semibold text-[#53615a] hover:bg-[#f5f7f6] disabled:opacity-40">취소</button>
            <button type="button" disabled={savingBulkClassification || !bulkClassificationDraft.subjectId} onClick={() => void saveBulkClassification()} className="focus-ring inline-flex items-center gap-2 rounded-lg bg-[#1f6b4f] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#195b43] disabled:opacity-50">
              {savingBulkClassification && <LoaderCircle className="animate-spin" size={15} />}
              {selected.length}개 문항에 적용
            </button>
          </div>
        </section>
      </div>
    )}
    {message && <p role="status" className="mb-3 rounded-xl bg-[#eef5f0] px-4 py-2 text-xs font-medium text-[#285243]">{message}</p>}
    {loading && <div className="grid min-h-72 place-items-center"><LoaderCircle className="animate-spin text-[#1f6b4f]" size={28} /></div>}
    {!loading && error && <p className="rounded-2xl bg-[#fff4e5] p-5 text-sm text-[#845918]">{error}</p>}
    {!loading && !error && !filtered.length && (
      <div className="rounded-2xl border border-dashed border-[#ccd6d0] bg-white p-10 text-center text-sm leading-6 text-[#6d7772]">
        저장된 문항 카드가 없습니다.<br />PDF 문서에서 영역을 검수 완료하면 이곳에 표시됩니다.
      </div>
    )}
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {filtered.map((card) => (
        <article key={card.id} className="overflow-hidden rounded-2xl border border-[#e3e8e4] bg-white transition hover:-translate-y-0.5 hover:shadow-lg">
          <QuestionCardPreview card={card} />
          <div className="p-4">
            <div className="flex items-start justify-between gap-3">
              <label className="flex min-w-0 items-center gap-2 font-semibold">
                <input
                  type="checkbox"
                  checked={selected.includes(card.id)}
                  onChange={(event) => setSelected((current) =>
                    event.target.checked ? [...current, card.id] : current.filter((id) => id !== card.id),
                  )}
                  className="accent-[#1f6b4f]"
                />
                <span>{card.sourceQuestionNumber ? `${card.sourceQuestionNumber}번 문항` : "문항 카드"}</span>
              </label>
              <Heart size={16} className="shrink-0 text-[#6d7772]" />
            </div>
            <p className="mt-2 truncate text-xs text-[#6d7772]" title={card.sourceName}>{card.sourceName}</p>
            {card.classification ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {classificationLabels(card).slice(0, 5).map((label, index) => (
                  <span key={`${label}-${index}`} className="rounded-full bg-[#eef5f0] px-2 py-1 text-[10px] font-semibold text-[#1f6b4f]">{label}</span>
                ))}
              </div>
            ) : (
              <p className="mt-3 rounded-lg bg-[#fff5e8] px-2.5 py-2 text-[11px] font-medium text-[#875b1d]">분류 미지정</p>
            )}
            <div className="mt-3 flex justify-between gap-3 text-xs text-[#6d7772]">
              <span>{card.regions.length > 1 ? `${card.regions.length}개 영역 결합` : `${card.regions[0].pageNumber}쪽`} · 검수 완료</span>
              <span className="flex flex-wrap justify-end gap-3">
                <button className="font-semibold text-[#1f6b4f] hover:underline" onClick={() => editingCardId === card.id ? setEditingCardId("") : beginClassification(card)}>분류 설정</button>
                <Link href={`/documents/${card.documentId}/review`} className="font-semibold text-[#1f6b4f] hover:underline">영역 편집</Link>
                <button
                  type="button"
                  disabled={Boolean(deletingCardId)}
                  onClick={() => void confirmDeleteCard(card)}
                  className="inline-flex items-center gap-1 font-semibold text-[#a34b40] hover:underline disabled:opacity-40"
                >
                  {deletingCardId === card.id
                    ? <LoaderCircle className="animate-spin" size={13} />
                    : <Trash2 size={13} />}
                  삭제
                </button>
              </span>
            </div>
            {editingCardId === card.id && classificationDraft && (
              <div className="mt-4 space-y-3 rounded-xl border border-[#dce6e0] bg-[#f7faf8] p-3">
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-[11px] text-[#65716b]">과목
                    <select aria-label={`${card.id} 과목`} className="focus-ring mt-1 w-full rounded-lg border border-[#dbe2de] bg-white px-2 py-2 text-xs text-[#18201d]" value={classificationDraft.subjectId} onChange={(event) => setClassificationDraft((current) => current ? { ...current, subjectId: event.target.value, categoryId: null } : current)}>
                      {activeSubjects.map((subjectItem) => <option key={subjectItem.id} value={subjectItem.id}>{subjectItem.name}</option>)}
                    </select>
                  </label>
                  <label className="text-[11px] text-[#65716b]">단원
                    <select aria-label={`${card.id} 단원`} className="focus-ring mt-1 w-full rounded-lg border border-[#dbe2de] bg-white px-2 py-2 text-xs text-[#18201d]" value={classificationDraft.categoryId ?? ""} onChange={(event) => setClassificationDraft((current) => current ? { ...current, categoryId: event.target.value || null } : current)}>
                      <option value="">미지정</option>
                      {flattenCategoryTree(classificationData.categories, classificationDraft.subjectId).filter((category) => category.isActive).map((category) => (
                        <option key={category.id} value={category.id}>{"　".repeat(category.depth)}{category.name}</option>
                      ))}
                    </select>
                  </label>
                  <label className="text-[11px] text-[#65716b]">난이도
                    <select aria-label={`${card.id} 난이도`} className="focus-ring mt-1 w-full rounded-lg border border-[#dbe2de] bg-white px-2 py-2 text-xs text-[#18201d]" value={classificationDraft.difficultyOptionId ?? ""} onChange={(event) => setClassificationDraft((current) => current ? { ...current, difficultyOptionId: event.target.value || null } : current)}>
                      <option value="">미지정</option>
                      {sortByOrder(classificationData.options.filter((option) => option.kind === "difficulty" && option.isActive)).map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
                    </select>
                  </label>
                  <label className="text-[11px] text-[#65716b]">문항 유형
                    <select aria-label={`${card.id} 문항 유형`} className="focus-ring mt-1 w-full rounded-lg border border-[#dbe2de] bg-white px-2 py-2 text-xs text-[#18201d]" value={classificationDraft.questionTypeOptionId ?? ""} onChange={(event) => setClassificationDraft((current) => current ? { ...current, questionTypeOptionId: event.target.value || null } : current)}>
                      <option value="">미지정</option>
                      {sortByOrder(classificationData.options.filter((option) => option.kind === "questionType" && option.isActive)).map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
                    </select>
                  </label>
                </div>
                <div>
                  <span className="text-[11px] text-[#65716b]">태그</span>
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    {sortByOrder(classificationData.tags.filter((tag) => tag.isActive)).map((tag) => (
                      <label key={tag.id} className="flex items-center gap-1 text-[11px]">
                        <input type="checkbox" className="accent-[#1f6b4f]" checked={classificationDraft.tagIds.includes(tag.id)} onChange={(event) => setClassificationDraft((current) => current ? {
                          ...current,
                          tagIds: event.target.checked ? [...current.tagIds, tag.id] : current.tagIds.filter((id) => id !== tag.id),
                        } : current)} />
                        {tag.name}
                      </label>
                    ))}
                  </div>
                </div>
                <button className="focus-ring flex w-full items-center justify-center gap-2 rounded-lg bg-[#1f6b4f] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50" disabled={savingCardId === card.id} onClick={() => void saveCardClassification(card.id)}>
                  {savingCardId === card.id && <LoaderCircle className="animate-spin" size={14} />}
                  분류 저장
                </button>
              </div>
            )}
          </div>
        </article>
      ))}
    </div>
  </>;
}

function ExamSets() {
  const [cards, setCards] = useState<LocalQuestionCardSummary[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [savedExamSets, setSavedExamSets] = useState<LocalExamSet[]>([]);
  const [currentExamSetId, setCurrentExamSetId] = useState("");
  const [curriculumSubjects, setCurriculumSubjects] = useState<SubjectDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [school, setSchool] = useState("");
  const [subject, setSubject] = useState("한국사1");
  const [grade, setGrade] = useState("1학년");
  const [examName, setExamName] = useState("단원 평가");
  const [examDate, setExamDate] = useState("");
  const [questionsPerPage, setQuestionsPerPage] = useState<4 | 6>(4);
  const [showStudentFields, setShowStudentFields] = useState(true);
  const [showScores, setShowScores] = useState(true);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [exportingFormat, setExportingFormat] = useState<"pdf" | "hwpx" | null>(null);
  const [previewingPdf, setPreviewingPdf] = useState(false);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState("");
  const [exportMessage, setExportMessage] = useState("");
  const [savingExamSet, setSavingExamSet] = useState(false);
  const [managementError, setManagementError] = useState("");

  useEffect(() => {
    const selectionTimer = window.setTimeout(() => {
      const stored = localStorage.getItem(EXAM_SELECTION_KEY);
      try {
        setSelectedIds(stored ? JSON.parse(stored) as string[] : []);
      } catch {
        setSelectedIds([]);
      }
    }, 0);
    let cancelled = false;
    void Promise.all([
      listLocalQuestionCards(),
      readClassificationLocally<ClassificationData>(),
      listLocalExamSets(),
    ])
      .then(([result, storedClassification, examSets]) => {
        if (cancelled) return;
        setCards(result);
        setSavedExamSets(examSets);
        const classification = storedClassification?.version === 1
          ? mergeDefaultClassificationData(storedClassification)
          : createDefaultClassificationData();
        const activeSubjects = sortByOrder(
          classification.subjects.filter((item) => item.isActive),
        );
        setCurriculumSubjects(activeSubjects);
        setSubject((current) =>
          activeSubjects.some((item) => item.name === current)
            ? current
            : activeSubjects[0]?.name ?? current,
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      window.clearTimeout(selectionTimer);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl);
    };
  }, [pdfPreviewUrl]);

  const selectedCards = selectedIds
    .map((id) => cards.find((card) => card.id === id))
    .filter((card): card is LocalQuestionCardSummary => Boolean(card));
  const linkedSubjectIds = Array.from(new Set(
    selectedCards
      .map((card) => card.classification?.subjectId)
      .filter((subjectId): subjectId is string => Boolean(subjectId)),
  ));
  const linkedSubject = linkedSubjectIds.length === 1
    ? curriculumSubjects.find((item) => item.id === linkedSubjectIds[0]) ?? null
    : null;
  const effectiveSubject = linkedSubject?.name ?? (subject.trim() || "과목");
  const title = linkedSubjectIds.length > 1 ? "통합 문제지" : effectiveSubject;

  function updateExamSelection(nextIds: string[]) {
    setSelectedIds(nextIds);
    localStorage.setItem(EXAM_SELECTION_KEY, JSON.stringify(nextIds));
  }

  function removeCardFromExam(card: LocalQuestionCardSummary) {
    const label = card.sourceQuestionNumber
      ? `원본 ${card.sourceQuestionNumber}번 문항`
      : "이 문항";
    if (!window.confirm(`${label}을 현재 문제지에서 제거할까요?`)) return;
    updateExamSelection(selectedIds.filter((id) => id !== card.id));
    setScores((current) => {
      const next = { ...current };
      delete next[card.id];
      return next;
    });
  }

  function clearExamSelection() {
    if (!selectedCards.length) return;
    if (!window.confirm(`현재 문제지에 담긴 ${selectedCards.length}개 문항을 모두 제거할까요?`)) return;
    updateExamSelection([]);
    setScores({});
  }

  function createNewExamSet() {
    if (selectedCards.length && !window.confirm("현재 편집 중인 문제지를 닫고 새 문제지를 만들까요?")) return;
    setCurrentExamSetId("");
    updateExamSelection([]);
    setSchool("");
    setGrade("1학년");
    setExamName("단원 평가");
    setExamDate("");
    setQuestionsPerPage(4);
    setShowStudentFields(true);
    setShowScores(true);
    setScores({});
    setExportMessage("새 문제지를 시작했습니다. 문항카드에서 문제를 담아주세요.");
    setManagementError("");
  }

  function loadExamSet(examSet: LocalExamSet) {
    const availableIds = examSet.questionIds.filter((questionId) =>
      cards.some((card) => card.id === questionId),
    );
    setCurrentExamSetId(examSet.id);
    updateExamSelection(availableIds);
    setSchool(examSet.school);
    setSubject(examSet.subject);
    setGrade(examSet.grade);
    setExamName(examSet.examName);
    setExamDate(examSet.examDate);
    setQuestionsPerPage(examSet.questionsPerPage);
    setShowStudentFields(examSet.showStudentFields);
    setShowScores(examSet.showScores);
    setScores(examSet.scores);
    setExportMessage(
      availableIds.length === examSet.questionIds.length
        ? `"${examSet.name}" 문제지를 불러왔습니다.`
        : `"${examSet.name}"을 불러왔습니다. 삭제된 문항 ${examSet.questionIds.length - availableIds.length}개는 제외했습니다.`,
    );
    setManagementError("");
  }

  async function saveCurrentExamSet() {
    if (!selectedCards.length || savingExamSet) return;
    setSavingExamSet(true);
    setManagementError("");
    try {
      const id = currentExamSetId || crypto.randomUUID();
      const saved = await saveLocalExamSet({
        id,
        name: examName.trim() || title,
        school: school.trim(),
        subject: effectiveSubject,
        grade: grade.trim(),
        examName: examName.trim() || "문제지",
        examDate,
        questionsPerPage,
        showStudentFields,
        showScores,
        questionIds: selectedCards.map((card) => card.id),
        scores: Object.fromEntries(
          selectedCards.map((card) => [card.id, Math.max(1, scores[card.id] ?? 2)]),
        ),
      });
      setCurrentExamSetId(saved.id);
      setSavedExamSets((current) => [
        saved,
        ...current.filter((examSet) => examSet.id !== saved.id),
      ]);
      setExportMessage(`"${saved.name}" 문제지를 저장했습니다.`);
    } catch (reason) {
      setManagementError(reason instanceof Error ? reason.message : "문제지를 저장하지 못했습니다.");
    } finally {
      setSavingExamSet(false);
    }
  }

  async function confirmDeleteExamSet(examSet: LocalExamSet) {
    if (savingExamSet) return;
    if (!window.confirm(`"${examSet.name}" 문제지를 삭제할까요?\n원본 문항카드와 생성된 PDF 파일은 유지됩니다.`)) return;
    setSavingExamSet(true);
    setManagementError("");
    try {
      await deleteLocalExamSet(examSet.id);
      setSavedExamSets((current) => current.filter((item) => item.id !== examSet.id));
      if (currentExamSetId === examSet.id) setCurrentExamSetId("");
      setExportMessage(`"${examSet.name}" 문제지를 삭제했습니다.`);
    } catch (reason) {
      setManagementError(reason instanceof Error ? reason.message : "문제지를 삭제하지 못했습니다.");
    } finally {
      setSavingExamSet(false);
    }
  }

  async function buildCurrentPdf() {
    const questions: ExamPdfQuestion[] = [];
    for (let index = 0; index < selectedCards.length; index += 1) {
      const card = selectedCards[index];
      setExportMessage(`${index + 1}/${selectedCards.length}번 문항을 PDF에 배치하고 있습니다.`);
      questions.push({
        canvas: await renderQuestionCardCanvas(card, null),
        score: Math.max(1, scores[card.id] ?? 2),
      });
    }
    setExportMessage("A4 PDF 페이지를 조립하고 있습니다.");
    return createExamPdf({
      title,
      school: school.trim(),
      subject: effectiveSubject,
      grade: grade.trim(),
      examName: examName.trim(),
      examDate,
      questionsPerPage,
      showStudentFields,
      showScores,
      questions,
    });
  }

  async function previewPdf() {
    if (!selectedCards.length || exportingFormat || previewingPdf) return;
    setPreviewingPdf(true);
    setExportMessage("PDF 미리보기를 준비하고 있습니다.");
    try {
      const data = await buildCurrentPdf();
      const dataBuffer = data.slice().buffer as ArrayBuffer;
      setPdfPreviewUrl(URL.createObjectURL(new Blob([dataBuffer], { type: "application/pdf" })));
      setExportMessage("PDF 미리보기가 준비되었습니다.");
    } catch (error) {
      setExportMessage(error instanceof Error ? error.message : "PDF 미리보기를 만들지 못했습니다.");
    } finally {
      setPreviewingPdf(false);
    }
  }

  async function exportPdf() {
    if (!selectedCards.length || exportingFormat || previewingPdf) return;
    setExportingFormat("pdf");
    setExportMessage("PDF 문제지의 문항 여백을 정리하고 있습니다.");
    try {
      const data = await buildCurrentPdf();
      const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
      const result = await saveGeneratedPdfLocally(`${title}_${stamp}.pdf`, data);
      setExportMessage(`PDF 생성 완료: ${result.rootName}/${result.relativePath}`);
    } catch (error) {
      setExportMessage(error instanceof Error ? error.message : "PDF 문제지를 생성하지 못했습니다.");
    } finally {
      setExportingFormat(null);
    }
  }

  async function exportHwpx() {
    if (!selectedCards.length || exportingFormat) return;
    setExportingFormat("hwpx");
    setExportMessage("HWPX 템플릿을 준비하고 있습니다.");
    try {
      const headerResponse = await fetch("/hwpx/header.xml");
      if (!headerResponse.ok) throw new Error("HWPX 기본 템플릿을 불러오지 못했습니다.");
      const headerXml = await headerResponse.text();
      const questions: HwpxQuestionImage[] = [];
      for (let index = 0; index < selectedCards.length; index += 1) {
        const card = selectedCards[index];
        setExportMessage(`${index + 1}/${selectedCards.length}번 문항 이미지를 만들고 있습니다.`);
        const score = Math.max(1, scores[card.id] ?? 2);
        const rendered = await renderQuestionCardPng(card, showScores ? score : null);
        questions.push({
          ...rendered,
          label: card.sourceQuestionNumber
            ? `원본 ${card.sourceQuestionNumber}번`
            : `${index + 1}번 문항`,
          score,
        });
      }

      setExportMessage("HWPX 패키지를 조립하고 있습니다.");
      const data = createHwpxPackage({
        title,
        school: school.trim(),
        subject: effectiveSubject,
        grade: grade.trim(),
        examName: examName.trim(),
        examDate,
        columns: 2,
        questionsPerPage,
        showStudentFields,
        showScores,
        headerXml,
        questions,
      });
      const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
      const result = await saveGeneratedHwpxLocally(`${title}_${stamp}.hwpx`, data);
      setExportMessage(`생성 완료: ${result.rootName}/${result.relativePath}`);
    } catch (error) {
      setExportMessage(error instanceof Error ? error.message : "HWPX를 생성하지 못했습니다.");
    } finally {
      setExportingFormat(null);
    }
  }

  return <>
  <section aria-label="저장된 문제지 관리" className="mb-5 rounded-2xl border border-[#dfe6e2] bg-white p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="font-bold">저장된 문제지</h2>
        <p className="mt-1 text-xs text-[#6d7772]">문항 구성과 배점, 시험 정보, 양식 설정을 저장하고 다시 불러올 수 있습니다.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={createNewExamSet}
          className="focus-ring inline-flex items-center gap-1.5 rounded-xl border border-[#dce3df] px-3 py-2 text-xs font-semibold transition hover:bg-[#f3f7f4]"
        >
          <Plus size={14} />새 문제지
        </button>
        <button
          type="button"
          disabled={!selectedCards.length || savingExamSet}
          onClick={() => void saveCurrentExamSet()}
          className="focus-ring inline-flex items-center gap-1.5 rounded-xl bg-[#1f6b4f] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#18553f] disabled:opacity-40"
        >
          {savingExamSet
            ? <LoaderCircle className="animate-spin" size={14} />
            : <BookOpen size={14} />}
          {currentExamSetId ? "변경사항 저장" : "현재 문제지 저장"}
        </button>
      </div>
    </div>
    {managementError && <p role="alert" className="mt-3 rounded-xl bg-[#fff0ed] p-3 text-xs text-[#9a3f32]">{managementError}</p>}
    {!loading && !savedExamSets.length && (
      <p className="mt-4 rounded-xl border border-dashed border-[#d7dfda] p-5 text-center text-xs text-[#748079]">
        저장된 문제지가 없습니다. 문항을 담은 뒤 ‘현재 문제지 저장’을 눌러주세요.
      </p>
    )}
    {savedExamSets.length > 0 && (
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {savedExamSets.map((examSet) => (
          <article
            key={examSet.id}
            className={`rounded-xl border p-4 transition ${
              currentExamSetId === examSet.id
                ? "border-[#1f6b4f] bg-[#f2f8f4]"
                : "border-[#e1e7e3] hover:border-[#b9c9c0]"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <b className="block truncate text-sm" title={examSet.name}>{examSet.name}</b>
                <p className="mt-1 text-[11px] text-[#6d7772]">
                  {examSet.subject} · {examSet.grade || "학년 미지정"} · {examSet.questionIds.length}문항
                </p>
              </div>
              {currentExamSetId === examSet.id && (
                <span className="shrink-0 rounded-full bg-[#dcefe5] px-2 py-1 text-[10px] font-semibold text-[#1f6b4f]">편집 중</span>
              )}
            </div>
            <p className="mt-3 text-[10px] text-[#8a948f]">
              {new Date(examSet.updatedAt).toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" })}
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => loadExamSet(examSet)}
                className="focus-ring flex-1 rounded-lg border border-[#cfdbd4] px-3 py-2 text-xs font-semibold text-[#1f6b4f] hover:bg-white"
              >
                불러오기
              </button>
              <button
                type="button"
                aria-label={`${examSet.name} 문제지 삭제`}
                title="저장된 문제지 삭제"
                disabled={savingExamSet}
                onClick={() => void confirmDeleteExamSet(examSet)}
                className="focus-ring grid size-9 place-items-center rounded-lg text-[#a34b40] hover:bg-[#fff0ed] disabled:opacity-40"
              >
                <Trash2 size={15} />
              </button>
            </div>
          </article>
        ))}
      </div>
    )}
  </section>
  <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
    <section className="min-h-[620px] rounded-2xl border border-[#e3e8e4] bg-white px-6 py-7 lg:px-8">
      <div className="border-b-2 border-[#18201d] pb-5 text-center">
        <p className="text-xs font-medium tracking-[.12em] text-[#68736e]">{school || "학교명"} · {grade || "학년"} · {effectiveSubject}</p>
        <h2 className="mt-2 text-2xl font-black tracking-[-.03em]">{title}</h2>
        <p className="mt-2 text-sm text-[#59645f]">{[examName, examDate].filter(Boolean).join(" · ") || `선택 문항 ${selectedCards.length}개`}</p>
        {selectedCards.length > 0 && (
          <button
            type="button"
            onClick={clearExamSelection}
            className="focus-ring mt-3 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-[#a34b40] transition hover:bg-[#fff0ed]"
          >
            <Trash2 size={14} />문제지 비우기
          </button>
        )}
        {showStudentFields && (
          <div className="mx-auto mt-5 grid max-w-xl grid-cols-4 overflow-hidden rounded-lg border border-[#bfc8c2] text-xs">
            {["학년","반","번호","이름"].map((label) => <span key={label} className="border-r border-[#d5dbd7] px-3 py-2 last:border-r-0"><b>{label}</b><span className="ml-2 text-[#9aa39e]">________</span></span>)}
          </div>
        )}
      </div>
      {loading && <div className="grid min-h-72 place-items-center"><LoaderCircle className="animate-spin text-[#1f6b4f]" size={28} /></div>}
      {!loading && !selectedCards.length && (
        <div className="grid min-h-72 place-items-center text-center text-sm leading-6 text-[#6d7772]">
          <div>담긴 문항이 없습니다.<br /><Link href="/questions" className="font-semibold text-[#1f6b4f] hover:underline">문항 카드에서 문제를 선택하세요.</Link></div>
        </div>
      )}
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {selectedCards.map((card, index) => (
          <article key={card.id} className="overflow-hidden rounded-2xl border border-[#e3e8e4] bg-[#f8faf8]">
            <QuestionCardPreview card={card} />
            <div className="flex items-center gap-3 p-4">
              <span className="grid size-8 place-items-center rounded-lg bg-[#1f6b4f] font-mono text-sm font-bold text-white">{index + 1}</span>
              <div className="min-w-0 flex-1">
                <b className="block text-sm">{card.sourceQuestionNumber ? `원본 ${card.sourceQuestionNumber}번` : "문항 카드"}</b>
                <p className="truncate text-xs text-[#6d7772]">{card.sourceName}</p>
              </div>
              {showScores && <label className="text-xs text-[#6d7772]">배점 <input type="number" min="1" value={scores[card.id] ?? 2} onChange={(event) => setScores((current) => ({ ...current, [card.id]: Math.max(1, Number(event.target.value) || 1) }))} className="ml-1 w-14 rounded-lg border border-[#d8dfda] px-2 py-1 text-right text-[#18201d]" /></label>}
              <button
                type="button"
                aria-label={`${card.sourceQuestionNumber ? `${card.sourceQuestionNumber}번 문항` : "문항"} 문제지에서 제거`}
                title="문제지에서 제거"
                onClick={() => removeCardFromExam(card)}
                className="focus-ring grid size-9 shrink-0 place-items-center rounded-lg text-[#a34b40] transition hover:bg-[#fff0ed]"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
    <aside className="space-y-4">
      <section className="rounded-2xl border border-[#e3e8e4] bg-white p-5">
        <h3 className="font-bold">문제지 정보</h3>
        <div className="mt-4 rounded-xl border border-[#d9e5de] bg-[#f3f8f5] px-3 py-2.5">
          <span className="block text-[11px] font-semibold text-[#617069]">자동 제목</span>
          <b className="mt-0.5 block text-sm text-[#1f6b4f]">{title}</b>
          <span className="mt-1 block text-[11px] text-[#748079]">분류 체계에서 선택한 과목명이 제목과 파일명에 사용됩니다.</span>
        </div>
        <label className="mt-4 block text-xs text-[#6d7772]">학교명<input className="focus-ring mt-1 w-full rounded-xl border border-[#e3e8e4] px-3 py-2 text-sm text-[#18201d]" value={school} onChange={(event) => setSchool(event.target.value)} /></label>
        <label className="mt-4 block text-xs text-[#6d7772]">과목
          <select className="focus-ring mt-1 w-full rounded-xl border border-[#e3e8e4] bg-white px-3 py-2 text-sm text-[#18201d] disabled:bg-[#f1f4f2] disabled:text-[#6f7a74]" value={effectiveSubject} disabled={Boolean(linkedSubject)} onChange={(event) => setSubject(event.target.value)}>
            {curriculumSubjects.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}
          </select>
          {linkedSubject && <span className="mt-1 block text-[11px] font-medium text-[#1f6b4f]">선택 문항의 분류에서 자동 연동됨</span>}
          {linkedSubjectIds.length > 1 && <span className="mt-1 block text-[11px] font-medium text-[#a06420]">서로 다른 과목의 문항이 섞여 있어 제목을 ‘통합 문제지’로 생성합니다.</span>}
        </label>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <label className="block text-xs text-[#6d7772]">학년<input className="focus-ring mt-1 w-full rounded-xl border border-[#e3e8e4] px-3 py-2 text-sm text-[#18201d]" value={grade} onChange={(event) => setGrade(event.target.value)} /></label>
          <label className="block text-xs text-[#6d7772]">시험명<input className="focus-ring mt-1 w-full rounded-xl border border-[#e3e8e4] px-3 py-2 text-sm text-[#18201d]" value={examName} onChange={(event) => setExamName(event.target.value)} /></label>
        </div>
        <label className="mt-4 block text-xs text-[#6d7772]">시행일<input type="date" className="focus-ring mt-1 w-full rounded-xl border border-[#e3e8e4] px-3 py-2 text-sm text-[#18201d]" value={examDate} onChange={(event) => setExamDate(event.target.value)} /></label>
      </section>
      <section className="rounded-2xl border border-[#e3e8e4] bg-white p-5">
        <h3 className="font-bold">양식 설정</h3>
        <p className="mt-1 text-xs leading-5 text-[#6d7772]">왼쪽 단을 위에서 아래로 채운 뒤 오른쪽 단으로 이어서, 한 쪽에 4개 또는 6개씩 배치합니다.</p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          {([4, 6] as const).map((count) => <button key={count} onClick={() => setQuestionsPerPage(count)} className={`focus-ring rounded-xl border px-3 py-3 text-sm font-semibold transition ${questionsPerPage === count ? "border-[#1f6b4f] bg-[#eef6f1] text-[#1f6b4f]" : "border-[#e3e8e4] hover:bg-[#f8faf8]"}`}>{count}문항/쪽</button>)}
        </div>
        <label className="mt-4 flex items-center justify-between text-sm"><span>학생 정보란</span><input type="checkbox" className="size-4 accent-[#1f6b4f]" checked={showStudentFields} onChange={(event) => setShowStudentFields(event.target.checked)} /></label>
        <label className="mt-3 flex items-center justify-between text-sm"><span>배점 표시</span><input type="checkbox" className="size-4 accent-[#1f6b4f]" checked={showScores} onChange={(event) => setShowScores(event.target.checked)} /></label>
      </section>
      <Button disabled={!selectedCards.length || Boolean(exportingFormat) || previewingPdf} onClick={() => void previewPdf()}>
        {previewingPdf ? <LoaderCircle className="animate-spin" size={17} /> : <Eye size={17} />}
        {previewingPdf ? "미리보기 생성 중" : "PDF 미리보기"}
      </Button>
      <Button variant="primary" disabled={!selectedCards.length || Boolean(exportingFormat) || previewingPdf} onClick={() => void exportPdf()}>
        {exportingFormat === "pdf" ? <LoaderCircle className="animate-spin" size={17} /> : <FileOutput size={17} />}
        {exportingFormat === "pdf" ? "PDF 생성 중" : "PDF 문제지 생성"}
      </Button>
      <Button disabled={!selectedCards.length || Boolean(exportingFormat) || previewingPdf} onClick={() => void exportHwpx()}>
        {exportingFormat === "hwpx" ? <LoaderCircle className="animate-spin" size={17} /> : <FileOutput size={17} />}
        {exportingFormat === "hwpx" ? "HWPX 생성 중" : "HWPX 호환용"}
      </Button>
      {exportMessage && <p role="status" className="rounded-xl bg-[#eef5f0] p-3 text-xs leading-5 text-[#285243]">{exportMessage}</p>}
    </aside>
  </div>
  {pdfPreviewUrl && (
    <div role="dialog" aria-modal="true" aria-label="PDF 문제지 미리보기" className="fixed inset-0 z-[80] grid bg-[#111814]/75 p-3 backdrop-blur-sm sm:p-6">
      <div className="flex min-h-0 flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#e2e7e4] px-4 py-3 sm:px-5">
          <div>
            <b className="block text-sm">PDF 문제지 미리보기</b>
            <span className="text-xs text-[#6d7772]">{title} · {selectedCards.length}문항 · {questionsPerPage}문항/쪽</span>
          </div>
          <button aria-label="미리보기 닫기" className="focus-ring grid size-9 place-items-center rounded-xl border border-[#dce3df] hover:bg-[#f2f6f3]" onClick={() => setPdfPreviewUrl("")}><X size={17} /></button>
        </div>
        <iframe title="생성될 PDF 문제지" className="min-h-0 flex-1 bg-[#e8ece9]" src={`${pdfPreviewUrl}#toolbar=1&navpanes=0&view=FitH`} />
      </div>
    </div>
  )}
  </>;
}

function Categories() {
  return <CategoriesManager />;
}

function LocalStorageSettings() {
  const [folder, setFolder] = useState<LocalFolderState | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void getLocalFolderState().then(setFolder);
  }, []);

  async function chooseFolder() {
    setBusy(true);
    setMessage("");
    try {
      await selectLocalRootDirectory();
      const next = await getLocalFolderState();
      setFolder(next);
      setMessage("저장 폴더를 연결했습니다.");
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        setMessage(error instanceof Error ? error.message : "저장 폴더를 연결하지 못했습니다.");
      }
    } finally {
      setBusy(false);
    }
  }

  const permissionText = folder?.permission === "granted"
    ? "쓰기 허용"
    : folder?.configured
      ? "사용할 때 권한 확인"
      : "연결 필요";

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <section className="rounded-2xl border border-[#e3e8e4] bg-white p-6">
        <div className="flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#dcefe5] text-[#1f6b4f]"><HardDrive size={21} /></span>
          <div>
            <h2 className="font-bold">PC 로컬 파일 저장소</h2>
            <p className="mt-1 text-sm leading-6 text-[#6d7772]">PDF, 문항 이미지, HWPX를 저장할 폴더를 선택합니다. 파일은 클라우드에 업로드되지 않습니다.</p>
          </div>
        </div>
        <dl className="mt-5 grid grid-cols-[100px_1fr] gap-y-3 border-y border-[#edf0ee] py-4 text-sm">
          <dt className="text-[#6d7772]">브라우저</dt><dd>{folder?.supported === false ? "미지원" : "Chrome / Edge 호환"}</dd>
          <dt className="text-[#6d7772]">저장 폴더</dt><dd className="font-semibold">{folder?.name ?? "선택되지 않음"}</dd>
          <dt className="text-[#6d7772]">권한 상태</dt><dd>{permissionText}</dd>
        </dl>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button variant="primary" onClick={() => void chooseFolder()}>
            {busy ? <LoaderCircle className="animate-spin" size={16} /> : <FolderOpen size={16} />}
            {folder?.configured ? "폴더 변경" : "저장 폴더 선택"}
          </Button>
          {message && <span role="status" className="text-sm font-medium text-[#1f6b4f]">{message}</span>}
        </div>
      </section>
      <section className="rounded-2xl border border-[#e3e8e4] bg-white p-6">
        <h2 className="font-bold">무료 Firebase 구성</h2>
        <p className="mt-2 text-sm leading-6 text-[#6d7772]">Authentication과 Firestore만 사용합니다. Firebase Storage와 Blaze 결제 등록은 필요하지 않습니다.</p>
        <div className="mt-4 space-y-3 text-sm">
          <p className="rounded-xl bg-[#f5f8f5] p-3"><b>Firestore</b><span className="ml-2 text-[#6d7772]">과목, 단원, 문항 좌표, 태그</span></p>
          <p className="rounded-xl bg-[#f5f8f5] p-3"><b>PC 폴더</b><span className="ml-2 text-[#6d7772]">원본 PDF, 카드 이미지, HWPX</span></p>
        </div>
      </section>
    </div>
  );
}

export function WorkspacePage({ view }: { view: View }) {
  const [upload, setUpload] = useState(false);
  const title: Record<View, [string,string]> = {
    dashboard: ["",""], documents:["PDF 문서","원본 자료와 문항 분석 상태를 관리합니다."], questions:["문항 카드","검토가 끝난 문항을 검색하고 조합합니다."], "exam-sets":["문제지 제작","문항 순서와 배점을 정하고 PDF로 내보냅니다."], categories:["분류 체계","과목, 교육과정, 단원과 태그를 관리합니다."], settings:["설정","작업 공간과 내보내기 파일을 관리합니다."],
  };
  return <Shell view={view} onUpload={()=>setUpload(true)}>
    {view !== "dashboard" && <Heading title={title[view][0]} subtitle={title[view][1]} />}
    {view === "dashboard" && <Dashboard />}
    {view === "documents" && <DocumentsView />}
    {view === "questions" && <QuestionCards />}
    {view === "exam-sets" && <ExamSets />}
    {view === "categories" && <Categories />}
    {view === "settings" && <LocalStorageSettings />}
    {upload && <UploadModal onClose={()=>setUpload(false)} />}
  </Shell>;
}
