// Construction du rapport (fonction pure) : données de la visite → modèle sémantique (docs/SPEC.md §6).
import { usedColors } from '../annotation/shapes';
import { ActionRow, Answer, MeasureRow, OTHER_VALUE, Photo, Project, URGENCIES, URGENCY_LABELS, Urgency, Visit } from '../model/data';
import { ResolvedItem, ResolvedSection, ResolvedTemplate } from '../model/template';
import { answerKey, collectActions, collectDefects, hasValue, sectionItems } from '../templates/template-engine';
import { applyLexicon, CompiledLexicon, LexiconState, stripExclusions } from './lexicon';
import { Block, FirmInfo, ReportConfig, ReportModel, ReportPhoto, Run, text } from './report-model';

export interface ReportInput {
  project: Project;
  visit: Visit;
  template: ResolvedTemplate;
  answers: Answer[];
  /** Photos visibles dans la révision de la visite. */
  photos: Photo[];
  config: ReportConfig;
  lexicon?: CompiledLexicon;
  /** Annexe lexique importée : sans elle, pas d'astérisques. */
  hasAnnex: boolean;
  firm?: FirmInfo;
  /** Date du rapport (ISO). */
  reportDate: string;
}

const pad = (n: number) => String(n).padStart(2, '0');

export function formatNumber(n: number): string {
  return String(Math.round(n * 100) / 100).replace('.', ',');
}

function formatDate(iso: string): string {
  const [date, time] = iso.split('T');
  const [y, m, d] = date.split('-');
  if (!y || !m || !d) return iso;
  const day = `${d}/${m}/${y}`;
  if (!time) return day;
  const [hh, mm] = time.split(':');
  return `${day} à ${pad(Number(hh))}h${mm}`;
}

const urgencyLower = (u: Urgency) => URGENCY_LABELS[u].toLowerCase();

/** Valeur d'une réponse telle qu'elle s'écrit dans le rapport (sans l'observation). */
export function formatAnswer(item: ResolvedItem, answer: Pick<Answer, 'value' | 'other'> | undefined): string {
  if (!answer || !hasValue(item, answer)) return '';
  const v = answer.value;
  const label = (value: string) => item.options?.find((o) => o.value === value)?.label ?? value;
  switch (item.type) {
    case 'boolean':
      return v ? 'Oui' : 'Non';
    case 'enum':
      return v === OTHER_VALUE ? (answer.other ?? '').trim() : label(v as string);
    case 'multi':
      return [...((v as string[]) ?? []).map(label), answer.other?.trim()].filter(Boolean).join(', ');
    case 'number':
      return `${formatNumber(v as number)}${item.unit ? ` ${item.unit}` : ''}`;
    case 'date':
    case 'datetime':
      return formatDate(v as string);
    case 'measures': {
      const columns = item.measures?.columns ?? [];
      return (v as MeasureRow[])
        .filter((r) => r.values.some((x) => typeof x === 'number'))
        .map((r) => {
          const cells = r.values
            .map((x, i) => (typeof x === 'number'
              ? `${columns.length > 1 ? `${columns[i]?.label} ` : ''}${formatNumber(x)}${columns[i]?.unit ? ` ${columns[i].unit}` : ''}`
              : ''))
            .filter(Boolean);
          return `${r.point ? `${r.point} : ` : ''}${cells.join(' ; ')}${r.note ? ` (${r.note})` : ''}`;
        })
        .join(' – ');
    }
    case 'actions':
      return (v as ActionRow[]).filter((r) => r.text.trim()).map((r) => r.text.trim()).join(' ; ');
    default:
      return String(v ?? '').trim();
  }
}

/** Constructeur : garde l'état du lexique (mode « première occurrence »). */
class Builder {
  readonly blocks: Block[] = [];
  readonly photoIds = new Set<string>();
  readonly terms: string[] = [];
  private readonly lexState: LexiconState;
  private readonly answers: Map<string, Answer>;
  private readonly photosByTarget = new Map<string, Photo[]>();

  constructor(readonly input: ReportInput) {
    this.lexState = { mode: input.config.lexicon.mark, seen: new Set() };
    this.answers = new Map(input.answers.map((a) => [answerKey(a.instanceId, a.itemId), a]));
    for (const p of [...input.photos].sort((a, b) => a.order - b.order || a.number - b.number)) {
      const key = answerKey(p.instanceId ?? '', p.itemId ?? '');
      this.photosByTarget.set(key, [...(this.photosByTarget.get(key) ?? []), p]);
    }
  }

