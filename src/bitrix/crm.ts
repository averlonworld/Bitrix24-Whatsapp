import type { Portal } from '../types.js';
import { normalizePhone } from '../util/phone.js';
import { call } from './client.js';

/**
 * CRM entity helpers shared by the CRM tab, the robot and the SMS provider.
 * Entity type ids are Bitrix's own: 1 lead, 2 deal, 3 contact, 4 company, 7 quote,
 * 31 smart invoice, >= 128 (or 1030+) smart processes.
 */
export const ENTITY_TYPE_ID = { lead: 1, deal: 2, contact: 3, company: 4, quote: 7, invoice: 31 } as const;

export interface CrmRef {
  entityTypeId: number;
  entityId: number;
}

const PLACEMENT_TYPES: Record<string, number> = {
  LEAD: 1,
  DEAL: 2,
  CONTACT: 3,
  COMPANY: 4,
  QUOTE: 7,
  SMART_INVOICE: 31,
};

/** "CRM_DEAL_DETAIL_TAB" / "CRM_DYNAMIC_128_LIST_MENU" + {"ID":"5"} -> {entityTypeId, entityId} */
export function parseCrmPlacement(placement: string | undefined, optionsRaw: string | undefined): CrmRef | null {
  if (!placement || !optionsRaw) return null;
  let entityTypeId: number | undefined;
  const dyn = placement.match(/^CRM_DYNAMIC_(\d+)_(DETAIL_TAB|LIST_MENU|DETAIL_ACTIVITY)$/);
  if (dyn?.[1]) entityTypeId = Number(dyn[1]);
  else {
    const fixed = placement.match(/^CRM_([A-Z_]+?)_(DETAIL_TAB|LIST_MENU|DETAIL_ACTIVITY)$/);
    if (fixed?.[1]) entityTypeId = PLACEMENT_TYPES[fixed[1]];
  }
  if (!entityTypeId) return null;
  try {
    const opts = JSON.parse(optionsRaw) as { ID?: string | number; ENTITY_ID?: string | number };
    const entityId = Number(opts.ID ?? opts.ENTITY_ID);
    return Number.isInteger(entityId) && entityId > 0 ? { entityTypeId, entityId } : null;
  } catch {
    return null;
  }
}

/** Business-process document id -> CRM ref. ['crm','CCrmDocumentDeal','DEAL_12'] etc. */
export function parseDocumentId(documentId: unknown): CrmRef | null {
  const raw = Array.isArray(documentId) ? String(documentId[2] ?? '') : typeof documentId === 'string' ? documentId : '';
  let m = raw.match(/^DYNAMIC_(\d+)_(\d+)$/);
  if (m) return { entityTypeId: Number(m[1]), entityId: Number(m[2]) };
  m = raw.match(/^SMART_INVOICE_(\d+)$/);
  if (m) return { entityTypeId: 31, entityId: Number(m[1]) };
  m = raw.match(/^(LEAD|DEAL|CONTACT|COMPANY|QUOTE)_(\d+)$/);
  if (m?.[1]) return { entityTypeId: PLACEMENT_TYPES[m[1]] as number, entityId: Number(m[2]) };
  return null;
}

/** Timeline ENTITY_TYPE string for crm.timeline.comment.add. */
export function timelineEntityType(entityTypeId: number): string {
  switch (entityTypeId) {
    case 1:
      return 'lead';
    case 2:
      return 'deal';
    case 3:
      return 'contact';
    case 4:
      return 'company';
    case 7:
      return 'quote';
    default:
      return `dynamic_${entityTypeId}`;
  }
}

interface Multifield {
  VALUE?: string;
  VALUE_TYPE?: string;
}

export interface CrmPhone {
  phone: string; // digits
  label: string; // "Mobile · John Smith"
}

async function phonesOf(portal: Portal, method: 'crm.lead.get' | 'crm.contact.get' | 'crm.company.get', id: number, who?: string) {
  const item = await call<{ PHONE?: Multifield[]; NAME?: string; LAST_NAME?: string; TITLE?: string }>(portal, method, { id }).catch(
    () => null,
  );
  const name = who ?? ([item?.NAME, item?.LAST_NAME].filter(Boolean).join(' ') || item?.TITLE || '');
  return (item?.PHONE ?? [])
    .map((p) => ({ phone: normalizePhone(p.VALUE ?? ''), type: p.VALUE_TYPE ?? '' }))
    .filter((p): p is { phone: string; type: string } => Boolean(p.phone))
    .map((p) => ({ phone: p.phone, label: [p.type && titleCase(p.type), name].filter(Boolean).join(' · ') }));
}

const titleCase = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

/** Every phone reachable from a CRM item: its own, plus its contacts' and company's. */
export async function resolvePhones(portal: Portal, ref: CrmRef): Promise<CrmPhone[]> {
  const out: CrmPhone[] = [];
  if (ref.entityTypeId === 1) out.push(...(await phonesOf(portal, 'crm.lead.get', ref.entityId)));
  else if (ref.entityTypeId === 3) out.push(...(await phonesOf(portal, 'crm.contact.get', ref.entityId)));
  else if (ref.entityTypeId === 4) out.push(...(await phonesOf(portal, 'crm.company.get', ref.entityId)));
  else {
    // Deal, quote, invoice, smart process: the item links to a company and contact(s).
    const res = await call<{ item?: { contactId?: number; contactIds?: number[]; companyId?: number } }>(portal, 'crm.item.get', {
      entityTypeId: ref.entityTypeId,
      id: ref.entityId,
    }).catch(() => null);
    const item = res?.item;
    const contactIds = [...new Set([...(item?.contactIds ?? []), ...(item?.contactId ? [item.contactId] : [])])].filter((x) => x > 0);
    for (const id of contactIds.slice(0, 10)) out.push(...(await phonesOf(portal, 'crm.contact.get', id)));
    if (item?.companyId) out.push(...(await phonesOf(portal, 'crm.company.get', item.companyId)));
  }
  const seen = new Set<string>();
  return out.filter((p) => (seen.has(p.phone) ? false : (seen.add(p.phone), true)));
}

/** Display name for a CRM item's client, used to name a new chat. */
export async function resolveClientName(portal: Portal, ref: CrmRef): Promise<string | null> {
  const phones = await resolvePhones(portal, ref).catch(() => []);
  const label = phones[0]?.label ?? '';
  return label.includes(' · ') ? label.split(' · ').slice(1).join(' · ') : null;
}

export async function addTimelineComment(portal: Portal, ref: CrmRef, comment: string): Promise<void> {
  await call(portal, 'crm.timeline.comment.add', {
    fields: { ENTITY_ID: ref.entityId, ENTITY_TYPE: timelineEntityType(ref.entityTypeId), COMMENT: comment },
  });
}
