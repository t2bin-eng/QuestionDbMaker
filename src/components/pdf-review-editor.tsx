"use client";

import Link from "next/link";
import {
  ArrowLeft, Check, CheckCheck, ChevronLeft, ChevronRight, Download, LoaderCircle, Minus, Plus,
  Redo2, RotateCcw, Save, ScanSearch, Trash2, Undo2, ZoomIn, ZoomOut,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, PDFPageProxy, TextItem } from "pdfjs-dist/types/src/display/api";
import {
  exportReviewTrainingDatasetLocally,
  readReviewDraftLocally,
  readSourcePdfLocally,
  saveReviewDraftLocally,
  saveReviewTrainingSampleLocally,
} from "@/lib/local-file-store";
import { inspectPdfLocally, type PdfInspectionSummary } from "@/lib/pdf-inspector-client";
import {
  detectDocumentQuestionRegions,
  hasExtractableText,
  type EditableRegion,
  type PdfPageTextContent,
  type PdfTextFragment,
  type PdfVisualElement,
} from "@/lib/question-detection";
import { buildReviewTrainingSample } from "@/lib/review-training";

interface ReviewDraft {
  version: 1 | 2 | 3 | 4 | 5 | 6;
  documentId: string;
  fileName?: string;
  pageCount: number;
  regions: EditableRegion[];
  automaticRegions?: EditableRegion[];
  inspection?: PdfInspectionSummary | null;
  savedAt: string;
}

interface PageSize {
  width: number;
  height: number;
}

type DrawMode = "select" | "add";
type Interaction = {
  id: string;
  kind: "move" | "resize";
  startX: number;
  startY: number;
  before: EditableRegion[];
  original: EditableRegion;
};

const buttonClass = "inline-flex items-center justify-center gap-2 rounded-xl border border-[#dce3df] bg-white px-3 py-2 text-sm font-semibold text-[#26332e] transition hover:bg-[#f2f6f3] disabled:cursor-not-allowed disabled:opacity-40";
const primaryButtonClass = "inline-flex items-center justify-center gap-2 rounded-xl border border-[#1f6b4f] bg-[#1f6b4f] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#18553f] disabled:cursor-not-allowed disabled:opacity-50";
const canvasRenderQueues = new WeakMap<HTMLCanvasElement, Promise<void>>();
const pdfTypeLabels: Record<PdfInspectionSummary["pdfType"], string> = {
  TextBased: "텍스트 PDF",
  Scanned: "스캔 PDF",
  ImageBased: "이미지 PDF",
  Mixed: "텍스트·스캔 혼합",
};

async function renderPageToCanvas(page: PDFPageProxy, canvas: HTMLCanvasElement, scale: number) {
  const viewport = page.getViewport({ scale });
  const previous = canvasRenderQueues.get(canvas) ?? Promise.resolve();
  const operation = previous.catch(() => undefined).then(async () => {
    const outputScale = Math.min(window.devicePixelRatio || 1, 2);
    const renderCanvas = document.createElement("canvas");
    renderCanvas.width = Math.floor(viewport.width * outputScale);
    renderCanvas.height = Math.floor(viewport.height * outputScale);
    const renderContext = renderCanvas.getContext("2d");
    if (!renderContext) throw new Error("PDF 렌더링 캔버스를 만들 수 없습니다.");
    await page.render({
      canvas: renderCanvas,
      canvasContext: renderContext,
      viewport,
      transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0],
    }).promise;
    canvas.width = renderCanvas.width;
    canvas.height = renderCanvas.height;
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;
    const displayContext = canvas.getContext("2d");
    if (!displayContext) throw new Error("PDF 표시 캔버스를 만들 수 없습니다.");
    displayContext.drawImage(renderCanvas, 0, 0);
  });
  canvasRenderQueues.set(canvas, operation);
  await operation;
  if (canvasRenderQueues.get(canvas) === operation) canvasRenderQueues.delete(canvas);
  return { width: viewport.width, height: viewport.height };
}

