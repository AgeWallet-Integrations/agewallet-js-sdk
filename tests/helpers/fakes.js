// tests/helpers/fakes.js
// Shared fakes for the test files: fetch responses, a page URL, an in-memory storage handler,
// an SDK instance on test endpoints, and a reset of the DOM, cookies and Web Storage between tests.
import { vi } from 'vitest';
import { AgeWallet } from '../../src/AgeWallet.js';

export const ENDPOINTS = {
    auth: 'https://aw.test/user/authorize',
    token: 'https://aw.test/user/token',
    userinfo: 'https://aw.test/user/userinfo'
};

export const REDIRECT_URI = 'http://localhost:3000/';

/** An SDK instance on ENDPOINTS with redirectUri REDIRECT_URI, plus any config given. */
export function createSdk(config = {}) {
    return new AgeWallet({ clientId: 'test-client', redirectUri: REDIRECT_URI, endpoints: ENDPOINTS, ...config });
}

/** The access token the SDK has stored in this browser, or null. */
export async function storedToken() {
    return createSdk().storage.getVerificationToken();
}

/** A fetch Response with a JSON body. */
export function jsonResponse(body, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' }
    });
}

/**
 * Replaces fetch with handler(url, options), which returns a Response.
 * Returns the vi.fn so a test can read each call's URL and options.
 */
export function stubFetch(handler) {
    const fetch = vi.fn(async (url, options = {}) => handler(String(url), options));
    vi.stubGlobal('fetch', fetch);
    return fetch;
}

/** Answers the token and userinfo endpoints in ENDPOINTS with the given bodies and statuses. */
export function stubAgeWallet({ token = { access_token: 'tok', expires_in: 900 }, userinfo = { sub: 'u1', age_verified: true }, tokenStatus = 200, userinfoStatus = 200 } = {}) {
    return stubFetch((url) => {
        if (url === ENDPOINTS.token) return jsonResponse(token, tokenStatus);
        if (url === ENDPOINTS.userinfo) return jsonResponse(userinfo, userinfoStatus);
        throw new Error(`Unexpected request to ${url}`);
    });
}

const realLocation = typeof window !== 'undefined' ? window.location : undefined;

/** Points window.location at href (a plain object, as the SDK only reads href and search). */
export function setLocation(href) {
    const url = new URL(href);
    delete window.location;
    window.location = { href: url.href, search: url.search, origin: url.origin, pathname: url.pathname };
}

export function restoreLocation() {
    if (window.location !== realLocation) {
        window.location = realLocation;
    }
}

/** Empties the page, cookies, localStorage and sessionStorage. */
export function resetBrowser() {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    document.body.removeAttribute('style');
    document.cookie = 'aw_verified=; path=/; max-age=0';
    window.localStorage.clear();
    window.sessionStorage.clear();
}

/** A custom storage handler (get/set/remove) backed by a Map. */
export function memoryHandler() {
    const store = new Map();
    return {
        store,
        get: vi.fn(async (key) => store.get(key) ?? null),
        set: vi.fn(async (key, value) => {
            store.set(key, value);
        }),
        remove: vi.fn(async (key) => {
            store.delete(key);
        })
    };
}
