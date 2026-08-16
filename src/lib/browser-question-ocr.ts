"use client";

import type { PDFDocumentProxy } from "pdfjs-dist/types/src/display/api";
import type { QuestionTextRecord } from "./auto-classification";
import type { EditableRegion, PdfPageTextContent, PdfVisualElement } from "./question-detection";

export interface QuestionOcrResult {
  records: QuestionTextRecord[];
  enrichedCount: number;
  attemptedCount: number;
}

type ProgressCallback = (message: string) => void;

function normalizeOcrText(value: string) {
  return value
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compact(value: string) {
  return normalizeOcrText(value).replace(/[^0-9A-Za-z가-힣·]/g, "").toLocaleLowerCase("ko-KR");
}

function overlapArea(region: EditableRegion, page: PdfPageTextContent, visual: PdfVisualElement) {
  const left = region.xRatio * page.pageWidth;
  const top = region.yRatio * page.pageHeight;
  const right = left + region.widthRatio * page.pageWidth;
  const bottom = top + region.heightRatio * page.pageHeight;
  const visualRight = visual.x + visual.width;
  const visualBottom = visual.y + visual.height;
  return Math.max(0, Math.min(right, visualRight) - Math.max(left, visual.x)) *
    Math.max(0, Math.min(bottom, visualBottom) - Math.max(top, visual.y));
}

export function shouldRunQuestionOcr(
  record: QuestionTextRecord,
  questionRegions: EditableRegion[],
  pagesByNumber: Map<number, PdfPageTextContent>,
) {
  const textLength = normalizeOcrText(record.questionText).length;
  if (!questionRegions.length || textLength >= 260) return false;
  const containsVisual = questionRegions.some((region) => {
    const page = pagesByNumber.get(region.pageNumber);
    if (!page) return false;
    const regionArea = Math.max(1, region.widthRatio * page.pageWidth * region.heightRatio * page.pageHeight);
    return (page.visuals ?? []).some((visual) => overlapArea(region, page, visual) / regionArea >= 0.004);
  });
  // Very short text usually means the source material is rasterized even when
  // PDF.js cannot expose its image bounds (for example an image inside a form XObject).
  return containsVisual || textLength < 55;
}

function mergeOcrText(extractedText: string, ocrText: string) {
  const normalized = normalizeOcrText(ocrText);
  if (normalized.length < 4) return extractedText;
  const extractedCompact = compact(extractedText);
  const ocrCompact = compact(normalized);
  if (!ocrCompact || extractedCompact.includes(ocrCompact)) return extractedText;
  return [extractedText, `[이미지 OCR] ${normalized}`].filter(Boolean).join(" ");
}

export async function enrichQuestionTextsWithLocalOcr(
  pdf: PDFDocumentProxy,
  pages: PdfPageTextContent[],
  regions: EditableRegion[],
  records: QuestionTextRecord[],
  onProgress?: ProgressCallback,
): Promise<QuestionOcrResult> {
  const pagesByNumber = new Map(pages.map((page) => [page.pageNumber, page]));
  const questionRegionsByKey = new Map<string, EditableRegion[]>();
  regions.forEach((region) => {
    if (region.status !== "reviewed" || region.regionType !== "question") return;
    questionRegionsByKey.set(region.questionKey, [
      ...(questionRegionsByKey.get(region.questionKey) ?? []),
      region,
    ]);
  });
  const targets = records.flatMap((record) => {
    const questionRegions = questionRegionsByKey.get(record.questionKey) ?? [];
    return shouldRunQuestionOcr(record, questionRegions, pagesByNumber)
      ? questionRegions.map((region) => ({ record, region }))
      : [];
  });
  if (!targets.length) return { records, enrichedCount: 0, attemptedCount: 0 };

  onProgress?.(`이미지 중심 문항 ${new Set(targets.map(({ record }) => record.questionKey)).size}개의 글자를 로컬 OCR로 읽고 있습니다.`);
  const { createWorker, OEM, PSM } = await import("tesseract.js");
  let lastProgress = -1;
  const worker = await createWorker(["kor", "eng"], OEM.LSTM_ONLY, {
    logger: (detail) => {
      const progress = Math.round(detail.progress * 100);
      if (progress >= lastProgress + 10) {
        lastProgress = progress;
        onProgress?.(`무료 한국어 OCR 모델을 준비하고 있습니다. ${progress}%`);
      }
    },
  });
  await worker.setParameters({
    tessedit_pageseg_mode: PSM.SPARSE_TEXT,
    preserve_interword_spaces: "1",
  });

  const ocrByQuestion = new Map<string, string[]>();
  const groupedByPage = new Map<number, typeof targets>();
  targets.forEach((target) => groupedByPage.set(target.region.pageNumber, [
    ...(groupedByPage.get(target.region.pageNumber) ?? []),
    target,
  ]));
  let completed = 0;
  try {
    for (const [pageNumber, pageTargets] of groupedByPage) {
      const page = await pdf.getPage(pageNumber);
      const scale = 2.6;
      const viewport = page.getViewport({ scale });
      const pageCanvas = document.createElement("canvas");
      pageCanvas.width = Math.ceil(viewport.width);
      pageCanvas.height = Math.ceil(viewport.height);
      const pageContext = pageCanvas.getContext("2d", { willReadFrequently: true });
      if (!pageContext) continue;
      await page.render({ canvas: pageCanvas, canvasContext: pageContext, viewport }).promise;

      for (const { record, region } of pageTargets) {
        const padding = 10;
        const sourceX = Math.max(0, Math.floor(region.xRatio * viewport.width) - padding);
        const sourceY = Math.max(0, Math.floor(region.yRatio * viewport.height) - padding);
        const sourceWidth = Math.min(
          pageCanvas.width - sourceX,
          Math.ceil(region.widthRatio * viewport.width) + padding * 2,
        );
        const sourceHeight = Math.min(
          pageCanvas.height - sourceY,
          Math.ceil(region.heightRatio * viewport.height) + padding * 2,
        );
        if (sourceWidth < 20 || sourceHeight < 20) continue;
        const crop = document.createElement("canvas");
        crop.width = sourceWidth;
        crop.height = sourceHeight;
        const cropContext = crop.getContext("2d", { willReadFrequently: true });
        if (!cropContext) continue;
        cropContext.filter = "grayscale(1) contrast(1.2)";
        cropContext.drawImage(
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
        const result = await worker.recognize(crop);
        const text = normalizeOcrText(result.data.text);
        if (text) ocrByQuestion.set(record.questionKey, [
          ...(ocrByQuestion.get(record.questionKey) ?? []),
          text,
        ]);
        completed += 1;
        onProgress?.(`이미지 글자 분석 ${completed}/${targets.length}`);
      }
    }
  } finally {
    await worker.terminate();
  }

  let enrichedCount = 0;
  const enriched = records.map((record) => {
    const ocrText = (ocrByQuestion.get(record.questionKey) ?? []).join(" ");
    const questionText = mergeOcrText(record.questionText, ocrText);
    if (questionText !== record.questionText) enrichedCount += 1;
    return { ...record, questionText };
  });
  return { records: enriched, enrichedCount, attemptedCount: targets.length };
}
