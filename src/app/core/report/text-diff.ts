// Diff mot à mot pour le rendu des mises à jour : seul le texte ajouté ou modifié passe en violet.

export interface DiffSegment {
  text: string;
  added: boolean;
}

const tokenize = (text: string) => text.split(/(\s+)/).filter(Boolean);

/** Segments du nouveau texte, marqués « ajouté » s'ils n'existaient pas avant. Les suppressions ne s'affichent pas. */
export function diffWords(before: string, after: string): DiffSegment[] {
  if (!after) return [];
  if (before === after) return [{ text: after, added: false }];
  if (!before.trim()) return [{ text: after, added: true }];
  let a = tokenize(before);
  let b = tokenize(after);
  // préfixe et suffixe communs : réduit le calcul aux zones modifiées
  let prefix = 0;
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++;
  let suffix = 0;
  while (suffix < a.length - prefix && suffix < b.length - prefix && a[a.length - 1 - suffix] === b[b.length - 1 - suffix]) suffix++;
  const head = b.slice(0, prefix);
  const tail = b.slice(b.length - suffix);
  a = a.slice(prefix, a.length - suffix);
  b = b.slice(prefix, b.length - suffix);

  const marks: boolean[] = new Array(b.length).fill(true);
  if (a.length && b.length && a.length * b.length <= 4_000_000) {
    // plus longue sous-séquence commune
    const rows = a.length + 1;
    const cols = b.length + 1;
    const table = new Uint32Array(rows * cols);
    for (let i = a.length - 1; i >= 0; i--) {
      for (let j = b.length - 1; j >= 0; j--) {
        table[i * cols + j] = a[i] === b[j]
          ? table[(i + 1) * cols + j + 1] + 1
          : Math.max(table[(i + 1) * cols + j], table[i * cols + j + 1]);
      }
    }
    let i = 0;
    let j = 0;
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) {
        marks[j] = false;
        i++;
        j++;
      } else if (table[(i + 1) * cols + j] >= table[i * cols + j + 1]) i++;
      else j++;
    }
  }

  const segments: DiffSegment[] = [];
  const push = (text: string, added: boolean) => {
    const last = segments.at(-1);
    if (last && last.added === added) last.text += text;
    else segments.push({ text, added });
  };
  head.forEach((t) => push(t, false));
  b.forEach((t, k) => push(t, marks[k]));
  tail.forEach((t) => push(t, false));
  return normalizeSpaces(segments);
}

/** Blancs en bordure : « mot [ajout] suite » ; une phrase ajoutée en fin emporte le blanc qui la précède. */
function normalizeSpaces(segments: DiffSegment[]): DiffSegment[] {
  for (let k = 0; k < segments.length; k++) {
    const s = segments[k];
    const next = segments[k + 1];
    if (!next) break;
    if (s.added && !next.added) {
      const trailing = /\s+$/.exec(s.text)?.[0];
      if (trailing && s.text.trim()) {
        s.text = s.text.slice(0, -trailing.length);
        next.text = trailing + next.text;
      }
    }
    if (!s.added && next.added && k + 1 === segments.length - 1) {
      const trailing = /\s+$/.exec(s.text)?.[0];
      if (trailing && !/^\s/.test(next.text)) {
        s.text = s.text.slice(0, -trailing.length);
        next.text = trailing + next.text;
      }
    }
  }
  return segments.filter((s) => s.text);
}
