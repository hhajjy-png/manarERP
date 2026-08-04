// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { composeStyledFromNode } from '../composeDocument';
import { getPageSpec } from '../pageSpec';

/* ════════════════════════════════════════════════════════════════════════════
   `forcePageSpec` — من يفوز بهندسة الورقة؟

   `app/theme.css` يعلن `@page { margin: 1cm }` على مستوى المستند. المُركِّب يفضّل
   قواعد `@page` **الملتقطة** على `pageSpec` (`?? toPageCss(pageSpec)`)، فما دامت
   تلك القاعدة موجودة يصبح مسار `pageSpec` غير قابل للوصول: طلبُ «أفقي» كان
   يُهمَل بصمت ويخرج الملف عموديًا.

   هذان الاختباران يثبتان الطرفين: الافتراضي لم يتغيّر بذرّة، والعَلَم يُنتج أفقيًا.
   ════════════════════════════════════════════════════════════════════════════ */

let styleEl: HTMLStyleElement;
let node: HTMLElement;

beforeEach(() => {
  // يحاكي قاعدة theme.css العالمية التي تُلتقط في كل تركيب.
  styleEl = document.createElement('style');
  styleEl.textContent = '@media print { @page { margin: 1cm; } }\n.probe { color: red; }';
  document.head.appendChild(styleEl);

  node = document.createElement('div');
  node.className = 'probe';
  node.textContent = 'تقرير';
  document.body.appendChild(node);
});

afterEach(() => {
  styleEl.remove();
  node.remove();
});

describe('composeStyledFromNode — page geometry', () => {
  it('defers to the captured @page by default — existing callers unchanged', () => {
    const html = composeStyledFromNode({
      node,
      pageSpec: getPageSpec('a4-landscape'),
      title: 'probe',
    });
    expect(html).toContain('margin: 1cm');
    // لا مقاس مفروض: القاعدة الملتقطة لا تُعلن `size`، والافتراضي لا يضيفه.
    expect(html).not.toContain('size: A4 landscape');
  });

  it('lets the caller PageSpec win when forcePageSpec is set', () => {
    const html = composeStyledFromNode({
      node,
      pageSpec: getPageSpec('a4-landscape'),
      title: 'probe',
      forcePageSpec: true,
    });
    expect(html).toContain('size: A4 landscape');
  });

  it('still emits exactly one @page rule when forcing', () => {
    const html = composeStyledFromNode({
      node,
      pageSpec: getPageSpec('a4-landscape'),
      title: 'probe',
      forcePageSpec: true,
    });
    // القاعدة الملتقطة تُستخرج من كتلة الأنماط، والناتج يحمل @page واحدة فقط.
    expect((html.match(/@page\s*\{/g) ?? []).length).toBe(1);
  });

  it('lets the spec margin override the captured one rather than merging both', () => {
    const html = composeStyledFromNode({
      node,
      pageSpec: getPageSpec('a4-landscape'),
      title: 'probe',
      forcePageSpec: true,
    });
    const rule = html.match(/@page\s*\{[^}]*\}/)![0];
    expect(rule).toContain('10mm');   // هوامش a4-landscape
    expect(rule).not.toContain('1cm'); // القاعدة العامة خسرت الخاصية نفسها
  });

  it('falls back to the spec when nothing declares @page at all', () => {
    styleEl.textContent = '.probe { color: red; }';
    const html = composeStyledFromNode({
      node,
      pageSpec: getPageSpec('a4-landscape'),
      title: 'probe',
    });
    expect(html).toContain('size: A4 landscape');
  });
});
