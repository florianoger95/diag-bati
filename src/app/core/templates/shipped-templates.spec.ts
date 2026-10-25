import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateTemplate } from './template-validator';
import { resolveTemplate } from './template-engine';

const dir = join(process.cwd(), 'public', 'templates');
const read = (file: string) => JSON.parse(readFileSync(join(dir, file), 'utf-8'));
const index: { templates: string[] } = read('index.json');

describe('modèles livrés', () => {
  it('le manifeste liste au moins les deux modèles', () => {
    expect(index.templates).toEqual(['diagnostic-bati-ancien.json', 'preparation-visite.json']);
  });

  for (const file of index.templates) {
    it(`${file} est valide`, () => {
      const result = validateTemplate(read(file));
      expect(result.errors).toEqual([]);
      expect(result.template?.templateId).toBe(file.replace('.json', ''));
    });
  }

  it('le diagnostic reprend les 8 fiches et leurs sections répétables', () => {
    const t = resolveTemplate(read('diagnostic-bati-ancien.json'));
    expect(t.sections.map((s) => s.id)).toEqual([
      'generalites', 'couverture', 'facades', 'environnement', 'sous-sols', 'interieur-general', 'pieces', 'combles',
    ]);
    const repeatable = t.sections.filter((s) => s.repeatable).map((s) => s.id);
    expect(repeatable).toEqual(['couverture', 'facades', 'pieces', 'combles']);
    // chaque fiche (sauf généralités) se termine par commentaires, préconisations, sécurité, entretien
    for (const s of t.sections.slice(1)) {
      expect(s.items.slice(-4).map((i) => i.role)).toEqual(['comment', 'recommendation', 'safety', 'maintenance']);
    }
  });
});
