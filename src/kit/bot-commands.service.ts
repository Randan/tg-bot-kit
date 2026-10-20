import type { OnApplicationBootstrap } from '@nestjs/common';
import { Inject, Injectable } from '@nestjs/common';
import { LoggerService } from '@randan/tg-logger';
import { InjectBot } from 'nestjs-telegraf';
import type { Telegraf } from 'telegraf';

import { BOT_KIT_OPTIONS, BotKitOptions } from './bot-kit.options';

/**
 * Scopes Telegram picks a menu from, most specific first: a menu set by hand in
 * BotFather for private or group chats would shadow the default one, so the
 * same list is written to all of them.
 */
const SCOPES = [{ type: 'default' }, { type: 'all_private_chats' }, { type: 'all_group_chats' }] as const;

/** Writes the bot's command menu on startup, so it always matches the code. */
@Injectable()
export class BotCommandsService implements OnApplicationBootstrap {
  constructor(
    @InjectBot() private readonly bot: Telegraf,
    @Inject(BOT_KIT_OPTIONS) private readonly options: BotKitOptions,
    private readonly logger: LoggerService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!this.options.commands?.length) {
      return;
    }
    try {
      for (const scope of SCOPES) {
        await this.bot.telegram.setMyCommands(this.options.commands, { scope });
      }
      this.logger.log('Telegram command menu registered');
    } catch (error) {
      this.logger.error('Failed to register the Telegram command menu', error);
    }
  }
}