  get colors() {
    return this.input.config.colors;
  }

  /** Applique le lexique à un texte du corps du rapport. */
  lex(t: string): string {
    const clean = stripExclusions(t);
    if (!this.input.lexicon || !this.input.hasAnnex) return clean;
    const result = applyLexicon(t, this.input.lexicon, this.lexState);
    for (const term of result.terms) if (!this.terms.includes(term)) this.terms.push(term);
    return result.text;
  }

  answer(instanceId: string, itemId: string): Answer | undefined {
    return this.answers.get(answerKey(instanceId, itemId));
  }

  photosOf(instanceId: string | null, itemId: string | null): Photo[] {
    return this.photosByTarget.get(answerKey(instanceId ?? '', itemId ?? '')) ?? [];
  }

  reportPhoto(p: Photo, ref?: string): ReportPhoto {
    this.photoIds.add(p.id);
    return { photoId: p.id, number: p.number, kind: p.kind, caption: this.lex(p.caption.trim()), ...(ref ? { ref } : {}) };
  }

  planBlock(p: Photo): Block {
    const colors = new Set(usedColors(p.annotations));
    const legend = this.input.project.legend.filter((l) => colors.has(l.color.toLowerCase()));
    return { type: 'plan', photo: this.reportPhoto(p), legend };
  }

  heading(level: 0 | 1 | 2 | 3, t: string, extra: Partial<Extract<Block, { type: 'heading' }>> = {}): void {
    this.blocks.push({ type: 'heading', level, runs: [text(t)], ...extra });
  }

  paragraph(runs: Run[], extra: Partial<Extract<Block, { type: 'paragraph' }>> = {}): void {
    this.blocks.push({ type: 'paragraph', runs, ...extra });
  }
}

// ---- page de garde ---------------------------------------------------------------

function cover(b: Builder, masterPlan: Photo | undefined): number {
  const { project, visit, template, config, firm, reportDate } = b.input;
  if (firm?.name) b.paragraph([text(firm.name, { bold: true })], { style: 'firm' });
  for (const line of firm?.lines ?? []) if (line.trim()) b.paragraph([text(line)], { style: 'firm' });
  b.blocks.push({ type: 'spacer', lines: 2 });
  const projet = String(project.fields['projet'] ?? '').trim();
  if (projet) b.paragraph([text(projet, { bold: true })], { align: 'right' });
  const adresse = String(project.fields['adresse'] ?? '').trim();
  if (adresse) b.paragraph([text(adresse)], { align: 'right' });
  b.blocks.push({ type: 'spacer', lines: 2 });
  b.heading(0, config.title, { align: 'center' });
  b.paragraph([text(formatDate(reportDate), { italic: true })], { align: 'center' });
  b.blocks.push({ type: 'spacer', lines: 1 });
  for (const field of template.visitFields) {
    const value = formatAnswer(field, { value: (visit.fields[field.id] as Answer['value']) ?? null });
    if (value) b.paragraph([text(`${field.label} : `, { bold: true, italic: true }), text(value, { italic: true })]);
  }
  if (masterPlan) {
    b.blocks.push({ type: 'spacer', lines: 1 });
    b.blocks.push(b.planBlock(masterPlan));
  }
  // la note du lexique est insérée ici une fois le corps rédigé
  return b.blocks.length;
}

// ---- corps -------------------------------------------------------------------------

function itemParagraph(b: Builder, instanceId: string, item: ResolvedItem): Run[] | null {
  const answer = b.answer(instanceId, item.id);
  const photos = b.photosOf(instanceId, item.id).filter((p) => p.kind === 'photo');
  const value = item.type === 'photo' ? '' : formatAnswer(item, answer);
  const observation = (answer?.observation ?? '').trim();
  if (!value && !observation && !answer?.defect && !photos.length) return null;
  const body = [value, observation].filter(Boolean).map((s, i, all) => (i < all.length - 1 && !/[.!?:;]$/.test(s) ? `${s}.` : s)).join(' ');
  const runs: Run[] = [text(`- ${item.label}${body ? ' : ' : ''}`), text(b.lex(body))];
  if (answer?.defect) {
    runs.push(text(` — Désordre (${urgencyLower(answer.defect.urgency)})`, { bold: true, color: b.colors.defect }));
  }
  if (photos.length) runs.push(text(` — photo${photos.length > 1 ? 's' : ''} ${photos.map((p) => p.number).join(', ')}`, { italic: true }));
  return runs;
}

