const { AppError } = require('./errorHandler');

/**
 * Joi validation middleware factory.
 * @param {import('joi').Schema} schema
 * @param {'body'|'query'|'params'} source
 */
const validate = (schema, source = 'body') => (req, res, next) => {
  const { error, value } = schema.validate(req[source], {
    abortEarly:    false,
    stripUnknown:  true,
    convert:       true,
  });

  if (error) {
    const messages = error.details.map((d) => ({
      field:   d.path.join('.'),
      message: d.message,
    }));
    throw new AppError('Validation failed.', 400, messages);
  }

  // Replace source with the sanitised + coerced value from Joi
  req[source] = value;
  next();
};

module.exports = validate;