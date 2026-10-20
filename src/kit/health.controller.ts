import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';

import { BotKitRegistry, HealthResult } from './bot-kit.registry';

interface HealthBody {
  ok: boolean;
  version: string;
  startedAt: Date;
  checks: Record<string, HealthResult>;
}

/** GET /health: 200 while every registered check passes, 503 otherwise (Docker marks the container unhealthy). */
@Controller()
export class HealthController {
  constructor(private readonly registry: BotKitRegistry) {}

  @Get('health')
  async health(): Promise<HealthBody> {
    const { ok, checks } = await this.registry.runHealthChecks();
    const body = { ok, version: this.registry.version, startedAt: this.registry.startedAt, checks };
    if (!ok) {
      throw new ServiceUnavailableException(body);
    }
    return body;
  }
}