function footerBlocks(b: Builder, instanceId: string, item: ResolvedItem): Block[] {
  const answer = b.answer(instanceId, item.id);
  if (!answer) return [];
  const label: Block = { type: 'paragraph', runs: [text(`${item.label} :`, { italic: true, underline: true })], style: 'label' };
  if (item.type === 'actions') {
    const rows = ((answer.value as ActionRow[] | null) ?? []).filter((r) => r.text.trim());
    if (!rows.length) return [];
    return [label, ...rows.map((r): Block => ({
      type: 'paragraph', bullet: true,
      runs: [text(`${b.lex(r.text.trim())} (${urgencyLower(r.urgency)})`)],
    }))];
  }
  const body = [formatAnswer(item, answer), answer.observation.trim()].filter(Boolean).join('\n');
  if (!body) return [];
  return [label, ...body.split(/\n+/).map((line): Block => ({ type: 'paragraph', runs: [text(b.lex(line.trim()))] }))];
}

/** Blocs d'une instance (vide → []). */
function instanceBlocks(b: Builder, section: ResolvedSection, instanceId: string, skip: Set<string>): Block[] {
  const blocks: Block[] = [];
  let pendingHeading: Block | null = null;
  const gridPhotos: ReportPhoto[] = [];
  const plans: Block[] = [];
  const footer: Block[] = [];
  for (const item of section.items) {
    if (item.type === 'heading') {
      pendingHeading = { type: 'heading', level: 3, runs: [text(item.label)] };
      continue;
    }
    if (item.fromFooter) {
      footer.push(...footerBlocks(b, instanceId, item));
      continue;
    }
    for (const p of b.photosOf(instanceId, item.id)) {
      if (skip.has(p.id)) continue;
      if (p.kind === 'photo') gridPhotos.push(b.reportPhoto(p, item.label));
      else plans.push(b.planBlock(p));
    }
    const runs = itemParagraph(b, instanceId, item);
    if (!runs || (item.type === 'photo' && !runs[1].text)) {
      // un item photo n'a pas de ligne de texte : ses images suffisent
      if (item.type === 'photo' && b.photosOf(instanceId, item.id).length && pendingHeading) {
        blocks.push(pendingHeading);
        pendingHeading = null;
      }
      continue;
    }
    if (pendingHeading) {
      blocks.push(pendingHeading);
      pendingHeading = null;
    }
    blocks.push({ type: 'paragraph', runs });
  }
  if (gridPhotos.length) blocks.push({ type: 'photos', photos: gridPhotos });
  blocks.push(...plans, ...footer);
  return blocks;
}

function body(b: Builder, skip: Set<string>): void {
  const { visit, template, config } = b.input;
  for (const section of template.sections) {
    const instances = visit.instances.filter((i) => i.sectionId === section.id).sort((a, c) => a.order - c.order);
    const parts = instances
      .map((inst) => ({ inst, blocks: instanceBlocks(b, section, inst.id, skip) }))
      .filter((p) => p.blocks.length || config.emptyInstance === 'show');
    if (!parts.length) continue;
    b.heading(1, section.label.toLocaleUpperCase('fr'), { pageBreakBefore: config.sectionPageBreak });
    for (const { inst, blocks } of parts) {
      if (section.repeatable) b.heading(2, inst.label.toLocaleUpperCase('fr'));
      if (!blocks.length) b.paragraph([text('Non visité.', { italic: true })]);
      b.blocks.push(...blocks);
    }
  }
  // photos générales de la visite (non rattachées)
  const general = b.photosOf(null, null);
  if (general.length) {
    b.heading(1, 'REPORTAGE PHOTOGRAPHIQUE', { pageBreakBefore: config.sectionPageBreak });
    const photos = general.filter((p) => p.kind === 'photo').map((p) => b.reportPhoto(p));
    if (photos.length) b.blocks.push({ type: 'photos', photos });
    for (const p of general.filter((x) => x.kind !== 'photo')) b.blocks.push(b.planBlock(p));
  }
}

function conclusion(b: Builder): void {
  const { visit, config } = b.input;
  const plans = b.photosOf(null, '__conclusion');
  const paragraphs = visit.conclusion.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  if (!paragraphs.length && !plans.length) return;
  b.heading(1, config.headings.conclusion, { pageBreakBefore: true });
  for (const p of plans) b.blocks.push(b.planBlock(p));
  for (const para of paragraphs) {
    const full = b.lex(para.replace(/\n/g, ' '));
    // « Fissures importantes - … » : l'entrée en gras
    const lead = /^(.{2,60}?\s[-–—])\s/.exec(full);
    b.paragraph(lead ? [text(lead[1], { bold: true }), text(full.slice(lead[1].length))] : [text(full)]);
  }
}

