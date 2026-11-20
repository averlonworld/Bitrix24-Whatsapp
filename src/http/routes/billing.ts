import { Hono } from 'hono';
import { verifyWebhook } from '../../billing/stripe.js';
import { applyStripeEvent } from '../../billing/sync.js';
import { config } from '../../config.js';
import { logger } from '../../logger.js';

/** Public billing endpoints: Stripe webhooks and the page Stripe Checkout returns to. */
export const billingRoutes = new Hono();

billingRoutes.post('/billing/stripe/webhook', async (c) => {
  const raw = await c.req.text();
  if (!verifyWebhook(raw, c.req.header('stripe-signature'), config().stripeWebhookSecret)) {
    logger.warn('stripe webhook with an invalid signature');
    return c.text('invalid signature', 400);
  }
  try {
    await applyStripeEvent(JSON.parse(raw));
  } catch (err) {
    logger.error({ err: (err as Error).message }, 'stripe webhook failed');
    return c.text('error', 500); // Stripe retries
  }
  return c.text('ok');
});

// Stripe Checkout cannot run inside the Bitrix24 iframe, so it opens in a new tab and lands here.
billingRoutes.get('/billing/return', (c) => {
  const paid = c.req.query('paid') === '1';
  const title = paid ? 'Thank you! Your subscription is active.' : 'Checkout was cancelled.';
  const text = paid
    ? 'You can close this tab and go back to Bitrix24. The WhatsApp app updates within a minute.'
    : 'No payment was taken. You can close this tab and go back to Bitrix24.';
  return c.html(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>WhatsApp for Bitrix24</title></head>` +
      `<body style="font:16px/1.5 system-ui,-apple-system,Segoe UI,sans-serif;background:#eef2f4;color:#333d47;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:16px">` +
      `<div style="background:#fff;border-radius:16px;padding:32px;max-width:440px;text-align:center;box-shadow:0 4px 16px rgba(16,24,40,.08)">` +
      `<div style="font-size:40px">${paid ? '✅' : '↩️'}</div><h1 style="font-size:20px;margin:8px 0">${title}</h1><p style="color:#828b95;margin:0">${text}</p></div></body></html>`,
  );
});
