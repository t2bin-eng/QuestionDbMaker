import type { ReviewTrainingSample } from "./review-training";
import type { RegionType } from "@/types/domain";
import type {
  ConfirmedClassificationExample,
  QuestionTextRecord,
  RankedClassificationCandidate,
} from "./auto-classification";
import {
  createDatabaseBackupArchive,
  parseDatabaseBackupArchive,
} from "./local-database-backup";

const DATABASE_NAME = "question-card-studio";
const STORE_NAME = "settings";
const ROOT_DIRECTORY_KEY = "local-root-directory";

type PermissionMode = "read" | "readwrite";
type PermissionStateValue = "granted" | "denied" | "prompt";

type PermissionCapableHandle = FileSystemDirectoryHandle & {
  queryPermission?: (descriptor: { mode: PermissionMode }) => Promise<PermissionStateValue>;
  requestPermission?: (descriptor: { mode: PermissionMode }) => Promise<PermissionStateValue>;
};

type DirectoryPickerWindow = Window & {
  showDirectoryPicker?: (options?: {
    id?: string;
    mode?: PermissionMode;
    startIn?: "desktop" | "documents" | "downloads";
  }) => Promise<FileSystemDirectoryHandle>;
};

export interface LocalFolderState {
  supported: boolean;
  configured: boolean;
  name: string | null;
  permission: PermissionStateValue | "unknown";
}

export interface LocalFileResult {
  documentId: string;
  rootName: string;
  relativePath: string;
  size: number;
}

export interface LocalExportResult {
  rootName: string;
  relativePath: string;
  size: number;
}

export interface TrainingDatasetExportResult extends LocalExportResult {
  sampleCount: number;
}

export interface LocalDatabaseBackupResult {
  fileName: string;
  blob: Blob;
  fileCount: number;
  size: number;
}

export interface LocalDatabaseImportResult {
  fileCount: number;
  documentCount: number;
  size: number;
}

export interface LocalExamSet {
  id: string;
  name: string;
  school: string;
  subject: string;
  grade: string;
  examName: string;
  examDate: string;
  questionsPerPage: 4 | 6;
  showStudentFields: boolean;
  showScores: boolean;
  questionIds: string[];
  scores: Record<string, number>;
  createdAt: string;
  updatedAt: string;
}

export interface LocalDocumentSummary {
  documentId: string;
  fileName: string;
  pageCount: number | null;
  regionCount: number;
  pendingReviewCount: number;
  updatedAt: string;
}

export interface LocalQuestionCardSummary {
  id: string;
  documentId: string;
  questionKey: string;
  sourceQuestionNumber: string | null;
  sourceName: string;
  updatedAt: string;
  classification: QuestionClassification | null;
  regions: LocalQuestionRegionSummary[];
  answerRegions?: LocalQuestionRegionSummary[];
  explanationRegions?: LocalQuestionRegionSummary[];
}

export interface LocalQuestionRegionSummary {
    pageNumber: number;
    xRatio: number;
    yRatio: number;
    widthRatio: number;
    heightRatio: number;
    sortOrder: number;
    regionType?: RegionType;
}

export interface QuestionClassification {
  subjectId: string;
  categoryId: string | null;
  difficultyOptionId: string | null;
  questionTypeOptionId: string | null;
  tagIds: string[];
  origin?: "manual" | "local_auto" | "semantic_auto" | "bionic_auto" | "gemini_auto" | "codex_import";
  autoConfidence?: number;
  autoReason?: string;
  autoAlternatives?: RankedClassificationCandidate[];
  updatedAt: string;
}

interface StoredQuestionClassifications {
  version: 1;
  items: Record<string, QuestionClassification>;
  updatedAt: string;
}

interface StoredQuestionTexts {
  version: 1;
  documentId: string;
  items: Record<string, QuestionTextRecord>;
  updatedAt: string;
}

interface StoredExamSets {
  version: 1;
  items: LocalExamSet[];
  updatedAt: string;
}

interface LocalDocumentMetadata {
  documentId: string;
  fileName: string;
  size: number;
  createdAt: string;
}

interface StoredReviewDraft {
  fileName?: string;
  pageCount?: number;
  savedAt?: string;
  regions?: Array<{
    questionKey?: string;
    questionNumber?: string | null;
    pageNumber?: number;
    xRatio?: number;
    yRatio?: number;
    widthRatio?: number;
    heightRatio?: number;
    sortOrder?: number;
    regionType?: RegionType;
    status?: "auto_detected" | "needs_review" | "reviewed";
  }>;
}