async function extractPageFragments(page: PDFPageProxy) {
  const pdfjs = await import("pdfjs-dist");
  const viewport = page.getViewport({ scale: 1 });
  const [content, operatorList] = await Promise.all([
    page.getTextContent(),
    page.getOperatorList(),
  ]);
  const fragments = content.items.flatMap<PdfTextFragment>((item) => {
    if (!("str" in item)) return [];
    const textItem = item as TextItem;
    const transform = pdfjs.Util.transform(viewport.transform, textItem.transform);
    const height = Math.max(7, Math.hypot(transform[2], transform[3]));
    return [{
      text: textItem.str,
      x: transform[4],
      y: transform[5] - height,
      width: Math.max(1, textItem.width),
      height,
    }];
  });
  const visuals: PdfVisualElement[] = [];
  const stack: number[][] = [];
  let transform = [...viewport.transform];
  const addImageBounds = () => {
    const transformedPoint = (point: number[]) => {
      pdfjs.Util.applyTransform(point, transform);
      return point as [number, number];
    };
    const corners = [
      transformedPoint([0, 0]),
      transformedPoint([1, 0]),
      transformedPoint([0, 1]),
      transformedPoint([1, 1]),
    ];
    const left = Math.min(...corners.map(([x]) => x));
    const right = Math.max(...corners.map(([x]) => x));
    const top = Math.min(...corners.map(([, y]) => y));
    const bottom = Math.max(...corners.map(([, y]) => y));
    const width = right - left;
    const height = bottom - top;
    if (
      width >= 8 && height >= 8 &&
      width <= viewport.width * 0.98 && height <= viewport.height * 0.98 &&
      width * height >= viewport.width * viewport.height * 0.0005
    ) {
      visuals.push({ x: left, y: top, width, height, kind: "image" });
    }
  };

  operatorList.fnArray.forEach((operation, index) => {
    const args = operatorList.argsArray[index] as unknown[] | null;
    if (operation === pdfjs.OPS.save) {
      stack.push([...transform]);
    } else if (operation === pdfjs.OPS.restore) {
      transform = stack.pop() ?? [...viewport.transform];
    } else if (operation === pdfjs.OPS.transform && args?.length === 6) {
      transform = pdfjs.Util.transform(transform, args as number[]);
    } else if (operation === pdfjs.OPS.paintFormXObjectBegin) {
      stack.push([...transform]);
      const matrix = args?.[0];
      if (Array.isArray(matrix) && matrix.length === 6) {
        transform = pdfjs.Util.transform(transform, matrix as number[]);
      }
    } else if (operation === pdfjs.OPS.paintFormXObjectEnd) {
      transform = stack.pop() ?? [...viewport.transform];
    } else if (
      operation === pdfjs.OPS.paintImageXObject ||
      operation === pdfjs.OPS.paintInlineImageXObject
    ) {
      addImageBounds();
    }
  });

  const uniqueVisuals = visuals.filter((visual, index) =>
    visuals.findIndex((candidate) =>
      Math.abs(candidate.x - visual.x) < 2 &&
      Math.abs(candidate.y - visual.y) < 2 &&
      Math.abs(candidate.width - visual.width) < 2 &&
      Math.abs(candidate.height - visual.height) < 2,
    ) === index,
  );
  return { fragments, visuals: uniqueVisuals, width: viewport.width, height: viewport.height };
}

function PageThumbnail({ pdf, pageNumber, active, onClick }: {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  active: boolean;
  onClick: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;
    void pdf.getPage(pageNumber).then(async (page) => {
      if (!canvasRef.current || cancelled) return;
      await renderPageToCanvas(page, canvasRef.current, 0.19);
    });
    return () => { cancelled = true; };
  }, [pageNumber, pdf]);

  return (
    <button onClick={onClick} className={`w-full rounded-xl border p-2 text-left transition ${active ? "border-[#1f6b4f] bg-[#e6f1eb] shadow-sm" : "border-[#dfe5e1] bg-white hover:border-[#a9c3b7]"}`}>
      <canvas ref={canvasRef} className="mx-auto max-w-full bg-white shadow-sm" />
      <span className="mt-2 block text-center font-mono text-xs text-[#64716b]">{pageNumber}</span>
    </button>
  );
}

