const multer = require('multer');

const MAX_SIZE_BYTES =
  (parseInt(process.env.MAX_FILE_SIZE_MB, 10) || 10) * 1024 * 1024;

const ALLOWED_MIME_TYPES = (
  process.env.ALLOWED_MIME_TYPES ||
  'image/jpeg,image/png,image/webp,image/tiff,application/pdf'
)
  .split(',')
  .map((t) => t.trim());

const fileFilter = (_req, file, cb) => {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      Object.assign(new Error(`Unsupported file type: ${file.mimetype}`), {
        statusCode: 415,
      }),
      false
    );
  }
};

// Store in memory — we stream directly to Cloudinary, no temp files on disk.
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: MAX_SIZE_BYTES },
  fileFilter,
});

module.exports = upload;