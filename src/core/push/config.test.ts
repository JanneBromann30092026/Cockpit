import { describe, expect, it } from 'vitest';
import { parsePushConfig, pushServiceName, serializePushConfig } from './config';

const key = (bytes: number) => 'A'.repeat(Math.ceil((bytes * 4) / 3));
const valid = {
  v: 1,
  publicKey: key(65),
  privateKey: key(32),
  subscription: {
    endpoint: 'https://web.push.apple.com/QAbc',
    keys: { p256dh: key(65), auth: key(16) },
  },
};

describe('push config', () => {
  it('accepts a complete configuration, also with whitespace from pasting', () => {
    const parsed = parsePushConfig(`  ${JSON.stringify(valid)}\n`);
    expect(parsed).toEqual({ ok: true, config: valid });
    if (parsed.ok) expect(parsePushConfig(serializePushConfig(parsed.config)).ok).toBe(true);
  });

  it('names what is wrong', () => {
    expect(parsePushConfig('{')).toEqual({ ok: false, problem: 'json' });
    expect(parsePushConfig(JSON.stringify({ ...valid, v: 2 }))).toEqual({
      ok: false,
      problem: 'version',
    });
    expect(parsePushConfig(JSON.stringify({ ...valid, privateKey: key(65) }))).toEqual({
      ok: false,
      problem: 'keys',
    });
    expect(
      parsePushConfig(
        JSON.stringify({ ...valid, subscription: { ...valid.subscription, endpoint: 'http://x' } }),
      ),
    ).toEqual({ ok: false, problem: 'subscription' });
  });

  it('shows only the push service, never the subscription', () => {
    expect(pushServiceName(valid.subscription.endpoint)).toBe('web.push.apple.com');
    expect(pushServiceName('nonsense')).toBe('');
  });
});
