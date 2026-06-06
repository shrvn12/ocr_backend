/**
 * OCR Field Parser
 *
 * Responsible for extracting structured fields from raw Vision API text.
 * Each extractor returns { value, confidence, method } so the caller
 * knows how the value was found and how reliable it is.
 *
 * Fields extracted:
 *   - vehicle_number  (e.g. MH12AB1234, DL-01-CA-0001)
 *   - weight          (numeric, in kg — handles "tonnes", "MT", "Kgs" etc.)
 *   - date            (normalised to YYYY-MM-DD)
 */

// ── Regex patterns ─────────────────────────────────────────────────────────────

const PATTERNS = {
  // Indian vehicle registration formats + generic alphanumeric plate
  vehicle_number: [
    /\b([A-Z]{2}[-\s]?\d{2}[-\s]?[A-Z]{1,3}[-\s]?\d{1,4})\b/i,   // MH 12 AB 1234
    /\b([A-Z]{2}\d{2}[A-Z]{2}\d{4})\b/i,                           // MH12AB1234 (no spaces)
    /\b([A-Z]{2}-\d{2}-[A-Z]{2}-\d{4})\b/i,                        // DL-01-CA-0001
    /(?:vehicle\s*(?:no|number|reg)[.:# ]*)([\w-]{4,15})/i,         // labelled: "Vehicle No: XYZ"
    /(?:reg(?:istration)?\s*(?:no|number)?[.:# ]*)([\w-]{4,15})/i,  // labelled: "Reg No: XYZ"
    /(?:truck\s*(?:no|number)?[.:# ]*)([\w-]{4,15})/i,
  ],

  weight: [
    /(?:net\s*weight|gross\s*weight|weight)[:\s]*([0-9]+(?:[.,][0-9]+)?)\s*(?:kg|kgs|kilogram)/i,
    /([0-9]+(?:[.,][0-9]+)?)\s*(?:metric\s*ton(?:ne)?s?|mt)\b/i,    // convert MT → kg later
    /([0-9]+(?:[.,][0-9]+)?)\s*(?:kg|kgs|kilograms?)\b/i,
    /(?:wt\.?|weight)[:\s.]*([0-9]+(?:[.,][0-9]+)?)/i,
  ],

  date: [
    // DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
    /\b(\d{2}[\/\-\.]\d{2}[\/\-\.]\d{4})\b/,
    // YYYY/MM/DD or YYYY-MM-DD
    /\b(\d{4}[\/\-\.]\d{2}[\/\-\.]\d{2})\b/,
    // DD MMM YYYY  e.g. 05 Jan 2024
    /\b(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4})\b/i,
    // MMM DD, YYYY  e.g. January 05, 2024
    /\b((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4})\b/i,
    // Labelled: "Date: ..."
    /(?:date|dt\.?)[:\s]*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i,
  ],
};

// ── Weight normalisation ───────────────────────────────────────────────────────

const normaliseWeight = (raw, matchedPattern) => {
  const cleaned = raw.replace(/,/g, '.').trim();
  const value   = parseFloat(cleaned);
  if (isNaN(value)) return null;

  // Convert metric tonnes → kg
  const isTonne = /metric\s*ton|mt\b/i.test(matchedPattern);
  return isTonne ? (value * 1000).toFixed(2) : value.toFixed(2);
};

// ── Date normalisation ─────────────────────────────────────────────────────────

const normaliseDate = (raw) => {
  if (!raw) return null;

  const cleaned = raw.trim();

  // Try native Date parsing first (handles ISO + long-form English dates)
  const parsed = new Date(cleaned);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split('T')[0]; // YYYY-MM-DD
  }

  // Manual parse for DD/MM/YYYY and DD-MM-YYYY
  const dmyMatch = cleaned.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
  if (dmyMatch) {
    let [, d, m, y] = dmyMatch;
    if (y.length === 2) y = `20${y}`;
    const date = new Date(`${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`);
    if (!isNaN(date.getTime())) return date.toISOString().split('T')[0];
  }

  return null; // Could not parse
};

// ── Vehicle number normalisation ───────────────────────────────────────────────

const normaliseVehicleNumber = (raw) =>
  raw.replace(/[\s\-]/g, '').toUpperCase();

// ── Core field extractor ───────────────────────────────────────────────────────

/**
 * Try each pattern for a field. Return first match.
 * @param {string} text        Full OCR text
 * @param {string} fieldName   'vehicle_number' | 'weight' | 'date'
 * @returns {{ rawValue: string|null, confidence: number, matchedBy: string }}
 */
const extractField = (text, fieldName) => {
  const patterns = PATTERNS[fieldName];
  if (!patterns) return { rawValue: null, confidence: 0, matchedBy: null };

  for (let i = 0; i < patterns.length; i++) {
    const pattern = patterns[i];
    const match   = text.match(pattern);

    if (match) {
      const captured = (match[2] ?? match[1])?.trim(); // group 2 for labelled patterns
      if (!captured) continue;

      // Confidence degrades slightly for later (less specific) patterns
      // and for labelled patterns (group 2 used) which indicate ambiguity
      const baseConfidence   = 1 - i * 0.07;
      const labelledPenalty  = match[2] ? 0.05 : 0;
      const confidence       = Math.max(0.4, baseConfidence - labelledPenalty);

      return {
        rawValue:  captured,
        confidence: parseFloat(confidence.toFixed(3)),
        matchedBy: pattern.toString(),
      };
    }
  }

  return { rawValue: null, confidence: 0, matchedBy: null };
};

// ── Main parse entry point ─────────────────────────────────────────────────────

/**
 * Parse all target fields from raw OCR text.
 *
 * @param {string} rawText
 * @param {Array<{description: string, confidence: number}>} wordAnnotations
 *        Word-level annotations from Vision API (for global confidence baseline)
 * @returns {Array<{ fieldName, rawValue, finalValue, confidence, isManuallySet }>}
 */
const parseFields = (rawText, wordAnnotations = []) => {
  // Global OCR confidence: mean of all word-level confidences
  const globalOcrConfidence =
    wordAnnotations.length > 0
      ? wordAnnotations.reduce((sum, w) => sum + (w.confidence ?? 0.8), 0) /
        wordAnnotations.length
      : 0.8; // default if annotations unavailable

  const fields = ['vehicle_number', 'weight', 'date'];
  const results = [];

  for (const fieldName of fields) {
    const { rawValue, confidence, matchedBy } = extractField(rawText, fieldName);

    // Normalise value based on field type
    let finalValue = null;
    if (rawValue) {
      if (fieldName === 'vehicle_number') finalValue = normaliseVehicleNumber(rawValue);
      else if (fieldName === 'weight')    finalValue = normaliseWeight(rawValue, matchedBy);
      else if (fieldName === 'date')      finalValue = normaliseDate(rawValue);
    }

    // Blend regex confidence with global OCR confidence
    const blendedConfidence = rawValue
      ? parseFloat((confidence * 0.7 + globalOcrConfidence * 0.3).toFixed(3))
      : 0;

    results.push({
      fieldName,
      rawValue:     rawValue ?? null,
      finalValue:   finalValue ?? rawValue ?? null, // fallback to rawValue if normalise fails
      confidence:   blendedConfidence,
      isManuallySet: false,
    });
  }

  return results;
};

module.exports = { parseFields };