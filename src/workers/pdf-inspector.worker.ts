import init, { detectPdf, type PdfProcessResult } from "@firecrawl/pdf-inspector-wasm";

type InspectRequest = {
  id: string;
  buffer: ArrayBuffer;
};

type InspectResponse = {
  id: string;
  result?: PdfProcessResult;
  error?: string;
};

let initialization: Promise<unknown> | null = null;

self.onmessage = async (event: MessageEvent<InspectRequest>) => {
  const { id, buffer } = event.data;
  try {
    initialization ??= init();
    await initialization;
    const result = detectPdf(new Uint8Array(buffer));
    self.postMessage({ id, result } satisfies InspectResponse);
  } catch (error) {
    self.postMessage({
      id,
      error: error instanceof Error ? error.message : "PDF 정밀 판별에 실패했습니다.",
    } satisfies InspectResponse);
  }
};

export {};
