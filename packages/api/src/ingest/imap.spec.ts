import { describe, expect, it } from 'vitest';
import { EmailSourceError } from '../common/errors';
import { normalizeHtmlPart, toEmailSourceError } from './imap';

describe('normalizeHtmlPart', () => {
  it.each<[string | false | undefined]>([[undefined], [false], [''], ['   ']])(
    'normalizes absent, false, and empty HTML (%j)',
    (html) => {
      expect(normalizeHtmlPart(html)).toBeNull();
    },
  );

  it('preserves a non-empty HTML part', () => {
    expect(normalizeHtmlPart('<h1>Offers</h1>')).toBe('<h1>Offers</h1>');
  });
});

/** Shape ImapFlow actually throws: a bare `Error('Command failed')` with the useful parts hung off
 * non-standard properties. */
function imapFlowError(extra: Record<string, unknown>): Error {
  return Object.assign(new Error('Command failed'), extra);
}

describe('toEmailSourceError', () => {
  it('keeps the provider response text for a rejected login, and names the credential fix', () => {
    const error = toEmailSourceError(
      imapFlowError({
        authenticationFailed: true,
        serverResponseCode: 'AUTHENTICATIONFAILED',
        responseText: 'Invalid credentials(Failure)',
      }),
      'imap.zoho.com',
    );

    expect(error).toBeInstanceOf(EmailSourceError);
    expect(error.status).toBe(502);
    // The bare 'Command failed' must not be all the operator gets.
    expect(error.message).toContain('Invalid credentials(Failure)');
    expect(error.message).toContain('imap.zoho.com');
    expect(error.message).toContain('IMAP_USER');
    expect(error.data).toEqual({
      host: 'imap.zoho.com',
      authenticationFailed: true,
      serverResponseCode: 'AUTHENTICATIONFAILED',
      responseText: 'Invalid credentials(Failure)',
    });
  });

  it('distinguishes a transport failure from an authentication one', () => {
    const error = toEmailSourceError(imapFlowError({ code: 'ETIMEDOUT' }), 'imap.example.com');

    expect(error.data?.authenticationFailed).toBe(false);
    expect(error.message).toContain('IMAP request to imap.example.com failed');
    expect(error.message).toContain('Command failed');
    expect(error.message).not.toContain('IMAP_USER');
  });

  it('falls back to the error message when the provider sends no response text', () => {
    const error = toEmailSourceError(imapFlowError({ authenticationFailed: true }), 'imap.test');

    expect(error.message).toContain('IMAP authentication failed for imap.test');
    expect(error.message).toContain('Command failed');
    expect(error.data?.responseText).toBeUndefined();
  });

  it('survives a thrown non-Error', () => {
    const error = toEmailSourceError('socket hang up', 'imap.test');

    expect(error).toBeInstanceOf(EmailSourceError);
    expect(error.message).toContain('unknown error');
  });

  it('passes an already-translated error straight through', () => {
    const original = toEmailSourceError(imapFlowError({ authenticationFailed: true }), 'imap.test');

    expect(toEmailSourceError(original, 'imap.other')).toBe(original);
  });
});
