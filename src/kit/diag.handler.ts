import { Inject } from '@nestjs/common';
import { Command, Ctx, Update } from 'nestjs-telegraf';
import type { Context } from 'telegraf';

import { AdminService } from './admin.service';
import { BOT_KIT_OPTIONS, BotKitOptions } from './bot-kit.options';
import { BotKitRegistry } from './bot-kit.registry';
import { formatDiagnostics } from './diagnostics.format';

/**
 * Admin-only and unlisted /diag: the version, the start time, the health checks
 * and every section the bot registered. Everything needed to tell what is wrong
 * without shell access to the server. Anyone else is ignored silently.
 */
@Update()
export class DiagHandler {
  constructor(
    private readonly registry: BotKitRegistry,
    private readonly admin: AdminService,
    @Inject(BOT_KIT_OPTIONS) private readonly options: BotKitOptions,
  ) {}

  @Command('diag')
  async diag(@Ctx() ctx: Context): Promise<void> {
    const chatId = ctx.chat?.id;
    if (!chatId || !this.admin.isAdmin(ctx)) {
      return;
    }
    try {
      const health = await this.registry.runHealthChecks();
      const sections = await this.registry.renderDiagnostics();
      await ctx.telegram.sendMessage(
        chatId,
        formatDiagnostics({
          name: this.options.name,
          version: this.registry.version,
          startedAt: this.registry.startedAt,
          health,
          sections,
          timeZone: process.env.TIMEZONE || process.env.TZ || 'Europe/Kyiv',
        }),
      );
    } catch (error) {
      await ctx.telegram.sendMessage(
        chatId,
        `Помилка діагностики: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
