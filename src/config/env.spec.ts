import { buildMongoUri, envBool, envInt, envMinutes, envPort, envString, requireEnv } from './env';

describe('env helpers', () => {
  it('trims and treats blank as unset', () => {
    expect(envString({ A: '  x ' }, 'A')).toBe('x');
    expect(envString({ A: '   ' }, 'A')).toBeUndefined();
    expect(envString({ A: 5 }, 'A')).toBe('5');
    expect(envString({ A: null }, 'A')).toBeUndefined();
    expect(envString({}, 'A')).toBeUndefined();
  });

  it('requires a value', () => {
    expect(requireEnv({ A: 'x' }, 'A')).toBe('x');
    expect(() => requireEnv({ A: ' ' }, 'A')).toThrow('Missing required env: A');
  });

  it('falls back to a default port on a bad one', () => {
    expect(envPort({ PORT: '4204' })).toBe(4204);
    expect(envPort({ PORT: 'abc' })).toBe(3000);
    expect(envPort({ PORT: '-1' })).toBe(3000);
    expect(envPort({}, 'HTTP_PORT', 8080)).toBe(8080);
  });

  it('parses integers within bounds and rejects the rest', () => {
    expect(envInt({}, 'N', 7)).toBe(7);
    expect(envInt({ N: '3' }, 'N', 7, 1, 5)).toBe(3);
    expect(() => envInt({ N: '6' }, 'N', 7, 1, 5)).toThrow('N must be an integer 1..5, got "6"');
    expect(() => envInt({ N: '2.5' }, 'N', 7)).toThrow();
  });

  it.each(['0', '60', '2.5', 'x'])('rejects %s minutes', value => {
    expect(() => envMinutes({ M: value }, 'M', 3)).toThrow('M must be an integer 1..59');
  });

  it('parses booleans', () => {
    expect(envBool({ B: 'yes' }, 'B', false)).toBe(true);
    expect(envBool({ B: 'OFF' }, 'B', true)).toBe(false);
    expect(envBool({}, 'B', true)).toBe(true);
    expect(() => envBool({ B: 'maybe' }, 'B', true)).toThrow('B must be a boolean');
  });
});

describe('buildMongoUri', () => {
  it('adds the write options, keeping an existing query', () => {
    expect(buildMongoUri('mongodb+srv://u:p@c.net/db')).toBe('mongodb+srv://u:p@c.net/db?retryWrites=true&w=majority');
    expect(buildMongoUri('mongodb://h/db?appName=x')).toBe('mongodb://h/db?appName=x&retryWrites=true&w=majority');
  });

  it('does not add options twice', () => {
    expect(buildMongoUri('mongodb://h/db?retryWrites=false')).toBe('mongodb://h/db?retryWrites=false&w=majority');
    expect(buildMongoUri('mongodb://h/db?retryWrites=true&w=1')).toBe('mongodb://h/db?retryWrites=true&w=1');
  });

  it('encodes special characters in the password once', () => {
    expect(buildMongoUri('mongodb+srv://u:p@ss#1@c.net/db')).toBe(
      'mongodb+srv://u:p%40ss%231@c.net/db?retryWrites=true&w=majority',
    );
    expect(buildMongoUri('mongodb+srv://u:p%40ss@c.net/db')).toBe(
      'mongodb+srv://u:p%40ss@c.net/db?retryWrites=true&w=majority',
    );
  });
});
