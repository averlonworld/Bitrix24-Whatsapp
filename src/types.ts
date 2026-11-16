export interface Portal {
  id: string;
  member_id: string;
  domain: string;
  client_endpoint: string;
  access_token: string;
  refresh_token: string;
  access_expires_at: number;
  application_token: string | null;
  connector_version: number | null;
  default_number_id: string | null;
  status: string;
  self_link_enabled: boolean;
  installed_at: number;
  updated_at: number;
}

export type NumberStatus = 'new' | 'qr' | 'connecting' | 'connected' | 'disconnected' | 'logged_out';

export interface WaNumber {
  id: string;
  portal_id: string;
  label: string;
  phone: string | null;
  status: NumberStatus;
  last_error: string | null;
  line_id: number | null;
  groups_enabled: boolean;
  created_at: number;
  updated_at: number;
  status_changed_at: number | null;
  alerted_status: string | null;
  owner_user_id: number | null;
  personal_line: boolean;
}

export interface ChatMapRow {
  id: string;
  number_id: string;
  peer: string;
  chat_id: string;
  last_jid: string;
  name: string | null;
  named: boolean;
  line_id: number | null;
  bitrix_chat_id: number | null;
  last_message_at: number | null;
}

/** A file going to WhatsApp: fetched from a URL (Bitrix disk link or our own media store). */
export interface OutboundFile {
  url: string;
  name: string;
  /** Bitrix's own coarse type, when known: image | video | audio | file */
  type?: string;
}
