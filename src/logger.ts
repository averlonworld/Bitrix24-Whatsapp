import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  // Tokens, keys and message bodies must never reach the logs.
  redact: {
    paths: ['*.access_token', '*.refresh_token', '*.application_token', '*.auth', '*.text', '*.body'],
    censor: '[redacted]',
  },
});
