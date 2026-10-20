import type { HealthResult } from './bot-kit.registry';

/** "20.10, 14:30" in the given time zone; "—" for nothing. */
export function formatDiagTime(date: Date | null | undefined, timeZone = 'Europe/Kyiv'): string {
  if (!date) {
    return '—';
  }
  return new Date(date).toLocaleString('uk-UA', {
    timeZone,
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export interface DiagnosticsInput {
  name?: string;
  version: string;
  startedAt: Date;
  health: { ok: boolean; checks: Record<string, HealthResult> };
  sections: { title: string; lines: string[] }[];
  timeZone?: string;
}

export function formatDiagnostics(input: DiagnosticsInput): string {
  const lines = [
    `🔧 Діагностика${input.name ? `: ${input.name}` : ''}`,
    `Версія: ${input.version}, запущено ${formatDiagTime(input.startedAt, input.timeZone)}`,
  ];

  const checks = Object.entries(input.health.checks);
  if (checks.length) {
    lines.push(`Стан: ${input.health.ok ? '✅ усе гаразд' : '⚠️ є проблеми'}`);
    for (const [name, result] of checks) {
      const details =
        result.details === undefined
          ? ''
          : ` (${typeof result.details === 'string' ? result.details : JSON.stringify(result.details)})`;
      lines.push(`  ${result.ok ? '✅' : '❌'} ${name}${details}`);
    }
  }

  for (const section of input.sections) {
    lines.push('', `${section.title}:`, ...section.lines.map(line => `  ${line}`));
  }
  return lines.join('\n');
}
