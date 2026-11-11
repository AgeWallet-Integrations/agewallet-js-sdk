// tests/setup.js
// Runs before every test file (vitest.config.js setupFiles).
// Replaces fetch with a guard: a test that sends a request without stubbing fetch itself fails,
// even when the SDK catches the error, so no test can reach app.agewallet.io.
import { afterEach, beforeEach, vi } from 'vitest';

let guard;

beforeEach(() => {
    guard = vi.fn(async (url) => {
        throw new Error(`Unexpected network request to ${url}`);
    });
    vi.stubGlobal('fetch', guard);
});

afterEach(() => {
    const unexpected = guard.mock.calls.map(([url]) => String(url));
    vi.unstubAllGlobals();
    if (unexpected.length) {
        throw new Error(`Test sent requests without stubbing fetch: ${unexpected.join(', ')}`);
    }
});
