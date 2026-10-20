import { describeTelegramError, isChatGone } from './chat-errors';

const telegramError = (error_code: number, description: string) =>
  Object.assign(new Error(description), { response: { error_code, description } });

describe('isChatGone', () => {
  it.each([
    [403, 'Forbidden: bot was blocked by the user'],
    [403, 'Forbidden: user is deactivated'],
    [403, 'Forbidden: bot was kicked from the group chat'],
    [400, 'Bad Request: chat not found'],
    [400, 'Bad Request: group chat was deactivated'],
  ])('%i %s: the chat is gone', (code, description) => {
    expect(isChatGone(telegramError(code, description))).toBe(true);
  });

  it.each([
    [400, 'Bad Request: wrong file identifier/HTTP URL specified'],
    [400, 'Bad Request: failed to get HTTP URL content'],
    [400, 'Bad Request: message caption is too long'],
    [429, 'Too Many Requests: retry after 5'],
  ])('%i %s: the bot problem, keep the chat', (code, description) => {
    expect(isChatGone(telegramError(code, description))).toBe(false);
  });

  it('is false for a non-Telegram error', () => {
    expect(isChatGone(new Error('ECONNRESET'))).toBe(false);
    expect(isChatGone(undefined)).toBe(false);
  });
});

describe('describeTelegramError', () => {
  it('prefers the Telegram code and text', () => {
    expect(describeTelegramError(telegramError(403, 'Forbidden: blocked'))).toBe('403 Forbidden: blocked');
    expect(describeTelegramError(new Error('socket hang up'))).toBe('socket hang up');
    expect(describeTelegramError('oops')).toBe('oops');
  });
});
