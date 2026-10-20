import type { INestApplication } from '@nestjs/common';
import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { LoggerModule } from '@randan/tg-logger';
import { getBotToken } from 'nestjs-telegraf';
import request from 'supertest';

import { AdminService } from './admin.service';
import { BotCommandsService } from './bot-commands.service';
import { BotKitModule } from './bot-kit.module';
import { BotKitRegistry } from './bot-kit.registry';
import { DiagHandler } from './diag.handler';
import { formatDiagnostics, formatDiagTime } from './diagnostics.format';

const COMMANDS = [
  { command: 'status', description: 'Чи є світло зараз' },
  { command: 'help', description: 'Допомога' },
];

describe('BotKitModule in a Nest app', () => {
  let app: INestApplication;
  let setMyCommands: jest.Mock;

  beforeEach(async () => {
    setMyCommands = jest.fn().mockResolvedValue(true);

    // stands in for TelegrafModule, which is global and provides the bot in a real app
    @Global()
    @Module({
      providers: [{ provide: getBotToken(), useValue: { telegram: { setMyCommands } } }],
      exports: [getBotToken()],
    })
    class FakeTelegrafModule {}

    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [() => ({ ADMIN_TELEGRAM_ID: '100', LOG_LEVEL: 'silent' })],
        }),
        LoggerModule,
        FakeTelegrafModule,
        BotKitModule.forRoot({ commands: COMMANDS, name: 'test-bot' }),
      ],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
  });

  afterEach(() => app.close());

  it('registers the menu in the default, private and group scopes on startup', () => {
    expect(setMyCommands.mock.calls.map(([commands, extra]) => [commands, extra.scope.type])).toEqual([
      [COMMANDS, 'default'],
      [COMMANDS, 'all_private_chats'],
      [COMMANDS, 'all_group_chats'],
    ]);
  });

  it('answers /health with 200 while the checks pass and 503 once one fails', async () => {
    const registry = app.get(BotKitRegistry);
    let polling = true;
    registry.addHealthCheck('power polling', () => polling);

    const ok = await request(app.getHttpServer()).get('/health').expect(200);
    expect(ok.body).toMatchObject({ ok: true, version: 'unknown', checks: { 'power polling': { ok: true } } });

    polling = false;
    const down = await request(app.getHttpServer()).get('/health').expect(503);
    expect(down.body).toMatchObject({ ok: false, checks: { 'power polling': { ok: false } } });
  });

  it('answers /health 200 with no checks at all', async () => {
    await request(app.getHttpServer()).get('/health').expect(200);
  });

  it('exposes AdminService for the bot handlers', () => {
    const admin = app.get(AdminService);
    expect(admin.isAdmin({ from: { id: 100 } } as never)).toBe(true);
    expect(admin.isAdmin({ from: { id: 1 } } as never)).toBe(false);
  });
});

describe('BotKitRegistry', () => {
  afterEach(() => delete process.env.GIT_SHA);

  it('reports the version from GIT_SHA', () => {
    process.env.GIT_SHA = 'eb42a61';
    expect(new BotKitRegistry().version).toBe('eb42a61');
  });

  it('turns a throwing check into a failed one', async () => {
    const registry = new BotKitRegistry();
    registry.addHealthCheck('db', () => Promise.reject(new Error('db down')));
    registry.addHealthCheck('api', () => ({ ok: true, details: 'fine' }));
    await expect(registry.runHealthChecks()).resolves.toEqual({
      ok: false,
      checks: { db: { ok: false, details: 'db down' }, api: { ok: true, details: 'fine' } },
    });
  });

  it('shows the error of a throwing section instead of failing /diag', async () => {
    const registry = new BotKitRegistry();
    registry.addDiagnostics('Tuya', () => ['online']);
    registry.addDiagnostics('YASNO', () => {
      throw new Error('boom');
    });
    await expect(registry.renderDiagnostics()).resolves.toEqual([
      { title: 'Tuya', lines: ['online'] },
      { title: 'YASNO', lines: ['⚠️ помилка: boom'] },
    ]);
  });
});