type IterableDirectoryHandle = FileSystemDirectoryHandle & {
  entries: () => AsyncIterableIterator<[string, FileSystemHandle]>;
};

export class LocalFolderNotConfiguredError extends Error {
  constructor() {
    super("로컬 저장 폴더를 먼저 선택해 주세요.");
    this.name = "LocalFolderNotConfiguredError";
  }
}

export function buildLocalFilePath(documentId: string) {
  return `documents/${documentId}/source.pdf`;
}

export function isLocalDirectorySupported() {
  return typeof window !== "undefined" &&
    typeof (window as DirectoryPickerWindow).showDirectoryPicker === "function" &&
    typeof indexedDB !== "undefined";
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readRootDirectory() {
  if (!isLocalDirectorySupported()) return null;
  const database = await openDatabase();
  return new Promise<FileSystemDirectoryHandle | null>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get(ROOT_DIRECTORY_KEY);
    request.onsuccess = () => resolve((request.result as FileSystemDirectoryHandle | undefined) ?? null);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => database.close();
  });
}

async function storeRootDirectory(handle: FileSystemDirectoryHandle) {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(handle, ROOT_DIRECTORY_KEY);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

async function queryPermission(handle: FileSystemDirectoryHandle) {
  const permissionHandle = handle as PermissionCapableHandle;
  if (!permissionHandle.queryPermission) return "unknown" as const;
  return permissionHandle.queryPermission({ mode: "readwrite" });
}

async function requireWritePermission(handle: FileSystemDirectoryHandle) {
  const permissionHandle = handle as PermissionCapableHandle;
  const current = await queryPermission(handle);
  if (current === "granted" || current === "unknown") return;
  const requested = await permissionHandle.requestPermission?.({ mode: "readwrite" });
  if (requested !== "granted") {
    throw new Error("선택한 폴더에 파일을 저장할 권한이 필요합니다.");
  }
}

export async function selectLocalRootDirectory() {
  if (!isLocalDirectorySupported()) {
    throw new Error("이 브라우저는 폴더 직접 저장을 지원하지 않습니다. 최신 Chrome 또는 Edge를 사용해 주세요.");
  }
  const handle = await (window as DirectoryPickerWindow).showDirectoryPicker?.({
    id: "question-card-studio-root",
    mode: "readwrite",
    startIn: "documents",
  });
  if (!handle) throw new Error("저장 폴더를 선택하지 않았습니다.");
  await storeRootDirectory(handle);
  await navigator.storage?.persist?.();
  return handle;
}

export async function getLocalFolderState(): Promise<LocalFolderState> {
  if (!isLocalDirectorySupported()) {
    return { supported: false, configured: false, name: null, permission: "unknown" };
  }
  const handle = await readRootDirectory();
  if (!handle) {
    return { supported: true, configured: false, name: null, permission: "prompt" };
  }
  return {
    supported: true,
    configured: true,
    name: handle.name,
    permission: await queryPermission(handle),
  };
}

async function getWritableRootDirectory() {
  const handle = await readRootDirectory();
  if (!handle) throw new LocalFolderNotConfiguredError();
  await requireWritePermission(handle);
  return handle;
}

async function getReadableRootDirectory() {
  const handle = await readRootDirectory();
  if (!handle) throw new LocalFolderNotConfiguredError();
  const permission = await queryPermission(handle);
  if (permission !== "granted" && permission !== "unknown") {
    throw new Error("저장 폴더 권한이 만료되었습니다. 설정에서 폴더를 다시 연결해 주세요.");
  }
  return handle;
}

async function ensureDirectory(root: FileSystemDirectoryHandle, segments: string[]) {
  let current = root;
  for (const segment of segments) {
    current = await current.getDirectoryHandle(segment, { create: true });
  }
  return current;
}

async function writeJsonFile(directory: FileSystemDirectoryHandle, name: string, value: unknown) {
  const fileHandle = await directory.getFileHandle(name, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(JSON.stringify(value, null, 2));
  await writable.close();
}

async function readOptionalJson<T>(directory: FileSystemDirectoryHandle, name: string): Promise<T | null> {
  try {
    const fileHandle = await directory.getFileHandle(name);
    const file = await fileHandle.getFile();
    return JSON.parse(await file.text()) as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === "NotFoundError") return null;
    throw error;
  }
}

async function collectBackupFiles(
  directory: FileSystemDirectoryHandle,
  prefix: string,
  files: Record<string, Uint8Array>,
) {
  for await (const [name, handle] of (directory as IterableDirectoryHandle).entries()) {
    const path = `${prefix}/${name}`;
    if (handle.kind === "directory") {
      await collectBackupFiles(handle as FileSystemDirectoryHandle, path, files);
      continue;
    }
    const file = await (handle as FileSystemFileHandle).getFile();
    files[path] = new Uint8Array(await file.arrayBuffer());
  }
}

async function collectOptionalBackupDirectory(
  root: FileSystemDirectoryHandle,
  name: "documents" | "metadata",
  files: Record<string, Uint8Array>,
) {
  try {
    const directory = await root.getDirectoryHandle(name);
    await collectBackupFiles(directory, name, files);
  } catch (error) {
    if (error instanceof DOMException && error.name === "NotFoundError") return;
    throw error;
  }
}

export async function exportLocalDatabaseBackup(): Promise<LocalDatabaseBackupResult> {
  const root = await getReadableRootDirectory();
  const files: Record<string, Uint8Array> = {};
  await collectOptionalBackupDirectory(root, "documents", files);
  await collectOptionalBackupDirectory(root, "metadata", files);
  if (!Object.keys(files).length) throw new Error("내보낼 문항 DB 파일이 없습니다.");

  const exportedAt = new Date().toISOString();
  const archive = createDatabaseBackupArchive(files, exportedAt);
  const stamp = exportedAt.slice(0, 16).replace(/[-:T]/g, "");
  return {
    fileName: `question-card-studio-backup-${stamp}.zip`,
    blob: new Blob([archive.slice().buffer as ArrayBuffer], { type: "application/zip" }),
    fileCount: Object.keys(files).length,
    size: archive.byteLength,
  };
}

export async function importLocalDatabaseBackup(file: File): Promise<LocalDatabaseImportResult> {
  const root = await getWritableRootDirectory();
  const parsed = parseDatabaseBackupArchive(new Uint8Array(await file.arrayBuffer()));

  for (const [path, bytes] of Object.entries(parsed.files)) {
    const segments = path.split("/");
    const fileName = segments.pop();
    if (!fileName) throw new Error("백업 파일 경로가 올바르지 않습니다.");
    const directory = await ensureDirectory(root, segments);
    const fileHandle = await directory.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(new Blob([bytes.slice().buffer as ArrayBuffer]));
    await writable.close();
  }

  const documentIds = new Set(
    Object.keys(parsed.files)
      .filter((path) => path.startsWith("documents/"))
      .map((path) => path.split("/")[1])
      .filter(Boolean),
  );
  return {
    fileCount: parsed.manifest.fileCount,
    documentCount: documentIds.size,
    size: parsed.totalSize,
  };
}

async function removeQuestionClassifications(
  root: FileSystemDirectoryHandle,
  shouldRemove: (questionCardId: string) => boolean,
) {
  try {
    const metadataDirectory = await root.getDirectoryHandle("metadata");
    const stored = await readOptionalJson<StoredQuestionClassifications>(
      metadataDirectory,
      "question-classifications.json",
    );
    if (stored?.version !== 1) return;
    const remainingItems = Object.fromEntries(
      Object.entries(stored.items).filter(([questionCardId]) => !shouldRemove(questionCardId)),
    );
    if (Object.keys(remainingItems).length === Object.keys(stored.items).length) return;
    const updatedAt = new Date().toISOString();
    await writeJsonFile(metadataDirectory, "question-classifications.json", {
      version: 1,
      items: remainingItems,
      updatedAt,
    } satisfies StoredQuestionClassifications);
  } catch (error) {
    if (error instanceof DOMException && error.name === "NotFoundError") return;
    throw error;
  }
}

async function removeQuestionsFromExamSets(
  root: FileSystemDirectoryHandle,
  shouldRemove: (questionCardId: string) => boolean,
) {
  try {
    const metadataDirectory = await root.getDirectoryHandle("metadata");
    const stored = await readOptionalJson<StoredExamSets>(metadataDirectory, "exam-sets.json");
    if (stored?.version !== 1) return;
    let changed = false;
    const items = stored.items.map((examSet) => {
      const questionIds = examSet.questionIds.filter((questionId) => !shouldRemove(questionId));
      if (questionIds.length === examSet.questionIds.length) return examSet;
      changed = true;
      const scores = Object.fromEntries(
        Object.entries(examSet.scores).filter(([questionId]) => !shouldRemove(questionId)),
      );
      return { ...examSet, questionIds, scores, updatedAt: new Date().toISOString() };
    });
    if (!changed) return;
    await writeJsonFile(metadataDirectory, "exam-sets.json", {
      version: 1,
      items,
      updatedAt: new Date().toISOString(),
    } satisfies StoredExamSets);
  } catch (error) {
    if (error instanceof DOMException && error.name === "NotFoundError") return;
    throw error;
  }
}

export async function saveSourcePdfLocally(file: File, documentId = crypto.randomUUID()): Promise<LocalFileResult> {
  const root = await getWritableRootDirectory();
  const directory = await ensureDirectory(root, ["documents", documentId]);
  const fileHandle = await directory.getFileHandle("source.pdf", { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(file);
  await writable.close();
  await writeJsonFile(directory, "document.json", {
    documentId,
    fileName: file.name,
    size: file.size,
    createdAt: new Date().toISOString(),
  } satisfies LocalDocumentMetadata);

  return {
    documentId,
    rootName: root.name,
    relativePath: buildLocalFilePath(documentId),
    size: file.size,
  };
}

export async function deleteLocalDocument(documentId: string) {
  const root = await getWritableRootDirectory();
  const documentsDirectory = await root.getDirectoryHandle("documents");
  await documentsDirectory.removeEntry(documentId, { recursive: true });
  await removeQuestionClassifications(root, (questionCardId) =>
    questionCardId.startsWith(`${documentId}:`),
  );
  await removeQuestionsFromExamSets(root, (questionCardId) =>
    questionCardId.startsWith(`${documentId}:`),
  );
}

export async function deleteLocalQuestionCard(
  documentId: string,
  questionKey: string,
  questionCardId: string,
) {
  const root = await getWritableRootDirectory();
  const documentsDirectory = await root.getDirectoryHandle("documents");
  const documentDirectory = await documentsDirectory.getDirectoryHandle(documentId);
  const draft = await readOptionalJson<StoredReviewDraft>(documentDirectory, "review-draft.json");
  if (!draft?.regions?.length) throw new Error("삭제할 문항카드를 찾지 못했습니다.");

  const remainingRegions = draft.regions.filter((region, index) =>
    (region.questionKey ?? `region-${index}`) !== questionKey,
  );
  if (remainingRegions.length === draft.regions.length) {
    throw new Error("삭제할 문항카드를 찾지 못했습니다.");
  }

  await writeJsonFile(documentDirectory, "review-draft.json", {
    ...draft,
    regions: remainingRegions,
    savedAt: new Date().toISOString(),
  });
  await removeQuestionClassifications(root, (storedId) => storedId === questionCardId);
  await removeQuestionsFromExamSets(root, (storedId) => storedId === questionCardId);
}

export async function readSourcePdfLocally(documentId: string) {
  const root = await getReadableRootDirectory();
  const documentsDirectory = await root.getDirectoryHandle("documents");
  const documentDirectory = await documentsDirectory.getDirectoryHandle(documentId);
  const fileHandle = await documentDirectory.getFileHandle("source.pdf");
  return fileHandle.getFile();
}

export async function saveGeneratedHwpxLocally(fileName: string, data: Uint8Array): Promise<LocalExportResult> {
  const root = await getWritableRootDirectory();
  const directory = await ensureDirectory(root, ["exports"]);
  const safeName = fileName
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/\.+$/g, "")
    .trim() || "문제지.hwpx";
  const finalName = safeName.toLocaleLowerCase().endsWith(".hwpx") ? safeName : `${safeName}.hwpx`;
  const fileHandle = await directory.getFileHandle(finalName, { create: true });
  const writable = await fileHandle.createWritable();
  const fileBuffer = data.slice().buffer as ArrayBuffer;
  await writable.write(new Blob([fileBuffer], { type: "application/hwp+zip" }));
  await writable.close();
  return {
    rootName: root.name,
    relativePath: `exports/${finalName}`,
    size: data.byteLength,
  };
}

export async function saveGeneratedPdfLocally(fileName: string, data: Uint8Array): Promise<LocalExportResult> {
  const root = await getWritableRootDirectory();
  const directory = await ensureDirectory(root, ["exports"]);
  const safeName = fileName
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/\.+$/g, "")
    .trim() || "문제지.pdf";
  const finalName = safeName.toLocaleLowerCase().endsWith(".pdf") ? safeName : `${safeName}.pdf`;
  const fileHandle = await directory.getFileHandle(finalName, { create: true });
  const writable = await fileHandle.createWritable();
  const fileBuffer = data.slice().buffer as ArrayBuffer;
  await writable.write(new Blob([fileBuffer], { type: "application/pdf" }));
  await writable.close();
  return {
    rootName: root.name,
    relativePath: `exports/${finalName}`,
    size: data.byteLength,
  };
}

export async function readClassificationLocally<T>(): Promise<T | null> {
  try {
    const root = await getReadableRootDirectory();
    const directory = await root.getDirectoryHandle("metadata");
    return readOptionalJson<T>(directory, "classification.json");
  } catch (error) {
    if (error instanceof DOMException && error.name === "NotFoundError") return null;
    throw error;
  }
}

export async function saveClassificationLocally(data: unknown) {
  const root = await getWritableRootDirectory();
  const directory = await ensureDirectory(root, ["metadata"]);
  await writeJsonFile(directory, "classification.json", data);
}

export async function listLocalExamSets(): Promise<LocalExamSet[]> {
  try {
    const root = await getReadableRootDirectory();
    const directory = await root.getDirectoryHandle("metadata");
    const stored = await readOptionalJson<StoredExamSets>(directory, "exam-sets.json");
    return stored?.version === 1
      ? [...stored.items].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      : [];
  } catch (error) {
    if (error instanceof DOMException && error.name === "NotFoundError") return [];
    throw error;
  }
}

export async function saveLocalExamSet(
  value: Omit<LocalExamSet, "createdAt" | "updatedAt">,
) {
  const root = await getWritableRootDirectory();
  const directory = await ensureDirectory(root, ["metadata"]);
  const stored = await readOptionalJson<StoredExamSets>(directory, "exam-sets.json");
  const existing = stored?.version === 1
    ? stored.items.find((item) => item.id === value.id)
    : null;
  const updatedAt = new Date().toISOString();
  const saved: LocalExamSet = {
    ...value,
    createdAt: existing?.createdAt ?? updatedAt,
    updatedAt,
  };
  const remaining = stored?.version === 1
    ? stored.items.filter((item) => item.id !== value.id)
    : [];
  await writeJsonFile(directory, "exam-sets.json", {
    version: 1,
    items: [saved, ...remaining],
    updatedAt,
  } satisfies StoredExamSets);
  return saved;
}

export async function deleteLocalExamSet(examSetId: string) {
  const root = await getWritableRootDirectory();
  const directory = await root.getDirectoryHandle("metadata");
  const stored = await readOptionalJson<StoredExamSets>(directory, "exam-sets.json");
  if (stored?.version !== 1) return;
  const items = stored.items.filter((item) => item.id !== examSetId);
  if (items.length === stored.items.length) return;
  const updatedAt = new Date().toISOString();
  await writeJsonFile(directory, "exam-sets.json", {
    version: 1,
    items,
    updatedAt,
  } satisfies StoredExamSets);
}

export async function readQuestionClassificationsLocally() {
  try {
    const root = await getReadableRootDirectory();
    const directory = await root.getDirectoryHandle("metadata");
    const stored = await readOptionalJson<StoredQuestionClassifications>(
      directory,
      "question-classifications.json",
    );
    return stored?.version === 1 ? stored.items : {};
  } catch (error) {
    if (error instanceof DOMException && error.name === "NotFoundError") return {};
    throw error;
  }
}

export async function saveQuestionClassificationLocally(
  questionCardId: string,
  classification: Omit<QuestionClassification, "updatedAt">,
) {
  const saved = await saveQuestionClassificationsLocally([questionCardId], classification);
  return saved[questionCardId];
}

export async function saveQuestionClassificationsLocally(
  questionCardIds: string[],
  classification: Omit<QuestionClassification, "updatedAt">,
) {
  const uniqueQuestionCardIds = Array.from(new Set(questionCardIds.filter(Boolean)));
  if (!uniqueQuestionCardIds.length) return {};

  const root = await getWritableRootDirectory();
  const directory = await ensureDirectory(root, ["metadata"]);
  const stored = await readOptionalJson<StoredQuestionClassifications>(
    directory,
    "question-classifications.json",
  );
  const updatedAt = new Date().toISOString();
  const values = Object.fromEntries(uniqueQuestionCardIds.map((questionCardId) => [
    questionCardId,
    {
      ...classification,
      tagIds: [...classification.tagIds],
      origin: classification.origin ?? "manual",
      updatedAt,
    } satisfies QuestionClassification,
  ]));
  await writeJsonFile(directory, "question-classifications.json", {
    version: 1,
    items: {
      ...(stored?.version === 1 ? stored.items : {}),
      ...values,
    },
    updatedAt,
  } satisfies StoredQuestionClassifications);
  return values;
}

export async function saveAutoQuestionClassificationsLocally(
  values: Record<string, Omit<QuestionClassification, "updatedAt">>,
) {
  const entries = Object.entries(values);
  if (!entries.length) return {};
  const root = await getWritableRootDirectory();
  const directory = await ensureDirectory(root, ["metadata"]);
  const stored = await readOptionalJson<StoredQuestionClassifications>(
    directory,
    "question-classifications.json",
  );
  const updatedAt = new Date().toISOString();
  const existingItems = stored?.version === 1 ? stored.items : {};
  const saved = Object.fromEntries(entries.flatMap(([questionCardId, classification]) => {
    const existing = existingItems[questionCardId];
    if (existing && (!existing.origin || existing.origin === "manual")) return [];
    return [[questionCardId, {
      ...classification,
      tagIds: [...classification.tagIds],
      updatedAt,
    } satisfies QuestionClassification]];
  }));
  if (!Object.keys(saved).length) return {};
  await writeJsonFile(directory, "question-classifications.json", {
    version: 1,
    items: { ...existingItems, ...saved },
    updatedAt,
  } satisfies StoredQuestionClassifications);
  return saved;
}

export async function saveQuestionTextsLocally(
  documentId: string,
  records: QuestionTextRecord[],
) {
  const root = await getWritableRootDirectory();
  const directory = await ensureDirectory(root, ["documents", documentId]);
  const updatedAt = new Date().toISOString();
  const items = Object.fromEntries(records.map((record) => [record.questionKey, record]));
  await writeJsonFile(directory, "question-texts.json", {
    version: 1,
    documentId,
    items,
    updatedAt,
  } satisfies StoredQuestionTexts);
  return items;
}

export async function readQuestionTextsLocally(documentId: string) {
  try {
    const root = await getReadableRootDirectory();
    const documentsDirectory = await root.getDirectoryHandle("documents");
    const directory = await documentsDirectory.getDirectoryHandle(documentId);
    const stored = await readOptionalJson<StoredQuestionTexts>(directory, "question-texts.json");
    return stored?.version === 1 ? stored.items : {};
  } catch (error) {
    if (error instanceof DOMException && error.name === "NotFoundError") return {};
    throw error;
  }
}

export async function listConfirmedClassificationExamplesLocally(
  subjectId: string,
): Promise<ConfirmedClassificationExample[]> {
  const root = await getReadableRootDirectory();
  let classifications: Record<string, QuestionClassification> = {};
  try {
    const metadataDirectory = await root.getDirectoryHandle("metadata");
    const stored = await readOptionalJson<StoredQuestionClassifications>(
      metadataDirectory,
      "question-classifications.json",
    );
    if (stored?.version === 1) classifications = stored.items;
  } catch (error) {
    if (!(error instanceof DOMException && error.name === "NotFoundError")) throw error;
  }

  let documentsDirectory: FileSystemDirectoryHandle;
  try {
    documentsDirectory = await root.getDirectoryHandle("documents");
  } catch (error) {
    if (error instanceof DOMException && error.name === "NotFoundError") return [];
    throw error;
  }

  const examples: ConfirmedClassificationExample[] = [];
  const iterable = documentsDirectory as IterableDirectoryHandle;
  for await (const [documentId, handle] of iterable.entries()) {
    if (handle.kind !== "directory") continue;
    const directory = handle as FileSystemDirectoryHandle;
    const stored = await readOptionalJson<StoredQuestionTexts>(directory, "question-texts.json");
    if (stored?.version !== 1) continue;
    Object.values(stored.items).forEach((record) => {
      const questionCardId = `${documentId}:${record.questionKey}`;
      const classification = classifications[questionCardId];
      if (
        classification?.subjectId !== subjectId ||
        !classification.categoryId ||
        (classification.origin && classification.origin !== "manual")
      ) return;
      examples.push({
        ...record,
        questionCardId,
        subjectId,
        categoryId: classification.categoryId,
      });
    });
  }
  return examples;
}

export async function saveReviewDraftLocally(documentId: string, draft: unknown) {
  const root = await getWritableRootDirectory();
  const directory = await ensureDirectory(root, ["documents", documentId]);
  await writeJsonFile(directory, "review-draft.json", draft);
}

export async function saveReviewTrainingSampleLocally(
  documentId: string,
  sample: ReviewTrainingSample,
) {
  const root = await getWritableRootDirectory();
  const directory = await ensureDirectory(root, ["documents", documentId]);
  await writeJsonFile(directory, "training-sample.json", sample);
}

export async function exportReviewTrainingDatasetLocally(): Promise<TrainingDatasetExportResult> {
  const root = await getWritableRootDirectory();
  const documentsDirectory = await root.getDirectoryHandle("documents");
  const samples: ReviewTrainingSample[] = [];
  const iterable = documentsDirectory as IterableDirectoryHandle;

  for await (const [, handle] of iterable.entries()) {
    if (handle.kind !== "directory") continue;
    const sample = await readOptionalJson<ReviewTrainingSample>(
      handle as FileSystemDirectoryHandle,
      "training-sample.json",
    );
    if (sample?.version === 1 && sample.usableForTraining) samples.push(sample);
  }

  if (!samples.length) {
    throw new Error("검수 완료된 학습 데이터가 아직 없습니다.");
  }

  const generatedAt = new Date().toISOString();
  const dataset = {
    version: 1,
    format: "question-card-studio-normalized-regions",
    generatedAt,
    sampleCount: samples.length,
    samples: samples.sort((a, b) => a.documentId.localeCompare(b.documentId)),
  };
  const directory = await ensureDirectory(root, ["exports"]);
  const date = generatedAt.slice(0, 10).replaceAll("-", "");
  const fileName = `question-card-training-dataset-${date}.json`;
  await writeJsonFile(directory, fileName, dataset);
  const size = new TextEncoder().encode(JSON.stringify(dataset, null, 2)).byteLength;

  return {
    rootName: root.name,
    relativePath: `exports/${fileName}`,
    size,
    sampleCount: samples.length,
  };
}

export async function readReviewDraftLocally<T>(documentId: string): Promise<T | null> {
  try {
    const root = await getReadableRootDirectory();
    const documentsDirectory = await root.getDirectoryHandle("documents");
    const documentDirectory = await documentsDirectory.getDirectoryHandle(documentId);
    const fileHandle = await documentDirectory.getFileHandle("review-draft.json");
    const file = await fileHandle.getFile();
    return JSON.parse(await file.text()) as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === "NotFoundError") return null;
    throw error;
  }
}

