"use client";

import type { FeatureExtractionPipeline } from "@huggingface/transformers";
import {
  buildSemanticCandidateText,
  buildSemanticClassificationResults,
  buildSemanticQuestionText,
  type SemanticEmbeddingInput,
  type SemanticRuntimeProgress,
} from "./semantic-classification";

export const BROWSER_EMBEDDING_MODEL = "Xenova/paraphrase-multilingual-MiniLM-L12-v2";

type Runtime = "webgpu" | "wasm";
type ProgressCallback = (progress: SemanticRuntimeProgress) => void;

interface CachedExtractor {
  runtime: Runtime;
  extractor: FeatureExtractionPipeline;
}

let cachedExtractor: Promise<CachedExtractor> | null = null;

function supportsWebGpu() {
  return typeof navigator !== "undefined" && "gpu" in navigator;
}

function readDownloadProgress(value: unknown) {
  if (!value || typeof value !== "object") return undefined;
  const progress = "progress" in value ? Number(value.progress) : Number.NaN;
  return Number.isFinite(progress) ? Math.max(0, Math.min(100, Math.round(progress))) : undefined;
}

async function createExtractor(runtime: Runtime, onProgress?: ProgressCallback): Promise<CachedExtractor> {
  const { env, pipeline } = await import("@huggingface/transformers");
  env.allowLocalModels = false;
  env.allowRemoteModels = true;
  env.useBrowserCache = true;
  const extractor = await pipeline("feature-extraction", BROWSER_EMBEDDING_MODEL, {
    device: runtime,
    dtype: "q8",
    progress_callback: (detail) => {
      const progress = readDownloadProgress(detail);
      onProgress?.({
        phase: "loading",
        runtime,
        progress,
        message: progress === undefined
          ? `${runtime === "webgpu" ? "WebGPU" : "WASM"} 의미 분석 모델을 준비하고 있습니다.`
          : `무료 의미 분석 모델 다운로드 ${progress}% (최초 1회)`,
      });
    },
  });
  return { runtime, extractor };
}

async function getExtractor(onProgress?: ProgressCallback) {
  if (!cachedExtractor) {
    const preferred: Runtime = supportsWebGpu() ? "webgpu" : "wasm";
    cachedExtractor = createExtractor(preferred, onProgress).catch(async (error) => {
      if (preferred === "wasm") throw error;
      onProgress?.({
        phase: "fallback",
        runtime: "wasm",
        message: "WebGPU 초기화에 실패해 WASM 방식으로 전환합니다.",
      });
      return createExtractor("wasm", onProgress);
    });
  }
  return cachedExtractor;
}

async function embedTexts(
  extractor: FeatureExtractionPipeline,
  texts: string[],
  runtime: Runtime,
  onProgress?: ProgressCallback,
) {
  const embeddings: number[][] = [];
  const chunkSize = runtime === "webgpu" ? 12 : 6;
  for (let start = 0; start < texts.length; start += chunkSize) {
    const chunk = texts.slice(start, start + chunkSize);
    onProgress?.({
      phase: "embedding",
      runtime,
      progress: Math.round((start / Math.max(1, texts.length)) * 100),
      message: `${runtime === "webgpu" ? "WebGPU" : "WASM"}로 의미를 분석하고 있습니다. ${Math.min(start + chunk.length, texts.length)}/${texts.length}`,
    });
    const output = await extractor(chunk, { pooling: "mean", normalize: true });
    embeddings.push(...(output.tolist() as number[][]));
  }
  return embeddings;
}

async function runWithExtractor(
  input: SemanticEmbeddingInput,
  runtimeState: CachedExtractor,
  onProgress?: ProgressCallback,
) {
  const candidateTexts = input.candidates.map(buildSemanticCandidateText);
  const questionTexts = input.records.map(buildSemanticQuestionText);
  const candidateEmbeddings = await embedTexts(
    runtimeState.extractor,
    candidateTexts,
    runtimeState.runtime,
    onProgress,
  );
  const questionEmbeddings = await embedTexts(
    runtimeState.extractor,
    questionTexts,
    runtimeState.runtime,
    onProgress,
  );
  return {
    runtime: runtimeState.runtime,
    results: buildSemanticClassificationResults(input, {
      runtime: runtimeState.runtime,
      candidateEmbeddings,
      questionEmbeddings,
    }),
  };
}

export async function classifyWithBrowserEmbeddings(
  input: SemanticEmbeddingInput,
  onProgress?: ProgressCallback,
) {
  if (!input.records.length) return { runtime: supportsWebGpu() ? "webgpu" as const : "wasm" as const, results: [] };
  const runtimeState = await getExtractor(onProgress);
  try {
    return await runWithExtractor(input, runtimeState, onProgress);
  } catch (error) {
    if (runtimeState.runtime === "wasm") throw error;
    onProgress?.({
      phase: "fallback",
      runtime: "wasm",
      message: "WebGPU 실행에 실패해 WASM으로 다시 분석합니다.",
    });
    cachedExtractor = createExtractor("wasm", onProgress);
    return runWithExtractor(input, await cachedExtractor, onProgress);
  }
}
