require('dotenv').config();

const { PrismaClient } = require('@prisma/client');
const bcrypt           = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // ── Users ──────────────────────────────────────────────────────────────────
  const passwordHash = await bcrypt.hash('Admin@1234', 12);

  const admin = await prisma.user.upsert({
    where:  { email: 'admin@ocr.dev' },
    update: {},
    create: { name: 'System Admin', email: 'admin@ocr.dev', passwordHash, role: 'ADMIN' },
  });

  const reviewer = await prisma.user.upsert({
    where:  { email: 'reviewer@ocr.dev' },
    update: {},
    create: {
      name:         'Lead Reviewer',
      email:        'reviewer@ocr.dev',
      passwordHash: await bcrypt.hash('Review@1234', 12),
      role:         'REVIEWER',
    },
  });

  const uploader = await prisma.user.upsert({
    where:  { email: 'uploader@ocr.dev' },
    update: {},
    create: {
      name:         'Truck Operator',
      email:        'uploader@ocr.dev',
      passwordHash: await bcrypt.hash('Upload@1234', 12),
      role:         'UPLOADER',
    },
  });

  console.log(`✅ Users seeded: ${admin.email}, ${reviewer.email}, ${uploader.email}`);

  // ── Sample documents ───────────────────────────────────────────────────────
  const sampleDocs = [
    {
      originalName:   'weighbridge-001.jpg',
      cloudinaryUrl:  'https://res.cloudinary.com/demo/image/upload/sample.jpg',
      cloudinaryId:   'ocr-documents/sample-001',
      status:         'APPROVED',
      ocrRawText:     'Vehicle No: MH12AB1234\nWeight: 5200 Kgs\nDate: 15/06/2024',
      ocrProcessedAt: new Date('2024-06-15T10:00:00Z'),
      reviewedAt:     new Date('2024-06-15T11:00:00Z'),
      uploadedById:   uploader.id,
    },
    {
      originalName:   'weighbridge-002.jpg',
      cloudinaryUrl:  'https://res.cloudinary.com/demo/image/upload/sample2.jpg',
      cloudinaryId:   'ocr-documents/sample-002',
      status:         'READY_FOR_REVIEW',
      ocrRawText:     'Reg No: DL01CA0001\nGross Weight: 8.5 MT\nDate: 20/06/2024',
      ocrProcessedAt: new Date('2024-06-20T09:30:00Z'),
      uploadedById:   uploader.id,
    },
    {
      originalName:   'weighbridge-003.jpg',
      cloudinaryUrl:  'https://res.cloudinary.com/demo/image/upload/sample3.jpg',
      cloudinaryId:   'ocr-documents/sample-003',
      status:         'OCR_FAILED',
      uploadedById:   uploader.id,
    },
  ];

  for (const docData of sampleDocs) {
    const doc = await prisma.document.create({ data: docData });

    // Seed extracted fields for OCR-processed docs
    if (['APPROVED', 'READY_FOR_REVIEW'].includes(doc.status)) {
      const isApproved = doc.status === 'APPROVED';

      const fields = [
        {
          fieldName:     'vehicle_number',
          rawValue:      isApproved ? 'MH12AB1234'   : 'DL01CA0001',
          finalValue:    isApproved ? 'MH12AB1234'   : 'DL01CA0001',
          confidence:    isApproved ? 0.92            : 0.78,
          isManuallySet: false,
        },
        {
          fieldName:     'weight',
          rawValue:      isApproved ? '5200.00' : '8500.00',
          finalValue:    isApproved ? '5200.00' : '8500.00',
          confidence:    isApproved ? 0.88       : 0.61,
          isManuallySet: false,
        },
        {
          fieldName:     'date',
          rawValue:      isApproved ? '2024-06-15' : '2024-06-20',
          finalValue:    isApproved ? '2024-06-15' : '2024-06-20',
          confidence:    isApproved ? 0.95         : 0.84,
          isManuallySet: false,
        },
      ];

      for (const field of fields) {
        await prisma.extractedField.create({
          data: { documentId: doc.id, ...field },
        });
      }

      // Seed audit logs
      await prisma.auditLog.createMany({
        data: [
          {
            documentId: doc.id,
            userId:     uploader.id,
            action:     'DOCUMENT_UPLOADED',
            newValue:   'UPLOADED',
          },
          {
            documentId: doc.id,
            userId:     admin.id,
            action:     'OCR_COMPLETED',
            newValue:   'READY_FOR_REVIEW',
          },
          ...(isApproved
            ? [{
                documentId: doc.id,
                userId:     reviewer.id,
                action:     'DOCUMENT_APPROVED',
                oldValue:   'READY_FOR_REVIEW',
                newValue:   'APPROVED',
              }]
            : []),
        ],
      });
    }

    console.log(`✅ Document seeded: ${doc.originalName} [${doc.status}]`);
  }

  console.log('\n🎉 Seed complete.\n');
  console.log('Seed credentials:');
  console.log('  Admin:    admin@ocr.dev    / Admin@1234');
  console.log('  Reviewer: reviewer@ocr.dev / Review@1234');
  console.log('  Uploader: uploader@ocr.dev / Upload@1234');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());