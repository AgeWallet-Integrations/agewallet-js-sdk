// @vitest-environment node
// tests/Node.test.js
// Server use: no window or document, a custom storage handler, and Node's Web Crypto.
import { describe, it, expect, vi } from 'vitest';
import { AgeWallet } from '../src/AgeWallet.js';
import { Security } from '../src/modules/Security.js';
import { ENDPOINTS, memoryHandler, stubAgeWallet } from './helpers/fakes.js';

const REDIRECT_URI = 'https://shop.test/auth/callback';

function createServerSdk(handler) {
    return new AgeWallet({
        clientId: 'test-client',
        clientSecret: 'secret',
        redirectUri: REDIRECT_URI,
        environment: 'node',
        storage: handler,
        endpoints: ENDPOINTS
    });
}

describe('Server use', () => {
    it('defaults redirectUri to an empty string without a window', () => {
        expect(new AgeWallet({ clientId: 'c' }).config.redirectUri).toBe('');
    });

    it('uses a storage object as the custom handler', () => {
        expect(createServerSdk(memoryHandler()).storage.mode).toBe('custom');
    });

    it('runs the whole flow through the custom handler', async () => {
        const handler = memoryHandler();
        const sdk = createServerSdk(handler);

        const { url, state } = await sdk.generateAuthUrl();

        const stored = handler.store.get('oidc_state');
        const params = new URL(url).searchParams;
        expect(stored.returnUrl).toBe(REDIRECT_URI);
        expect(params.get('state')).toBe(state);
        expect(params.get('code_challenge')).toBe(await new Security('node').generatePkceChallenge(stored.verifier));

        const fetch = stubAgeWallet({ userinfo: { sub: 'u1', age_verified: true, metadata: 'order-9001' } });

        expect(await sdk.handleCallback('abc', state)).toBe(REDIRECT_URI);
        expect(fetch.mock.calls[0][1].body.get('client_secret')).toBe('secret');
        expect(fetch.mock.calls[0][1].body.get('code_verifier')).toBe(stored.verifier);
        expect(handler.set).toHaveBeenCalledWith('aw_verified', { access_token: 'tok', expires_in: 900, metadata: 'order-9001' });
        expect(handler.store.has('oidc_state')).toBe(false);
        expect(await sdk.getMetadata()).toBe('order-9001');
    });

    it('throws when no Web Crypto API exists', () => {
        vi.stubGlobal('crypto', undefined);

        expect(() => new Security('node')).toThrow('[AgeWallet] Crypto API not found');
    });
});
