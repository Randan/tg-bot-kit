# @randan/tg-bot-kit

Shared runtime plumbing for the NestJS Telegram bots on the R5oRR Pi: everything
that is the same in every bot, so a fix lands once.

```bash
npm install @randan/tg-bot-kit
```

Peer dependencies: `@nestjs/common`, `@nestjs/config`, `nestjs-telegraf`, `telegraf`,
`@randan/tg-logger`.

## BotKitModule: /health, /diag, the command menu

```ts
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate }),
    LoggerModule,
    NotifyAdminModule,
    BotKitModule.forRoot({ name: 'light-tg-bot', commands: BOT_COMMANDS }),
    TelegrafModule.forRootAsync({
      useFactory: (config: ConfigService) => ({ token: config.get('BOT_TOKEN'), include: [LightModule, BotKitModule] }),
      inject: [ConfigService],
    }),
  ],
})
export class AppModule {}
```

- **`GET /health`**: `{ ok, version, startedAt, checks }`, 503 when a registered check
  fails, so the Docker healthcheck marks the container unhealthy.
- **`/diag`** (admin only, `ADMIN_TELEGRAM_ID`, unlisted): version (`GIT_SHA`), start
  time, the checks and every section a service registered. Add `BotKitModule` to the
  Telegraf `include` list, or the command is not picked up.
- **Command menu**: `commands` are written to Telegram's default, private and group
  scopes on startup, so the menu always matches the code.
- **`AdminService.isAdmin(ctx)`** for other admin-only commands.

Services plug in through `BotKitRegistry`, usually in `onModuleInit`:

```ts
registry.addHealthCheck('power polling', () => !this.poller.isStuck());
registry.addDiagnostics('Tuya', () => [`остання відповідь: ${formatDiagTime(this.lastSuccessAt)}`]);
```

## Helpers

| | |
|---|---|
| `envString`, `requireEnv`, `envPort`, `envInt`, `envMinutes`, `envBool` | for `ConfigModule.forRoot({ validate })` |
| `buildMongoUri(url)` | encodes the password, adds `retryWrites=true&w=majority` |
| `withTimeout(promise, ms)` | for clients without a timeout (axios defaults, SDKs) |
| `retry(task, { attempts, delayMs })`, `isTransientError` | DNS hiccups, `fetch failed`, 408/429/5xx; doubling delay |
| `createLimiter(n)`, `mapWithConcurrency` | at most n calls at once, e.g. a speech-to-text API |
| `FailureAlert` | tell the admin about an ongoing failure once per interval, and once when it is over |
| `isChatGone(error)` | 403 or "chat not found": only then unsubscribe a chat; any other 400 is the bot's own problem |
| `Poller` | a task every N ms, never two rounds at once, `isStuck()` |
| `Watchdog` | exits the process when something is stuck for good, so Docker restarts it |

## Reusable CI/CD

`.github/workflows/bot.yml`: lint, Prettier, build, unit tests, then deploy to the Pi
over Tailscale, only if the checks pass. A bot's workflow is:

```yaml
name: Deploy
on: { push: { branches: [master] }, pull_request: {}, workflow_dispatch: {} }
jobs:
  bot:
    uses: Randan/tg-bot-kit/.github/workflows/bot.yml@v1
    with:
      project: light-tg-bot
    secrets: inherit
```

## Releasing

Bump `version` in `package.json`, push a tag `vX.Y.Z`: CI runs the checks and publishes
to npm (needs the `NPM_TOKEN` secret). Move the floating `v1` tag along for the bots'
workflow.
