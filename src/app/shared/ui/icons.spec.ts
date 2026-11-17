import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ICONS } from './icons';

const APP = join(process.cwd(), 'src', 'app');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.(html|ts)$/.test(name) && !name.endsWith('.spec.ts') ? [path] : [];
  });
}

/** Écrans et composants d'interface (le rapport et l'annotation ont leurs propres glyphes). */
const UI = files(APP).filter((f) => !/[\\/]core[\\/](report|annotation)[\\/]/.test(f));

// pictogrammes, flèches et symboles qui servaient d'icônes avant le lot 6a
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2300}-\u{23FF}\u{2460}-\u{24FF}\u{25A0}-\u{25FF}\u{27F0}-\u{2BFF}\u{2500}-\u{257F}\u{FF0B}\u{FF0D}]/u;

describe('icônes de l’interface', () => {
  it('reprend les 52 icônes du design system', () => {
    expect(Object.keys(ICONS)).toHaveLength(52);
    for (const name of ['camera', 'image', 'pin', 'sonder', 'alert', 'gear', 'trash', 'undo', 'redo', 'pastille']) {
      expect(ICONS).toHaveProperty(name);
    }
  });

  it('chaque nom utilisé dans un écran existe', () => {
    const used = new Set<string>();
    for (const f of UI) {
      const src = readFileSync(f, 'utf8');
      for (const m of src.matchAll(/<app-icon[^>]*\sname="([a-z-]+)"/g)) used.add(m[1]);
      for (const m of src.matchAll(/\bicon: '([a-z-]+)'/g)) used.add(m[1]);
    }
    expect(used.size).toBeGreaterThan(10);
    expect([...used].filter((n) => !(n in ICONS))).toEqual([]);
  });

  it('plus aucun emoji ni symbole servant d’icône dans les écrans', () => {
    const found = UI.flatMap((f) =>
      readFileSync(f, 'utf8').split('\n')
        .map((line, i) => [line, i] as const)
        // les commentaires de code ne s'affichent pas
        .filter(([line]) => EMOJI.test(line) && !line.includes('// glyphe autorisé') && !/^\s*(\/\/|\*|\/\*)/.test(line))
        .map(([line, i]) => `${f.slice(APP.length + 1)}:${i + 1}: ${line.trim()}`),
    );
    expect(found).toEqual([]);
  });
});
