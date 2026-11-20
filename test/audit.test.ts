import { describe as suite, expect, it } from 'vitest';
import { describe, toCsv, type AuditRow } from '../src/db/audit.js';

const row = (over: Partial<AuditRow>): AuditRow => ({
  id: '1',
  at: 1_794_000_000,
  actor_type: 'user',
  actor_user_id: 2102,
  actor_name: 'Mohd Awaish',
  action: 'number.deleted',
  target_type: 'number',
  target_id: 'n1',
  target_label: 'Sales',
  details: {},
  ip: '203.0.113.7',
  ...over,
});

suite('activity log text', () => {
  it('describes each kind of event in plain English', () => {
    expect(describe(row({ details: { phone: '918355892950' } }))).toBe('Removed number "Sales" (+918355892950)');
    expect(describe(row({ action: 'number.renamed', details: { from: 'Sales', to: 'Main office' } }))).toBe('Renamed number "Sales" to "Main office"');
    expect(describe(row({ action: 'number.line_changed', details: { lineId: 6, fromLineId: 2 } }))).toBe('Routed "Sales" to Open Line #6 (was #2)');
    expect(describe(row({ action: 'number.line_changed', details: { lineId: null } }))).toBe('Stopped routing "Sales" to an Open Line');
    expect(describe(row({ action: 'connection.logged_out', actor_type: 'system', details: { error: 'Logged out from the phone.' } }))).toBe(
      '"Sales" was logged out of WhatsApp: Logged out from the phone.',
    );
    expect(describe(row({ action: 'auto_replies.updated', target_label: null, details: { welcome: { on: true }, rating: { on: true } } }))).toBe(
      'Updated automatic replies (on: welcome, rating)',
    );
    expect(describe(row({ action: 'something.new' }))).toBe('something.new');
  });

  it('exports CSV that is safe to open in a spreadsheet', () => {
    const csv = toCsv([row({ target_label: '=HYPERLINK("http://evil")', details: { phone: '1' } })]);
    const [head, line] = csv.trim().split('\r\n');
    expect(head).toBe('"Time (UTC)","Who","Actor type","User id","Action","What happened","Target","IP address"');
    expect(line).toContain('"2026-11-06 21:20:00","Mohd Awaish","user","2102","number.deleted"');
    expect(line).toContain(`"'=HYPERLINK(""http://evil"")"`); // formula neutralised, quotes escaped
    expect(line?.endsWith('"203.0.113.7"')).toBe(true);
  });
});
