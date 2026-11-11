// tests/Security.test.js
import { describe, it, expect } from 'vitest';
import { Security } from '../src/modules/Security.js';

// RFC 7636 Appendix B
const RFC_OCTETS = new Uint8Array([
    116, 24, 223, 180, 151, 153, 224, 37, 79, 250, 96, 125, 216, 173, 187, 186,
    22, 212, 37, 77, 105, 214, 191, 240, 91, 88, 5, 88, 83, 132, 141, 121
]);
const RFC_VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
const RFC_CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';

describe.each(['browser', 'node'])('Security (environment "%s")', (environment) => {
    const security = new Security(environment);

    it('encodes the RFC 7636 example octets as its verifier', () => {
        expect(security._base64UrlEncode(RFC_OCTETS)).toBe(RFC_VERIFIER);
    });

    it('derives the RFC 7636 example challenge', async () => {
        expect(await security.generatePkceChallenge(RFC_VERIFIER)).toBe(RFC_CHALLENGE);
    });

    it('generates an 86-character URL-safe verifier', () => {
        expect(security.generatePkceVerifier()).toMatch(/^[A-Za-z0-9_-]{86}$/);
    });

    it('generates hex random strings that differ between calls', () => {
        const first = security.generateRandomString(16);

        expect(first).toMatch(/^[0-9a-f]{32}$/);
        expect(security.generateRandomString(16)).not.toBe(first);
    });
});
