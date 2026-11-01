import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { createWorker } from 'tesseract.js';
import mammoth from 'mammoth';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Standard fonts and CMaps paths for PDF.js in Node.js
const standardFontsPath = path.resolve(__dirname, '../../node_modules/pdfjs-dist/standard_fonts/') + '/';
const cmapsPath = path.resolve(__dirname, '../../node_modules/pdfjs-dist/cmaps/') + '/';

const DEFAULT_MIN_TEXT_CHARS = 15;
const DEFAULT_PDF_RENDER_SCALE = 2.0;

export class DocumentProcessingError extends Error {
  constructor(message, code = 'PROCESSING_ERROR', details = null) {
    super(message);
    this.name = 'DocumentProcessingError';
    this.code = code;
    this.details = details;
  }
}

// Reusable OCR worker instance and lifecycle management
let ocrWorker = null;
let ocrWorkerPromise = null;

/**
 * Returns a shared Tesseract worker initialized with English OCR.
 * Reuses the existing worker instance to avoid expensive re-initializations.
 */
export async function getOcrWorker() {
  if (ocrWorker) {
    return ocrWorker;
  }
  if (!ocrWorkerPromise) {
    ocrWorkerPromise = (async () => {
      try {
        const worker = await createWorker('eng');
        ocrWorker = worker;
        return worker;
      } catch (err) {
        ocrWorker = null;
        ocrWorkerPromise = null;
        throw err;
      }
    })();
  }
  return ocrWorkerPromise;
}

/**
 * Explicitly terminates the shared OCR worker if running.
 */
export async function terminateOcrWorker() {
  if (ocrWorker) {
    const workerToTerminate = ocrWorker;
    ocrWorker = null;
    ocrWorkerPromise = null;
    try {
      await workerToTerminate.terminate();
    } catch (_) {}
  }
}

/**
 * Normalizes input into a Buffer.
 */
async function resolveBuffer(input) {
  if (Buffer.isBuffer(input)) {
    return input;
  }
  if (input instanceof Uint8Array) {
    return Buffer.from(input);
  }
  if (typeof input === 'string') {
    if (!fs.existsSync(input)) {
      throw new DocumentProcessingError(`File not found at path: ${input}`, 'FILE_NOT_FOUND');
    }
    return fs.promises.readFile(input);
  }
  throw new DocumentProcessingError('Invalid input type. Expected Buffer or file path string.', 'INVALID_INPUT');
}

/**
 * Processes a PDF document page-by-page.
 * Extracts text natively; pages with little or no extractable text are rendered
 * to canvas images and processed using Tesseract OCR.
 */
