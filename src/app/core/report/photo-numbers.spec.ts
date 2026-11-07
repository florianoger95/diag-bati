import { describe, expect, it } from 'vitest';
import { Photo, Visit } from '../model/data';
import { sampleTemplate } from '../testing/fixtures';
import { resolveTemplate } from '../templates/template-engine';
import { photoNumbers, reportPhotoOrder } from './photo-numbers';

const template = resolveTemplate(sampleTemplate());

function photo(id: string, partial: Partial<Photo>): Photo {
  return {
    id, projectId: 'p1', blobId: `b-${id}`, instanceId: null, itemId: null, kind: 'photo', number: 1, caption: '',
    order: 0, annotations: [], addedInRevision: 0, createdAt: 0, updatedAt: 0, ...partial,
  };
}

const visit = (order: [number, number]): Visit => ({
  id: 'v1', projectId: 'p1', revision: 0, fields: {}, conclusion: '', status: 'draft', cursor: null, createdAt: 0, updatedAt: 0,
  instances: [
    { id: 'generalites', sectionId: 'generalites', label: 'Généralités', order: 0 },
    { id: 'bat-a', sectionId: 'couverture', label: 'Bâtiment A', order: order[0] },
    { id: 'bat-b', sectionId: 'couverture', label: 'Bâtiment B', order: order[1] },
  ],
});

// numéros de création volontairement dans le désordre
const photos: Photo[] = [
  photo('b1', { number: 1, instanceId: 'bat-b', itemId: 'couv-etat' }),
  photo('a2', { number: 2, instanceId: 'bat-a', itemId: 'couv-patho' }),
  photo('a1', { number: 3, instanceId: 'bat-a', itemId: 'couv-etat' }),
  photo('a1bis', { number: 4, instanceId: 'bat-a', itemId: 'couv-etat', order: 1 }),
  photo('planA', { number: 5, instanceId: 'bat-a', itemId: 'couv-etat', kind: 'plan' }),
  photo('masse', { number: 6, instanceId: 'generalites', itemId: 'gen-plan', kind: 'plan' }),
  photo('libre', { number: 7 }),
  photo('croquis', { number: 8, itemId: '__conclusion', kind: 'sketch' }),
  photo('pied', { number: 9, instanceId: 'bat-a', itemId: 'commentaires' }), // jamais imprimée
];

const config = { blocks: ['cover', 'body', 'conclusion', 'defects'] as const, masterPlanItem: 'gen-plan' };

describe('numéros des photos dans l’ordre du rapport', () => {
  it('suit l’ordre des pages : plan de garde, fiches, items, photos puis plans, reportage, conclusion', () => {
    const order = reportPhotoOrder(template, visit([0, 1]), photos, { ...config, blocks: [...config.blocks] });
    expect(order.map((p) => p.id)).toEqual(['masse', 'a1', 'a1bis', 'a2', 'planA', 'b1', 'libre', 'croquis', 'pied']);
  });

  it('numérote chaque nature à part : photos, plans, croquis', () => {
    const n = photoNumbers(template, visit([0, 1]), photos, { ...config, blocks: [...config.blocks] });
    expect(['a1', 'a1bis', 'a2', 'b1', 'libre', 'pied'].map((id) => n.get(id))).toEqual([1, 2, 3, 4, 5, 6]);
    expect(['masse', 'planA'].map((id) => n.get(id))).toEqual([1, 2]);
    expect(n.get('croquis')).toBe(1);
  });

  it('renumérote quand une fiche change de place', () => {
    const n = photoNumbers(template, visit([1, 0]), photos, { ...config, blocks: [...config.blocks] });
    expect(n.get('b1')).toBe(1);
    expect(n.get('a1')).toBe(2);
  });

  it('sans plan de masse en page de garde, le plan reste à sa place dans les fiches', () => {
    const order = reportPhotoOrder(template, visit([0, 1]), photos, { blocks: ['body'] });
    expect(order.map((p) => p.id).slice(0, 3)).toEqual(['masse', 'a1', 'a1bis']);
    // conclusion absente du rapport : ses images viennent à la fin
    expect(order.at(-1)?.id).toBe('pied');
  });
});