describe('AdminService', () => {
  it('nobody is the admin when ADMIN_TELEGRAM_ID is unset', () => {
    const admin = new AdminService({ get: () => undefined } as never);
    expect(admin.isAdmin({ from: { id: 1 } } as never)).toBe(false);
    expect(admin.isAdmin({} as never)).toBe(false);
  });
});

describe('BotCommandsService', () => {
  it('skips the menu when there are no commands', async () => {
    const setMyCommands = jest.fn();
    await new BotCommandsService({ telegram: { setMyCommands } } as never, {}, {} as never).onApplicationBootstrap();
    expect(setMyCommands).not.toHaveBeenCalled();
  });

  it('logs and goes on when Telegram refuses', async () => {
    const error = jest.fn();
    const telegram = { setMyCommands: jest.fn().mockRejectedValue(new Error('429')) };
    await new BotCommandsService({ telegram } as never, { commands: COMMANDS }, {
      error,
    } as never).onApplicationBootstrap();
    expect(error).toHaveBeenCalled();
  });
});

describe('DiagHandler', () => {
  const ctx = (fromId: number) => {
    const sent: string[] = [];
    return {
      sent,
      chat: { id: 1 },
      from: { id: fromId },
      telegram: { sendMessage: jest.fn(async (_chat: number, text: string) => sent.push(text)) },
    };
  };
  const handler = (registry = new BotKitRegistry()) =>
    new DiagHandler(registry, new AdminService({ get: () => '100' } as never), { name: 'light-tg-bot' });

  it('is silent for anyone but the admin', async () => {
    const c = ctx(1);
    await handler().diag(c as never);
    expect(c.sent).toEqual([]);
  });

  it('sends the header, the checks and the sections', async () => {
    const registry = new BotKitRegistry();
    registry.addHealthCheck('power polling', () => false);
    registry.addDiagnostics('Tuya', () => ['остання відповідь: онлайн']);
    const c = ctx(100);
    await handler(registry).diag(c as never);
    expect(c.sent[0]).toMatch(/^🔧 Діагностика: light-tg-bot\nВерсія: unknown, запущено /);
    expect(c.sent[0]).toContain('Стан: ⚠️ є проблеми\n  ❌ power polling');
    expect(c.sent[0]).toContain('\n\nTuya:\n  остання відповідь: онлайн');
  });

  it('reports its own failure', async () => {
    const registry = new BotKitRegistry();
    jest.spyOn(registry, 'runHealthChecks').mockRejectedValue(new Error('boom'));
    const c = ctx(100);
    await handler(registry).diag(c as never);
    expect(c.sent).toEqual(['Помилка діагностики: boom']);
  });
});

describe('formatDiagnostics', () => {
  it('renders without checks and sections', () => {
    expect(
      formatDiagnostics({
        version: 'abc',
        startedAt: new Date('2026-10-20T11:30:00Z'),
        health: { ok: true, checks: {} },
        sections: [],
      }),
    ).toBe('🔧 Діагностика\nВерсія: abc, запущено 20.10, 14:30');
  });

  it('shows check details', () => {
    const text = formatDiagnostics({
      version: 'abc',
      startedAt: new Date(),
      health: {
        ok: true,
        checks: { mongo: { ok: true, details: { readyState: 1 } }, api: { ok: true, details: 'fine' } },
      },
      sections: [],
    });
    expect(text).toContain('✅ mongo ({"readyState":1})');
    expect(text).toContain('✅ api (fine)');
  });

  it('formats times in Kyiv and a dash for nothing', () => {
    expect(formatDiagTime(new Date('2026-10-20T11:30:00Z'))).toBe('20.10, 14:30');
    expect(formatDiagTime(null)).toBe('—');
  });
});
