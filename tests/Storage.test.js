// tests/Storage.test.js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Storage } from '../src/modules/Storage.js';
import { memoryHandler, resetBrowser } from './helpers/fakes.js';

const NOW = new Date('2026-11-11T00:00:00Z');

describe('Storage', () => {
    beforeEach(() => {
        resetBrowser();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe.each(['cookie', 'local'])('%s mode', (mode) => {
        it('returns the stored token with its expiry time', async () => {
            vi.useFakeTimers({ toFake: ['Date'] });
            vi.setSystemTime(NOW);
            const storage = new Storage(mode);

            await storage.setVerification({ access_token: 'tok', expires_in: 900 });

            expect(await storage.getVerification()).toEqual({
                access_token: 'tok',
                expires_in: 900,
                expiry_timestamp: NOW.getTime() + 900 * 1000
            });
            expect(await storage.getVerificationToken()).toBe('tok');
        });

        it('returns nothing once the token has expired', async () => {
            vi.useFakeTimers({ toFake: ['Date'] });
            vi.setSystemTime(NOW);
            const storage = new Storage(mode);
            await storage.setVerification({ access_token: 'tok', expires_in: 900 });

            vi.setSystemTime(NOW.getTime() + 901 * 1000);

            expect(await storage.getVerification()).toBeNull();
            expect(await storage.getVerificationToken()).toBeNull();
        });

        it('clearVerification() removes the token', async () => {
            const storage = new Storage(mode);
            await storage.setVerification({ access_token: 'tok', expires_in: 900 });

            await storage.clearVerification();

            expect(await storage.getVerification()).toBeNull();
        });
    });

    describe('local mode', () => {
        it('removes an expired token from localStorage', async () => {
            vi.useFakeTimers({ toFake: ['Date'] });
            vi.setSystemTime(NOW);
            const storage = new Storage('local');
            await storage.setVerification({ access_token: 'tok', expires_in: 900 });
            vi.setSystemTime(NOW.getTime() + 901 * 1000);

            await storage.getVerification();

            expect(window.localStorage.getItem('aw_verified')).toBeNull();
        });

        it('treats unreadable data as no verification and removes it', async () => {
            window.localStorage.setItem('aw_verified', '{not json');

            expect(await new Storage('local').getVerification()).toBeNull();
            expect(window.localStorage.getItem('aw_verified')).toBeNull();
        });
    });

    describe('cookie mode', () => {
        it('writes the cookie for the whole site, for the token lifetime, Secure and SameSite=Lax', async () => {
            // Spy on the prototype that defines document.cookie, so mockRestore() puts the real accessor back
            let cookieOwner = document;
            while (!Object.getOwnPropertyDescriptor(cookieOwner, 'cookie')) {
                cookieOwner = Object.getPrototypeOf(cookieOwner);
            }
            const setter = vi.spyOn(cookieOwner, 'cookie', 'set');

            await new Storage('cookie').setVerification({ access_token: 'tok', expires_in: 900 });

            expect(setter).toHaveBeenCalledTimes(1);
            expect(setter.mock.calls[0][0]).toMatch(/^aw_verified=[^;]+; path=\/; max-age=900; SameSite=Lax; Secure$/);
            setter.mockRestore();
        });

        it('treats an unreadable cookie as no verification', async () => {
            document.cookie = 'aw_verified=%7Bnot-json; path=/';

            expect(await new Storage('cookie').getVerification()).toBeNull();
            expect(document.cookie).not.toContain('aw_verified=%7B');
        });
    });

    describe('OIDC state in sessionStorage', () => {
        it('can be read once only', async () => {
            const storage = new Storage('cookie');
            await storage.setOidcState('s', 'v', 'n', 'http://localhost:3000/shop');

            expect(await storage.getOidcState()).toEqual({ state: 's', verifier: 'v', nonce: 'n', returnUrl: 'http://localhost:3000/shop' });
            expect(await storage.getOidcState()).toBeNull();
        });
    });

    describe('custom handler', () => {
        it('passes the token data, lifetime included, to the handler', async () => {
            const handler = memoryHandler();
            const storage = new Storage('custom', handler);

            await storage.setVerification({ access_token: 'tok', expires_in: 900 });

            expect(handler.set).toHaveBeenCalledWith('aw_verified', { access_token: 'tok', expires_in: 900 });
            expect(await storage.getVerificationToken()).toBe('tok');
        });

        it('clearVerification() removes the token from the handler', async () => {
            const handler = memoryHandler();
            const storage = new Storage('custom', handler);
            await storage.setVerification({ access_token: 'tok', expires_in: 900 });

            await storage.clearVerification();

            expect(handler.remove).toHaveBeenCalledWith('aw_verified');
            expect(await storage.getVerification()).toBeNull();
        });

        it('keeps OIDC state for one read only', async () => {
            const handler = memoryHandler();
            const storage = new Storage('custom', handler);
            await storage.setOidcState('s', 'v', 'n', 'https://shop.test/');

            expect(await storage.getOidcState()).toEqual({ state: 's', verifier: 'v', nonce: 'n', returnUrl: 'https://shop.test/' });
            expect(handler.remove).toHaveBeenCalledWith('oidc_state');
            expect(await storage.getOidcState()).toBeNull();
        });
    });
});