function defects(b: Builder): void {
  const { template, visit, answers, config } = b.input;
  b.heading(1, config.headings.defects, { pageBreakBefore: true });
  const list = collectDefects(template, visit, answers);
  if (!list.length) {
    b.paragraph([text('Aucun désordre relevé.', { italic: true })]);
    return;
  }
  for (const u of URGENCIES) {
    const group = list.filter((d) => d.urgency === u);
    if (!group.length) continue;
    b.heading(3, URGENCY_LABELS[u]);
    for (const d of group) {
      const photos = b.photosOf(d.instanceId, d.itemId).filter((p) => p.kind === 'photo');
      const obs = d.observation.trim();
      b.paragraph([
        text(`${d.instanceLabel} — ${d.itemLabel}`, { bold: true }),
        text(obs ? ` : ${b.lex(obs)}` : ''),
        text(photos.length ? ` (photo${photos.length > 1 ? 's' : ''} ${photos.map((p) => p.number).join(', ')})` : '', { italic: true }),
      ], { bullet: true });
    }
  }
}

function works(b: Builder): void {
  const { template, visit, answers, config } = b.input;
  const safety = collectActions(template, visit, answers, 'safety');
  const recos = collectActions(template, visit, answers, 'recommendation');
  const maintenance = collectActions(template, visit, answers, 'maintenance');
  if (!safety.length && !recos.length && !maintenance.length) return;
  b.heading(1, config.headings.works, { pageBreakBefore: true });
  if (safety.length) {
    b.heading(3, config.headings.safety);
    for (const a of safety) b.paragraph([text(`${b.lex(a.text.trim())} (${urgencyLower(a.urgency)}) — ${a.instanceLabel}`)], { bullet: true });
  }
  for (const u of URGENCIES) {
    const group = recos.filter((a) => a.urgency === u);
    if (!group.length) continue;
    b.heading(3, URGENCY_LABELS[u]);
    for (const a of group) b.paragraph([text(`${b.lex(a.text.trim())} — ${a.instanceLabel}`)], { bullet: true });
  }
  if (maintenance.length) {
    b.heading(3, config.headings.maintenance);
    for (const a of maintenance) b.paragraph([text(`${b.lex(a.text.trim())} — ${a.instanceLabel}`)], { bullet: true });
  }
}

function lexiconAnnex(b: Builder): void {
  const { config, lexicon, hasAnnex } = b.input;
  if (!lexicon || !hasAnnex) return;
  let pages: 'all' | number[] = 'all';
  if (config.lexicon.annex === 'used') {
    if (!b.terms.length) return;
    const groups = new Set(lexicon.lexicon.terms.filter((t) => b.terms.includes(t.id)).map((t) => t.group));
    pages = [...new Set(lexicon.lexicon.groups.filter((g) => groups.has(g.id)).flatMap((g) => g.annexPages))].sort((x, y) => x - y);
  }
  // pas de titre ajouté : l'annexe importée porte déjà « ANNEXE – LEXIQUE » sur sa première page
  b.blocks.push({ type: 'annex', pages });
}

export function buildReport(input: ReportInput): ReportModel {
  const b = new Builder(input);
  const { config, project } = input;
  const masterPlan = config.masterPlanItem
    ? input.photos.find((p) => p.itemId === config.masterPlanItem && p.kind !== 'photo')
    : undefined;
  const skip = new Set(masterPlan ? [masterPlan.id] : []);
  let notePosition = -1;
  for (const block of config.blocks) {
    switch (block) {
      case 'cover':
        notePosition = cover(b, masterPlan);
        break;
      case 'body':
        body(b, skip);
        break;
      case 'conclusion':
        conclusion(b);
        break;
      case 'defects':
        defects(b);
        break;
      case 'works':
        works(b);
        break;
      case 'lexicon':
        lexiconAnnex(b);
        break;
    }
  }
  if (notePosition >= 0 && b.terms.length && input.lexicon) {
    b.blocks.splice(notePosition, 0, { type: 'spacer', lines: 2 }, {
      type: 'paragraph', style: 'note', runs: [text(input.lexicon.lexicon.note, { bold: true, italic: true })],
    });
  }
  const name = String(project.fields['projet'] ?? '').trim();
  const fileBaseName = `${project.reference}${name ? ` ${name}` : ''}`.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
  return { blocks: b.blocks, photoIds: [...b.photoIds], lexiconTerms: b.terms, fileBaseName };
}