export async function processPdf(input, options = {}) {
  const minTextThreshold = options.minTextThreshold ?? DEFAULT_MIN_TEXT_CHARS;
  const scale = options.scale ?? DEFAULT_PDF_RENDER_SCALE;
  const warnings = [];
  const ocrPages = [];
  const pagesText = [];

  const buffer = await resolveBuffer(input);
  if (buffer.length === 0) {
    throw new DocumentProcessingError('PDF file is empty (0 bytes).', 'EMPTY_FILE');
  }

  let loadingTask = null;
  let doc = null;

  try {
    loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(buffer),
      standardFontDataUrl: standardFontsPath,
      cMapUrl: cmapsPath,
      cMapPacked: true,
      disableFontFace: false
    });
    doc = await loadingTask.promise;
  } catch (err) {
    if (err?.name === 'PasswordException' || /password/i.test(err?.message || '')) {
      throw new DocumentProcessingError(
        'Password-protected or encrypted PDF files are not supported.',
        'ENCRYPTED_PDF',
        err
      );
    }
    if (err?.name === 'InvalidPDFException' || /invalid pdf/i.test(err?.message || '')) {
      throw new DocumentProcessingError(
        'Failed to process PDF: Invalid or corrupted PDF file.',
        'INVALID_PDF',
        err
      );
    }
    throw new DocumentProcessingError(
      `Failed to load PDF document: ${err.message}`,
      'PDF_LOAD_ERROR',
      err
    );
  }

  try {
    const numPages = doc.numPages;

    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      let page = null;
      try {
        page = await doc.getPage(pageNum);
        const textContent = await page.getTextContent();
        let pageText = '';

        if (textContent?.items?.length) {
          for (const item of textContent.items) {
            if (typeof item.str === 'string') {
              pageText += item.str + (item.hasEOL ? '\n' : ' ');
            }
          }
        }
        pageText = pageText.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
        const nonWsChars = pageText.replace(/\s+/g, '').length;

        if (nonWsChars < minTextThreshold) {
          try {
            const viewport = page.getViewport({ scale });
            const canvas = createCanvas(Math.floor(viewport.width), Math.floor(viewport.height));
            const ctx = canvas.getContext('2d');

            await page.render({ canvasContext: ctx, viewport }).promise;
            const renderedBuffer = canvas.toBuffer('image/png');

            const worker = await getOcrWorker();
            const ocrRes = await worker.recognize(renderedBuffer);
            const ocrText = (ocrRes?.data?.text || '').trim();

            if (ocrText.length > 0) {
              ocrPages.push(pageNum);
              pagesText.push(ocrText);
            } else {
              pagesText.push(pageText);
            }
          } catch (ocrErr) {
            warnings.push(`Page ${pageNum}: OCR recognition failed (${ocrErr.message}). Falling back to extracted text.`);
            pagesText.push(pageText);
          }
        } else {
          pagesText.push(pageText);
        }
      } catch (pageErr) {
        warnings.push(`Page ${pageNum}: Failed to extract page content (${pageErr.message}).`);
        pagesText.push('');
      } finally {
        if (page && typeof page.cleanup === 'function') {
          page.cleanup();
        }
      }
    }

    const combinedText = pagesText.filter((p) => p && p.trim().length > 0).join('\n\n').trim();
    if (!combinedText) {
      warnings.push('Extracted text is empty.');
    }

    const isScanned = ocrPages.length > 0;
    const ocrEngine = isScanned ? 'tesseract.js' : null;

    return {
      text: combinedText,
      isScanned,
      ocrEngine,
      pageCount: doc.numPages,
      ocrPages,
      warnings
    };
  } finally {
    try {
      if (doc && typeof doc.cleanup === 'function') {
        doc.cleanup();
      }
      if (loadingTask && typeof loadingTask.destroy === 'function') {
        await loadingTask.destroy();
      }
    } catch (_) {}
  }
}

/**
 * Processes a DOCX file using Mammoth's raw text extraction API.
 */
export async function processDocx(input, options = {}) {
  const warnings = [];
  const buffer = await resolveBuffer(input);

  if (buffer.length === 0) {
    throw new DocumentProcessingError('DOCX file is empty (0 bytes).', 'EMPTY_FILE');
  }

  try {
    const result = await mammoth.extractRawText({ buffer });
    if (result.messages && result.messages.length > 0) {
      for (const msg of result.messages) {
        if (msg.type === 'warning' || msg.type === 'error') {
          warnings.push(msg.message);
        }
      }
    }

    const text = (result.value || '').trim();
    if (!text) {
      warnings.push('Extracted text is empty.');
    }

    return {
      text,
      isScanned: false,
      ocrEngine: null,
      pageCount: 1,
      ocrPages: [],
      warnings
    };
  } catch (err) {
    throw new DocumentProcessingError(
      `Failed to process DOCX: ${err.message}`,
      'INVALID_DOCX',
      err
    );
  }
}

/**
 * Processes an image file (PNG, JPG, JPEG) using Tesseract.js OCR.
 */
