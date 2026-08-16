import type { RegionType } from "@/types/domain";

export interface PdfTextFragment {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PdfVisualElement {
  x: number;
  y: number;
  width: number;
  height: number;
  kind: "image" | "vector";
}

export interface PdfPageTextContent {
  pageNumber: number;
  pageWidth: number;
  pageHeight: number;
  fragments: PdfTextFragment[];
  visuals?: PdfVisualElement[];
}

export interface EditableRegion {
  id: string;
  questionKey: string;
  questionNumber: string | null;
  pageNumber: number;
  xRatio: number;
  yRatio: number;
  widthRatio: number;
  heightRatio: number;
  regionType: RegionType;
  sortOrder: number;
  status: "auto_detected" | "needs_review" | "reviewed";
  detectionConfidence?: number;
  detectionReasons?: string[];
}

interface TextLine {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ForcedColumnLayout {
  twoColumns: true;
  split: number;
}

const QUESTION_MARKER = /^\s*(\d{1,3})\s*[.)](?!\d)(?:\s|$)/;
const QUESTION_CUE = /[?？]$|\[(?:\d+)\s*점\]|(?:옳은|옳지 않은|적절한|적절하지 않은|고르시오|것은)/;
const CHOICE_CUE = /^[①②③④⑤⑥]/;
const ANSWER_GUIDANCE = /^정답\s*(?:찾기|확인|분석|근거)(?:\s|$)/;
const SECTION_BOUNDARY = /^(?:정답(?!\s*(?:찾기|확인|분석|근거)(?:\s|$))|해설|풀이|해답|정답률|보기\s*선택\s*비율)(?:\s|$)/;
const ANSWER_BOUNDARY = /^정답(?:\s|$)/;
const EXPLANATION_BOUNDARY = /^(?:해설|풀이|해답)(?:\s|$)/;
const FOOTER_CUE = /저작권|무단\s*(?:복제|전재)|^\s*\d+\s*\/\s*\d+\s*$/;
const PAGE_EDGE_PADDING_RATIO = 0.015;
const EARLY_SECTION_BOUNDARY_RATIO = 0.16;

function clamp(value: number, minimum = 0, maximum = 1) {
  return Math.min(maximum, Math.max(minimum, value));
}

function findContentBottom(lines: TextLine[], pageHeight: number) {
  const footerLine = lines.find((line) => line.y > pageHeight * 0.78 && FOOTER_CUE.test(line.text));
  const pageBottom = pageHeight * (1 - PAGE_EDGE_PADDING_RATIO);
  return Math.max(pageHeight * 0.5, Math.min(pageBottom, footerLine ? footerLine.y - 8 : pageBottom));
}

export function groupTextFragmentsIntoLines(fragments: PdfTextFragment[], pageWidth?: number) {
  const sorted = [...fragments]
    .filter((fragment) => fragment.text.trim())
    .sort((a, b) => a.y - b.y || a.x - b.x);
  const lines: Array<PdfTextFragment[]> = [];

  for (const fragment of sorted) {
    const tolerance = Math.max(3, fragment.height * 0.45);
    const line = lines.find((candidate) => Math.abs(candidate[0].y - fragment.y) <= tolerance);
    if (line) line.push(fragment);
    else lines.push([fragment]);
  }

  return lines.flatMap<TextLine>((line) => {
    line.sort((a, b) => a.x - b.x);
    const groups: Array<PdfTextFragment[]> = [];
    for (const item of line) {
      const current = groups.at(-1);
      const previous = current?.at(-1);
      const splitGap = Math.max(42, item.height * 6);
      const gap = previous ? item.x - (previous.x + previous.width) : 0;
      const crossesColumnGutter = Boolean(
        pageWidth &&
        previous &&
        previous.x < pageWidth * 0.5 &&
        item.x >= pageWidth * 0.5 &&
        gap > pageWidth * 0.025,
      );
      if (!current || !previous || gap > splitGap || crossesColumnGutter) {
        groups.push([item]);
      } else {
        current.push(item);
      }
    }
    return groups.map((group) => {
      const left = Math.min(...group.map((item) => item.x));
      const top = Math.min(...group.map((item) => item.y));
      const right = Math.max(...group.map((item) => item.x + item.width));
      const bottom = Math.max(...group.map((item) => item.y + item.height));
      return {
        text: group.map((item) => item.text).join(" ").replace(/[\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim(),
        x: left,
        y: top,
        width: right - left,
        height: bottom - top,
      };
    });
  }).sort((a, b) => a.y - b.y || a.x - b.x);
}

function markerConfidence(line: TextLine, lines: TextLine[], pageWidth: number, pageHeight: number) {
  const match = line.text.match(QUESTION_MARKER);
  if (!match) return null;
  if (line.text.includes("%")) return null;

  let score = 2;
  if (QUESTION_CUE.test(line.text)) score += 3;
  if (line.x < pageWidth * 0.12 || (line.x > pageWidth * 0.47 && line.x < pageWidth * 0.62)) score += 2;
  if (line.height >= 8) score += 1;

  const sameColumn = (candidate: TextLine) => Math.abs(candidate.x - line.x) < pageWidth * 0.12;
  const nearby = lines.filter((candidate) =>
    candidate.y > line.y &&
    candidate.y < Math.min(pageHeight * 0.9, line.y + pageHeight * 0.32) &&
    sameColumn(candidate),
  );
  if (nearby.some((candidate) => CHOICE_CUE.test(candidate.text))) score += 2;
  if (nearby.some((candidate) => /^\[\d+\s*점\]/.test(candidate.text))) score += 1;
  if (nearby.some((candidate) => SECTION_BOUNDARY.test(candidate.text))) score += 1;

  return score >= 5 ? { line, match, score } : null;
}

type MarkerCandidate = {
  line: TextLine;
  match: RegExpMatchArray;
  score: number;
};

function removeNestedNumberedListMarkers(
  markers: MarkerCandidate[],
  pageWidth: number,
  pageHeight: number,
) {
  return markers.filter((candidate, index) => {
    const candidateNumber = Number(candidate.match[1]);
    const candidateColumn = candidate.line.x >= pageWidth * 0.5 ? 1 : 0;
    return !markers.slice(0, index).some((previous) => {
      const previousColumn = previous.line.x >= pageWidth * 0.5 ? 1 : 0;
      const verticalGap = candidate.line.y - previous.line.y;
      return previousColumn === candidateColumn &&
        verticalGap > 0 &&
        verticalGap < pageHeight * 0.18 &&
        Number(previous.match[1]) > candidateNumber &&
        previous.score >= candidate.score;
    });
  });
}

function inferColumnAnchors(markers: Array<{ line: TextLine }>, pageWidth: number) {
  const sortedX = [...markers].map(({ line }) => line.x).sort((a, b) => a - b);
  if (sortedX.length < 2) return { twoColumns: false, split: pageWidth };
  let largestGap = 0;
  let split = pageWidth;
  for (let index = 1; index < sortedX.length; index += 1) {
    const gap = sortedX[index] - sortedX[index - 1];
    if (gap > largestGap) {
      largestGap = gap;
      split = (sortedX[index] + sortedX[index - 1]) / 2;
    }
  }
  return {
    twoColumns: largestGap > pageWidth * 0.24,
    split: largestGap > pageWidth * 0.24
      ? clamp(split + largestGap / 2 - pageWidth * 0.04, pageWidth * 0.32, pageWidth * 0.72)
      : split,
  };
}

function inferColumnsFromLineStarts(lines: TextLine[], pageWidth: number, pageHeight: number) {
  const starts = lines
    .filter((line) =>
      line.y > pageHeight * 0.04 &&
      line.y < pageHeight * 0.94 &&
      line.width < pageWidth * 0.72,
    )
    .map((line) => line.x)
    .sort((a, b) => a - b);
  if (starts.length < 8) return { twoColumns: false, split: pageWidth };

  let best: { gap: number; rightAnchor: number } | null = null;
  for (let index = 3; index < starts.length - 3; index += 1) {
    const gap = starts[index] - starts[index - 1];
    const rightAnchor = starts[index];
    if (
      gap > pageWidth * 0.16 &&
      rightAnchor > pageWidth * 0.38 &&
      rightAnchor < pageWidth * 0.82 &&
      (!best || gap > best.gap)
    ) {
      best = { gap, rightAnchor };
    }
  }

  return best
    ? {
        twoColumns: true,
        split: clamp(best.rightAnchor - pageWidth * 0.04, pageWidth * 0.32, pageWidth * 0.72),
      }
    : { twoColumns: false, split: pageWidth };
}

function inferPageColumns(
  lines: TextLine[],
  markers: Array<{ line: TextLine }>,
  pageWidth: number,
  pageHeight: number,
) {
  const markerLayout = inferColumnAnchors(markers, pageWidth);
  if (markerLayout.twoColumns) return markerLayout;
  return inferColumnsFromLineStarts(lines, pageWidth, pageHeight);
}

function normalizeEdgeText(text: string) {
  return text
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/\d+/g, "#")
    .replace(/\s+/g, " ")
    .trim();
}

function edgeLineSignature(line: TextLine, pageWidth: number, pageHeight: number) {
  const edge = line.y < pageHeight * 0.13 ? "top" : line.y > pageHeight * 0.86 ? "bottom" : null;
  if (!edge) return null;
  const normalized = normalizeEdgeText(line.text);
  if (normalized.length < 2) return null;
  const center = line.x + line.width / 2;
  const horizontalZone = center < pageWidth / 3 ? "left" : center > pageWidth * 2 / 3 ? "right" : "center";
  return `${edge}:${horizontalZone}:${normalized}`;
}

function findRepeatedEdgeLineSignatures(
  pages: Array<{ pageWidth: number; pageHeight: number; lines: TextLine[] }>,
) {
  if (pages.length < 2) return new Set<string>();
  const pageNumbersBySignature = new Map<string, Set<number>>();
  pages.forEach((page, pageIndex) => {
    for (const line of page.lines) {
      const signature = edgeLineSignature(line, page.pageWidth, page.pageHeight);
      if (!signature) continue;
      const pageNumbers = pageNumbersBySignature.get(signature) ?? new Set<number>();
      pageNumbers.add(pageIndex);
      pageNumbersBySignature.set(signature, pageNumbers);
    }
  });
  const minimumPages = Math.max(2, Math.ceil(pages.length * 0.45));
  return new Set(
    [...pageNumbersBySignature.entries()]
      .filter(([, pageNumbers]) => pageNumbers.size >= minimumPages)
      .map(([signature]) => signature),
  );
}

function repeatedHeaderBottom(
  rawLines: TextLine[],
  pageWidth: number,
  pageHeight: number,
  repeatedEdgeLines: Set<string>,
) {
  const headerLines = rawLines.filter((line) => {
    const signature = edgeLineSignature(line, pageWidth, pageHeight);
    return line.y < pageHeight * 0.13 && Boolean(signature && repeatedEdgeLines.has(signature));
  });
  if (!headerLines.length) return pageHeight * PAGE_EDGE_PADDING_RATIO;
  return Math.max(
    pageHeight * PAGE_EDGE_PADDING_RATIO,
    ...headerLines.map((line) => line.y + line.height + 4),
  );
}

function repeatedFooterTop(
  rawLines: TextLine[],
  pageWidth: number,
  pageHeight: number,
  repeatedEdgeLines: Set<string>,
) {
  const footerLines = rawLines.filter((line) => {
    const signature = edgeLineSignature(line, pageWidth, pageHeight);
    return line.y > pageHeight * 0.86 && Boolean(signature && repeatedEdgeLines.has(signature));
  });
  return footerLines.length
    ? Math.min(...footerLines.map((line) => line.y - 8))
    : pageHeight * (1 - PAGE_EDGE_PADDING_RATIO);
}

function analyzePageLayout(
  page: PdfPageTextContent,
  rawLines = groupTextFragmentsIntoLines(page.fragments, page.pageWidth),
  repeatedEdgeLines = new Set<string>(),
  forcedColumnLayout?: ForcedColumnLayout,
) {
  const lines = rawLines.filter((line) => {
    const signature = edgeLineSignature(line, page.pageWidth, page.pageHeight);
    return !signature || !repeatedEdgeLines.has(signature);
  });
  const rawMarkers = lines
    .map((line) => markerConfidence(line, lines, page.pageWidth, page.pageHeight))
    .filter((candidate): candidate is MarkerCandidate => Boolean(candidate))
    .filter(({ line }) => line.y > page.pageHeight * 0.035 && line.y < page.pageHeight * 0.96);
  const markers = removeNestedNumberedListMarkers(rawMarkers, page.pageWidth, page.pageHeight);
  const inferredColumns = inferPageColumns(lines, markers, page.pageWidth, page.pageHeight);
  const twoColumns = forcedColumnLayout?.twoColumns ?? inferredColumns.twoColumns;
  const split = forcedColumnLayout?.split ?? inferredColumns.split;
  const columnOf = (line: Pick<TextLine, "x">) => twoColumns && line.x >= split ? 1 : 0;
  const contentBottom = Math.min(
    findContentBottom(rawLines, page.pageHeight),
    repeatedFooterTop(rawLines, page.pageWidth, page.pageHeight, repeatedEdgeLines),
  );
  const columns = twoColumns ? [0, 1] : [0];
  const visuals = page.visuals ?? [];
  const headerBottom = repeatedHeaderBottom(rawLines, page.pageWidth, page.pageHeight, repeatedEdgeLines);
  const earlyFirstQuestionTop = page.pageNumber === 1
    ? markers
        .map(({ line }) => line.y - 8)
        .filter((markerTop) => markerTop > headerBottom + 4 && markerTop < page.pageHeight * 0.24)
        .sort((a, b) => a - b)[0]
    : undefined;
  const top = Math.max(headerBottom, earlyFirstQuestionTop ?? headerBottom);
  const contentTop = new Map(columns.map((column) => [column, top]));

  return {
    ...page,
    visuals,
    lines,
    markers,
    twoColumns,
    split,
    columnOf,
    contentBottom,
    contentTop,
    columns,
    forcedTwoColumn: Boolean(forcedColumnLayout),
    firstQuestionTopGuarded: earlyFirstQuestionTop !== undefined,
  };
}

export function detectQuestionRegions(
  fragments: PdfTextFragment[],
  pageNumber: number,
  pageWidth: number,
  pageHeight: number,
): EditableRegion[] {
  return regionsFromAnalyzedPage(analyzePageLayout({
    pageNumber,
    pageWidth,
    pageHeight,
    fragments,
  }));
}

function regionsFromAnalyzedPage(page: ReturnType<typeof analyzePageLayout>): EditableRegion[] {
  const {
    pageNumber, pageWidth, pageHeight, lines, markers,
    twoColumns: hasTwoColumns, split, contentBottom, columnOf,
  } = page;

  if (!markers.length) return [];

  const horizontalBounds = (column: number, markerX?: number) => {
    const columnLeft = column === 1 ? split : 0;
    const columnRight = hasTwoColumns && column === 0 ? split : pageWidth;
    const edgeInset = 4;
    return {
      left: Math.max(columnLeft + edgeInset, markerX === undefined ? columnLeft + edgeInset : markerX - 14),
      right: columnRight - (hasTwoColumns && column === 0 ? 3 : edgeInset),
    };
  };

  return markers.map(({ line, match, score }, index) => {
    const column = columnOf(line);
    const next = markers
      .filter(({ line: candidate }) => candidate.y > line.y && columnOf(candidate) === column)
      .sort((a, b) => a.line.y - b.line.y)[0];
    const { left, right } = horizontalBounds(column, line.x);
    const top = Math.max(8, line.y - 8);
    const structuralBoundary = lines.find((candidate) =>
      candidate.y > line.y + line.height &&
      candidate.y < (next?.line.y ?? contentBottom) &&
      columnOf(candidate) === column &&
      candidate.x < right - pageWidth * 0.08 &&
      SECTION_BOUNDARY.test(candidate.text),
    );
    const bottom = Math.min(
      contentBottom,
      next ? next.line.y - 10 : contentBottom,
      structuralBoundary ? structuralBoundary.y - 10 : contentBottom,
    );
    const questionNumber = match[1];

    return {
      id: crypto.randomUUID(),
      questionKey: `q-${pageNumber}-${questionNumber}-${index}`,
      questionNumber,
      pageNumber,
      xRatio: clamp(left / pageWidth),
      yRatio: clamp(top / pageHeight),
      widthRatio: clamp((right - left) / pageWidth, 0.04),
      heightRatio: clamp((Math.max(bottom, top + line.height + 20) - top) / pageHeight, 0.025),
      regionType: "question",
      sortOrder: 0,
      status: "auto_detected",
      detectionConfidence: clamp(0.35 + score * 0.08, 0, 0.98),
      detectionReasons: [
        "문항 번호",
        ...(QUESTION_CUE.test(line.text) ? ["문제 문장"] : []),
        ...(page.forcedTwoColumn ? ["문서 2단 레이아웃 유지"] : []),
      ],
    };
  });
}

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function inferDominantDocumentColumnLayout(
  analyses: Array<ReturnType<typeof analyzePageLayout>>,
) {
  const pagesWithQuestions = analyses.filter((page) => page.markers.length > 0);
  const twoColumnPages = pagesWithQuestions.filter((page) => page.twoColumns);
  const minimumSupportingPages = Math.max(2, Math.ceil(pagesWithQuestions.length * 0.5));
  if (twoColumnPages.length < minimumSupportingPages) return null;
  const splitRatio = median(twoColumnPages.map((page) => page.split / page.pageWidth));
  return splitRatio === null ? null : { splitRatio };
}

export function detectDocumentQuestionRegions(pages: PdfPageTextContent[]) {
  const sortedPages = [...pages].sort((a, b) => a.pageNumber - b.pageNumber);
  const rawLayouts = sortedPages.map((page) => ({
    pageWidth: page.pageWidth,
    pageHeight: page.pageHeight,
    lines: groupTextFragmentsIntoLines(page.fragments, page.pageWidth),
  }));
  const repeatedEdgeLines = findRepeatedEdgeLineSignatures(rawLayouts);
  const initialAnalyses = sortedPages.map((page, index) =>
    analyzePageLayout(page, rawLayouts[index].lines, repeatedEdgeLines),
  );
  const dominantColumnLayout = inferDominantDocumentColumnLayout(initialAnalyses);
  const lastPageNumber = sortedPages.at(-1)?.pageNumber;
  const analyses = initialAnalyses.map((analysis, index) => {
    if (
      !dominantColumnLayout ||
      analysis.twoColumns ||
      analysis.pageNumber !== lastPageNumber ||
      !analysis.markers.length
    ) return analysis;

    const split = dominantColumnLayout.splitRatio * analysis.pageWidth;
    const markerColumns = new Set(analysis.markers.map(({ line }) => line.x >= split ? 1 : 0));
    if (markerColumns.size !== 1) return analysis;
    return analyzePageLayout(
      sortedPages[index],
      rawLayouts[index].lines,
      repeatedEdgeLines,
      { twoColumns: true, split },
    );
  });
  const baseRegions = analyses.flatMap(regionsFromAnalyzedPage);
  const orderedBaseRegions = analyses.flatMap((page) =>
    page.columns.flatMap((column) =>
      baseRegions
        .filter((region) => {
          const regionColumn = page.twoColumns && region.xRatio * page.pageWidth >= page.split ? 1 : 0;
          return region.pageNumber === page.pageNumber && regionColumn === column;
        })
        .sort((a, b) => a.yRatio - b.yRatio),
    ),
  );
  const questionOrder = new Map(orderedBaseRegions.map((region, index) => [region.questionKey, index]));
  const allRegions = [...baseRegions];
  const segments = analyses.flatMap((page) =>
    page.columns.map((column) => ({ page, column })),
  );

  for (const source of baseRegions) {
    const sourcePage = analyses.find((page) => page.pageNumber === source.pageNumber);
    if (!sourcePage) continue;
    const sourceColumn = sourcePage.twoColumns && source.xRatio * sourcePage.pageWidth >= sourcePage.split ? 1 : 0;
    const sourceBottom = (source.yRatio + source.heightRatio) * sourcePage.pageHeight;
    if (sourceBottom < sourcePage.contentBottom - sourcePage.pageHeight * 0.018) continue;

    let segmentIndex = segments.findIndex((segment) =>
      segment.page.pageNumber === source.pageNumber && segment.column === sourceColumn,
    ) + 1;
    let continuationOrder = 1;
    let addedContinuation = false;

    while (segmentIndex > 0 && segmentIndex < segments.length) {
      const target = segments[segmentIndex];
      const { page, column } = target;
      const top = page.contentTop.get(column) ?? page.pageHeight * 0.08;
      const targetQuestions = baseRegions
        .filter((region) => {
          const regionColumn = page.twoColumns && region.xRatio * page.pageWidth >= page.split ? 1 : 0;
          return region.pageNumber === page.pageNumber && regionColumn === column && region.yRatio * page.pageHeight >= top;
        })
        .sort((a, b) => a.yRatio - b.yRatio);
      const nextQuestion = targetQuestions[0];
      const structuralBoundary = page.lines.find((line) =>
        page.columnOf(line) === column &&
        line.y > top + 6 &&
        line.y < (nextQuestion ? nextQuestion.yRatio * page.pageHeight : page.contentBottom) &&
        SECTION_BOUNDARY.test(line.text),
      );
      const startsWithPreviousAnswer = Boolean(
        structuralBoundary &&
        structuralBoundary.y < top + page.pageHeight * EARLY_SECTION_BOUNDARY_RATIO,
      );
      const stopCandidates = [
        page.contentBottom,
        nextQuestion ? nextQuestion.yRatio * page.pageHeight - 10 : Number.POSITIVE_INFINITY,
        structuralBoundary ? structuralBoundary.y - 10 : Number.POSITIVE_INFINITY,
      ];
      const bottom = Math.min(...stopCandidates);
      const meaningfulLines = page.lines.filter((line) =>
        page.columnOf(line) === column &&
        line.y >= top &&
        line.y < bottom &&
        !SECTION_BOUNDARY.test(line.text) &&
        !FOOTER_CUE.test(line.text) &&
        line.text.replace(/\s/g, "").length >= 2,
      );
      const meaningfulVisuals = page.visuals.filter((visual) => {
        const centerX = visual.x + visual.width / 2;
        return page.columnOf({ x: centerX }) === column &&
          visual.y + visual.height >= top &&
          visual.y < bottom &&
          visual.width * visual.height >= page.pageWidth * page.pageHeight * 0.002;
      });
      const hasChoiceBeforeBoundary = meaningfulLines.some((line) => CHOICE_CUE.test(line.text));
      if (startsWithPreviousAnswer && !hasChoiceBeforeBoundary && !meaningfulVisuals.length) break;

      if (bottom - top >= page.pageHeight * 0.025 && (meaningfulLines.length || meaningfulVisuals.length)) {
        const rightColumnStarts = page.lines
          .filter((line) => page.columnOf(line) === 1)
          .map((line) => line.x);
        const rightColumnAnchor = page.twoColumns
          ? rightColumnStarts.length
            ? Math.min(...rightColumnStarts)
            : Math.min(page.pageWidth, page.split + page.pageWidth * 0.04)
          : page.pageWidth;
        const columnLeft = column === 1 ? page.split : 0;
        const columnRight = page.twoColumns && column === 0 ? page.split : page.pageWidth;
        const left = column === 1 ? Math.max(columnLeft + 4, rightColumnAnchor - 14) : 4;
        const right = columnRight - (page.twoColumns && column === 0 ? 3 : 4);
        allRegions.push({
          ...source,
          id: crypto.randomUUID(),
          pageNumber: page.pageNumber,
          xRatio: clamp(left / page.pageWidth),
          yRatio: clamp(top / page.pageHeight),
          widthRatio: clamp((right - left) / page.pageWidth, 0.04),
          heightRatio: clamp((bottom - top) / page.pageHeight, 0.025),
          sortOrder: continuationOrder,
          detectionReasons: [
            ...(source.detectionReasons ?? []),
            ...(page.firstQuestionTopGuarded ? ["첫 문항 시작선 적용"] : []),
          ],
        });
        continuationOrder += 1;
        addedContinuation = true;
      }

      if (nextQuestion || structuralBoundary) break;
      segmentIndex += 1;
    }

    // Keep the source region open to the real page footer. A continuation often
    // begins with a large illustration, while choices can sit below the last
    // extractable text line in the source column. Shrinking to text alone cuts
    // both kinds of visual content.
    void addedContinuation;
  }

  const supplementaryOrder = new Map<string, number>();
  let currentQuestion: EditableRegion | null = null;
  let activeSupplement: { type: "answer" | "explanation"; start: number } | null = null;

  const addSupplementRegion = (
    page: ReturnType<typeof analyzePageLayout>,
    column: number,
    type: "answer" | "explanation",
    start: number,
    end: number,
  ) => {
    if (!currentQuestion || end <= start + 4) return;
    const meaningfulLines = page.lines.filter((line) =>
      page.columnOf(line) === column &&
      line.y + line.height >= start &&
      line.y < end &&
      !FOOTER_CUE.test(line.text) &&
      line.text.replace(/\s/g, "").length >= 2,
    );
    const meaningfulVisuals = page.visuals.filter((visual) => {
      const centerX = visual.x + visual.width / 2;
      return page.columnOf({ x: centerX }) === column &&
        visual.y + visual.height >= start && visual.y < end;
    });
    if (!meaningfulLines.length && !meaningfulVisuals.length) return;

    const columnLeft = column === 1 ? page.split : 0;
    const columnRight = page.twoColumns && column === 0
      ? page.split
      : page.pageWidth;
    const contentLeft = meaningfulLines.length
      ? Math.min(...meaningfulLines.map((line) => line.x - 14))
      : columnLeft + 4;
    const left = Math.max(columnLeft + 4, contentLeft);
    const orderKey = `${currentQuestion.questionKey}:${type}`;
    const sortOrder = supplementaryOrder.get(orderKey) ?? 0;
    supplementaryOrder.set(orderKey, sortOrder + 1);
    allRegions.push({
      id: crypto.randomUUID(),
      questionKey: currentQuestion.questionKey,
      questionNumber: currentQuestion.questionNumber,
      pageNumber: page.pageNumber,
      xRatio: clamp(left / page.pageWidth),
      yRatio: clamp(Math.max(8, start) / page.pageHeight),
      widthRatio: clamp((columnRight - (page.twoColumns && column === 0 ? 3 : 4) - left) / page.pageWidth, 0.04),
      heightRatio: clamp((Math.min(page.contentBottom, end) - Math.max(8, start)) / page.pageHeight, 0.02),
      regionType: type,
      sortOrder,
      status: "auto_detected",
      detectionConfidence: type === "answer" ? 0.9 : 0.84,
      detectionReasons: [type === "answer" ? "정답 표식" : "해설 표식"],
    });
  };

  for (const { page, column } of segments) {
    const top = page.contentTop.get(column) ?? page.pageHeight * PAGE_EDGE_PADDING_RATIO;
    const continuingSupplement = activeSupplement as { type: "answer" | "explanation"; start: number } | null;
    if (continuingSupplement) activeSupplement = { type: continuingSupplement.type, start: top };
    const segmentLines = page.lines
      .filter((line) => page.columnOf(line) === column && line.y >= top && line.y < page.contentBottom)
      .sort((a, b) => a.y - b.y || a.x - b.x);

    for (const line of segmentLines) {
      const marker = page.markers.find((candidate) => candidate.line === line);
      const boundaryType = ANSWER_BOUNDARY.test(line.text) && !ANSWER_GUIDANCE.test(line.text)
        ? "answer" as const
        : EXPLANATION_BOUNDARY.test(line.text)
          ? "explanation" as const
          : null;
      if (!marker && !boundaryType) continue;

      if (activeSupplement) {
        addSupplementRegion(page, column, activeSupplement.type, activeSupplement.start, line.y - 6);
      }

      if (marker) {
        const markerRegion = baseRegions.find((region) =>
          region.pageNumber === page.pageNumber &&
          region.questionNumber === marker.match[1] &&
          Math.abs(region.yRatio * page.pageHeight - (marker.line.y - 8)) < 3 &&
          Math.abs(region.xRatio * page.pageWidth - Math.max((column === 1 ? page.split : 0) + 4, marker.line.x - 14)) < 3,
        );
        currentQuestion = markerRegion ?? null;
        activeSupplement = null;
      } else if (boundaryType && currentQuestion) {
        activeSupplement = { type: boundaryType, start: Math.max(top, line.y - 6) };
      }
    }

    if (activeSupplement) {
      addSupplementRegion(page, column, activeSupplement.type, activeSupplement.start, page.contentBottom);
    }
  }

  const sortedRegions = allRegions.sort((a, b) =>
    (questionOrder.get(a.questionKey) ?? Number.MAX_SAFE_INTEGER) -
      (questionOrder.get(b.questionKey) ?? Number.MAX_SAFE_INTEGER) ||
    ({ question: 0, answer: 1, explanation: 2 }[a.regionType] -
      { question: 0, answer: 1, explanation: 2 }[b.regionType]) ||
    a.sortOrder - b.sortOrder ||
    a.pageNumber - b.pageNumber,
  );

  const firstSegments = sortedRegions.filter((region) => region.regionType === "question" && region.sortOrder === 0);
  for (let index = 1; index < firstSegments.length; index += 1) {
    const previous = Number(firstSegments[index - 1].questionNumber);
    const current = Number(firstSegments[index].questionNumber);
    if (!Number.isFinite(previous) || !Number.isFinite(current)) continue;
    const jump = current - previous;
    if (jump === 1) {
      firstSegments[index].detectionConfidence = clamp(
        (firstSegments[index].detectionConfidence ?? 0.5) + 0.08,
      );
      firstSegments[index].detectionReasons = [
        ...(firstSegments[index].detectionReasons ?? []),
        "문항 번호 연속",
      ];
    } else if (jump <= 0 || jump > 5) {
      firstSegments[index].detectionConfidence = clamp(
        (firstSegments[index].detectionConfidence ?? 0.5) - 0.25,
      );
      firstSegments[index].detectionReasons = [
        ...(firstSegments[index].detectionReasons ?? []),
        "문항 번호 흐름 확인 필요",
      ];
      if ((firstSegments[index].detectionConfidence ?? 0) < 0.6) {
        sortedRegions
          .filter((region) => region.questionKey === firstSegments[index].questionKey)
          .forEach((region) => { region.status = "needs_review"; });
      }
    }
  }

  if (dominantColumnLayout) {
    for (const region of firstSegments) {
      const page = analyses.find((candidate) => candidate.pageNumber === region.pageNumber);
      if (!page || page.twoColumns || region.widthRatio < 0.7) continue;
      region.detectionConfidence = Math.min(
        0.55,
        clamp((region.detectionConfidence ?? 0.5) - 0.35),
      );
      region.detectionReasons = [
        ...(region.detectionReasons ?? []),
        "문서 2단 레이아웃과 영역 너비 불일치",
      ];
      sortedRegions
        .filter((candidate) => candidate.questionKey === region.questionKey)
        .forEach((candidate) => { candidate.status = "needs_review"; });
    }
  }

  return sortedRegions;
}

export function hasExtractableText(fragments: PdfTextFragment[]) {
  return fragments.reduce((length, fragment) => length + fragment.text.trim().length, 0) >= 12;
}
