// ─────────────────────────────────────────────────────────────
// fileImport.js — Extracción de texto desde archivos e imágenes
// Todo corre en el navegador. Sin APIs externas ni claves.
// ─────────────────────────────────────────────────────────────

import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import mammoth from "mammoth";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

// ── Tipos aceptados ───────────────────────────────────────────
export const ACCEPTED_DOCS =
  ".pdf,.docx,.doc,.txt,.md,.rtf,application/pdf," +
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document," +
  "text/plain,text/markdown";

export const ACCEPTED_IMAGES = "image/*";

// ── Utilidades ────────────────────────────────────────────────
const readAsArrayBuffer = (file) =>
  new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => rej(new Error("No se pudo leer el archivo"));
    r.readAsArrayBuffer(file);
  });

const readAsText = (file) =>
  new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => rej(new Error("No se pudo leer el archivo"));
    r.readAsText(file);
  });

const cleanText = (t) =>
  t
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

export const stripExtension = (name) => name.replace(/\.[^.]+$/, "");

// ── PDF ───────────────────────────────────────────────────────
async function extractPdf(file, onProgress) {
  const buf = await readAsArrayBuffer(file);
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const pages = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    onProgress?.({
      stage: "pdf",
      message: `Leyendo página ${i} de ${pdf.numPages}…`,
      percent: Math.round((i / pdf.numPages) * 100),
    });

    const page = await pdf.getPage(i);
    const tc = await page.getTextContent();

    // Reconstruye saltos de línea usando la posición vertical de cada item
    let lastY = null;
    let line = "";
    const lines = [];

    for (const item of tc.items) {
      const y = item.transform[5];
      if (lastY !== null && Math.abs(y - lastY) > 4) {
        lines.push(line.trim());
        line = "";
      }
      line += item.str + (item.hasEOL ? "\n" : " ");
      lastY = y;
    }
    if (line.trim()) lines.push(line.trim());

    pages.push(lines.join("\n"));
  }

  const text = cleanText(pages.join("\n\n"));

  if (!text) {
    throw new Error(
      "Este PDF no contiene texto seleccionable (probablemente es un escaneo). " +
      "Usa la opción «Escanear» para extraerlo con reconocimiento óptico."
    );
  }

  return { text, pages: pdf.numPages };
}

// ── DOCX ──────────────────────────────────────────────────────
async function extractDocx(file, onProgress) {
  onProgress?.({ stage: "docx", message: "Extrayendo texto del documento…", percent: 50 });
  const buf = await readAsArrayBuffer(file);
  const result = await mammoth.extractRawText({ arrayBuffer: buf });
  const text = cleanText(result.value);
  if (!text) throw new Error("El documento está vacío o no se pudo leer.");
  return { text };
}

// ── Texto plano ───────────────────────────────────────────────
async function extractPlain(file, onProgress) {
  onProgress?.({ stage: "text", message: "Leyendo archivo…", percent: 50 });
  const raw = await readAsText(file);
  const text = cleanText(raw);
  if (!text) throw new Error("El archivo está vacío.");
  return { text };
}

// ── OCR de imágenes (Tesseract) ───────────────────────────────
export async function ocrImage(file, onProgress) {
  onProgress?.({ stage: "ocr", message: "Preparando reconocimiento…", percent: 5 });

  // Carga diferida: tesseract.js pesa, sólo se descarga si se usa
  const Tesseract = (await import("tesseract.js")).default;

  const { data } = await Tesseract.recognize(file, "spa+eng", {
    logger: (m) => {
      if (m.status === "recognizing text") {
        onProgress?.({
          stage: "ocr",
          message: "Reconociendo texto…",
          percent: Math.round(m.progress * 100),
        });
      } else if (m.status === "loading language traineddata") {
        onProgress?.({
          stage: "ocr",
          message: "Descargando modelo de idioma (sólo la primera vez)…",
          percent: Math.round(m.progress * 100),
        });
      }
    },
  });

  const text = cleanText(data.text);
  if (!text) {
    throw new Error(
      "No se detectó texto en la imagen. Intenta con mejor iluminación, " +
      "que el documento esté plano y ocupe la mayor parte del encuadre."
    );
  }

  return { text, confidence: Math.round(data.confidence) };
}

// ── Router principal ──────────────────────────────────────────
export async function extractFromFile(file, onProgress) {
  const MAX_MB = 20;
  if (file.size > MAX_MB * 1024 * 1024) {
    throw new Error(`El archivo supera los ${MAX_MB} MB.`);
  }

  const name = file.name.toLowerCase();
  const type = file.type;

  if (type === "application/pdf" || name.endsWith(".pdf")) {
    return extractPdf(file, onProgress);
  }

  if (name.endsWith(".docx") || type.includes("wordprocessingml")) {
    return extractDocx(file, onProgress);
  }

  if (name.endsWith(".doc")) {
    throw new Error(
      "Los archivos .doc antiguos no son compatibles. " +
      "Guárdalo como .docx o .pdf e inténtalo de nuevo."
    );
  }

  if (type.startsWith("image/")) {
    return ocrImage(file, onProgress);
  }

  if (
    type.startsWith("text/") ||
    name.endsWith(".txt") ||
    name.endsWith(".md") ||
    name.endsWith(".rtf")
  ) {
    return extractPlain(file, onProgress);
  }

  throw new Error("Formato no soportado. Usa PDF, DOCX, TXT o una imagen.");
}