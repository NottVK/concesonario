import { chatDebugEnabled, chatEvalMode, chatMaxTurns, chatMinTurnGapMs, chatPerHourLimit, chatPerMinuteLimit } from './chat.config.js';

const saved = { ...process.env };

afterEach(() => {
  for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
  Object.assign(process.env, saved);
});

describe('límites del chat', () => {
  it('en producción los valores son fijos aunque haya variables CHAT_* y CHAT_EVAL_MODE', () => {
    process.env.NODE_ENV = 'production';
    process.env.CHAT_EVAL_MODE = 'true';
    process.env.CHAT_DEBUG_TOOLS = 'true';
    process.env.CHAT_LIMIT_PER_MINUTE = '100000';
    process.env.CHAT_LIMIT_PER_HOUR = '100000';
    process.env.CHAT_MIN_TURN_GAP_MS = '0';
    process.env.CHAT_MAX_TURNS = '100000';
    expect(chatEvalMode()).toBe(false);
    expect(chatDebugEnabled()).toBe(false);
    expect([chatPerMinuteLimit(), chatPerHourLimit(), chatMinTurnGapMs(), chatMaxTurns()]).toEqual([6, 60, 2000, 60]);
  });

  it('sin NODE_ENV=test ni modo de evaluación, las variables se ignoran', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.CHAT_EVAL_MODE;
    process.env.CHAT_LIMIT_PER_MINUTE = '100000';
    expect(chatPerMinuteLimit()).toBe(6);
    expect(chatDebugEnabled()).toBe(false);
  });

  it('en el modo de evaluación (fuera de producción) se relajan los límites y se activa la depuración', () => {
    process.env.NODE_ENV = 'development';
    process.env.CHAT_EVAL_MODE = 'true';
    process.env.CHAT_LIMIT_PER_MINUTE = '1000';
    expect(chatEvalMode()).toBe(true);
    expect(chatPerMinuteLimit()).toBe(1000);
    expect(chatDebugEnabled()).toBe(true);
    process.env.CHAT_DEBUG_TOOLS = 'false';
    expect(chatDebugEnabled()).toBe(false);
  });

  it('valores inválidos vuelven al valor fijo', () => {
    process.env.NODE_ENV = 'test';
    process.env.CHAT_LIMIT_PER_MINUTE = 'abc';
    process.env.CHAT_MAX_TURNS = '-4';
    expect(chatPerMinuteLimit()).toBe(6);
    expect(chatMaxTurns()).toBe(60);
  });
});

describe('chatTurnTimeoutMs', () => {
  it('240 s por defecto y valida el rango de 30 a 300 s', async () => {
    const { chatTurnTimeoutMs, DEFAULT_CHAT_TURN_TIMEOUT_MS } = await import('./chat.config.js');
    expect(chatTurnTimeoutMs(undefined)).toBe(DEFAULT_CHAT_TURN_TIMEOUT_MS);
    expect(chatTurnTimeoutMs('')).toBe(240_000);
    expect(chatTurnTimeoutMs('240000')).toBe(240_000);
    for (const bad of ['10000', '400000', '2m', '-1', '1e5']) {
      expect(() => chatTurnTimeoutMs(bad)).toThrow(/CHAT_TURN_TIMEOUT_MS/);
    }
  });
});
