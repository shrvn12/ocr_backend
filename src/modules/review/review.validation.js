const Joi = require('joi');

const correctField = Joi.object({
  fieldName: Joi.string()
    .valid('vehicle_number', 'weight', 'date')
    .required(),
  correctedValue: Joi.string().trim().min(1).max(255).required(),
  reason: Joi.string().trim().max(500).optional(),
});

const correctFields = Joi.object({
  corrections: Joi.array()
    .items(
      Joi.object({
        fieldName:      Joi.string().valid('vehicle_number', 'weight', 'date').required(),
        correctedValue: Joi.string().trim().min(1).max(255).required(),
        reason:         Joi.string().trim().max(500).optional(),
      })
    )
    .min(1)
    .required(),
});

const approveDocument = Joi.object({
  notes: Joi.string().trim().max(1000).optional(),
});

const rejectDocument = Joi.object({
  notes: Joi.string().trim().min(5).max(1000).required()
    .messages({ 'string.min': 'Rejection reason must be at least 5 characters.' }),
});

const listReviewQueue = Joi.object({
  page:               Joi.number().integer().min(1).default(1),
  limit:              Joi.number().integer().min(1).max(100).default(20),
  minConfidence:      Joi.number().min(0).max(1).optional(),
  maxConfidence:      Joi.number().min(0).max(1).optional(),
  hasCorrections:     Joi.boolean().optional(),
  assignedToMe:       Joi.boolean().optional(),
});

const documentId = Joi.object({
  id: Joi.string().required(),
});

module.exports = {
  correctField,
  correctFields,
  approveDocument,
  rejectDocument,
  listReviewQueue,
  documentId,
};