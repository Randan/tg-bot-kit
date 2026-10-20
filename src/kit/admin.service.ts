import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Context } from 'telegraf';

/** The admin is the Telegram user in ADMIN_TELEGRAM_ID; nobody is when it is unset. */
@Injectable()
export class AdminService {
  constructor(private readonly config: ConfigService) {}

  isAdmin(ctx: Pick<Context, 'from'>): boolean {
    const adminId = this.config.get<string>('ADMIN_TELEGRAM_ID');
    return Boolean(adminId) && String(ctx.from?.id) === String(adminId);
  }
}
