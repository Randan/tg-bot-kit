/**
 * Helpers for a hand-written `ConfigModule.forRoot({ validate })` function:
 * every bot validates its env the same way, so the parsing lives here.
 */
export type RawEnv = Record<string, unknown>;

/** A trimmed value; blank counts as unset. */
export function envString(env: RawEnv, key: string): string | undefined {
  const value = env[key];
  return value === undefined || value === null ? undefined : String(value).trim() || undefined;
}

export function requireEnv(env: RawEnv, key: string): string {
  const value = envString(env, key);
  if (value === undefined) {
    throw new Error(`Missing required env: ${key}`);
  }
  return value;
}

/** A positive port, or the fallback when unset or invalid. */
export function envPort(env: RawEnv, key = 'PORT', fallback = 3000): number {
  const port = Number(envString(env, key));
  return Number.isInteger(port) && port > 0 ? port : fallback;
}

/** An integer in [min, max]; unset gives the fallback, anything else invalid throws. */
export function envInt(env: RawEnv, key: string, fallback: number, min = 1, max = Number.MAX_SAFE_INTEGER): number {
  const raw = envString(env, key);
  if (raw === undefined) {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${key} must be an integer ${min}..${max}, got "${raw}"`);
  }
  return value;
}

/** Minutes between polls, 1..59 by default. */
export function envMinutes(env: RawEnv, key: string, fallback: number, max = 59): number {
  return envInt(env, key, fallback, 1, max);
}

export function envBool(env: RawEnv, key: string, fallback: boolean): boolean {
  const raw = envString(env, key)?.toLowerCase();
  if (raw === undefined) {
    return fallback;
  }
  if (['1', 'true', 'yes', 'on'].includes(raw)) {
    return true;
  }
  if (['0', 'false', 'no', 'off'].includes(raw)) {
    return false;
  }
  throw new Error(`${key} must be a boolean, got "${raw}"`);
}

/** user:password@host: the password runs to the last "@", so an unencoded "@" in it still parses. */
const MONGO_URL = /^(mongodb(?:\+srv)?:\/\/)([^:/]+):(.*)@([^@]+)$/;

/**
 * The Mongo URL with the password URL-encoded (unless it already is) and
 * retryWrites=true&w=majority added, keeping the URL's own query.
 */
export function buildMongoUri(url: string): string {
  let result = url;
  const match = url.match(MONGO_URL);
  if (match) {
    const [, protocol, user, password, rest] = match;
    const encoded = /%[0-9a-f]{2}/i.test(password) ? password : encodeURIComponent(password);
    result = `${protocol}${user}:${encoded}@${rest}`;
  }
  const options = ['retryWrites=true', 'w=majority'].filter(option => !result.includes(option.split('=')[0] + '='));
  if (!options.length) {
    return result;
  }
  return `${result}${result.includes('?') ? '&' : '?'}${options.join('&')}`;
}
