// Plan de référence d'une fiche, sur lequel on situe ses photos (docs/SPEC.md §9.2). Fonctions pures.
import { Photo, SectionInstance } from '../model/data';
import { ResolvedSection } from '../model/template';

/** Plans candidats : ceux de la fiche d'abord, puis par ordre de préférence du modèle, puis ordre d'ajout. */
export function planCandidates(section: Pick<ResolvedSection, 'referencePlan'>, instanceId: string, photos: readonly Photo[]): Photo[] {
  const items = section.referencePlan?.items ?? [];
  if (!items.length) return [];
  const rank = (p: Photo) => items.indexOf(p.itemId ?? '');
  return photos
    .filter((p) => p.kind !== 'photo' && rank(p) >= 0)
    .sort((a, b) => Number(a.instanceId !== instanceId) - Number(b.instanceId !== instanceId)
      || rank(a) - rank(b) || a.order - b.order || a.number - b.number);
}

export interface ReferencePlan {
  plan?: Photo;
  candidates: Photo[];
  /** Plusieurs plans possibles et aucun choisi (fiche à `choose`). */
  needsChoice: boolean;
}

export function resolveReferencePlan(
  section: Pick<ResolvedSection, 'referencePlan'>, instance: SectionInstance, photos: readonly Photo[],
): ReferencePlan {
  const candidates = planCandidates(section, instance.id, photos);
  const chosen = instance.referencePlanId ? candidates.find((p) => p.id === instance.referencePlanId) : undefined;
  if (chosen) return { plan: chosen, candidates, needsChoice: false };
  if (section.referencePlan?.choose && candidates.length > 1) return { plan: undefined, candidates, needsChoice: true };
  return { plan: candidates[0], candidates, needsChoice: false };
}
