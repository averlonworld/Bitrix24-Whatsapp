import { describe, expect, it } from 'vitest';
import { parseExtraApps } from '../src/config.js';

describe('BITRIX_EXTRA_APPS', () => {
  it('parses client_id:secret pairs', () => {
    expect(parseExtraApps(' local.a.1:sA , local.b.2:sB=,')).toEqual([
      { clientId: 'local.a.1', clientSecret: 'sA' },
      { clientId: 'local.b.2', clientSecret: 'sB=' },
    ]);
    expect(parseExtraApps('')).toEqual([]);
  });
  it('rejects malformed entries', () => {
    expect(() => parseExtraApps('local.a.1')).toThrow();
    expect(() => parseExtraApps(':secret')).toThrow();
    expect(() => parseExtraApps('local.a.1:')).toThrow();
  });
});
