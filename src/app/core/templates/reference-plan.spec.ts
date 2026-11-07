import { describe, expect, it } from 'vitest';
import { Photo, SectionInstance } from '../model/data';
import { ResolvedSection } from '../model/template';
import { planCandidates, resolveReferencePlan } from './reference-plan';

function photo(id: string, partial: Partial<Photo>): Photo {
  return {
    id, projectId: 'p1', blobId: `b-${id}`, instanceId: null, itemId: null, kind: 'plan', number: 1, caption: '',
    order: 0, annotations: [], addedInRevision: 0, createdAt: 0, updatedAt: 0, ...partial,
  };
}

const section = (referencePlan?: ResolvedSection['referencePlan']): ResolvedSection =>
  ({ id: 'couverture', label: 'Couverture', items: [], ...(referencePlan ? { referencePlan } : {}) });
const inst = (partial: Partial<SectionInstance> = {}): SectionInstance => ({ id: 'bat-b', sectionId: 'couverture', label: 'Bâtiment B', order: 1, ...partial });

const photos: Photo[] = [
  photo('toiture', { instanceId: 'generalites', itemId: 'gen-plan-toiture', number: 1 }),
  photo('typesA', { instanceId: 'bat-a', itemId: 'couv-plan-types', number: 2 }),
  photo('typesB', { instanceId: 'bat-b', itemId: 'couv-plan-types', number: 3 }),
  photo('desordresB', { instanceId: 'bat-b', itemId: 'couv-plan-desordres', number: 4 }),
  photo('photoB', { instanceId: 'bat-b', itemId: 'couv-plan-types', kind: 'photo', number: 5 }),
];

describe('plan de référence d’une fiche', () => {
  const config = { items: ['couv-plan-types', 'couv-plan-desordres', 'gen-plan-toiture'] };

  it('liste les plans candidats : ceux de la fiche d’abord, puis par ordre de préférence', () => {
    expect(planCandidates(section(config), 'bat-b', photos).map((p) => p.id)).toEqual(['typesB', 'desordresB', 'typesA', 'toiture']);
    expect(planCandidates(section(), 'bat-b', photos)).toEqual([]);
  });

  it('prend le premier candidat, ou celui choisi sur la fiche', () => {
    expect(resolveReferencePlan(section(config), inst(), photos)).toMatchObject({ plan: { id: 'typesB' }, needsChoice: false });
    expect(resolveReferencePlan(section(config), inst({ referencePlanId: 'toiture' }), photos).plan?.id).toBe('toiture');
    // choix devenu invalide (plan supprimé) : retour au premier candidat
    expect(resolveReferencePlan(section(config), inst({ referencePlanId: 'disparu' }), photos).plan?.id).toBe('typesB');
  });

  it('choose : plusieurs plans possibles (niveaux) → choix obligatoire sur la fiche', () => {
    const levels = { items: ['gen-plans-niveaux'], choose: true };
    const plans = [
      photo('rdc', { instanceId: 'generalites', itemId: 'gen-plans-niveaux', caption: 'RDC' }),
      photo('r1', { instanceId: 'generalites', itemId: 'gen-plans-niveaux', caption: 'R+1', order: 1 }),
    ];
    const room = inst({ id: 'cuisine', sectionId: 'pieces' });
    expect(resolveReferencePlan(section(levels), room, plans)).toMatchObject({ plan: undefined, needsChoice: true });
    expect(resolveReferencePlan(section(levels), { ...room, referencePlanId: 'r1' }, plans).plan?.id).toBe('r1');
    expect(resolveReferencePlan(section(levels), room, plans.slice(0, 1)).plan?.id).toBe('rdc');
  });
});