export async function listLocalDocuments(): Promise<LocalDocumentSummary[]> {
  const root = await getReadableRootDirectory();
  let documentsDirectory: FileSystemDirectoryHandle;
  try {
    documentsDirectory = await root.getDirectoryHandle("documents");
  } catch (error) {
    if (error instanceof DOMException && error.name === "NotFoundError") return [];
    throw error;
  }

  const summaries: LocalDocumentSummary[] = [];
  const iterable = documentsDirectory as IterableDirectoryHandle;
  for await (const [documentId, handle] of iterable.entries()) {
    if (handle.kind !== "directory") continue;
    const directory = handle as FileSystemDirectoryHandle;
    try {
      const sourceHandle = await directory.getFileHandle("source.pdf");
      const sourceFile = await sourceHandle.getFile();
      const metadata = await readOptionalJson<LocalDocumentMetadata>(directory, "document.json");
      const draft = await readOptionalJson<StoredReviewDraft>(directory, "review-draft.json");
      const regions = draft?.regions ?? [];
      const pendingQuestionKeys = new Set(
        regions
          .filter((region) => region.status !== "reviewed")
          .map((region, index) => region.questionKey ?? `region-${index}`),
      );

      summaries.push({
        documentId,
        fileName: metadata?.fileName ?? draft?.fileName ?? sourceFile.name,
        pageCount: draft?.pageCount ?? null,
        regionCount: regions.length,
        pendingReviewCount: pendingQuestionKeys.size,
        updatedAt: draft?.savedAt ?? metadata?.createdAt ?? new Date(sourceFile.lastModified).toISOString(),
      });
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "NotFoundError")) throw error;
    }
  }

  return summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function listLocalQuestionCards(): Promise<LocalQuestionCardSummary[]> {
  const root = await getReadableRootDirectory();
  let questionClassifications: Record<string, QuestionClassification> = {};
  try {
    const metadataDirectory = await root.getDirectoryHandle("metadata");
    const stored = await readOptionalJson<StoredQuestionClassifications>(
      metadataDirectory,
      "question-classifications.json",
    );
    if (stored?.version === 1) questionClassifications = stored.items;
  } catch (error) {
    if (!(error instanceof DOMException && error.name === "NotFoundError")) throw error;
  }
  let documentsDirectory: FileSystemDirectoryHandle;
  try {
    documentsDirectory = await root.getDirectoryHandle("documents");
  } catch (error) {
    if (error instanceof DOMException && error.name === "NotFoundError") return [];
    throw error;
  }

  const cards: LocalQuestionCardSummary[] = [];
  const iterable = documentsDirectory as IterableDirectoryHandle;
  for await (const [documentId, handle] of iterable.entries()) {
    if (handle.kind !== "directory") continue;
    const directory = handle as FileSystemDirectoryHandle;
    const metadata = await readOptionalJson<LocalDocumentMetadata>(directory, "document.json");
    const draft = await readOptionalJson<StoredReviewDraft>(directory, "review-draft.json");
    if (!draft?.regions?.length) continue;

    const grouped = new Map<string, NonNullable<StoredReviewDraft["regions"]>>();
    draft.regions.forEach((region, index) => {
      const questionKey = region.questionKey ?? `region-${index}`;
      grouped.set(questionKey, [...(grouped.get(questionKey) ?? []), region]);
    });

    const documentCards: LocalQuestionCardSummary[] = [];
    for (const [questionKey, regions] of grouped) {
      if (regions.some((region) => region.status !== "reviewed")) continue;
      const validRegions = regions
        .filter((region) =>
          typeof region.pageNumber === "number" &&
          typeof region.xRatio === "number" &&
          typeof region.yRatio === "number" &&
          typeof region.widthRatio === "number" &&
          typeof region.heightRatio === "number",
        )
        .map((region) => ({
          pageNumber: region.pageNumber!,
          xRatio: region.xRatio!,
          yRatio: region.yRatio!,
          widthRatio: region.widthRatio!,
          heightRatio: region.heightRatio!,
          sortOrder: region.sortOrder ?? 0,
          regionType: region.regionType ?? "question",
        }))
        .sort((a, b) => a.sortOrder - b.sortOrder || a.pageNumber - b.pageNumber);
      const questionRegions = validRegions.filter((region) => region.regionType === "question");
      const answerRegions = validRegions.filter((region) => region.regionType === "answer");
      const explanationRegions = validRegions.filter((region) => region.regionType === "explanation");
      if (!questionRegions.length) continue;

      const id = `${documentId}:${questionKey}`;
      documentCards.push({
        id,
        documentId,
        questionKey,
        sourceQuestionNumber: regions.find((region) => region.questionNumber)?.questionNumber ?? null,
        sourceName: metadata?.fileName ?? draft.fileName ?? "source.pdf",
        updatedAt: draft.savedAt ?? metadata?.createdAt ?? "",
        classification: questionClassifications[id] ?? null,
        regions: questionRegions,
        answerRegions,
        explanationRegions,
      });
    }

    const deduplicatedByNumber = new Map<string, LocalQuestionCardSummary>();
    const unnumberedCards: LocalQuestionCardSummary[] = [];
    for (const card of documentCards) {
      if (!card.sourceQuestionNumber) {
        unnumberedCards.push(card);
        continue;
      }
      const existing = deduplicatedByNumber.get(card.sourceQuestionNumber);
      const cardFirstPage = Math.min(...card.regions.map((region) => region.pageNumber));
      const existingFirstPage = existing
        ? Math.min(...existing.regions.map((region) => region.pageNumber))
        : Number.MAX_SAFE_INTEGER;
      const isBetterCandidate = !existing ||
        card.regions.length > existing.regions.length ||
        (card.regions.length === existing.regions.length && cardFirstPage < existingFirstPage);
      if (isBetterCandidate) deduplicatedByNumber.set(card.sourceQuestionNumber, card);
    }
    cards.push(...deduplicatedByNumber.values(), ...unnumberedCards);
  }

  return cards.sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt) ||
    (Number(a.sourceQuestionNumber) || Number.MAX_SAFE_INTEGER) -
      (Number(b.sourceQuestionNumber) || Number.MAX_SAFE_INTEGER),
  );
}
