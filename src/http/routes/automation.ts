import { Hono } from 'hono';
import { authenticateEvent, type EventAuth } from '../../bitrix/auth.js';
import { parseDocumentId, resolvePhones } from '../../bitrix/crm.js';
import { logger } from '../../logger.js';
import { crmQueue } from '../../queue/queues.js';
import { obj, readPhpForm, str } from '../../util/phpForm.js';

/**
 * Two ways Bitrix asks us to send a WhatsApp message from CRM:
 *  - the "Send WhatsApp message" robot / BP activity (Lead, Deal, Smart Process automation)
 *  - the SMS provider: anywhere Bitrix sends an SMS (CRM activity panel, "Send SMS" rule...)
 * Both are authenticated like events and only enqueue.
 */
export const automationRoutes = new Hono();

automationRoutes.post('/bitrix/robot', async (c) => {
  const body = await readPhpForm(c.req.raw);
  const auth = obj(body.auth) as unknown as EventAuth;
  const r = await authenticateEvent(auth);
  if (!r.portal) {
    logger.warn({ reason: r.reason }, 'robot call rejected');
    return c.text('ignored', 200);
  }
  const props = obj(body.properties);
  const ref = parseDocumentId(Object.values(obj(body.document_id)).map((v) => str(v)));
  const eventToken = str(body.event_token) || `${Date.now()}-${Math.random()}`;
  const text = str(props.message).trim();
  if (!text && !str(props.fileUrl)) return c.text('ok');

  let phone = str(props.phone).trim();
  if (!phone && ref) phone = (await resolvePhones(r.portal, ref).catch(() => []))[0]?.phone ?? '';
  if (!phone) {
    logger.warn({ ref }, 'robot: no phone on the CRM item');
    return c.text('ok');
  }
  await crmQueue().add(
    'robot',
    {
      portalId: r.portal.id,
      source: 'robot',
      from: str(props.from) || null,
      phone,
      text,
      fileUrl: str(props.fileUrl) || null,
      ref,
      extRef: `robot:${eventToken}`,
    },
    { jobId: `robot-${r.portal.id}-${eventToken}`.replace(/[^a-zA-Z0-9_-]/g, '_') },
  );
  return c.text('ok');
});

automationRoutes.post('/bitrix/sms', async (c) => {
  const body = await readPhpForm(c.req.raw);
  const r = await authenticateEvent(obj(body.auth) as unknown as EventAuth);
  if (!r.portal) {
    logger.warn({ reason: r.reason }, 'sms provider call rejected');
    return c.text('ignored', 200);
  }
  const messageId = str(body.message_id);
  const to = str(body.message_to);
  const text = str(body.message_body);
  if (!messageId || !to || !text) return c.text('ok');
  const bindings = Object.values(obj(body.bindings)).map((b) => obj(b));
  const owner = bindings[0];
  const ref =
    owner && Number(str(owner.OWNER_TYPE_ID)) > 0 && Number(str(owner.OWNER_ID)) > 0
      ? { entityTypeId: Number(str(owner.OWNER_TYPE_ID)), entityId: Number(str(owner.OWNER_ID)) }
      : null;
  await crmQueue().add(
    'sms',
    {
      portalId: r.portal.id,
      source: 'sms',
      from: str(body.message_from) || null,
      phone: to,
      text,
      ref,
      extRef: `sms:${messageId}`,
      smsMessageId: messageId,
    },
    { jobId: `sms-${r.portal.id}-${messageId}`.replace(/[^a-zA-Z0-9_-]/g, '_') },
  );
  return c.text('ok');
});
