import type { EditableRegion, PdfPageTextContent, PdfTextFragment } from "./question-detection";
import type { QuestionTextRecord } from "./auto-classification";

function normalizeExtractedText(value: string) {
  return value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function fragmentOverlapsRegion(
  fragment: PdfTextFragment,
  page: PdfPageTextContent,
  region: EditableRegion,
) {
  const regionLeft = region.xRatio * page.pageWidth;
  const regionTop = region.yRatio * page.pageHeight;
  const regionRight = regionLeft + region.widthRatio * page.pageWidth;
  const regionBottom = regionTop + region.heightRatio * page.pageHeight;
  const fragmentRight = fragment.x + Math.max(1, fragment.width);
  const fragmentBottom = fragment.y + Math.max(1, fragment.height);
  const overlapWidth = Math.max(0, Math.min(regionRight, fragmentRight) - Math.max(regionLeft, fragment.x));
  const overlapHeight = Math.max(0, Math.min(regionBottom, fragmentBottom) - Math.max(regionTop, fragment.y));
  const fragmentArea = Math.max(1, fragment.width * fragment.height);
  return overlapWidth * overlapHeight >= fragmentArea * 0.25;
}

function extractRegionText(page: PdfPageTextContent, region: EditableRegion) {
  return normalizeExtractedText(page.fragments
    .filter((fragment) => fragmentOverlapsRegion(fragment, page, region))
    .sort((left, right) => {
      const lineTolerance = Math.max(left.height, right.height) * 0.65;
      return Math.abs(left.y - right.y) <= lineTolerance
        ? left.x - right.x
        : left.y - right.y;
    })
    .map((fragment) => fragment.text)
    .join(" "));
}

export function extractReviewedQuestionTexts(
  pages: PdfPageTextContent[],
  regions: EditableRegion[],
): QuestionTextRecord[] {
  const pagesByNumber = new Map(pages.map((page) => [page.pageNumber, page]));
  const grouped = new Map<string, EditableRegion[]>();
  regions.forEach((region) => {
    if (region.status !== "reviewed") return;
    grouped.set(region.questionKey, [...(grouped.get(region.questionKey) ?? []), region]);
  });

  return Array.from(grouped.entries()).flatMap(([questionKey, questionRegions]) => {
    if (!questionRegions.some((region) => region.regionType === "question")) return [];
    const textByType = (regionType: EditableRegion["regionType"]) => questionRegions
      .filter((region) => region.regionType === regionType)
      .sort((left, right) => left.sortOrder - right.sortOrder || left.pageNumber - right.pageNumber)
      .map((region) => {
        const page = pagesByNumber.get(region.pageNumber);
        return page ? extractRegionText(page, region) : "";
      })
      .filter(Boolean)
      .join(" ");
    return [{
      questionKey,
      questionNumber: questionRegions.find((region) => region.questionNumber)?.questionNumber ?? null,
      questionText: textByType("question"),
      answerText: textByType("answer"),
      explanationText: textByType("explanation"),
    }];
  }).sort((left, right) =>
    (Number(left.questionNumber) || Number.MAX_SAFE_INTEGER) -
    (Number(right.questionNumber) || Number.MAX_SAFE_INTEGER));
}
