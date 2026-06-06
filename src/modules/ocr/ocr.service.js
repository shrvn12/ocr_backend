const prisma           = require('../../config/db');
const { getVisionClient } = require('../../config/vision');
const { parseFields }  = require('./ocr.parser');
const { AppError }     = require('../../middleware/errorHandler');
const logger           = require('../../utils/logger');

// ── Vision API call ───────────────────────────────────────────────────────────

/**
 * Send an image URL to Google Vision and return raw text + word annotations.
 * @param {string} imageUrl  Cloudinary secure URL
 */
const runVisionOCR = async (imageUrl) => {
  const client = getVisionClient();

  const [result] = await client.documentTextDetection(imageUrl);
  const fullText = result.fullTextAnnotation;

  if (!fullText) {
    return { rawText: '', wordAnnotations: [] };
  }

  // Flatten word-level annotations across all pages → blocks → paragraphs → words
  const wordAnnotations = [];
  for (const page of fullText.pages ?? []) {
    for (const block of page.blocks ?? []) {
      for (const para of block.paragraphs ?? []) {
        for (const word of para.words ?? []) {
          const text = word.symbols?.map((s) => s.text).join('') ?? '';
          const conf = word.confidence ?? null;
          if (text) wordAnnotations.push({ description: text, confidence: conf });
        }
      }
    }
  }

  return {
    rawText:         fullText.text ?? '',
    wordAnnotations,
  };
};

// ── OCR pipeline ──────────────────────────────────────────────────────────────

/**
 * Full OCR pipeline for a single document:
 *   1. Set status → OCR_PROCESSING
 *   2. Call Google Vision
 *   3. Parse fields + confidence
 *   4. Upsert extracted_fields rows
 *   5. Set status → READY_FOR_REVIEW (or OCR_FAILED)
 *   6. Write audit log
 *
 * @param {string} documentId
 * @param {string} triggeredByUserId  User who triggered the OCR (upload or retry)
 */
const processDocument = async (documentId, triggeredByUserId) => {
  logger.info(`[OCR] Starting pipeline for document ${documentId}`);

  // ── Step 1: Mark as processing ─────────────────────────────────────────────
  const document = await prisma.document.findUnique({
    where: { id: documentId },
  });

  if (!document) throw new AppError('Document not found.', 404);

  if (!['UPLOADED', 'OCR_FAILED', 'REJECTED'].includes(document.status)) {
    throw new AppError(
      `Cannot run OCR on document with status '${document.status}'.`,
      400
    );
  }

  await prisma.document.update({
    where: { id: documentId },
    data:  { status: 'OCR_PROCESSING' },
  });

  // ── Step 2: Call Vision API ────────────────────────────────────────────────
  let rawText, wordAnnotations;
  try {
    ({ rawText, wordAnnotations } = await runVisionOCR(document.cloudinaryUrl));
  } catch (err) {
    logger.error(`[OCR] Vision API failed for document ${documentId}:`, err);

    await prisma.$transaction([
      prisma.document.update({
        where: { id: documentId },
        data:  { status: 'OCR_FAILED' },
      }),
      prisma.auditLog.create({
        data: {
          documentId,
          userId:   triggeredByUserId,
          action:   'OCR_COMPLETED',
          newValue: 'OCR_FAILED',
          metadata: { error: err.message },
        },
      }),
    ]);

    throw new AppError(`Google Vision OCR failed: ${err.message}`, 502);
  }

  // ── Step 3: Parse fields ───────────────────────────────────────────────────
  const parsedFields = parseFields(rawText, wordAnnotations);

  logger.info(
    `[OCR] Parsed fields for ${documentId}:`,
    parsedFields.map((f) => ({
      field:      f.fieldName,
      value:      f.finalValue,
      confidence: f.confidence,
    }))
  );

  // ── Step 4 & 5: Persist results in a transaction ───────────────────────────
  const updated = await prisma.$transaction(async (tx) => {
    // Upsert one row per field (unique: documentId + fieldName)
    for (const field of parsedFields) {
      await tx.extractedField.upsert({
        where: {
          documentId_fieldName: {
            documentId,
            fieldName: field.fieldName,
          },
        },
        create: {
          documentId,
          fieldName:    field.fieldName,
          rawValue:     field.rawValue,
          finalValue:   field.finalValue,
          confidence:   field.confidence,
          isManuallySet: false,
        },
        update: {
          rawValue:     field.rawValue,
          finalValue:   field.finalValue,
          confidence:   field.confidence,
          isManuallySet: false,
          correctedValue: null, // reset any prior correction on re-run
        },
      });
    }

    // Update document with raw text + status
    const doc = await tx.document.update({
      where: { id: documentId },
      data: {
        ocrRawText:     rawText,
        ocrProcessedAt: new Date(),
        status:         'READY_FOR_REVIEW',
      },
      include: {
        extractedFields: { orderBy: { fieldName: 'asc' } },
        uploadedBy:      { select: { id: true, name: true, email: true } },
      },
    });

    // Audit log
    await tx.auditLog.create({
      data: {
        documentId,
        userId:   triggeredByUserId,
        action:   'OCR_COMPLETED',
        newValue: 'READY_FOR_REVIEW',
        metadata: {
          fieldsExtracted: parsedFields.map((f) => f.fieldName),
          rawTextLength:   rawText.length,
          wordCount:       wordAnnotations.length,
          avgConfidence:   parsedFields.length
            ? (
                parsedFields.reduce((s, f) => s + f.confidence, 0) /
                parsedFields.length
              ).toFixed(3)
            : null,
        },
      },
    });

    return doc;
  });

  logger.info(`[OCR] Pipeline complete for document ${documentId} → READY_FOR_REVIEW`);
  return updated;
};

