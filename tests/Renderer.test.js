// tests/Renderer.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Renderer } from '../src/modules/Renderer.js';
import { resetBrowser } from './helpers/fakes.js';

const AUTH_URL = 'https://aw.test/user/authorize?state=s';

describe('Renderer', () => {
    beforeEach(() => {
        resetBrowser();
    });

    it('hides the page when created and shows it again on revealPage()', () => {
        const renderer = new Renderer();
        expect(document.getElementById('aw-hider')).not.toBeNull();

        renderer.revealPage();

        expect(document.getElementById('aw-hider')).toBeNull();
    });

    it('adds the hiding style only once', () => {
        new Renderer();
        new Renderer();

        expect(document.querySelectorAll('#aw-hider')).toHaveLength(1);
    });

    it('renders the gate over the whole page with the verify link', () => {
        new Renderer().renderGate(document.body, {}, AUTH_URL);

        const gate = document.getElementById('aw-gate-overlay');
        expect(gate).not.toBeNull();
        expect(gate.querySelector('.aw-gate__btn--yes').getAttribute('href')).toBe(AUTH_URL);
        expect(gate.querySelector('.aw-gate__title').textContent).toBe('You Must Verify Your Age');
        expect(gate.querySelector('.aw-gate__btn--yes').textContent).toBe('I Agree');
        expect(document.getElementById('aw-default-css')).not.toBeNull();
        expect(document.getElementById('aw-hider')).toBeNull();
    });

    it('uses the configured title, description and button text', () => {
        new Renderer().renderGate(document.body, { title: 'Members 21+', description: 'Verify to continue.', buttonText: 'Verify now' }, AUTH_URL);

        const gate = document.getElementById('aw-gate-overlay');
        expect(gate.querySelector('.aw-gate__title').textContent).toBe('Members 21+');
        expect(gate.querySelector('.aw-gate__desc').textContent).toBe('Verify to continue.');
        expect(gate.querySelector('.aw-gate__btn--yes').textContent).toBe('Verify now');
    });

    it('replaces the content of a target element that is not the body', () => {
        document.body.innerHTML = '<main id="members"><p>Members only</p></main>';
        const target = document.getElementById('members');

        new Renderer().renderGate(target, {}, AUTH_URL);

        expect(target.textContent).not.toContain('Members only');
        expect(target.querySelector('#aw-gate-overlay')).not.toBeNull();
        expect(document.body.style.overflow).toBe('');
    });

    it('clearGate() removes the full-page gate and unlocks scrolling', () => {
        const renderer = new Renderer();
        renderer.renderGate(document.body, {}, AUTH_URL);

        renderer.clearGate(document.body);

        expect(document.getElementById('aw-gate-overlay')).toBeNull();
        expect(document.body.style.overflow).toBe('');
    });

    it('renders the loading screen while a callback is processed', () => {
        new Renderer().renderLoading(document.body);

        expect(document.querySelector('#aw-gate-overlay .aw-gate__title').textContent).toBe('Verifying...');
        expect(document.querySelector('#aw-gate-overlay .aw-spinner')).not.toBeNull();
    });

    it('injectContent() replaces the target content and re-creates its scripts', () => {
        document.body.innerHTML = '<div id="content"><p>Placeholder</p></div>';
        const target = document.getElementById('content');
        const renderer = new Renderer();
        const createElement = vi.spyOn(document, 'createElement');

        renderer.injectContent(target, '<p>Secret</p><script data-x="1">window.awInjected = 1;</script>');

        expect(target.querySelector('p').textContent).toBe('Secret');
        expect(createElement).toHaveBeenCalledWith('script');
        const script = target.querySelector('script');
        expect(script.getAttribute('data-x')).toBe('1');
        expect(script.textContent).toBe('window.awInjected = 1;');
        expect(document.getElementById('aw-hider')).toBeNull();
        createElement.mockRestore();
    });
});
