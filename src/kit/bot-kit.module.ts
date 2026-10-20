import type { DynamicModule } from '@nestjs/common';
import { Global, Module } from '@nestjs/common';

import { AdminService } from './admin.service';
import { BotCommandsService } from './bot-commands.service';
import { BOT_KIT_OPTIONS, BotKitOptions } from './bot-kit.options';
import { BotKitRegistry } from './bot-kit.registry';
import { DiagHandler } from './diag.handler';
import { HealthController } from './health.controller';

/**
 * GET /health, the admin /diag command, the command menu and AdminService.
 * Needs ConfigModule (global), LoggerModule from @randan/tg-logger and
 * TelegrafModule; add BotKitModule to TelegrafModule's `include` so /diag is
 * picked up.
 */
@Global()
@Module({})
export class BotKitModule {
  static forRoot(options: BotKitOptions = {}): DynamicModule {
    return {
      module: BotKitModule,
      controllers: [HealthController],
      providers: [
        { provide: BOT_KIT_OPTIONS, useValue: options },
        BotKitRegistry,
        AdminService,
        BotCommandsService,
        DiagHandler,
      ],
      exports: [BotKitRegistry, AdminService, BOT_KIT_OPTIONS],
    };
  }
}
