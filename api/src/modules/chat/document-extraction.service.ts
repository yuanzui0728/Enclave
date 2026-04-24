import { Injectable, Logger } from '@nestjs/common';
import { execFile } from 'node:child_process';
import {
  mkdtemp,
  readdir,
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
const DOCX_XML_PARSE_TIMEOUT_MS = 15_000;
const PDF_OCR_RENDER_TIMEOUT_MS = 20_000;
const PDF_OCR_PAGE_TIMEOUT_MS = 12_000;
const MAX_PDF_OCR_PAGES = 4;
const PDF_OCR_RENDER_DPI = 180;
const PDF_OCR_LANGS = 'chi_sim+eng';
const MAX_DOCX_OCR_IMAGES = 6;
const MAX_OFFICE_OCR_PAGES = 6;
const OFFICE_COMMAND_CANDIDATES = ['soffice', 'libreoffice'];

type WordExtractorLike = {
  extract(input: string | Buffer): Promise<{
    getBody(): string;
    getFootnotes?(): string;
    getEndnotes?(): string;
    getHeaders?(options?: { includeFooters?: boolean }): string;
    getFooters?(): string;
    getAnnotations?(): string;
    getTextboxes?(options?: {
      includeHeadersAndFooters?: boolean;
      includeBody?: boolean;
    }): string;
  }>;
};

type YauzlLike = {
  fromBuffer(
    buffer: Buffer,
    options: { lazyEntries: boolean },
    callback: (error: Error | null, zipFile?: YauzlZipFileLike) => void,
  ): void;
};

type YauzlZipFileLike = {
  readEntry(): void;
  openReadStream(
    entry: YauzlEntryLike,
    callback: (error: Error | null, stream?: NodeJS.ReadableStream) => void,
  ): void;
  close(): void;
  on(event: 'entry', listener: (entry: YauzlEntryLike) => void): void;
  on(event: 'end', listener: () => void): void;
  on(event: 'error', listener: (error: Error) => void): void;
};

type YauzlEntryLike = {
  fileName: string;
};

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
      const officeResult = await this.extractOfficeText(
        input.buffer,
        '.docx',
        'docx_text',
      );
      if (officeResult.status === 'completed') {
        return officeResult;
      }

      const wordExtractorResult = await this.extractWordExtractorText(
        input.buffer,
        'docx_text',
      );
      if (wordExtractorResult.status === 'completed') {
        return wordExtractorResult;
      }

      const docxImageOcrResult = await this.extractDocxEmbeddedImageOcr(
        input.buffer,
      );
      if (docxImageOcrResult.status === 'completed') {
        return docxImageOcrResult;
      }

      const docxXmlResult = await this.extractDocxXmlText(input.buffer);
      if (docxXmlResult.status === 'completed') {
        return docxXmlResult;
      }

      const officeOcrResult = await this.extractOfficeRenderedOcr(
        input.buffer,
        '.docx',
        'docx_ocr',
      );
      if (officeOcrResult.status === 'completed') {
        return officeOcrResult;
      }

      return officeResult;
    }

    if (mimeType === 'application/msword' || extension === '.doc') {
      const officeResult = await this.extractOfficeText(
        input.buffer,
        '.doc',
        'legacy_word_text',
      );
      if (officeResult.status === 'completed') {
        return officeResult;
      }

      const legacyWordResult = await this.extractWordExtractorText(
        input.buffer,
        'legacy_word_text',
      );
      if (legacyWordResult.status === 'completed') {
        return legacyWordResult;
      }

      const officeOcrResult = await this.extractOfficeRenderedOcr(
        input.buffer,
        '.doc',
        'legacy_word_ocr',
      );
      if (officeOcrResult.status === 'completed') {
        return officeOcrResult;
      }

      return officeResult;
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
    let primaryFailure: DocumentExtractionResult | null = null;
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
      const extractedResult = this.buildCompletedResult({
        text: normalizeExtractedText(stdout, 'application/pdf'),
        extractionMode: 'pdf_text',
        parser: 'pdftotext',
      });
      if (extractedResult.status === 'completed') {
        return extractedResult;
      }

      primaryFailure = extractedResult;
    } catch (error) {
      primaryFailure = toFailedExtractionResult({
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

    const ocrResult = await this.extractPdfOcrText(buffer);
    if (ocrResult.status === 'completed') {
      return ocrResult;
    }

    return (
      primaryFailure ?? {
        status: 'failed',
        extractionMode: 'pdf_text',
        parser: 'pdftotext',
        errorCode: 'PDF_TEXT_EXTRACTION_FAILED',
        errorMessage: 'PDF 正文抽取失败。',
      }
    );
  }

  private async extractPdfOcrText(
    buffer: Buffer,
  ): Promise<DocumentExtractionResult> {
    const tempDir = await mkdtemp(path.join(tmpdir(), 'yinjie-pdf-ocr-'));
    const tempFilePath = path.join(tempDir, 'source.pdf');
    try {
      await writeFile(tempFilePath, buffer);
      return await this.extractPdfOcrTextFromFilePath({
        pdfPath: tempFilePath,
        workingDir: tempDir,
        extractionMode: 'pdf_ocr',
        maxPages: MAX_PDF_OCR_PAGES,
      });
    } catch (error) {
      return toFailedExtractionResult({
        error,
        extractionMode: 'pdf_ocr',
        parser: 'tesseract_ocr',
        binaryMissingCode: 'PDF_OCR_UNAVAILABLE',
        failureCode: 'PDF_OCR_FAILED',
        emptyCode: 'TEXT_EXTRACTION_EMPTY',
        emptyMessage: 'PDF OCR 未提取到可用正文。',
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

  private async extractWordExtractorText(
    buffer: Buffer,
    extractionMode: 'docx_text' | 'legacy_word_text',
  ): Promise<DocumentExtractionResult> {
    try {
      const extractor = await this.loadWordExtractor();
      const doc = await extractor.extract(buffer);
      const text = [
        doc.getBody(),
        doc.getHeaders?.({ includeFooters: false }) ?? '',
        doc.getFooters?.() ?? '',
        doc.getFootnotes?.() ?? '',
        doc.getEndnotes?.() ?? '',
        doc.getAnnotations?.() ?? '',
        doc.getTextboxes?.() ?? '',
      ]
        .map((value) => value.trim())
        .filter(Boolean)
        .join('\n\n');
      return this.buildCompletedResult({
        text: normalizeExtractedText(text),
        extractionMode,
        parser: 'word_extractor',
      });
    } catch (error) {
      return toFailedExtractionResult({
        error,
        extractionMode,
        parser: 'word_extractor',
        binaryMissingCode: 'WORD_EXTRACTOR_UNAVAILABLE',
        failureCode:
          extractionMode === 'docx_text'
            ? 'DOCX_PARSE_FAILED'
            : 'LEGACY_WORD_PARSE_FAILED',
        emptyCode:
          extractionMode === 'docx_text'
            ? 'TEXT_EXTRACTION_EMPTY'
            : 'LEGACY_WORD_UNSUPPORTED',
        emptyMessage:
          extractionMode === 'docx_text'
            ? 'DOCX 未提取到可用正文。'
            : 'DOC 未提取到可用正文。',
      });
    }
  }

  private async extractDocxEmbeddedImageOcr(
    buffer: Buffer,
  ): Promise<DocumentExtractionResult> {
    try {
      const imageAssets = await this.extractDocxEmbeddedImages(buffer);
      if (!imageAssets.length) {
        return {
          status: 'failed',
          extractionMode: 'docx_ocr',
          parser: 'docx_media_ocr',
          errorCode: 'DOCX_MEDIA_NOT_FOUND',
          errorMessage: 'DOCX 中未找到可 OCR 的嵌入图片。',
        };
      }

      return this.ocrImageAssets({
        imageAssets,
        extractionMode: 'docx_ocr',
        parser: 'docx_media_ocr',
      });
    } catch (error) {
      return toFailedExtractionResult({
        error,
        extractionMode: 'docx_ocr',
        parser: 'docx_media_ocr',
        binaryMissingCode: 'DOCX_MEDIA_OCR_UNAVAILABLE',
        failureCode: 'DOCX_MEDIA_OCR_FAILED',
        emptyCode: 'TEXT_EXTRACTION_EMPTY',
        emptyMessage: 'DOCX 嵌图 OCR 未提取到可用正文。',
      });
    }
  }

  private async extractOfficeRenderedOcr(
    buffer: Buffer,
    extension: '.doc' | '.docx',
    extractionMode: 'docx_ocr' | 'legacy_word_ocr',
  ): Promise<DocumentExtractionResult> {
    const tempDir = await mkdtemp(path.join(tmpdir(), 'yinjie-office-ocr-'));
    const tempFilePath = path.join(tempDir, `source${extension}`);
    try {
      await writeFile(tempFilePath, buffer);
      const pdfPath = await convertOfficeToPdf(tempFilePath, tempDir);
      return await this.extractPdfOcrTextFromFilePath({
        pdfPath,
        workingDir: tempDir,
        extractionMode,
        maxPages: MAX_OFFICE_OCR_PAGES,
      });
    } catch (error) {
      return toFailedExtractionResult({
        error,
        extractionMode,
        parser: 'libreoffice+tesseract_ocr',
        binaryMissingCode: 'OFFICE_OCR_UNAVAILABLE',
        failureCode:
          extractionMode === 'docx_ocr'
            ? 'DOCX_OCR_FAILED'
            : 'LEGACY_WORD_OCR_FAILED',
        emptyCode: 'TEXT_EXTRACTION_EMPTY',
        emptyMessage:
          extractionMode === 'docx_ocr'
            ? 'DOCX OCR 未提取到可用正文。'
            : 'DOC OCR 未提取到可用正文。',
      });
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }

  private async extractDocxXmlText(
    buffer: Buffer,
  ): Promise<DocumentExtractionResult> {
    const tempDir = await mkdtemp(path.join(tmpdir(), 'yinjie-docx-'));
    const tempFilePath = path.join(tempDir, 'source.docx');
    try {
      await writeFile(tempFilePath, buffer);
      const { stdout } = await execFileAsync(
        'unzip',
        ['-p', tempFilePath, 'word/document.xml'],
        {
          timeout: DOCX_XML_PARSE_TIMEOUT_MS,
          maxBuffer: MAX_DOCUMENT_DOWNLOAD_BYTES,
        },
      );
      const text = extractTextFromDocxXml(stdout);
      return this.buildCompletedResult({
        text,
        extractionMode: 'docx_text',
        parser: 'docx_xml',
      });
    } catch (error) {
      return toFailedExtractionResult({
        error,
        extractionMode: 'docx_text',
        parser: 'docx_xml',
        binaryMissingCode: 'UNZIP_UNAVAILABLE',
        failureCode: 'DOCX_XML_PARSE_FAILED',
        emptyCode: 'TEXT_EXTRACTION_EMPTY',
        emptyMessage: 'DOCX XML 未提取到可用正文。',
      });
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }

  private async extractPdfOcrTextFromFilePath(input: {
    pdfPath: string;
    workingDir: string;
    extractionMode: 'pdf_ocr' | 'docx_ocr' | 'legacy_word_ocr';
    maxPages: number;
  }): Promise<DocumentExtractionResult> {
    const imagePrefix = path.join(input.workingDir, 'page');
    await execFileAsync(
      'pdftoppm',
      [
        '-f',
        '1',
        '-l',
        String(input.maxPages),
        '-r',
        String(PDF_OCR_RENDER_DPI),
        '-png',
        input.pdfPath,
        imagePrefix,
      ],
      {
        timeout: PDF_OCR_RENDER_TIMEOUT_MS,
        maxBuffer: MAX_DOCUMENT_DOWNLOAD_BYTES,
      },
    );
    const imageAssets = (await readdir(input.workingDir))
      .filter((fileName) => /^page-\d+\.png$/i.test(fileName))
      .sort((left, right) => left.localeCompare(right, 'en'))
      .map((fileName) => ({
        fileName,
        path: path.join(input.workingDir, fileName),
      }));
    if (!imageAssets.length) {
      return {
        status: 'failed',
        extractionMode: input.extractionMode,
        parser: 'tesseract_ocr',
        errorCode: 'PDF_OCR_RENDER_EMPTY',
        errorMessage: 'OCR 渲染阶段未生成可识别页面。',
      };
    }

    return this.ocrImageAssets({
      imageAssets,
      extractionMode: input.extractionMode,
      parser: 'tesseract_ocr',
    });
  }

  private async ocrImageAssets(input: {
    imageAssets: Array<
      | {
          fileName: string;
          buffer: Buffer;
        }
      | {
          fileName: string;
          path: string;
        }
    >;
    extractionMode: 'pdf_ocr' | 'docx_ocr' | 'legacy_word_ocr';
    parser: string;
  }): Promise<DocumentExtractionResult> {
    const tempDir = await mkdtemp(path.join(tmpdir(), 'yinjie-image-ocr-'));
    try {
      const pageTexts: string[] = [];
      let index = 0;
      for (const asset of input.imageAssets) {
        index += 1;
        const imagePath =
          'path' in asset
            ? asset.path
            : path.join(
                tempDir,
                `ocr-${index}${normalizeOcrImageExtension(asset.fileName)}`,
              );
        if ('buffer' in asset) {
          await writeFile(imagePath, asset.buffer);
        }
        const { stdout } = await execFileAsync(
          'tesseract',
          [imagePath, 'stdout', '-l', PDF_OCR_LANGS],
          {
            timeout: PDF_OCR_PAGE_TIMEOUT_MS,
            maxBuffer: MAX_DOCUMENT_DOWNLOAD_BYTES,
          },
        );
        const pageText = normalizeExtractedText(stdout);
        if (pageText) {
          pageTexts.push(pageText);
        }
      }

      return this.buildCompletedResult({
        text: pageTexts.join('\n\n'),
        extractionMode: input.extractionMode,
        parser: input.parser,
        pageCount: input.imageAssets.length,
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

  private async loadWordExtractor(): Promise<WordExtractorLike> {
    const loadedModule = await import('word-extractor');
    const WordExtractor =
      (loadedModule.default ?? loadedModule) as new () => WordExtractorLike;
    return new WordExtractor();
  }

  private async loadYauzl(): Promise<YauzlLike> {
    const loadedModule = await import('yauzl');
    return (loadedModule.default ?? loadedModule) as YauzlLike;
  }

  private async extractDocxEmbeddedImages(buffer: Buffer) {
    const yauzl = await this.loadYauzl();
    return new Promise<Array<{ fileName: string; buffer: Buffer }>>(
      (resolve, reject) => {
        yauzl.fromBuffer(
          buffer,
          { lazyEntries: true },
          (error, zipFile) => {
            if (error || !zipFile) {
              reject(error ?? new Error('docx zip open failed'));
              return;
            }

            const imageAssets: Array<{ fileName: string; buffer: Buffer }> = [];
            let settled = false;
            const finish = (callback: () => void) => {
              if (settled) {
                return;
              }
              settled = true;
              try {
                zipFile.close();
              } catch {}
              callback();
            };

            zipFile.on('entry', (entry) => {
              if (settled) {
                return;
              }
              if (imageAssets.length >= MAX_DOCX_OCR_IMAGES) {
                finish(() => resolve(imageAssets));
                return;
              }

              if (!isSupportedDocxMediaEntry(entry.fileName)) {
                zipFile.readEntry();
                return;
              }

              zipFile.openReadStream(entry, (streamError, stream) => {
                if (streamError || !stream) {
                  finish(() =>
                    reject(streamError ?? new Error('docx media stream unavailable')),
                  );
                  return;
                }

                const chunks: Buffer[] = [];
                stream.on('data', (chunk) => {
                  chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
                });
                stream.on('error', (streamReadError) => {
                  finish(() => reject(streamReadError));
                });
                stream.on('end', () => {
                  imageAssets.push({
                    fileName: path.basename(entry.fileName),
                    buffer: Buffer.concat(chunks),
                  });
                  if (imageAssets.length >= MAX_DOCX_OCR_IMAGES) {
                    finish(() => resolve(imageAssets));
                    return;
                  }
                  zipFile.readEntry();
                });
              });
            });

            zipFile.on('end', () => finish(() => resolve(imageAssets)));
            zipFile.on('error', (zipError) => finish(() => reject(zipError)));
            zipFile.readEntry();
          },
        );
      },
    );
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

async function convertOfficeToPdf(inputPath: string, outputDir: string) {
  let lastError: unknown = null;
  for (const command of OFFICE_COMMAND_CANDIDATES) {
    try {
      await execFileAsync(
        command,
        ['--headless', '--convert-to', 'pdf', '--outdir', outputDir, inputPath],
        {
          timeout: OFFICE_CONVERT_TIMEOUT_MS,
          maxBuffer: MAX_DOCUMENT_DOWNLOAD_BYTES,
        },
      );
      const outputPath = path.join(
        outputDir,
        `${path.basename(inputPath, path.extname(inputPath))}.pdf`,
      );
      const outputStat = await stat(outputPath);
      if (outputStat.size > 0) {
        return outputPath;
      }
      lastError = new Error('converted pdf output is empty');
    } catch (error) {
      lastError = error;
      if (!isBinaryMissingError(error)) {
        break;
      }
    }
  }

  throw lastError ?? new Error('office pdf conversion failed');
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

function isSupportedDocxMediaEntry(fileName: string) {
  return /^word\/media\/[^/]+\.(png|jpe?g|bmp|tif|tiff)$/i.test(fileName);
}

function normalizeOcrImageExtension(fileName: string) {
  const extension = path.extname(fileName).trim().toLowerCase();
  return /\.(png|jpe?g|bmp|tif|tiff)$/i.test(extension) ? extension : '.png';
}

function extractTextFromDocxXml(xml: string) {
  return normalizeExtractedText(
    decodeHtmlEntities(
      xml
        .replace(/<w:tab\b[^>]*\/>/gi, '\t')
        .replace(/<w:br\b[^>]*\/>/gi, '\n')
        .replace(/<\/w:p>/gi, '\n\n')
        .replace(/<[^>]+>/g, ' '),
    ),
  );
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
      safeFromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#([0-9]+);/g, (_, decimal: string) =>
      safeFromCodePoint(Number.parseInt(decimal, 10)),
    )
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function safeFromCodePoint(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return '';
  }

  try {
    return String.fromCodePoint(value);
  } catch {
    return '';
  }
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
