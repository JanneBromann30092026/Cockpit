import { describe, expect, it } from 'vitest';
import { MIN_PASSWORD_LENGTH, passwordScore } from './passwordStrength';

describe('password strength', () => {
  it('marks passwords below the minimum length as too short', () => {
    expect(MIN_PASSWORD_LENGTH).toBe(8);
    expect(passwordScore('')).toBe(0);
    expect(passwordScore('Ab1!xyz')).toBe(0);
  });

  it('rates common words and patterns as weak', () => {
    expect(passwordScore('passwort')).toBe(1);
    expect(passwordScore('12345678')).toBe(1);
    expect(passwordScore('aaaaaaaaaaaa')).toBe(1);
    expect(passwordScore('Cockpit123')).toBeLessThanOrEqual(2);
  });

  it('rates longer mixed passwords higher', () => {
    expect(passwordScore('Haus-Baum7')).toBeGreaterThanOrEqual(2);
    expect(passwordScore('Cockpit-Test-2026!')).toBeGreaterThanOrEqual(3);
    expect(passwordScore('Sonnenblume Fahrrad Kaffeetasse Wolke')).toBe(4);
  });
});
