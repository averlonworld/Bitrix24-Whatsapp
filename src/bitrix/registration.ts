import { config } from '../config.js';
import { setConnectorVersion } from '../db/portals.js';
import { listNumbers } from '../db/numbers.js';
import { logger } from '../logger.js';
import type { Portal } from '../types.js';
import { bindIdempotent, BitrixError, call } from './client.js';

/**
 * Everything this app plugs into on a portal. One function, re-run on install and whenever
 * CONNECTOR_VERSION is bumped, so every portal ends up with exactly this set.
 *
 *  Contact Center   imconnector "WhatsApp" channel -> Open Line chats (CRM tracker makes leads/deals)
 *  CRM detail tab   Lead, Deal, Contact, Company, Quote, Invoice, every Smart Process (SPA)
 *  CRM list menu    "WhatsApp" in the row menu of Lead, Deal, Contact, Company and every SPA list
 *  SMS provider     WhatsApp shows up wherever Bitrix sends SMS: the CRM activity panel of every
 *                   entity, the standard "Send SMS" automation rule, Sales Center
 *  Robot            "Send WhatsApp message" automation rule for Lead, Deal and SPA pipelines
 *  BP activity      the same action inside the Business Process designer
 *  Events           operator replies, install/update/uninstall, new SPA types
 */

const ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#fff" d="M12 3.2c-5 0-9 3.5-9 7.9 0 2.3 1.1 4.4 2.9 5.8L5 21.2l4.5-1.8c.8.2 1.6.3 2.5.3 5 0 9-3.5 9-7.9s-4-8.6-9-8.6z"/></svg>';
const iconUri = `data:image/svg+xml,${encodeURIComponent(ICON_SVG)}`;

/** Fixed CRM entity placements. Smart Processes are discovered per portal (crm.type.list). */
export const CRM_DETAIL_TABS = [
  'CRM_LEAD_DETAIL_TAB',
  'CRM_DEAL_DETAIL_TAB',
  'CRM_CONTACT_DETAIL_TAB',
  'CRM_COMPANY_DETAIL_TAB',
  'CRM_QUOTE_DETAIL_TAB',
  'CRM_SMART_INVOICE_DETAIL_TAB',
];
export const CRM_LIST_MENUS = ['CRM_LEAD_LIST_MENU', 'CRM_DEAL_LIST_MENU', 'CRM_CONTACT_LIST_MENU', 'CRM_COMPANY_LIST_MENU'];

export const EVENTS: Array<{ event: string; path: string }> = [
  { event: 'ONIMCONNECTORMESSAGEADD', path: '/events/message-add' },
  { event: 'ONIMCONNECTORLINEDELETE', path: '/events/line-delete' },
  { event: 'ONAPPINSTALL', path: '/events/install' },
  { event: 'ONAPPUPDATE', path: '/events/update' },
  { event: 'ONAPPUNINSTALL', path: '/events/uninstall' },
  { event: 'ONCRMTYPEADD', path: '/events/crm-type-add' },
];

export const ROBOT_CODE = 'wa_qr_send_message';
export const SMS_PROVIDER_CODE = 'wa_qr';

const robotProperties = {
  message: { Name: { en: 'Message', ru: 'Сообщение', pt: 'Mensagem', es: 'Mensaje' }, Type: 'text', Required: 'Y', Multiple: 'N' },
  phone: {
    Name: { en: 'Phone (empty = take it from the CRM item)', ru: 'Телефон (пусто = из элемента CRM)', pt: 'Telefone (vazio = do item CRM)' },
    Type: 'string',
    Required: 'N',
    Multiple: 'N',
  },
  from: {
    Name: { en: 'Send from WhatsApp number (label or phone, empty = default)', ru: 'Номер WhatsApp отправителя (пусто = по умолчанию)' },
    Type: 'string',
    Required: 'N',
    Multiple: 'N',
  },
  fileUrl: { Name: { en: 'File URL (optional)', ru: 'Ссылка на файл (необязательно)' }, Type: 'string', Required: 'N', Multiple: 'N' },
};

/** Best effort per item: one placement a portal's plan does not offer must not block the rest. */
async function soft(portal: Portal, what: string, fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (err) {
    logger.warn({ memberId: portal.member_id, what, err: (err as Error).message }, 'registration step skipped');
  }
}

export async function registerConnector(portal: Portal): Promise<void> {
  const cfg = config();
  await call(portal, 'imconnector.register', {
    ID: cfg.connectorId,
    NAME: cfg.connectorName,
    ICON: { DATA_IMAGE: iconUri, COLOR: '#25D366', SIZE: '90%', POSITION: 'center' },
    ICON_DISABLED: { DATA_IMAGE: iconUri, COLOR: '#99adb3', SIZE: '90%', POSITION: 'center' },
    PLACEMENT_HANDLER: `${cfg.publicUrl}/connector/settings`,
    // 1:1 chats; groups are addressed as one "user" per group (see inbound.ts).
    CHAT_GROUP: 'N',
  });
}

export async function bindEvents(portal: Portal): Promise<void> {
  const base = config().publicUrl;
  for (const { event, path } of EVENTS) {
    await bindIdempotent(portal, 'event.bind', { event, handler: `${base}${path}` });
  }
}

