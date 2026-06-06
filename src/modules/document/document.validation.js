const Joi = require('joi');

const updateStatus = Joi.object({
  status: Joi.string()
    .valid('UPLOADED', 'OCR_PROCESSING', 'OCR_FAILED', 'READY_FOR_REVIEW', 'APPROVED', 'REJECTED')
    .required(),
});

const listDocuments = Joi.object({
  page:   Joi.number().integer().min(1).default(1),
  limit:  Joi.number().integer().min(1).max(100).default(20),
  status: Joi.string()
    .valid('UPLOADED', 'OCR_PROCESSING', 'OCR_FAILED', 'READY_FOR_REVIEW', 'APPROVED', 'REJECTED')
    .optional(),
  uploadedById: Joi.string().optional(),
});

const documentId = Joi.object({
  id: Joi.string().required(),
});

module.exports = { updateStatus, listDocuments, documentId };