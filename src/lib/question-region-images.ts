"use client";

import type { PDFDocumentProxy } from "pdfjs-dist/types/src/display/api";
import type { EditableRegion } from "./question-detection";

type ProgressCallback = (message: string) => void;

export async function renderQuestionRegionImages(
  pdf: PDFDocumentProxy,
  regions: EditableRegion[],
  questionKeys: string[],
  onProgress?: ProgressCallback,
) {
  const requestedKeys = new Set(questionKeys);
  const questionRegions = regions
    .filter((region) =>
      region.status === "reviewed" &&
      region.regionType === "question" &&
      requestedKeys.has(region.questionKey))
    .sort((left, right) => left.pageNumber - right.pageNumber || left.sortOrder - right.sortOrder);
  const groupedByPage = new Map<number, EditableRegion[]>();
  questionRegions.forEach((region) => groupedByPage.set(region.pageNumber, [
    ...(groupedByPage.get(region.pageNumber) ?? []),
    region,
  ]));

  const imagesByQuestion: Record<string, string[]> = {};
  let completed = 0;
  for (const [pageNumber, pageRegions] of groupedByPage) {
    const page = await pdf.getPage(pageNumber);
    const scale = 2.25;
    const viewport = page.getViewport({ scale });
    const pageCanvas = document.createElement("canvas");
    pageCanvas.width = Math.ceil(viewport.width);
    pageCanvas.height = Math.ceil(viewport.height);
    const pageContext = pageCanvas.getContext("2d");
    if (!pageContext) continue;
    await page.render({ canvas: pageCanvas, canvasContext: pageContext, viewport }).promise;

    pageRegions.forEach((region) => {
      const padding = 8;
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
      if (sourceWidth < 20 || sourceHeight < 20) return;
      const crop = document.createElement("canvas");
      crop.width = sourceWidth;
      crop.height = sourceHeight;
      const cropContext = crop.getContext("2d");
      if (!cropContext) return;
      cropContext.fillStyle = "#ffffff";
      cropContext.fillRect(0, 0, crop.width, crop.height);
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
      imagesByQuestion[region.questionKey] = [
        ...(imagesByQuestion[region.questionKey] ?? []),
        crop.toDataURL("image/jpeg", 0.9),
      ];
      completed += 1;
      onProgress?.(`Bionic용 원본 문항 이미지 준비 ${completed}/${questionRegions.length}`);
    });
  }
  return imagesByQuestion;
}
