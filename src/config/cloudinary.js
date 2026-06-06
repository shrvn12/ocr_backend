const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure:     true,
});

/**
 * Upload a buffer directly to Cloudinary (no temp file on disk).
 * @param {Buffer} buffer
 * @param {string} originalName
 * @returns {Promise<{url: string, publicId: string, format: string, bytes: number}>}
 */
const uploadBuffer = (buffer, originalName) => {
  return new Promise((resolve, reject) => {
    const folder = process.env.CLOUDINARY_UPLOAD_FOLDER || 'ocr-documents';

    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        public_id:       `${Date.now()}-${originalName.replace(/\s+/g, '_')}`,
        resource_type:   'auto',
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'tiff', 'pdf'],
        transformation:  [{ quality: 'auto', fetch_format: 'auto' }],
      },
      (error, result) => {
        if (error) return reject(error);
        resolve({
          url:      result.secure_url,
          publicId: result.public_id,
          format:   result.format,
          bytes:    result.bytes,
        });
      }
    );

    const streamifier = require('streamifier');
    streamifier.createReadStream(buffer).pipe(uploadStream);
  });
};

/**
 * Delete a resource from Cloudinary by publicId.
 */
const deleteResource = (publicId) =>
  cloudinary.uploader.destroy(publicId, { resource_type: 'auto' });

module.exports = { cloudinary, uploadBuffer, deleteResource };