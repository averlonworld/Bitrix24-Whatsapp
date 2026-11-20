import { describe, expect, it } from 'vitest';
import { DEFAULT_AUTO_REPLIES, lineParams, normalizeAutoReplies } from '../src/bitrix/autoReplies.js';

describe('automatic replies', () => {
  it('are all off by default, and new Open Lines get every automatic message switched off', () => {
    const a = normalizeAutoReplies({});
    expect([a.welcome.on, a.away.on, a.closing.on, a.rating.on]).toEqual([false, false, false, false]);
    expect(lineParams(a)).toEqual({ WELCOME_MESSAGE: 'N', NO_ANSWER_RULE: 'none', CLOSE_RULE: 'none', VOTE_MESSAGE: 'N' });
  });

  it('send the admin wording when switched on', () => {
    const a = normalizeAutoReplies({
      welcome: { on: true, text: 'Hello!\nWe reply within 10 minutes.' },
      away: { on: true, text: 'Back soon', minutes: 30 },
      closing: { on: true, text: 'Thanks [b]a lot[/b]' },
      rating: { on: true },
    });
    expect(lineParams(a)).toEqual({
      WELCOME_MESSAGE: 'Y',
      WELCOME_MESSAGE_TEXT: 'Hello![br]We reply within 10 minutes.',
      NO_ANSWER_RULE: 'text',
      NO_ANSWER_TEXT: 'Back soon',
      NO_ANSWER_TIME: 1800,
      CLOSE_RULE: 'text',
      CLOSE_TEXT: 'Thanks (b)a lot(/b)', // brackets cannot inject Bitrix markup
      VOTE_MESSAGE: 'Y',
    });
  });

  it('cleans up bad input', () => {
    const a = normalizeAutoReplies({ welcome: { on: 'yes', text: '   ' }, away: { on: true, minutes: 7 }, extra: 1 });
    expect(a.welcome).toEqual({ on: false, text: DEFAULT_AUTO_REPLIES.welcome.text });
    expect(a.away.minutes).toBe(15);
    expect(normalizeAutoReplies({ closing: { on: true, text: 'x'.repeat(5000) } }).closing.text).toHaveLength(1000);
  });
});
