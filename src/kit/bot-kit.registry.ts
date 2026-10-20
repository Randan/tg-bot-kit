import { Injectable } from '@nestjs/common';

export interface HealthResult {
  ok: boolean;
  details?: unknown;
}

export type HealthCheck = () => HealthResult | boolean | Promise<HealthResult | boolean>;

/** Lines of one /diag section; a section that throws shows its error instead. */
export type DiagnosticsSection = () => string[] | Promise<string[]>;

/**
 * Where a bot's services plug into /health and /diag: each registers its own
 * checks and sections (usually in onModuleInit), the kit renders them.
 */
@Injectable()
export class BotKitRegistry {
  readonly startedAt = new Date();
  private readonly healthChecks = new Map<string, HealthCheck>();
  private readonly sections = new Map<string, DiagnosticsSection>();

  /** The commit the image was built from, passed as the GIT_SHA build arg. */
  get version(): string {
    return process.env.GIT_SHA || 'unknown';
  }

  addHealthCheck(name: string, check: HealthCheck): void {
    this.healthChecks.set(name, check);
  }

  addDiagnostics(title: string, section: DiagnosticsSection): void {
    this.sections.set(title, section);
  }

  async runHealthChecks(): Promise<{ ok: boolean; checks: Record<string, HealthResult> }> {
    const checks: Record<string, HealthResult> = {};
    for (const [name, check] of this.healthChecks) {
      try {
        const result = await check();
        checks[name] = typeof result === 'boolean' ? { ok: result } : result;
      } catch (error) {
        checks[name] = { ok: false, details: error instanceof Error ? error.message : String(error) };
      }
    }
    return { ok: Object.values(checks).every(check => check.ok), checks };
  }

  async renderDiagnostics(): Promise<{ title: string; lines: string[] }[]> {
    const rendered: { title: string; lines: string[] }[] = [];
    for (const [title, section] of this.sections) {
      try {
        rendered.push({ title, lines: await section() });
      } catch (error) {
        rendered.push({ title, lines: [`⚠️ помилка: ${error instanceof Error ? error.message : String(error)}`] });
      }
    }
    return rendered;
  }
}
