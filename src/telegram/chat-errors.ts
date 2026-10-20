interface TelegramErrorResponse {
  error_code?: number;
  description?: string;
}

function responseOf(error: unknown): TelegramErrorResponse | undefined {
  const err = error as { response?: TelegramErrorResponse };
  return err?.response;
}

/**
 * Whether a send failed because the chat is gone for good: the user blocked
 * the bot, deleted the account, or the chat no longer exists. Only then is it
 * right to unsubscribe the chat. Any other 400 (a bad photo URL, a too long
 * caption) is the bot's own problem, not the user's.
 */
export function isChatGone(error: unknown): boolean {
  const response = responseOf(error);
  if (!response) {
    return false;
  }
  if (response.error_code === 403) {
    return true;
  }
  return (
    response.error_code === 400 &&
    /chat not found|user not found|group chat was deactivated/i.test(response.description ?? '')
  );
}

/** The Telegram error text for logs and alerts. */
export function describeTelegramError(error: unknown): string {
  const response = responseOf(error);
  if (response?.error_code) {
    return `${response.error_code} ${response.description ?? ''}`.trim();
  }
  return error instanceof Error ? error.message : String(error);
}
