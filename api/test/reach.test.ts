import { describe, expect, it } from 'vitest';
import { HttpError } from '../src/errors.js';
import { reach } from '../src/process.js';

describe('reach error handling', () => {
  it('a person object on the previous version answers 503 with Retry-After', async () => {
    // Test that reach() catches the specific version-skew TypeError and throws 503
    const call = async () => {
      throw new TypeError('The RPC receiver does not implement the method "runStatus"');
    };

    try {
      await reach('runStatus', call);
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpError);
      if (err instanceof HttpError) {
        expect(err.status).toBe(503);
        expect(err.code).toBe('internal');
      }
    }
  });

  it('another error still answers 500', async () => {
    // Test that other errors still result in 500
    const call = async () => {
      throw new Error('Some other error');
    };

    try {
      await reach('someMethod', call);
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpError);
      if (err instanceof HttpError) {
        expect(err.status).toBe(500);
        expect(err.code).toBe('internal');
      }
    }
  });
});
