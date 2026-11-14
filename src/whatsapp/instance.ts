import type { WhatsAppEngine } from './engine.js';

let engine: WhatsAppEngine | null = null;

export function setEngine(e: WhatsAppEngine): void {
  engine = e;
}

export function getEngine(): WhatsAppEngine {
  if (!engine) throw new Error('WhatsApp engine not started');
  return engine;
}
