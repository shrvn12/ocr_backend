const prisma = require('../../config/db');

// ── Main counts ───────────────────────────────────────────────────────────────

const getStatusCounts = async () => {
  const counts = await prisma.document.groupBy({
    by:     ['status'],
    _count: { _all: true },
  });

  const statusMap = Object.fromEntries(
    counts.map((c) => [c.status, c._count._all])
  );

  return {
    uploaded:       statusMap.UPLOADED          ?? 0,
    ocrProcessing:  statusMap.OCR_PROCESSING    ?? 0,
    ocrFailed:      statusMap.OCR_FAILED        ?? 0,
    pendingReview:  statusMap.READY_FOR_REVIEW  ?? 0,
    approved:       statusMap.APPROVED          ?? 0,
    rejected:       statusMap.REJECTED          ?? 0,
    total: counts.reduce((s, c) => s + c._count._all, 0),
  };
};

// ── Confidence distribution ───────────────────────────────────────────────────

const getConfidenceDistribution = async () => {
  const fields = await prisma.extractedField.findMany({
    where:  { confidence: { not: null } },
    select: { confidence: true, fieldName: true },
  });

  const buckets = { high: 0, medium: 0, low: 0 };
  const byField = { vehicle_number: { ...buckets }, weight: { ...buckets }, date: { ...buckets } };

  for (const f of fields) {
    const bucket = f.confidence >= 0.85 ? 'high' : f.confidence >= 0.65 ? 'medium' : 'low';
    buckets[bucket]++;
    if (byField[f.fieldName]) byField[f.fieldName][bucket]++;
  }

  return {
    overall: buckets,
    byField,
    totalFields: fields.length,
    avgConfidence:
      fields.length > 0
        ? parseFloat(
            (fields.reduce((s, f) => s + f.confidence, 0) / fields.length).toFixed(3)
          )
        : null,
  };
};

// ── Throughput over time (last N days) ────────────────────────────────────────

const getThroughput = async (days = 30) => {
  const from = new Date();
  from.setDate(from.getDate() - days);

  const [uploaded, approved, rejected] = await Promise.all([
    prisma.document.findMany({
      where:  { createdAt: { gte: from } },
      select: { createdAt: true },
    }),
    prisma.document.findMany({
      where:  { status: 'APPROVED', reviewedAt: { gte: from } },
      select: { reviewedAt: true },
    }),
    prisma.document.findMany({
      where:  { status: 'REJECTED', reviewedAt: { gte: from } },
      select: { reviewedAt: true },
    }),
  ]);

  // Bucket by day string YYYY-MM-DD
  const bucket = (date) => new Date(date).toISOString().split('T')[0];

  const toMap = (rows, key) =>
    rows.reduce((acc, r) => {
      const day = bucket(r[key]);
      acc[day]  = (acc[day] ?? 0) + 1;
      return acc;
    }, {});

  // Build full date range
  const days_arr = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days_arr.push(d.toISOString().split('T')[0]);
  }

  const uploadMap   = toMap(uploaded,  'createdAt');
  const approveMap  = toMap(approved,  'reviewedAt');
  const rejectMap   = toMap(rejected,  'reviewedAt');

  return days_arr.map((day) => ({
    date:     day,
    uploaded: uploadMap[day]  ?? 0,
    approved: approveMap[day] ?? 0,
    rejected: rejectMap[day]  ?? 0,
  }));
};

// ── Correction rate ───────────────────────────────────────────────────────────

const getCorrectionRate = async () => {
  const [totalFields, correctedFields] = await Promise.all([
    prisma.extractedField.count({ where: { rawValue: { not: null } } }),
    prisma.extractedField.count({ where: { isManuallySet: true } }),
  ]);

  const byField = await prisma.extractedField.groupBy({
    by:    ['fieldName'],
    where: { isManuallySet: true },
    _count: { _all: true },
  });

  return {
    totalExtracted:   totalFields,
    totalCorrected:   correctedFields,
    correctionRate:   totalFields > 0
      ? parseFloat(((correctedFields / totalFields) * 100).toFixed(2))
      : 0,
    byField: byField.map((r) => ({
      fieldName:      r.fieldName,
      correctedCount: r._count._all,
    })),
  };
};

// ── Recent activity feed ──────────────────────────────────────────────────────

const getRecentActivity = async (limit = 10) => {
  const logs = await prisma.auditLog.findMany({
    take:    limit,
    orderBy: { createdAt: 'desc' },
    include: {
      user:     { select: { id: true, name: true, role: true } },
      document: { select: { id: true, originalName: true, status: true } },
    },
  });
  return logs;
};

// ── Full dashboard aggregation ────────────────────────────────────────────────

const getDashboard = async ({ days = 30 } = {}) => {
  const [statusCounts, confidence, throughput, correctionRate, recentActivity] =
    await Promise.all([
      getStatusCounts(),
      getConfidenceDistribution(),
      getThroughput(Number(days)),
      getCorrectionRate(),
      getRecentActivity(10),
    ]);

  return {
    statusCounts,
    confidence,
    throughput,
    correctionRate,
    recentActivity,
    generatedAt: new Date().toISOString(),
  };
};

module.exports = {
  getDashboard,
  getStatusCounts,
  getConfidenceDistribution,
  getThroughput,
  getCorrectionRate,
  getRecentActivity,
};