// Lexique : astérisques automatiques sur les termes définis en annexe (docs/SPEC.md §6 bis).

export interface LexiconGroup {
  id: string;
  label: string;
  /** Pages (1-based) de l'annexe importée qui illustrent ce groupe. */
  annexPages: number[];
}

export interface LexiconTerm {
  id: string;
  group: string;
  /** Formes reconnues (pluriels, variantes d'accent) : rien n'est deviné. */
  forms: string[];
  /** Expressions où le terme ne doit pas être marqué (« tableau électrique »). */
  except?: string[];
}

export interface Lexicon {
  version: string;
  note: string;
  groups: LexiconGroup[];
  terms: LexiconTerm[];
}

/** Marqueur invisible (WORD JOINER) placé après un mot pour ne pas le marquer à cet endroit. */
export const LEXICON_EXCLUDE = '⁠';

export interface CompiledLexicon {
  lexicon: Lexicon;
  /** Formes normalisées, de la plus longue à la plus courte. */
  forms: { form: string; termId: string }[];
  excepts: string[];
}

export interface TermOccurrence {
  start: number;
  end: number;
  termId: string;
  excluded: boolean;
}

/** Normalisation de même longueur : minuscules et apostrophe typographique → droite. */
function normalize(text: string): string {
  let out = '';
  for (const ch of text) {
    const lower = ch.toLocaleLowerCase('fr');
    out += ch === '’' ? "'" : lower.length === ch.length ? lower : ch;
  }
  return out;
}

const WORD = /[\p{L}\p{N}]/u;
const isWordChar = (ch: string | undefined) => !!ch && WORD.test(ch);

export function compileLexicon(lexicon: Lexicon): CompiledLexicon {
  const forms = lexicon.terms
    .flatMap((t) => t.forms.map((form) => ({ form: normalize(form), termId: t.id })))
    .sort((a, b) => b.form.length - a.form.length);
  const excepts = lexicon.terms.flatMap((t) => t.except ?? []).map(normalize);
  return { lexicon, forms, excepts };
}

/** Occurrences des termes dans un texte (mot entier, forme la plus longue d'abord). */
export function findTerms(text: string, compiled: CompiledLexicon): TermOccurrence[] {
  const norm = normalize(text);
  const found: TermOccurrence[] = [];
  // zones couvertes par une exception
  const blocked: [number, number][] = [];
  for (const ex of compiled.excepts) {
    for (let i = norm.indexOf(ex); i >= 0; i = norm.indexOf(ex, i + 1)) blocked.push([i, i + ex.length]);
  }
  let i = 0;
  while (i < norm.length) {
    if (isWordChar(norm[i - 1]) || !isWordChar(norm[i])) {
      i++;
      continue;
    }
    const match = compiled.forms.find(({ form }) => norm.startsWith(form, i) && !isWordChar(norm[i + form.length]));
    if (!match) {
      i++;
      continue;
    }
    const end = i + match.form.length;
    if (!blocked.some(([a, b]) => a <= i && end <= b)) {
      found.push({ start: i, end, termId: match.termId, excluded: text[end] === LEXICON_EXCLUDE });
    }
    i = end;
  }
  return found;
}

export interface LexiconState {
  mode: 'every' | 'first';
  /** Termes déjà marqués dans le rapport (mode « first »). */
  seen?: Set<string>;
}

/** Ajoute les astérisques ; renvoie aussi les termes marqués. Les marqueurs d'exclusion sont retirés. */
export function applyLexicon(text: string, compiled: CompiledLexicon, state: LexiconState): { text: string; terms: string[] } {
  const terms: string[] = [];
  let out = '';
  let last = 0;
  for (const occ of findTerms(text, compiled)) {
    out += text.slice(last, occ.end);
    last = occ.end;
    if (occ.excluded || text[occ.end] === '*') continue;
    if (state.mode === 'first') {
      state.seen ??= new Set();
      if (state.seen.has(occ.termId)) continue;
      state.seen.add(occ.termId);
    }
    out += '*';
    if (!terms.includes(occ.termId)) terms.push(occ.termId);
  }
  out += text.slice(last);
  return { text: stripExclusions(out), terms };
}

/** Exclut (ou ré-inclut) la n-ième occurrence trouvée dans le texte. */
export function toggleExclusion(text: string, compiled: CompiledLexicon, index: number): string {
  const occ = findTerms(text, compiled)[index];
  if (!occ) return text;
  return occ.excluded
    ? text.slice(0, occ.end) + text.slice(occ.end + 1)
    : text.slice(0, occ.end) + LEXICON_EXCLUDE + text.slice(occ.end);
}

export function stripExclusions(text: string): string {
  return text.split(LEXICON_EXCLUDE).join('');
}
