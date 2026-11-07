// Numéros des images dans l'ordre où elles apparaissent dans le rapport (docs/SPEC.md §9.1).
// Fonction pure, partagée par buildReport et par l'affichage dans l'app : les deux ne peuvent pas diverger.
import { Photo, Visit } from '../model/data';
import { ResolvedTemplate } from '../model/template';
import { answerKey } from '../templates/template-engine';
import { ReportConfig } from './report-model';

export type PhotoOrderConfig = Pick<ReportConfig, 'blocks' | 'masterPlanItem'>;

/** Item réservé aux plans de la conclusion. */
const CONCLUSION_ITEM = '__conclusion';

const byPlace = (a: Photo, b: Photo) => a.order - b.order || a.number - b.number;

/** Plan de masse imprimé en page de garde. */
export function findMasterPlan(photos: readonly Photo[], config: PhotoOrderConfig): Photo | undefined {
  if (!config.masterPlanItem || !config.blocks.includes('cover')) return undefined;
  return [...photos].sort(byPlace).find((p) => p.itemId === config.masterPlanItem && p.kind !== 'photo');
}

/** Images dans l'ordre des pages du rapport ; celles qui n'y figurent pas viennent ensuite, par numéro de création. */
export function reportPhotoOrder(
  template: ResolvedTemplate, visit: Visit, photos: readonly Photo[], config: PhotoOrderConfig,
): Photo[] {
  const byTarget = new Map<string, Photo[]>();
  for (const p of [...photos].sort(byPlace)) {
    const key = answerKey(p.instanceId ?? '', p.itemId ?? '');
    byTarget.set(key, [...(byTarget.get(key) ?? []), p]);
  }
  const of = (instanceId: string | null, itemId: string | null) => byTarget.get(answerKey(instanceId ?? '', itemId ?? '')) ?? [];
  const master = findMasterPlan(photos, config);
  const order: Photo[] = [];
  const placed = new Set<string>();
  const place = (list: Photo[]) => {
    for (const p of list) {
      if (placed.has(p.id)) continue;
      placed.add(p.id);
      order.push(p);
    }
  };
  if (master) placed.add(master.id); // placé avec la page de garde

  for (const block of config.blocks) {
    switch (block) {
      case 'cover':
        if (master) order.push(master);
        break;
      case 'body':
        for (const section of template.sections) {
          const instances = visit.instances.filter((i) => i.sectionId === section.id).sort((a, b) => a.order - b.order);
          for (const instance of instances) {
            // comme dans le rapport : grille des photos de la fiche, puis plans et croquis (les rubriques de synthèse n'en ont pas)
            const items = section.items.filter((i) => !i.fromFooter);
            place(items.flatMap((i) => of(instance.id, i.id).filter((p) => p.kind === 'photo')));
            place(items.flatMap((i) => of(instance.id, i.id).filter((p) => p.kind !== 'photo')));
          }
        }
        place(of(null, null).filter((p) => p.kind === 'photo'));
        place(of(null, null).filter((p) => p.kind !== 'photo'));
        break;
      case 'conclusion':
        place(of(null, CONCLUSION_ITEM));
        break;
    }
  }
  place([...photos].sort((a, b) => a.number - b.number));
  return order;
}

/** Numéro de chaque image : une suite par nature (photos, plans, croquis), dans l'ordre du rapport. */
export function photoNumbers(
  template: ResolvedTemplate, visit: Visit, photos: readonly Photo[], config: PhotoOrderConfig,
): Map<string, number> {
  const counters: Record<Photo['kind'], number> = { photo: 0, plan: 0, sketch: 0 };
  return new Map(reportPhotoOrder(template, visit, photos, config).map((p) => [p.id, ++counters[p.kind]]));
}