export function PdfReviewEditor({ documentId }: { documentId: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pageSurfaceRef = useRef<HTMLDivElement>(null);
  const interactionRef = useRef<Interaction | null>(null);
  const drawStartRef = useRef<{ x: number; y: number } | null>(null);
  const regionsRef = useRef<EditableRegion[]>([]);
  const automaticRegionsRef = useRef<EditableRegion[]>([]);
  const inspectionRef = useRef<PdfInspectionSummary | null>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [fileName, setFileName] = useState("source.pdf");
  const [pageNumber, setPageNumber] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>({ width: 620, height: 877 });
  const [regions, setRegions] = useState<EditableRegion[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [mode, setMode] = useState<DrawMode>("select");
  const [drawPreview, setDrawPreview] = useState<Pick<EditableRegion, "xRatio" | "yRatio" | "widthRatio" | "heightRatio"> | null>(null);
  const [undoStack, setUndoStack] = useState<EditableRegion[][]>([]);
  const [redoStack, setRedoStack] = useState<EditableRegion[][]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exportingTraining, setExportingTraining] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState("PDF를 불러오는 중입니다.");
  const [ocrPages, setOcrPages] = useState<number[]>([]);
  const [inspection, setInspection] = useState<PdfInspectionSummary | null>(null);

  const runDetection = useCallback(async (document: PDFDocumentProxy) => {
    setDetecting(true);
    setMessage("페이지의 문항 시작 위치를 분석하고 있습니다.");
    const pages: PdfPageTextContent[] = [];
    const imageOnlyPages: number[] = [];
    try {
      for (let pageNo = 1; pageNo <= document.numPages; pageNo += 1) {
        const page = await document.getPage(pageNo);
        const { fragments, visuals, width, height } = await extractPageFragments(page);
        if (!hasExtractableText(fragments)) imageOnlyPages.push(pageNo);
        pages.push({ pageNumber: pageNo, pageWidth: width, pageHeight: height, fragments, visuals });
      }
      const detected: EditableRegion[] = detectDocumentQuestionRegions(pages);
      setUndoStack((stack) => [...stack, regionsRef.current]);
      setRedoStack([]);
      setRegions(detected);
      automaticRegionsRef.current = detected.map((region) => ({ ...region }));
      setSelectedId(detected[0]?.id ?? null);
      setOcrPages([...new Set([
        ...imageOnlyPages,
        ...(inspectionRef.current?.pagesNeedingOcr ?? []),
      ])].sort((a, b) => a - b));
      setDirty(true);
      setMessage(detected.length
        ? `${detected.length}개 영역을 제안했습니다. 반드시 위치를 검토해 주세요.`
        : "문항 번호를 찾지 못했습니다. 영역 추가 도구로 직접 지정해 주세요.");
    } finally {
      setDetecting(false);
    }
  }, []);

  useEffect(() => {
    regionsRef.current = regions;
  }, [regions]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const file = await readSourcePdfLocally(documentId);
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        const sourceBuffer = await file.arrayBuffer();
        const inspectionPromise = inspectPdfLocally(sourceBuffer.slice(0)).catch(() => null);
        const document = await pdfjs.getDocument({ data: sourceBuffer }).promise;
        const inspected = await inspectionPromise;
        if (cancelled) return;
        setPdf(document);
        setFileName(file.name);
        setInspection(inspected);
        inspectionRef.current = inspected;
        const draft = await readReviewDraftLocally<ReviewDraft>(documentId);
        const hasManualReview = draft?.regions.some((region) => region.status !== "auto_detected");
        if (draft?.regions.length && (draft.version >= 5 || hasManualReview)) {
          setRegions(draft.regions);
          automaticRegionsRef.current = (draft.automaticRegions ?? draft.regions).map((region) => ({ ...region }));
          if (draft.inspection) {
            setInspection(draft.inspection);
            inspectionRef.current = draft.inspection;
          }
          setOcrPages(draft.inspection?.pagesNeedingOcr ?? inspected?.pagesNeedingOcr ?? []);
          setSelectedId(draft.regions[0].id);
          setMessage(`저장된 검수 초안을 불러왔습니다. ${draft.regions.length}개 영역`);
        } else {
          await runDetection(document);
        }
      } catch (error) {
        setLoadError(true);
        setMessage(error instanceof Error ? error.message : "PDF를 열지 못했습니다.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [documentId, runDetection]);

  useEffect(() => {
    if (!pdf || !canvasRef.current) return;
    let cancelled = false;
    void pdf.getPage(pageNumber).then(async (page) => {
      if (!canvasRef.current || cancelled) return;
      const size = await renderPageToCanvas(page, canvasRef.current, 1.15 * zoom);
      if (!cancelled) setPageSize(size);
    });
    return () => { cancelled = true; };
  }, [pageNumber, pdf, zoom]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function commit(next: EditableRegion[]) {
    setUndoStack((stack) => [...stack, regions]);
    setRedoStack([]);
    setRegions(next);
    setDirty(true);
  }

  function undo() {
    const previous = undoStack.at(-1);
    if (!previous) return;
    setRedoStack((stack) => [...stack, regions]);
    setRegions(previous);
    setUndoStack((stack) => stack.slice(0, -1));
    setDirty(true);
  }

  function redo() {
    const next = redoStack.at(-1);
    if (!next) return;
    setUndoStack((stack) => [...stack, regions]);
    setRegions(next);
    setRedoStack((stack) => stack.slice(0, -1));
    setDirty(true);
  }

  function pointerRatio(event: React.PointerEvent) {
    const rectangle = pageSurfaceRef.current?.getBoundingClientRect();
    if (!rectangle) return { x: 0, y: 0 };
    return {
      x: Math.min(1, Math.max(0, (event.clientX - rectangle.left) / rectangle.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rectangle.top) / rectangle.height)),
    };
  }

  function startDrawing(event: React.PointerEvent<HTMLDivElement>) {
    if (mode !== "add" || event.target !== event.currentTarget) return;
    const point = pointerRatio(event);
    drawStartRef.current = point;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrawPreview({ xRatio: point.x, yRatio: point.y, widthRatio: 0, heightRatio: 0 });
  }

  function movePointer(event: React.PointerEvent<HTMLDivElement>) {
    const point = pointerRatio(event);
    if (drawStartRef.current) {
      const start = drawStartRef.current;
      setDrawPreview({
        xRatio: Math.min(start.x, point.x),
        yRatio: Math.min(start.y, point.y),
        widthRatio: Math.abs(point.x - start.x),
        heightRatio: Math.abs(point.y - start.y),
      });
      return;
    }
    const interaction = interactionRef.current;
    if (!interaction) return;
    const deltaX = (event.clientX - interaction.startX) / pageSize.width;
    const deltaY = (event.clientY - interaction.startY) / pageSize.height;
    setRegions((current) => current.map((region) => {
      if (region.id !== interaction.id) return region;
      if (interaction.kind === "resize") {
        return {
          ...region,
          widthRatio: Math.min(1 - region.xRatio, Math.max(0.03, interaction.original.widthRatio + deltaX)),
          heightRatio: Math.min(1 - region.yRatio, Math.max(0.03, interaction.original.heightRatio + deltaY)),
          status: "needs_review",
        };
      }
      return {
        ...region,
        xRatio: Math.min(1 - region.widthRatio, Math.max(0, interaction.original.xRatio + deltaX)),
        yRatio: Math.min(1 - region.heightRatio, Math.max(0, interaction.original.yRatio + deltaY)),
        status: "needs_review",
      };
    }));
    setDirty(true);
  }

  function endPointer(event: React.PointerEvent<HTMLDivElement>) {
    if (drawStartRef.current && drawPreview) {
      if (drawPreview.widthRatio > 0.02 && drawPreview.heightRatio > 0.02) {
        const selected = regions.find((region) => region.id === selectedId);
        const newRegion: EditableRegion = {
          id: crypto.randomUUID(),
          questionKey: selected?.questionKey ?? `manual-${crypto.randomUUID()}`,
          questionNumber: selected?.questionNumber ?? null,
          pageNumber,
          ...drawPreview,
          regionType: "question",
          sortOrder: regions.length,
          status: "needs_review",
        };
        commit([...regions, newRegion]);
        setSelectedId(newRegion.id);
      }
      drawStartRef.current = null;
      setDrawPreview(null);
      setMode("select");
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (interactionRef.current) {
      const before = interactionRef.current.before;
      setUndoStack((stack) => [...stack, before]);
      setRedoStack([]);
      interactionRef.current = null;
    }
  }

  function startRegionInteraction(event: React.PointerEvent, region: EditableRegion, kind: "move" | "resize") {
    if (mode !== "select") return;
    event.stopPropagation();
    setSelectedId(region.id);
    interactionRef.current = {
      id: region.id,
      kind,
      startX: event.clientX,
      startY: event.clientY,
      before: regions,
      original: region,
    };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  async function saveDraft(regionsToSave = regions) {
    if (!pdf) return;
    setSaving(true);
    try {
      const draft: ReviewDraft = {
        version: 6,
        documentId,
        fileName,
        pageCount: pdf.numPages,
        regions: regionsToSave,
        automaticRegions: automaticRegionsRef.current,
        inspection,
        savedAt: new Date().toISOString(),
      };
      await saveReviewDraftLocally(documentId, draft);
      const trainingSample = buildReviewTrainingSample({
        documentId,
        fileName,
        pageCount: pdf.numPages,
        automaticRegions: automaticRegionsRef.current,
        correctedRegions: regionsToSave,
        inspection,
        updatedAt: draft.savedAt,
      });
      await saveReviewTrainingSampleLocally(documentId, trainingSample);
      setDirty(false);
      setMessage(`검수 초안을 저장했습니다. ${regionsToSave.length}개 영역`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "검수 초안을 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  function deleteSelected() {
    if (!selectedId) return;
    commit(regions.filter((region) => region.id !== selectedId));
    setSelectedId(null);
  }

  function markReviewed() {
    if (!selectedId) return;
    commit(regions.map((region) => region.id === selectedId ? { ...region, status: "reviewed" } : region));
  }

  async function markAllReviewed() {
    const pendingCount = regions.filter((region) => region.status !== "reviewed").length;
    if (!pendingCount) return;
    const reviewedRegions: EditableRegion[] = regions.map((region) => ({ ...region, status: "reviewed" }));
    commit(reviewedRegions);
    await saveDraft(reviewedRegions);
    setMessage(`${pendingCount}개 영역을 일괄 검수 완료하고 저장했습니다.`);
  }

  async function exportTrainingDataset() {
    setExportingTraining(true);
    try {
      const result = await exportReviewTrainingDatasetLocally();
      setMessage(`학습 데이터 ${result.sampleCount}건을 ${result.relativePath}에 저장했습니다.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "학습 데이터를 내보내지 못했습니다.");
    } finally {
      setExportingTraining(false);
    }
  }

  const pageRegions = regions.filter((region) => region.pageNumber === pageNumber);
  const groupedQuestions = Array.from(new Map(regions.map((region) => [region.questionKey, region])).values());
  const pendingReviewCount = regions.filter((region) => region.status !== "reviewed").length;

  return (
    <div className="min-h-screen bg-[#edf0ed] text-[#17211d]">
      <header className="sticky top-0 z-30 flex flex-wrap items-center gap-3 border-b border-[#d9dfdb] bg-white px-4 py-3 shadow-sm">
        <Link href="/documents" className={buttonClass}><ArrowLeft size={16} />문서 목록</Link>
        <div className="mr-auto min-w-0">
          <h1 className="truncate font-bold">{fileName} · 문항 영역 검수</h1>
          <p className="text-xs text-[#6b7771]">{message}</p>
        </div>
        <button onClick={() => pdf && void runDetection(pdf)} disabled={!pdf || detecting} className={buttonClass}>
          {detecting ? <LoaderCircle className="animate-spin" size={16} /> : <ScanSearch size={16} />}자동 탐지 재실행
        </button>
        <button onClick={() => setMode(mode === "add" ? "select" : "add")} className={mode === "add" ? primaryButtonClass : buttonClass}>
          <Plus size={16} />영역 추가
        </button>
        <button onClick={deleteSelected} disabled={!selectedId} className={buttonClass}><Trash2 size={16} />삭제</button>
        <button onClick={undo} disabled={!undoStack.length} className={buttonClass} aria-label="실행 취소"><Undo2 size={16} /></button>
        <button onClick={redo} disabled={!redoStack.length} className={buttonClass} aria-label="다시 실행"><Redo2 size={16} /></button>
        <button onClick={() => void saveDraft()} disabled={!pdf || saving} className={primaryButtonClass}>
          {saving ? <LoaderCircle className="animate-spin" size={16} /> : <Save size={16} />}초안 저장
        </button>
        <button onClick={() => void exportTrainingDataset()} disabled={exportingTraining} className={buttonClass}>
          {exportingTraining ? <LoaderCircle className="animate-spin" size={16} /> : <Download size={16} />}학습 데이터
        </button>
      </header>

      <main className="grid min-h-[calc(100vh-65px)] grid-cols-1 lg:grid-cols-[160px_minmax(0,1fr)_310px]">
        <aside className="order-2 border-r border-[#d9dfdb] bg-[#f7f9f7] p-3 lg:order-1">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-[#6b7771]">페이지</h2>
          <div className="grid grid-cols-3 gap-2 lg:grid-cols-1">
            {pdf && Array.from({ length: pdf.numPages }, (_, index) => (
              <PageThumbnail key={index + 1} pdf={pdf} pageNumber={index + 1} active={pageNumber === index + 1} onClick={() => setPageNumber(index + 1)} />
            ))}
          </div>
        </aside>

        <section className="order-1 min-w-0 overflow-auto p-4 lg:order-2 lg:p-6">
          <div className="mb-3 flex items-center justify-center gap-2">
            <button className={buttonClass} onClick={() => setPageNumber((value) => Math.max(1, value - 1))} disabled={pageNumber <= 1}><ChevronLeft size={16} /></button>
            <span className="min-w-24 text-center font-mono text-sm">{pageNumber} / {pdf?.numPages ?? "-"}</span>
            <button className={buttonClass} onClick={() => setPageNumber((value) => Math.min(pdf?.numPages ?? 1, value + 1))} disabled={!pdf || pageNumber >= pdf.numPages}><ChevronRight size={16} /></button>
            <span className="mx-2 h-6 w-px bg-[#d7ded9]" />
            <button className={buttonClass} onClick={() => setZoom((value) => Math.max(0.65, value - 0.15))}><ZoomOut size={16} /></button>
            <span className="min-w-12 text-center font-mono text-xs">{Math.round(zoom * 100)}%</span>
            <button className={buttonClass} onClick={() => setZoom((value) => Math.min(2, value + 0.15))}><ZoomIn size={16} /></button>
          </div>

          {loading && <div className="grid min-h-[600px] place-items-center"><LoaderCircle className="animate-spin text-[#1f6b4f]" size={32} /></div>}
          {!loading && loadError && (
            <div className="mx-auto mb-4 max-w-xl rounded-2xl border border-[#eccb9f] bg-[#fff8ec] p-6 text-center">
              <h2 className="font-bold text-[#734d18]">PDF를 열려면 로컬 폴더 연결이 필요합니다.</h2>
              <p className="mt-2 text-sm leading-6 text-[#86632f]">{message}</p>
              <Link href="/settings" className={`${primaryButtonClass} mt-4`}>설정에서 폴더 연결</Link>
            </div>
          )}
          <div className="mx-auto w-max bg-white shadow-xl">
            <div
              ref={pageSurfaceRef}
              className={`relative touch-none select-none ${mode === "add" ? "cursor-crosshair" : ""}`}
              style={{ width: pageSize.width, height: pageSize.height }}
              onPointerDown={startDrawing}
              onPointerMove={movePointer}
              onPointerUp={endPointer}
              onPointerCancel={endPointer}
            >
              <canvas ref={canvasRef} className="pointer-events-none block" />
              {pageRegions.map((region) => {
                const selected = selectedId === region.id;
                const reviewed = region.status === "reviewed";
                return (
                  <div
                    key={region.id}
                    onPointerDown={(event) => startRegionInteraction(event, region, "move")}
                    className={`absolute border-2 ${selected ? "z-20" : "z-10"} ${selected || reviewed ? "border-[#146c4a] bg-[#2a9a6b]/15" : "border-[#e08a23] bg-[#f5a63c]/10 hover:bg-[#f5a63c]/20"}`}
                    style={{
                      left: `${region.xRatio * 100}%`,
                      top: `${region.yRatio * 100}%`,
                      width: `${region.widthRatio * 100}%`,
                      height: `${region.heightRatio * 100}%`,
                    }}
                  >
                    <span className={`absolute -top-6 left-[-2px] rounded-t-md px-2 py-1 text-[10px] font-bold text-white ${selected || reviewed ? "bg-[#146c4a]" : "bg-[#d37b14]"}`}>
                      {region.questionNumber ? `${region.questionNumber}번` : "새 문항"} · {region.status === "reviewed" ? "검수 완료" : "검수 필요"}
                    </span>
                    {selected && (
                      <button
                        aria-label="영역 크기 조절"
                        onPointerDown={(event) => startRegionInteraction(event, region, "resize")}
                        className="absolute -bottom-2 -right-2 size-4 cursor-nwse-resize rounded-full border-2 border-white bg-[#146c4a] shadow"
                      />
                    )}
                  </div>
                );
              })}
              {drawPreview && (
                <div className="pointer-events-none absolute border-2 border-dashed border-[#146c4a] bg-[#2a9a6b]/15" style={{
                  left: `${drawPreview.xRatio * 100}%`,
                  top: `${drawPreview.yRatio * 100}%`,
                  width: `${drawPreview.widthRatio * 100}%`,
                  height: `${drawPreview.heightRatio * 100}%`,
                }} />
              )}
            </div>
          </div>
        </section>

        <aside className="order-3 border-l border-[#d9dfdb] bg-white p-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-bold">임시 문항</h2>
              <p className="text-xs text-[#6b7771]">{groupedQuestions.length}문항 · {regions.length}개 영역 · 검수 완료 {regions.length - pendingReviewCount}/{regions.length}</p>
            </div>
            {dirty && <span className="rounded-full bg-[#fff0dc] px-2 py-1 text-[10px] font-bold text-[#9a6019]">저장 안 됨</span>}
          </div>
          {inspection && (
            <div className="mt-4 rounded-xl border border-[#cddfd5] bg-[#f1f8f4] p-3 text-xs leading-5 text-[#315b49]">
              <b className="block text-sm text-[#1f6b4f]">정밀 PDF 판별</b>
              {pdfTypeLabels[inspection.pdfType]} · 신뢰도 {Math.round(inspection.confidence * 100)}%
              {inspection.pagesWithColumns.length > 0 && <><br />다단 편집: {inspection.pagesWithColumns.join(", ")}쪽</>}
              {inspection.pagesWithTables.length > 0 && <><br />표 포함: {inspection.pagesWithTables.join(", ")}쪽</>}
              {inspection.hasEncodingIssues && <><br /><span className="text-[#9a6019]">글자 인코딩 확인이 필요합니다.</span></>}
            </div>
          )}
          {ocrPages.length > 0 && (
            <div className="mt-4 rounded-xl border border-[#f0d39e] bg-[#fff8e9] p-3 text-xs leading-5 text-[#81591c]">
              텍스트가 없는 페이지: {ocrPages.join(", ")}쪽<br />해당 페이지는 OCR이 필요하며 수동 영역 지정이 가능합니다.
            </div>
          )}
          <div className="mt-4 space-y-2">
            {regions.map((region, index) => (
              <button
                key={region.id}
                onClick={() => { setSelectedId(region.id); setPageNumber(region.pageNumber); }}
                className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition ${selectedId === region.id ? "border-[#1f6b4f] bg-[#eaf3ee]" : "border-[#e1e6e3] hover:bg-[#f7f9f7]"}`}
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white font-mono text-xs shadow-sm">{region.questionNumber ?? index + 1}</span>
                <span className="min-w-0 flex-1"><b className="block text-sm">문항 영역</b><small className="text-[#6b7771]">{region.pageNumber}쪽 · 영역 {region.sortOrder + 1}</small></span>
                {region.status === "reviewed" ? <Check size={16} className="text-[#1f6b4f]" /> : <Minus size={16} className="text-[#cf7b18]" />}
              </button>
            ))}
          </div>
          {!regions.length && !loading && <div className="mt-5 rounded-xl border border-dashed border-[#ccd6d0] p-6 text-center text-sm text-[#6b7771]">탐지된 영역이 없습니다.<br />상단의 영역 추가를 사용하세요.</div>}
          <div className="sticky bottom-4 mt-5 space-y-2 rounded-2xl border border-[#dfe5e1] bg-[#f8faf8] p-4">
            <h3 className="text-sm font-bold">선택 영역</h3>
            <p className="text-xs leading-5 text-[#6b7771]">영역을 드래그해 이동하고 오른쪽 아래 점으로 크기를 조절합니다. 다른 페이지에서 영역 추가를 누르면 선택한 문항에 연결됩니다.</p>
            <button onClick={markReviewed} disabled={!selectedId} className={`${primaryButtonClass} w-full`}><Check size={16} />이 영역 검수 완료</button>
            <button onClick={() => void markAllReviewed()} disabled={!pendingReviewCount || saving} className={`${primaryButtonClass} w-full`}><CheckCheck size={16} />일괄 검수 완료</button>
            <button onClick={() => pdf && void runDetection(pdf)} disabled={!pdf || detecting} className={`${buttonClass} w-full`}><RotateCcw size={16} />현재 제안 초기화</button>
          </div>
        </aside>
      </main>
    </div>
  );
}
