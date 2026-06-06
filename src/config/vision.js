const vision = require('@google-cloud/vision');

let client;

/**
 * Lazily instantiate the Vision client.
 * Supports both key-file and inline credentials strategies.
 */
const getVisionClient = () => {
  if (client) return client;

  // Strategy A: GOOGLE_APPLICATION_CREDENTIALS env var points to a JSON key file.
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    client = new vision.ImageAnnotatorClient();
    return client;
  }

  // Strategy B: Inline credentials (for containerised deployments).
  if (process.env.GOOGLE_CLOUD_CLIENT_EMAIL && process.env.GOOGLE_CLOUD_PRIVATE_KEY) {
    client = new vision.ImageAnnotatorClient({
      credentials: {
        client_email: process.env.GOOGLE_CLOUD_CLIENT_EMAIL,
        // Render/Railway store the key with literal \n — restore real newlines.
        private_key: process.env.GOOGLE_CLOUD_PRIVATE_KEY.replace(/\\n/g, '\n'),
      },
      projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
    });
    return client;
  }

  throw new Error(
    'Google Vision credentials not configured. ' +
    'Set GOOGLE_APPLICATION_CREDENTIALS or GOOGLE_CLOUD_CLIENT_EMAIL + GOOGLE_CLOUD_PRIVATE_KEY.'
  );
};

module.exports = { getVisionClient };