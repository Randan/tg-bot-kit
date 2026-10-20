export const BOT_KIT_OPTIONS = Symbol('BOT_KIT_OPTIONS');

export interface BotCommand {
  command: string;
  description: string;
}

export interface BotKitOptions {
  /** The public command menu, written to Telegram on startup. Admin commands stay out of it. */
  commands?: BotCommand[];
  /** The bot's name in the /diag header. */
  name?: string;
}