export async function processImage(input, options = {}) {
  const warnings = [];
  const buffer = await resolveBuffer(input);

  if (buffer.length === 0) {
    throw new DocumentProcessingError('Image file is empty (0 bytes).', 'EMPTY_FILE');
  }

  // Pre-validate image using @napi-rs/canvas loadImage to prevent unhandled worker errors
  try {
    await loadImage(buffer);
  } catch (imgErr) {
    throw new DocumentProcessingError(
      `Failed to process image: Unreadable or corrupted image format (${imgErr.message}).`,
      'INVALID_IMAGE',
      imgErr
    );
  }

  try {
    const worker = await getOcrWorker();
    const res = await worker.recognize(buffer);
    const text = (res?.data?.text || '').trim();

    if (!text) {
      warnings.push('Extracted text is empty.');
    }

    return {
      text,
      isScanned: true,
      ocrEngine: 'tesseract.js',
      pageCount: 1,
      ocrPages: [1],
      warnings
    };
  } catch (err) {
    throw new DocumentProcessingError(
      `Failed to perform OCR on image: ${err.message}`,
      'OCR_FAILURE',
      err
    );
  }
}

/**
 * Unified document processing function.
 * Accepts a file path, Buffer, or configuration object.
 */
export async function processDocument(input, options = {}) {
  let buffer = null;
  let filePath = null;
  let fileType = options.fileType || options.type;
  let mimeType = options.mimeType;
  let originalName = options.originalName;

  if (typeof input === 'string') {
    filePath = input;
    if (!originalName) originalName = path.basename(filePath);
  } else if (Buffer.isBuffer(input) || input instanceof Uint8Array) {
    buffer = Buffer.from(input);
  } else if (input && typeof input === 'object') {
    filePath = input.filePath;
    buffer = input.buffer;
    fileType = input.fileType || fileType;
    mimeType = input.mimeType || mimeType;
    originalName = input.originalName || originalName;
  }

  if (filePath && !buffer) {
    if (!fs.existsSync(filePath)) {
      throw new DocumentProcessingError(`File not found: ${filePath}`, 'FILE_NOT_FOUND');
    }
    buffer = await fs.promises.readFile(filePath);
  }

  if (!buffer || buffer.length === 0) {
    throw new DocumentProcessingError('Document buffer is missing or empty (0 bytes).', 'EMPTY_DOCUMENT');
  }

  // Infer fileType from filename extension if not explicitly provided
  if (!fileType) {
    const targetName = originalName || (typeof filePath === 'string' ? filePath : '');
    if (targetName) {
      const ext = path.extname(targetName).toLowerCase().replace('.', '');
      if (['pdf', 'docx', 'png', 'jpg', 'jpeg'].includes(ext)) {
        fileType = ext;
      }
    }
  }

  // Infer from MIME type
  if (!fileType && mimeType) {
    if (mimeType.includes('pdf')) fileType = 'pdf';
    else if (mimeType.includes('word') || mimeType.includes('document')) fileType = 'docx';
    else if (mimeType.includes('png')) fileType = 'png';
    else if (mimeType.includes('jpeg') || mimeType.includes('jpg')) fileType = 'jpeg';
  }

  // Infer from magic bytes
  if (!fileType && buffer.length >= 4) {
    const header = buffer.subarray(0, Math.min(1024, buffer.length));
    if (header.includes(Buffer.from('%PDF'))) {
      fileType = 'pdf';
    } else if (buffer[0] === 0x50 && buffer[1] === 0x4B && buffer[2] === 0x03 && buffer[3] === 0x04) {
      fileType = 'docx';
    } else if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
      fileType = 'png';
    } else if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
      fileType = 'jpeg';
    }
  }

  const normalizedType = (fileType || '').toLowerCase();

  switch (normalizedType) {
    case 'pdf':
      return processPdf(buffer, options);
    case 'docx':
      return processDocx(buffer, options);
    case 'png':
    case 'jpg':
    case 'jpeg':
      return processImage(buffer, options);
    default:
      throw new DocumentProcessingError(
        `Unsupported document format "${fileType || 'unknown'}". Supported formats: PDF, DOCX, PNG, JPG, JPEG.`,
        'UNSUPPORTED_TYPE'
      );
  }
}

export default {
  processDocument,
  processPdf,
  processDocx,
  processImage,
  getOcrWorker,
  terminateOcrWorker,
  DocumentProcessingError
};
