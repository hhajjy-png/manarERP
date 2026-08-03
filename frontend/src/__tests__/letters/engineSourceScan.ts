/**
 * Shared helper for the Letter Engine's two source-scanning invariant tests
 * (`noHardcodedGeometry` and `fontRegistryEnforcement`).
 *
 * NOT A TEST FILE — no `.test.ts` suffix, so Vitest does not collect it.
 *
 * WHY COMMENTS ARE STRIPPED BEFORE SCANNING
 * ─────────────────────────────────────────
 * INV-4 and INV-5 constrain CODE, not prose. The Geometry Registry's own explanation
 * has to be able to say "40 mm at the top is where the logo is", and the typography
 * presets have to be able to explain why Traditional Arabic cannot carry a bold face.
 * A scan that forbade those sentences would push the reasoning out of the files that
 * need it — making the codebase worse in the name of a rule meant to make it better.
 *
 * String LITERALS are deliberately still scanned, because a literal is data the
 * program carries: `'40mm'` in a style object is exactly the violation these tests
 * exist to catch, and it is indistinguishable from prose to a regex.
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { resolve } from 'path';

/** Absolute path of the engine's source root. */
export const ENGINE_ROOT = resolve(__dirname, '../../letters');

export interface EngineSourceFile {
  /** Path relative to the engine root, POSIX separators — stable in assertion output. */
  readonly relativePath: string;
  readonly absolutePath: string;
  /** Raw file text. */
  readonly source: string;
  /** File text with block and line comments removed. */
  readonly code: string;
}

function walk(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, out);
    } else if (/\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
}

/**
 * Remove comments so the scans see code and data only.
 *
 * The line-comment pattern requires the `//` not to be preceded by `:` so a URL
 * inside a string is not mistaken for the start of a comment.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** Every TypeScript source file under `src/letters/`, with comments stripped. */
export function readEngineSources(): EngineSourceFile[] {
  const files: string[] = [];
  walk(ENGINE_ROOT, files);
  return files
    .map((absolutePath) => {
      const source = readFileSync(absolutePath, 'utf8');
      return {
        absolutePath,
        relativePath: absolutePath.slice(ENGINE_ROOT.length + 1).replace(/\\/g, '/'),
        source,
        code: stripComments(source),
      };
    })
    .sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

/** Lines of `code` matching a pattern, with 1-based line numbers for the failure message. */
export function matchingLines(file: EngineSourceFile, pattern: RegExp): string[] {
  const hits: string[] = [];
  file.code.split('\n').forEach((line, index) => {
    // Fresh regex per line: a `g`-flagged pattern would carry `lastIndex` between calls.
    const perLine = new RegExp(pattern.source, pattern.flags.replace('g', ''));
    if (perLine.test(line)) {
      hits.push(`${file.relativePath}:${index + 1}  ${line.trim()}`);
    }
  });
  return hits;
}
