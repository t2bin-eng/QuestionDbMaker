import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const source = resolve("node_modules/pdfjs-dist/build/pdf.worker.min.mjs");
const destination = resolve("public/pdf.worker.min.mjs");

await mkdir(dirname(destination), { recursive: true });
await copyFile(source, destination);