function crmTab(portal: Portal, placement: string) {
  return bindIdempotent(portal, 'placement.bind', {
    PLACEMENT: placement,
    HANDLER: `${config().publicUrl}/crm/tab`,
    TITLE: 'WhatsApp',
    DESCRIPTION: 'WhatsApp conversations with this client',
  });
}

/** Detail tab + list menu for one Smart Process type. Also called live from ONCRMTYPEADD. */
export async function bindSmartProcess(portal: Portal, entityTypeId: number): Promise<void> {
  await soft(portal, `CRM_DYNAMIC_${entityTypeId}_DETAIL_TAB`, () => crmTab(portal, `CRM_DYNAMIC_${entityTypeId}_DETAIL_TAB`));
  await soft(portal, `CRM_DYNAMIC_${entityTypeId}_LIST_MENU`, () => crmTab(portal, `CRM_DYNAMIC_${entityTypeId}_LIST_MENU`));
}

export async function bindCrmPlacements(portal: Portal): Promise<void> {
  for (const placement of [...CRM_DETAIL_TABS, ...CRM_LIST_MENUS]) {
    await soft(portal, placement, () => crmTab(portal, placement));
  }
  const types = await call<{ types?: Array<{ entityTypeId: number }> }>(portal, 'crm.type.list', {}).catch(() => null);
  for (const t of types?.types ?? []) await bindSmartProcess(portal, t.entityTypeId);
}

export async function registerAutomation(portal: Portal): Promise<void> {
  const base = config().publicUrl;
  const common = {
    CODE: ROBOT_CODE,
    HANDLER: `${base}/bitrix/robot`,
    AUTH_USER_ID: 1,
    NAME: { en: 'Send WhatsApp message', ru: 'Отправить сообщение WhatsApp', pt: 'Enviar mensagem WhatsApp', es: 'Enviar mensaje de WhatsApp' },
    DESCRIPTION: { en: 'Sends a WhatsApp message from a QR-linked number', ru: 'Отправляет сообщение WhatsApp' },
    USE_SUBSCRIPTION: 'N',
    PROPERTIES: robotProperties,
  };
  // Robot: Lead/Deal/SPA automation rules. Activity: Business Process designer.
  await soft(portal, 'bizproc.robot.add', () => registerOrUpdate(portal, 'bizproc.robot', common));
  await soft(portal, 'bizproc.activity.add', () =>
    registerOrUpdate(portal, 'bizproc.activity', { ...common, DOCUMENT_TYPE: undefined }),
  );
}

async function registerOrUpdate(portal: Portal, family: 'bizproc.robot' | 'bizproc.activity', fields: Record<string, unknown>) {
  try {
    await call(portal, `${family}.add`, fields);
  } catch (err) {
    if (err instanceof BitrixError && /exist|duplicate/i.test(`${err.code} ${err.description}`)) {
      const { CODE, ...rest } = fields;
      await call(portal, `${family}.update`, { CODE, FIELDS: rest });
      return;
    }
    throw err;
  }
}

export async function registerSmsProvider(portal: Portal): Promise<void> {
  await soft(portal, 'messageservice.sender.add', async () => {
    try {
      await call(portal, 'messageservice.sender.add', {
        CODE: SMS_PROVIDER_CODE,
        TYPE: 'SMS',
        HANDLER: `${config().publicUrl}/bitrix/sms`,
        NAME: 'WhatsApp',
        DESCRIPTION: 'Send "SMS" from CRM as WhatsApp messages through your QR-linked number',
      });
    } catch (err) {
      if (err instanceof BitrixError && /exist|duplicate|already/i.test(`${err.code} ${err.description}`)) return;
      throw err;
    }
  });
}

/** imconnector.activate: route an Open Line through this connector. */
export async function activateLine(portal: Portal, lineId: number, active = true): Promise<void> {
  await call(portal, 'imconnector.activate', { CONNECTOR: config().connectorId, LINE: lineId, ACTIVE: active ? 1 : 0 });
  if (active) {
    // Tell Contact Center the channel on this line is connected and healthy.
    await soft(portal, 'imconnector.connector.data.set', () =>
      call(portal, 'imconnector.connector.data.set', {
        CONNECTOR: config().connectorId,
        LINE: lineId,
        DATA: { id: `${config().connectorId}_${lineId}`, url_im: config().publicUrl, name: 'WhatsApp' },
      }),
    );
  }
}

/**
 * Full registration. `force` ignores the remembered connector_version: Bitrix wipes the
 * connector, placements and robots on uninstall, so after an install nothing can be assumed.
 */
export async function ensureRegistered(portal: Portal, { force = false } = {}): Promise<boolean> {
  const target = config().connectorVersion;
  if (!force && portal.connector_version === target) return false;

  await registerConnector(portal);
  await bindEvents(portal);
  await bindCrmPlacements(portal);
  await registerAutomation(portal);
  await registerSmsProvider(portal);

  // Re-registering brings the connector back deactivated on every line: re-apply bindings.
  for (const n of await listNumbers(portal.id)) {
    if (n.line_id) await soft(portal, `activate line ${n.line_id}`, () => activateLine(portal, n.line_id as number));
  }
  await setConnectorVersion(portal.id, target);
  logger.info({ memberId: portal.member_id, version: target }, 'portal registered');
  return true;
}
