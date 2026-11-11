// tests/Strategies.test.js
// Overlay and API modes through init() with the real modules; only fetch and window.location are faked.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createSdk, jsonResponse, resetBrowser, restoreLocation, setLocation, storedToken, stubFetch } from './helpers/fakes.js';

const NOW = new Date('2026-11-11T00:00:00Z');
const API = { endpoint: 'https://api.test/content' };

async function verify(extra = {}) {
    await createSdk().storage.setVerification({ access_token: 'tok', expires_in: 900, ...extra });
}

function gateLink() {
    return document.querySelector('#aw-gate-overlay .aw-gate__btn--yes');
}

describe('Display modes', () => {
    let consoleSpies;

    beforeEach(() => {
        resetBrowser();
        setLocation('http://localhost:3000/members');
        consoleSpies = [
            vi.spyOn(console, 'error').mockImplementation(() => {}),
            vi.spyOn(console, 'warn').mockImplementation(() => {})
        ];
    });

    afterEach(() => {
        restoreLocation();
        consoleSpies.forEach((spy) => spy.mockRestore());
        vi.useRealTimers();
    });

    describe('overlay mode', () => {
        it('shows the gate again once the token has expired', async () => {
            const expired = { access_token: 'tok', expires_in: 900, expiry_timestamp: Date.now() - 1000 };
            document.cookie = `aw_verified=${encodeURIComponent(JSON.stringify(expired))}; path=/`;

            await createSdk().init();

            expect(gateLink()).not.toBeNull();
        });

        it('headless: passes the verify link to onUnverified and renders nothing', async () => {
            const onUnverified = vi.fn();

            await createSdk({ render: false, onUnverified }).init();

            expect(onUnverified).toHaveBeenCalledWith(expect.stringMatching(/^https:\/\/aw\.test\/user\/authorize\?/));
            expect(document.getElementById('aw-gate-overlay')).toBeNull();
        });

        it('headless: passes the metadata and expiry to onVerified', async () => {
            vi.useFakeTimers({ toFake: ['Date'] });
            vi.setSystemTime(NOW);
            await verify({ metadata: 'order-9001' });
            const onVerified = vi.fn();

            await createSdk({ render: false, onVerified }).init();

            expect(onVerified).toHaveBeenCalledWith(null, { metadata: 'order-9001', expiresAt: NOW.getTime() + 900 * 1000, hasToken: true });
        });
    });

    describe('API mode', () => {
        it('fetches the content with the token and puts it on the page', async () => {
            await verify();
            const fetch = stubFetch(() => new Response('<p>Members only</p>', { headers: { 'content-type': 'text/html' } }));

            await createSdk({ mode: 'api', api: API }).init();

            expect(fetch).toHaveBeenCalledWith('https://api.test/content', { method: 'GET', headers: { Authorization: 'Bearer tok' } });
            expect(document.body.innerHTML).toContain('<p>Members only</p>');
            expect(gateLink()).toBeNull();
        });

        it('headless: passes the content and verification details to onVerified', async () => {
            vi.useFakeTimers({ toFake: ['Date'] });
            vi.setSystemTime(NOW);
            await verify({ metadata: 'order-9001' });
            stubFetch(() => jsonResponse({ article: 'Members only' }));
            const onVerified = vi.fn();

            await createSdk({ mode: 'api', api: API, render: false, onVerified }).init();

            expect(onVerified).toHaveBeenCalledWith({ article: 'Members only' }, { metadata: 'order-9001', expiresAt: NOW.getTime() + 900 * 1000, hasToken: true });
        });

        it('removes the token and shows the gate when the content request fails', async () => {
            await verify();
            stubFetch(() => jsonResponse({ error: 'invalid_token' }, 401));

            await createSdk({ mode: 'api', api: API }).init();

            expect(gateLink()).not.toBeNull();
            expect(await storedToken()).toBeNull();
        });

        it('shows the gate without requesting content when unverified', async () => {
            await createSdk({ mode: 'api', api: API }).init();

            expect(gateLink()).not.toBeNull();
        });

        it('requests nothing when no API endpoint is configured', async () => {
            await verify();

            await createSdk({ mode: 'api' }).init();

            expect(console.error).toHaveBeenCalledWith('[AgeWallet] API Strategy requires config.api.endpoint');
        });
    });
});
