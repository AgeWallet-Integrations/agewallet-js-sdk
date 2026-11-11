// tests/Flow.test.js
// The browser flow through init(), generateAuthUrl() and handleCallback() with the real modules;
// only fetch and window.location are faked.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AgeWallet } from '../src/AgeWallet.js';
import { Security } from '../src/modules/Security.js';
import { ENDPOINTS, REDIRECT_URI, createSdk, resetBrowser, restoreLocation, setLocation, storedToken, stubAgeWallet } from './helpers/fakes.js';

function storedState() {
    return JSON.parse(window.sessionStorage.getItem('aw_oidc_state'));
}

/** Starts a flow on startPage and returns the state the SDK stored for it. */
async function startFlow(startPage) {
    setLocation(startPage);
    await createSdk().generateAuthUrl();
    return storedState();
}

describe('Browser flow', () => {
    let consoleSpies;

    beforeEach(() => {
        resetBrowser();
        consoleSpies = [
            vi.spyOn(console, 'error').mockImplementation(() => {}),
            vi.spyOn(console, 'warn').mockImplementation(() => {})
        ];
    });

    afterEach(() => {
        restoreLocation();
        consoleSpies.forEach((spy) => spy.mockRestore());
    });

    it('shows the gate with a link carrying the stored state, nonce and PKCE challenge', async () => {
        setLocation('http://localhost:3000/shop');

        await createSdk().init();

        const link = new URL(document.querySelector('#aw-gate-overlay .aw-gate__btn--yes').getAttribute('href'));
        const stored = storedState();
        expect(link.origin + link.pathname).toBe(ENDPOINTS.auth);
        expect(Object.fromEntries(link.searchParams)).toEqual({
            response_type: 'code',
            client_id: 'test-client',
            redirect_uri: REDIRECT_URI,
            scope: 'openid age',
            state: stored.state,
            code_challenge: await new Security().generatePkceChallenge(stored.verifier),
            code_challenge_method: 'S256',
            nonce: stored.nonce
        });
        expect(stored.returnUrl).toBe('http://localhost:3000/shop');
        expect(document.getElementById('aw-hider')).toBeNull();
    });

    it('completes a callback and sends the visitor back to the page they started on', async () => {
        const started = await startFlow('http://localhost:3000/shop');
        const fetch = stubAgeWallet();
        setLocation(`${REDIRECT_URI}?code=abc&state=${started.state}`);

        await createSdk().init();

        expect(window.location.href).toBe('http://localhost:3000/shop');
        expect(await storedToken()).toBe('tok');
        expect(document.querySelector('#aw-gate-overlay .aw-gate__title').textContent).toBe('Verifying...');

        const [tokenUrl, tokenRequest] = fetch.mock.calls[0];
        expect(tokenUrl).toBe(ENDPOINTS.token);
        expect(Object.fromEntries(tokenRequest.body)).toEqual({
            grant_type: 'authorization_code',
            client_id: 'test-client',
            redirect_uri: REDIRECT_URI,
            code: 'abc',
            code_verifier: started.verifier
        });
        const [userinfoUrl, userinfoRequest] = fetch.mock.calls[1];
        expect(userinfoUrl).toBe(ENDPOINTS.userinfo);
        expect(userinfoRequest.headers).toEqual({ Authorization: 'Bearer tok' });
    });

    it('sends the client secret only when one is configured', async () => {
        const started = await startFlow('http://localhost:3000/shop');
        const fetch = stubAgeWallet();

        await createSdk({ clientSecret: 'secret' }).handleCallback('abc', started.state);

        expect(fetch.mock.calls[0][1].body.get('client_secret')).toBe('secret');
    });

    it('returns to redirectUri when the flow stored no return address', async () => {
        const sdk = createSdk();
        await sdk.storage.setOidcState('s', 'v', 'n', undefined);
        stubAgeWallet();

        expect(await sdk.handleCallback('abc', 's')).toBe(REDIRECT_URI);
    });

    it('rejects a callback whose state does not match, without sending any request', async () => {
        await startFlow('http://localhost:3000/shop');

        expect(await createSdk().handleCallback('abc', 'forged-state')).toBeNull();
        expect(await storedToken()).toBeNull();
    });

    it('rejects a callback when no flow was started', async () => {
        expect(await createSdk().handleCallback('abc', 'any-state')).toBeNull();
        expect(await storedToken()).toBeNull();
    });

    it('accepts each state only once', async () => {
        const started = await startFlow('http://localhost:3000/shop');
        const fetch = stubAgeWallet();
        const sdk = createSdk();

        expect(await sdk.handleCallback('abc', started.state)).toBe('http://localhost:3000/shop');
        expect(await sdk.handleCallback('abc', started.state)).toBeNull();
        expect(fetch).toHaveBeenCalledTimes(2);
    });

    it.each([
        ['false', { sub: 'u1', age_verified: false }],
        ['missing', { sub: 'u1' }],
        ['the string "true"', { sub: 'u1', age_verified: 'true' }]
    ])('stores nothing when age_verified is %s', async (_, userinfo) => {
        const started = await startFlow('http://localhost:3000/shop');
        stubAgeWallet({ userinfo });

        expect(await createSdk().handleCallback('abc', started.state)).toBeNull();
        expect(await storedToken()).toBeNull();
    });

    it.each([
        ['the token endpoint', { tokenStatus: 400, token: { error: 'invalid_grant' } }],
        ['the userinfo endpoint', { userinfoStatus: 401, userinfo: { error: 'invalid_token' } }]
    ])('stores nothing when %s fails', async (_, replies) => {
        const started = await startFlow('http://localhost:3000/shop');
        stubAgeWallet(replies);

        expect(await createSdk().handleCallback('abc', started.state)).toBeNull();
        expect(await storedToken()).toBeNull();
    });

    it('shows the gate, cleans the URL and stores nothing when AgeWallet returns an error', async () => {
        const started = await startFlow('http://localhost:3000/shop');
        setLocation(`${REDIRECT_URI}?error=access_denied&error_description=The%20user%20denied%20the%20request&state=${started.state}`);
        const replaceState = vi.spyOn(window.history, 'replaceState');

        await createSdk().init();

        expect(replaceState).toHaveBeenCalledWith({}, document.title, REDIRECT_URI);
        expect(document.querySelector('#aw-gate-overlay .aw-gate__btn--yes')).not.toBeNull();
        expect(await storedToken()).toBeNull();
        replaceState.mockRestore();
    });

    it('shows no gate once the visitor is verified', async () => {
        await createSdk().storage.setVerification({ access_token: 'tok', expires_in: 900 });
        setLocation('http://localhost:3000/shop');

        await createSdk().init();

        expect(document.getElementById('aw-gate-overlay')).toBeNull();
        expect(document.getElementById('aw-hider')).toBeNull();
    });

    it('custom endpoints replace only the defaults they name', () => {
        const sdk = new AgeWallet({ clientId: 'c', redirectUri: REDIRECT_URI, endpoints: { token: 'https://proxy.test/token' } });

        expect(sdk.config.endpoints).toEqual({
            auth: 'https://app.agewallet.io/user/authorize',
            token: 'https://proxy.test/token',
            userinfo: 'https://app.agewallet.io/user/userinfo'
        });
    });
});
