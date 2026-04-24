import { Injectable, Logger } from '@nestjs/common';
import { execFile } from 'node:child_process';
import {
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { resolveReadableChatAttachmentPath } from './chat-attachment-storage';
import type { DocumentAttachmentInsight } from './chat.types';

const execFileAsync = promisify(execFile);

const MAX_DOCUMENT_DOWNLOAD_BYTES = 16 * 1024 * 1024;
const MAX_STORED_DOCUMENT_TEXT_CHARS = 24_000;
const MAX_DOCUMENT_PREVIEW_CHARS = 1_800;
const PDFTOTEXT_TIMEOUT_MS = 15_000;
const OFFICE_CONVERT_TIMEOUT_MS = 30_000;
const OFFICE_COMMAND_CANDIDATES = ['soffice', 'libreoffice'];

type ExtractionMode = DocumentAttachmentInsight['extractionMode'];

export type DocumentExtractionResult =
  | {
      status: 'completed';
      extractionMode: ExtractionMode;
      parser: string;
      extractedText: string;
      previewText: string;
      pageCount?: number;
      characterCount: number;
      truncated: boolean;
    }
  | {
      status: 'failed';
      extractionMode: ExtractionMode;
      parser: string;
      errorCode: string;
      errorMessage: string;
    };

@Injectable()
export class DocumentExtractionService {
  private readonly logger = new Logger(DocumentExtractionService.name);

  async extractFromUrl(input: {
    url: string;
    mimeType?: string | null;
    fileName?: string | null;
    maxBytes?: number;
  }): Promise<DocumentExtractionResult> {
    const asset = await this.loadAssetFromUrl({
      url: input.url,
      fileName: input.fileName ?? undefined,
      maxBytes: input.maxBytes,
    });
    if (!asset) {
      return {
        status: 'failed',
        extractionMode: 'plain_text',
        parser: 'unavailable',
        errorCode: 'SOURCE_UNAVAILABLE',
        errorMessage: '文档源文件不可用或下载失败。',
      };
    }

    return this.extractFromBuffer({
      buffer: asset.buffer,
      mimeType: input.mimeType ?? asset.mimeType,
      fileName: input.fileName ?? asset.fileName,
    });
  }

  async extractFromBuffer(input: {
    buffer: Buffer;
    mimeType?: string | null;
    fileName?: string | null;
  }): Promise<DocumentExtractionResult> {
    const mimeType =
      normalizeMimeType(input.mimeType) ??
      inferMimeTypeFromFileName(input.fileName) ??
      '';
    const fileName = input.fileName?.trim() || 'document';
    if (!input.buffer.length) {
      return {
        status: 'failed',
        extractionMode: 'plain_text',
        parser: 'unavailable',
        errorCode: 'EMPTY_DOCUMENT',
        errorMessage: '文档内容为空。',
      };
    }

    if (isPlainTextDocument(mimeType, fileName)) {
      return this.extractPlainText(input.buffer, mimeType);
    }

    const extension = path.extname(fileName).trim().toLowerCase();
    if (mimeType === 'application/pdf' || extension === '.pdf') {
      return this.extractPdfText(input.buffer, fileName);
    }

    if (
      mimeType ===
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      extension === '.docx'
    ) {
      return this.extractOfficeText(input.buffer, '.docx', 'docx_text');
    }

    if (mimeType === 'application/msword' || extension === '.doc') {
      return this.extractOfficeText(input.buffer, '.doc', 'legacy_word_text');
    }

    return {
      status: 'failed',
      extractionMode: 'provider_file_fallback',
      parser: 'unavailable',
      errorCode: 'UNSUPPORTED_DOCUMENT_TYPE',
      errorMessage: '当前文档类型暂不支持本地正文抽取。',
    };
  }

  private async loadAssetFromUrl(input: {
    url: string;
    fileName?: string;
    maxBytes?: number;
  }) {
    const localPath = resolveLocalChatAttachmentPath(input.url);
    if (localPath) {
      try {
        const fileStat = await stat(localPath);
        if (fileStat.size > (input.maxBytes ?? MAX_DOCUMENT_DOWNLOAD_BYTES)) {
          return null;
        }

        return {
          buffer: await readFile(localPath),
          fileName: input.fileName ?? path.basename(localPath),
          mimeType: inferMimeTypeFromFileName(input.fileName ?? localPath),
        };
      } catch (error) {
        this.logger.warn('Failed to read local document attachment', {
          url: input.url,
          errorMessage: error instanceof Error ? error.message : String(error),
        });
      }
    }

    try {
      const response = await fetch(input.url);
      if (!response.ok) {
        return null;
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      if (buffer.byteLength > (input.maxBytes ?? MAX_DOCUMENT_DOWNLOAD_BYTES)) {
        return null;
      }

      return {
        buffer,
        fileName: input.fileName,
        mimeType: response.headers.get('content-type') ?? undefined,
      };
    } catch (error) {
      this.logger.warn('Failed to download document source', {
        url: input.url,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  private extractPlainText(
    buffer: Buffer,
    mimeType?: string | null,
  ): DocumentExtractionResult {
    return this.buildCompletedResult({
      text: normalizeExtractedText(buffer.toString('utf8'), mimeType),
      extractionMode: 'plain_text',
      parser: 'utf8',
    });
  }

  private async extractPdfText(
    buffer: Buffer,
    fileName: string,
  ): Promise<DocumentExtractionResult> {
    const tempDir = await mkdtemp(path.join(tmpdir(), 'yinjie-pdf-'));
    const tempFilePath = path.join(tempDir, sanitizeTempFileName(fileName, '.pdf'));
    try {
      await writeFile(tempFilePath, buffer);
      const { stdout } = await execFileAsync(
        'pdftotext',
        ['-q', '-enc', 'UTF-8', '-nopgbrk', tempFilePath, '-'],
        {
          timeout: PDFTOTEXT_TIMEOUT_MS,
          maxBuffer: MAX_DOCUMENT_DOWNLOAD_BYTES,
        },
      );
      return this.buildCompletedResult({
        text: normalizeExtractedText(stdout, 'application/pdf'),
        extractionMode: 'pdf_text',
        parser: 'pdftotext',
      });
    } catch (error) {
      return toFailedExtractionResult({
        error,
        extractionMode: 'pdf_text',
        parser: 'pdftotext',
        binaryMissingCode: 'PDFTOTEXT_UNAVAILABLE',
        failureCode: 'PDF_TEXT_EXTRACTION_FAILED',
        emptyCode: 'TEXT_EXTRACTION_EMPTY',
        emptyMessage: 'PDF 未提取到可用正文，可能是扫描件或图片型 PDF。',
      });
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }

  private async extractOfficeText(
    buffer: Buffer,
    extension: '.doc' | '.docx',
    extractionMode: ExtractionMode,
  ): Promise<DocumentExtractionResult> {
    const tempDir = await mkdtemp(path.join(tmpdir(), 'yinjie-office-'));
    const tempFilePath = path.join(tempDir, `source${extension}`);
    try {
      await writeFile(tempFilePath, buffer);
      const outputPath = await convertOfficeToText(tempFilePath, tempDir);
      const text = await readFile(outputPath, 'utf8');
      return this.buildCompletedResult({
        text: normalizeExtractedText(text),
        extractionMode,
        parser: 'libreoffice',
      });
    } catch (error) {
      return toFailedExtractionResult({
        error,
        extractionMode,
        parser: 'libreoffice',
        binaryMissingCode: 'LIBREOFFICE_UNAVAILABLE',
        failureCode:
          extractionMode === 'docx_text'
            ? 'DOCX_TEXT_EXTRACTION_FAILED'
            : 'LEGACY_WORD_PARSE_FAILED',
        emptyCode:
          extractionMode === 'docx_text'
            ? 'TEXT_EXTRACTION_EMPTY'
            : 'LEGACY_WORD_UNSUPPORTED',
        emptyMessage:
          extractionMode === 'docx_text'
            ? 'DOCX 未提取到可用正文。'
            : 'DOC 未提取到可用正文，请确认运行环境是否安装了 LibreOffice 过滤器。',
      });
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }

  private buildCompletedResult(input: {
    text: string;
    extractionMode: ExtractionMode;
    parser: string;
    pageCount?: number;
  }): DocumentExtractionResult {
    if (!input.text.trim()) {
      return {
        status: 'failed',
        extractionMode: input.extractionMode,
        parser: input.parser,
        errorCode: 'TEXT_EXTRACTION_EMPTY',
        errorMessage: '文档未提取到可用正文。',
      };
    }

    const fullText = input.text.trim();
    const truncated = fullText.length > MAX_STORED_DOCUMENT_TEXT_CHARS;
    const extractedText = truncated
      ? `${fullText.slice(0, MAX_STORED_DOCUMENT_TEXT_CHARS).trim()}…`
      : fullText;
    const previewText =
      extractedText.length > MAX_DOCUMENT_PREVIEW_CHARS
        ? `${extractedText.slice(0, MAX_DOCUMENT_PREVIEW_CHARS).trim()}…`
        : extractedText;

    return {
      status: 'completed',
      extractionMode: input.extractionMode,
      parser: input.parser,
      extractedText,
      previewText,
      pageCount: input.pageCount,
      characterCount: fullText.length,
      truncated,
    };
  }
}

async function convertOfficeToText(inputPath: string, outputDir: string) {
  let lastError: unknown = null;
  for (const command of OFFICE_COMMAND_CANDIDATES) {
    try {
      await execFileAsync(
        command,
        ['--headless', '--convert-to', 'txt:Text', '--outdir', outputDir, inputPath],
        {
          timeout: OFFICE_CONVERT_TIMEOUT_MS,
          maxBuffer: MAX_DOCUMENT_DOWNLOAD_BYTES,
        },
      );
      const outputPath = path.join(
        outputDir,
        `${path.basename(inputPath, path.extname(inputPath))}.txt`,
      );
      const outputStat = await stat(outputPath);
      if (outputStat.size > 0) {
        return outputPath;
      }
      lastError = new Error('converted text output is empty');
    } catch (error) {
      lastError = error;
      if (!isBinaryMissingError(error)) {
        break;
      }
    }
  }

  throw lastError ?? new Error('office conversion failed');
}

function resolveLocalChatAttachmentPath(sourceUrl: string) {
  const fileName = extractChatAttachmentFileName(sourceUrl);
  return fileName ? resolveReadableChatAttachmentPath(fileName) : null;
}

function extractChatAttachmentFileName(sourceUrl: string) {
  const match =
    sourceUrl.match(/\/api\/chat\/attachments\/([^/?#]+)/i) ??
    sourceUrl.match(/^([^/?#]+)$/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function sanitizeTempFileName(fileName: string, fallbackExtension: string) {
  const ext = path.extname(fileName) || fallbackExtension;
  const baseName = path.basename(fileName, ext).replace(/[^\w.-]+/g, '-') || 'source';
  return `${baseName}${ext}`;
}

function normalizeExtractedText(text: string, mimeType?: string | null) {
  let normalized = text.replace(/\u0000/g, ' ').trim();
  if (/html|xml/i.test(mimeType ?? '')) {
    normalized = normalized.replace(/<[^>]+>/g, ' ');
  }

  return normalized
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function normalizeMimeType(value?: string | null) {
  const normalized = value?.split(';', 1)[0]?.trim().toLowerCase();
  return normalized || null;
}

function inferMimeTypeFromFileName(fileName?: string | null) {
  const extension = path.extname(fileName ?? '').trim().toLowerCase();
  switch (extension) {
    case '.pdf':
      return 'application/pdf';
    case '.doc':
      return 'application/msword';
    case '.docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case '.txt':
      return 'text/plain';
    case '.md':
    case '.markdown':
      return 'text/markdown';
    case '.csv':
      return 'text/csv';
    case '.json':
      return 'application/json';
    case '.xml':
      return 'application/xml';
    case '.html':
    case '.htm':
      return 'text/html';
    default:
      return null;
  }
}

function isPlainTextDocument(mimeType?: string | null, fileName?: string | null) {
  const normalizedMimeType = normalizeMimeType(mimeType);
  if (normalizedMimeType) {
    if (/^text\//i.test(normalizedMimeType)) {
      return true;
    }

    if (
      /^(application\/json|application\/xml|application\/xhtml\+xml)$/i.test(
        normalizedMimeType,
      )
    ) {
      return true;
    }
  }

  return /\.(txt|md|markdown|csv|json|xml|html|htm)$/i.test(fileName ?? '');
}

function isBinaryMissingError(error: unknown) {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: unknown }).code === 'ENOENT',
  );
}

function toFailedExtractionResult(input: {
  error: unknown;
  extractionMode: ExtractionMode;
  parser: string;
  binaryMissingCode: string;
  failureCode: string;
  emptyCode: string;
  emptyMessage: string;
}): DocumentExtractionResult {
  if (input.error instanceof Error) {
    const normalizedMessage = input.error.message.trim();
    if (isBinaryMissingError(input.error)) {
      return {
        status: 'failed',
        extractionMode: input.extractionMode,
        parser: input.parser,
        errorCode: input.binaryMissingCode,
        errorMessage: `${input.parser} 未安装，无法提取该文档正文。`,
      };
    }

    if (
      normalizedMessage === 'converted text output is empty' ||
      /Syntax Error|Couldn't find trailer dictionary|no text/i.test(normalizedMessage)
    ) {
      return {
        status: 'failed',
        extractionMode: input.extractionMode,
        parser: input.parser,
        errorCode: input.emptyCode,
        errorMessage: input.emptyMessage,
      };
    }

    return {
      status: 'failed',
      extractionMode: input.extractionMode,
      parser: input.parser,
      errorCode: input.failureCode,
      errorMessage: normalizedMessage || '文档正文抽取失败。',
    };
  }

  return {
    status: 'failed',
    extractionMode: input.extractionMode,
    parser: input.parser,
    errorCode: input.failureCode,
    errorMessage: '文档正文抽取失败。',
  };
}
