/**
 * Rendering contracts — integrity (INV-7).
 *
 * INV-7: "Preview, PDF and Printing must always render from the same Document Model.
 * There must never be multiple rendering engines."
 *
 * The invariant is enforced at RUNTIME, not documented: registering a second renderer
 * throws. That matters because the tempting violation is always small and local — "a
 * bespoke preview renderer, just for this one path" — and by the time it exists, the
 * claim "content never enters the reserved zone" has quietly become a statement about
 * one render path and a hope about the others.
 *
 * This pack registers no renderer. That is asserted below, because a renderer
 * appearing here would mean a later pack's implementation had leaked into P0.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  RENDER_TARGETS,
  __resetDocumentRendererForTests,
  getDocumentRenderer,
  hasDocumentRenderer,
  registerDocumentRenderer,
  type DocumentRenderer,
  type RenderResult,
} from '../../letters/rendering/contracts';

/**
 * A renderer stub. `rootNode` is a plain object cast to `Element`: this suite runs in
 * the default node environment because nothing here needs a DOM — the contract is
 * being tested, not any rendering.
 */
function stubRenderer(rendererId: string): DocumentRenderer {
  return {
    rendererId,
    render: (request): RenderResult => ({
      target: request.target,
      pageCount: 1,
      rootNode: {} as Element,
    }),
  };
}

beforeEach(() => {
  __resetDocumentRendererForTests();
});

describe('Render targets', () => {
  it('declares the five consumers of the single rendered node', () => {
    expect([...RENDER_TARGETS]).toEqual(['screen', 'validation', 'accuratePreview', 'print', 'pdf']);
  });

  it('includes validation as a target alongside the output paths', () => {
    // Validation measures the SAME node print and PDF consume. Listing it here is what
    // makes that a contract rather than a convention.
    expect(RENDER_TARGETS).toContain('validation');
    expect(RENDER_TARGETS).toContain('print');
    expect(RENDER_TARGETS).toContain('pdf');
  });
});

describe('INV-7 — exactly one renderer may ever be registered', () => {
  it('accepts the first renderer', () => {
    registerDocumentRenderer(stubRenderer('letter-renderer'));
    expect(hasDocumentRenderer()).toBe(true);
    expect(getDocumentRenderer().rendererId).toBe('letter-renderer');
  });

  it('REFUSES a second renderer, naming both', () => {
    registerDocumentRenderer(stubRenderer('letter-renderer'));
    expect(() => registerDocumentRenderer(stubRenderer('bespoke-preview-renderer'))).toThrow(
      /already\s+registered/,
    );
    expect(() => registerDocumentRenderer(stubRenderer('bespoke-preview-renderer'))).toThrow(
      /bespoke-preview-renderer/,
    );
  });

  it('keeps the first renderer after a rejected second registration', () => {
    registerDocumentRenderer(stubRenderer('letter-renderer'));
    try {
      registerDocumentRenderer(stubRenderer('intruder'));
    } catch {
      /* expected */
    }
    expect(getDocumentRenderer().rendererId).toBe('letter-renderer');
  });

  it('every target is served by that same renderer', () => {
    const renderer = stubRenderer('letter-renderer');
    registerDocumentRenderer(renderer);
    for (const target of RENDER_TARGETS) {
      expect(getDocumentRenderer()).toBe(renderer);
      expect(getDocumentRenderer().render({ target } as never).target).toBe(target);
    }
  });
});

describe('Accessing the renderer before one exists', () => {
  it('throws rather than returning null', () => {
    // A null-returning accessor invites a caller to silently skip rendering — and a
    // document that was never rendered is a document that was never validated.
    expect(hasDocumentRenderer()).toBe(false);
    expect(() => getDocumentRenderer()).toThrow(/No document renderer is registered/);
  });

  it('offers a non-throwing check for callers that can handle absence', () => {
    expect(hasDocumentRenderer()).toBe(false);
    expect(() => hasDocumentRenderer()).not.toThrow();
  });
});

describe('P0 boundary — this pack registers NO renderer', () => {
  it('importing the whole engine surface leaves no renderer registered', async () => {
    __resetDocumentRendererForTests();
    // Import the public surface exactly as a consumer would. If any module registered
    // a renderer as an import side effect, this fails.
    const engine = await import('../../letters/index');
    expect(engine.hasDocumentRenderer()).toBe(false);
    expect(() => engine.getDocumentRenderer()).toThrow(/No document renderer is registered/);
  });

  it('exposes the contract without any implementation of it', () => {
    const contracts = ['registerDocumentRenderer', 'getDocumentRenderer', 'hasDocumentRenderer'];
    for (const name of contracts) {
      expect(typeof (globalThis as Record<string, unknown>)[name]).toBe('undefined');
    }
    expect(hasDocumentRenderer()).toBe(false);
  });
});
