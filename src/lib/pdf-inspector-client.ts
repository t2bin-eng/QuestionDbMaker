import type { PdfProcessResult, PdfType } from "@firecrawl/pdf-inspector-wasm";

export interface PdfInspectionSummary {
  pdfType: PdfType;
  pageCount: number;
  confidence: number;
  pagesNeedingOcr: number[];
  pagesWithColumns: number[];
  pagesWithTables: number[];
  hasEncodingIssues: boolean;
  processingTimeMs: number;
}

type InspectResponse = {
  id: string;
  result?: PdfProcessResult;
  error?: string;
};

function summarize(result: PdfProcessResult): PdfInspectionSummary {
  return {
    pdfType: result.pdfType,
    pageCount: result.pageCount,
    confidence: result.confidence,
    pagesNeedingOcr: result.pagesNeedingOcr,
    pagesWithColumns: result.layout.pagesWithColumns,
    pagesWithTables: result.layout.pagesWithTables,
    hasEncodingIssues: result.hasEncodingIssues,
    processingTimeMs: result.processingTimeMs,
  };
}

async function inspectOnMainThread(buffer: ArrayBuffer) {
  const inspector = await import("@firecrawl/pdf-inspector-wasm");
  await inspector.default();
  return summarize(inspector.detectPdf(new Uint8Array(buffer)));
}

export async function inspectPdfLocally(buffer: ArrayBuffer): Promise<PdfInspectionSummary> {
  if (typeof Worker === "undefined") return inspectOnMainThread(buffer);

  const worker = new Worker(new URL("../workers/pdf-inspector.worker.ts", import.meta.url), {
    type: "module",
  });
  const id = crypto.randomUUID();
  const workerBuffer = buffer.slice(0);

  try {
    return await new Promise<PdfInspectionSummary>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error("PDF 정밀 판별 시간이 초과되었습니다.")), 30_000);
      worker.onmessage = (event: MessageEvent<InspectResponse>) => {
        if (event.data.id !== id) return;
        window.clearTimeout(timeout);
        if (event.data.error || !event.data.result) {
          reject(new Error(event.data.error ?? "PDF 정밀 판별 결과가 없습니다."));
          return;
        }
        resolve(summarize(event.data.result));
      };
      worker.onerror = (event) => {
        window.clearTimeout(timeout);
        reject(new Error(event.message || "PDF 정밀 판별 작업자를 시작하지 못했습니다."));
      };
      worker.postMessage({ id, buffer: workerBuffer }, [workerBuffer]);
    });
  } catch {
    return inspectOnMainThread(buffer.slice(0));
  } finally {
    worker.terminate();
  }
}