// ── Retry OCR ─────────────────────────────────────────────────────────────────

const retryOcr = async (documentId, userId) => {
  const document = await prisma.document.findUnique({ where: { id: documentId } });
  if (!document) throw new AppError('Document not found.', 404);

  if (!['OCR_FAILED', 'REJECTED'].includes(document.status)) {
    throw new AppError(
      `OCR retry is only allowed for OCR_FAILED or REJECTED documents. Current status: '${document.status}'.`,
      400
    );
  }

  return processDocument(documentId, userId);
};

// ── Get OCR result ────────────────────────────────────────────────────────────

const getOcrResult = async (documentId, requestingUser) => {
  const document = await prisma.document.findUnique({
    where:   { id: documentId },
    include: {
      extractedFields: { orderBy: { fieldName: 'asc' } },
      uploadedBy:      { select: { id: true, name: true, email: true } },
    },
  });

  if (!document) throw new AppError('Document not found.', 404);

  if (
    requestingUser.role === 'UPLOADER' &&
    document.uploadedById !== requestingUser.id
  ) {
    throw new AppError('Access denied.', 403);
  }

  if (!['READY_FOR_REVIEW', 'APPROVED', 'REJECTED'].includes(document.status)) {
    throw new AppError(
      `OCR results not yet available. Current status: '${document.status}'.`,
      400
    );
  }

  return {
    documentId:     document.id,
    status:         document.status,
    ocrRawText:     document.ocrRawText,
    ocrProcessedAt: document.ocrProcessedAt,
    extractedFields: document.extractedFields,
    summary: {
      totalFields:      document.extractedFields.length,
      extractedCount:   document.extractedFields.filter((f) => f.rawValue).length,
      correctedCount:   document.extractedFields.filter((f) => f.correctedValue).length,
      avgConfidence:
        document.extractedFields.length > 0
          ? parseFloat(
              (
                document.extractedFields.reduce((s, f) => s + (f.confidence ?? 0), 0) /
                document.extractedFields.length
              ).toFixed(3)
            )
          : null,
    },
  };
};

module.exports = { processDocument, retryOcr, getOcrResult };