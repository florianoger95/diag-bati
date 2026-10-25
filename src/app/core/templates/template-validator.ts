import { ChecklistTemplate, ITEM_TYPES, Item } from '../model/template';

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  template?: ChecklistTemplate;
}

const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const SEMVER = /^\d+\.\d+\.\d+$/;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Vérifie qu'un JSON chargé est un modèle utilisable.
 * Le fichier checklist-template.schema.json documente le même contrat pour l'édition.
 */
export function validateTemplate(input: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isObject(input)) {
    return { ok: false, errors: ['Le modèle doit être un objet JSON.'] };
  }
  const t = input as Partial<ChecklistTemplate>;

  if (typeof t.templateId !== 'string' || !KEBAB.test(t.templateId)) {
    errors.push(`templateId invalide (attendu : minuscules-avec-tirets) : ${JSON.stringify(t.templateId)}`);
  }
  if (typeof t.version !== 'string' || !SEMVER.test(t.version)) {
    errors.push(`version invalide (attendu : 1.0.0) : ${JSON.stringify(t.version)}`);
  }
  if (typeof t.label !== 'string' || !t.label.trim()) {
    errors.push('label manquant.');
  }
  for (const key of ['projectFields', 'visitFields', 'sections'] as const) {
    if (!Array.isArray(t[key])) errors.push(`${key} doit être une liste.`);
  }
  if (t.sectionFooter !== undefined && !Array.isArray(t.sectionFooter)) {
    errors.push('sectionFooter doit être une liste.');
  }
  if (errors.length) return { ok: false, errors };

  const optionSets = isObject(t.optionSets) ? t.optionSets : {};
  for (const [name, set] of Object.entries(optionSets)) {
    if (!Array.isArray(set) || set.length === 0) errors.push(`optionSet « ${name} » vide.`);
  }

  const checkItem = (item: unknown, where: string) => {
    if (!isObject(item)) {
      errors.push(`${where} : item invalide.`);
      return;
    }
    const it = item as Partial<Item>;
    const id = typeof it.id === 'string' ? it.id : '?';
    const at = `${where} › ${id}`;
    if (typeof it.id !== 'string' || !KEBAB.test(it.id)) errors.push(`${at} : id invalide.`);
    if (typeof it.label !== 'string' || !it.label.trim()) errors.push(`${at} : label manquant.`);
    if (typeof it.required !== 'boolean') errors.push(`${at} : required doit valoir true ou false.`);
    if (!ITEM_TYPES.includes(it.type as Item['type'])) {
      errors.push(`${at} : type inconnu « ${String(it.type)} ».`);
      return;
    }
    if (it.type === 'enum' || it.type === 'multi') {
      if (typeof it.options === 'string') {
        if (!(it.options in optionSets)) errors.push(`${at} : optionSet « ${it.options} » inexistant.`);
      } else if (!Array.isArray(it.options) || it.options.length === 0) {
        errors.push(`${at} : options manquantes pour le type ${it.type}.`);
      } else {
        const values = it.options.map((o) => o?.value);
        if (new Set(values).size !== values.length) errors.push(`${at} : valeurs d'options en double.`);
      }
    }
    if (it.type === 'measures') {
      if (!isObject(it.measures) || !Array.isArray(it.measures.columns) || it.measures.columns.length === 0) {
        errors.push(`${at} : configuration measures.columns manquante.`);
      }
    }
  };

  const ids = new Map<string, string>();
  const claim = (id: unknown, where: string) => {
    if (typeof id !== 'string') return;
    const previous = ids.get(id);
    if (previous) errors.push(`Identifiant d'item en double « ${id} » (${previous} et ${where}).`);
    else ids.set(id, where);
  };

  (t.projectFields ?? []).forEach((it) => { checkItem(it, 'projectFields'); claim(it?.id, 'projectFields'); });
  (t.visitFields ?? []).forEach((it) => { checkItem(it, 'visitFields'); claim(it?.id, 'visitFields'); });
  (t.sectionFooter ?? []).forEach((it) => { checkItem(it, 'sectionFooter'); claim(it?.id, 'sectionFooter'); });

  if ((t.sections ?? []).length === 0) errors.push('Le modèle doit contenir au moins une section.');
  const sectionIds = new Set<string>();
  for (const section of t.sections ?? []) {
    if (!isObject(section)) {
      errors.push('Section invalide.');
      continue;
    }
    const sid = typeof section.id === 'string' ? section.id : '?';
    if (typeof section.id !== 'string' || !KEBAB.test(section.id)) errors.push(`Section « ${sid} » : id invalide.`);
    if (sectionIds.has(sid)) errors.push(`Identifiant de section en double « ${sid} ».`);
    sectionIds.add(sid);
    if (typeof section.label !== 'string' || !section.label.trim()) errors.push(`Section « ${sid} » : label manquant.`);
    if (section.repeatable !== undefined
      && (!isObject(section.repeatable) || typeof section.repeatable.noun !== 'string')) {
      errors.push(`Section « ${sid} » : repeatable.noun manquant.`);
    }
    if (!Array.isArray(section.items)) {
      errors.push(`Section « ${sid} » : items doit être une liste.`);
      continue;
    }
    for (const it of section.items) {
      checkItem(it, `Section ${sid}`);
      claim(it?.id, `section ${sid}`);
    }
  }

  return errors.length ? { ok: false, errors } : { ok: true, errors: [], template: t as ChecklistTemplate };
}
