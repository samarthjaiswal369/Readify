import fs from 'fs';
import AdmZip from 'adm-zip';

export const ALLOWED_EXTENSIONS = ['.pdf', '.docx', '.png', '.jpg', '.jpeg'];

export const ALLOWED_MIME_TYPES = {
  '.pdf': ['application/pdf', 'application/x-pdf'],
  '.docx': [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/zip',
    'application/octet-stream',
    'application/x-zip-compressed'
  ],
  '.png': ['image/png'],
  '.jpg': ['image/jpeg', 'image/pjpeg', 'image/jpg'],
  '.jpeg': ['image/jpeg', 'image/pjpeg', 'image/jpg']
};

export const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15 MB

/**
 * Safely unlinks a file if it exists on disk, ignoring missing-file errors.
 */
export async function safeDeleteFile(filePath) {
  if (!filePath) return;
  try {
    await fs.promises.unlink(filePath);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.error(`Warning: Failed to delete file at ${filePath}:`, err.message);
    }
  }
}

/**
 * Validates file signature (magic bytes) and format-specific container integrity.
 * For DOCX, verifies that the ZIP container contains 'word/document.xml'.
 *
 * @param {string} filePath - Path to file on disk
 * @param {string} ext - Lowercase file extension including leading dot (e.g. '.pdf')
 * @returns {Promise<{ valid: boolean, fileType?: string, reason?: string }>}
 */
export async function validateFileSignature(filePath, ext) {
  let fd = null;
  try {
    fd = await fs.promises.open(filePath, 'r');
    const buffer = Buffer.alloc(1024);
    const { bytesRead } = await fd.read(buffer, 0, 1024, 0);
    await fd.close();
    fd = null;

    if (bytesRead < 4) {
      return { valid: false, reason: 'Uploaded file is too small or truncated.' };
    }

    switch (ext) {
      case '.pdf': {
        // PDF header is '%PDF-' (or '%PDF') within the first 1024 bytes per ISO 32000-1
        const headerText = buffer.subarray(0, bytesRead).toString('latin1');
        const pdfIndex = headerText.indexOf('%PDF-');
        const startsWithPdf = headerText.startsWith('%PDF');

        if (pdfIndex >= 0 || startsWithPdf) {
          return { valid: true, fileType: 'pdf' };
        }
        return {
          valid: false,
          reason: 'File signature verification failed: Content does not match PDF format.'
        };
      }

      case '.png': {
        // PNG 8-byte signature: 0x89 0x50 0x4E 0x47 0x0D 0x0A 0x1A 0x0A
        const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
        if (
          bytesRead >= 8 &&
          pngSignature.every((byte, idx) => buffer[idx] === byte)
        ) {
          return { valid: true, fileType: 'png' };
        }
        return {
          valid: false,
          reason: 'File signature verification failed: Content does not match PNG format.'
        };
      }

      case '.jpg':
      case '.jpeg': {
        // JPEG SOI (Start of Image) marker is 0xFF 0xD8 0xFF
        if (
          bytesRead >= 3 &&
          buffer[0] === 0xff &&
          buffer[1] === 0xd8 &&
          buffer[2] === 0xff
        ) {
          return { valid: true, fileType: ext.slice(1) };
        }
        return {
          valid: false,
          reason: 'File signature verification failed: Content does not match JPEG format.'
        };
      }

      case '.docx': {
        // ZIP local file header signature: PK\x03\x04 (0x50 0x4B 0x03 0x04)
        if (
          !(
            buffer[0] === 0x50 &&
            buffer[1] === 0x4b &&
            buffer[2] === 0x03 &&
            buffer[3] === 0x04
          )
        ) {
          return {
            valid: false,
            reason: 'File signature verification failed: DOCX is not a valid ZIP package.'
          };
        }

        // Deep validation of DOCX ZIP container
        try {
          const zip = new AdmZip(filePath);
          const entries = zip.getEntries();
          const hasWordDoc = entries.some((entry) => {
            const entryPath = entry.entryName.replace(/\\/g, '/').toLowerCase();
            return entryPath === 'word/document.xml';
          });

          if (!hasWordDoc) {
            return {
              valid: false,
              reason: 'Invalid DOCX container: Missing "word/document.xml" entry in ZIP package.'
            };
          }

          return { valid: true, fileType: 'docx' };
        } catch (zipError) {
          return {
            valid: false,
            reason: `Corrupted DOCX archive: ${zipError.message}`
          };
        }
      }

      default:
        return { valid: false, reason: `Unsupported file extension: ${ext}` };
    }
  } catch (err) {
    if (fd) {
      try {
        await fd.close();
      } catch (_) {}
    }
    return {
      valid: false,
      reason: `Failed to inspect file signature: ${err.message}`
    };
  }
}
