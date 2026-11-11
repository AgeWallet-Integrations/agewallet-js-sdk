// tests/Network.test.js
import { describe, it, expect } from 'vitest';
import { Network } from '../src/modules/Network.js';
import { jsonResponse, stubFetch } from './helpers/fakes.js';

describe('Network', () => {
    it('posts every field form-encoded and returns the JSON reply', async () => {
        const fetch = stubFetch(() => jsonResponse({ access_token: 'tok' }));

        const result = await new Network().postForm('https://aw.test/user/token', { grant_type: 'authorization_code', code: 'c 1' });

        const [url, options] = fetch.mock.calls[0];
        expect(url).toBe('https://aw.test/user/token');
        expect(options.method).toBe('POST');
        expect(options.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
        expect(options.body.toString()).toBe('grant_type=authorization_code&code=c+1');
        expect(result).toEqual({ access_token: 'tok' });
    });

    it('sends a bearer token only when given one', async () => {
        const fetch = stubFetch(() => jsonResponse({}));
        const network = new Network();

        await network.get('https://api.test/with-token', 'tok');
        await network.get('https://api.test/without-token');

        expect(fetch.mock.calls[0][1]).toEqual({ method: 'GET', headers: { Authorization: 'Bearer tok' } });
        expect(fetch.mock.calls[1][1]).toEqual({ method: 'GET', headers: {} });
    });

    it('returns text when the reply is not JSON', async () => {
        stubFetch(() => new Response('<p>Members only</p>', { headers: { 'content-type': 'text/html' } }));

        expect(await new Network().get('https://api.test/content', 'tok')).toBe('<p>Members only</p>');
    });

    it('throws the status and error description when the request fails', async () => {
        const body = { error: 'invalid_grant', error_description: 'Code expired' };
        stubFetch(() => jsonResponse(body, 400));

        await expect(new Network().postForm('https://aw.test/user/token', {})).rejects.toEqual({ status: 400, message: 'Code expired', data: body });
    });

    it('falls back to the error code, then to "Network Error"', async () => {
        const network = new Network();

        stubFetch(() => jsonResponse({ error: 'invalid_client' }, 401));
        await expect(network.get('https://aw.test/user/userinfo', 'tok')).rejects.toMatchObject({ status: 401, message: 'invalid_client' });

        stubFetch(() => new Response('Bad gateway', { status: 502, headers: { 'content-type': 'text/plain' } }));
        await expect(network.get('https://aw.test/user/userinfo', 'tok')).rejects.toMatchObject({ status: 502, message: 'Network Error' });
    });
});
