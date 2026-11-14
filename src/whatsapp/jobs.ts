/** Normalized events the WhatsApp engine hands to the queues. Plain JSON - no Baileys types. */

export interface InboundMessageJob {
  kind: 'message';
  numberId: string;
  waMessageId: string;
  /** true = typed on the business phone itself (not sent through this connector) */
  fromMe: boolean;
  /** digits-only phone, or the group jid, or (rarely, unresolvable) the LID jid */
  peer: string;
  /** remoteJid as received - where replies can be addressed */
  jid: string;
  pushName: string | null;
  /** group messages: who in the group wrote it */
  participant: string | null;
  timestamp: number;
  text: string;
  quoted: string | null;
  media: { key: string; name: string; mime: string } | null;
  firstSeenAt: number;
}

export interface InboundNoteJob {
  kind: 'note';
  numberId: string;
  peer: string;
  jid: string;
  /** stable id for idempotency, e.g. call:<id>:<status> */
  eventId: string;
  text: string;
  timestamp: number;
}

export type InboundJob = InboundMessageJob | InboundNoteJob;

export interface ReceiptEvent {
  numberId: string;
  waMessageId: string;
  status: 'delivered' | 'read';
}
