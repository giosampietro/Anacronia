export function parseSearchTerms(termsText: string): string[] {
  const seenTerms = new Set<string>();
  const terms: string[] = [];

  for (const segment of termsText.split(/[,\n]/)) {
    const term = segment.trim().replace(/\s+/g, " ");
    const normalizedTerm = term.toLowerCase();

    if (term === "" || seenTerms.has(normalizedTerm)) {
      continue;
    }

    seenTerms.add(normalizedTerm);
    terms.push(term);
  }

  return terms;
}

export function termDetectionLabel(terms: string[]): string {
  const noun = terms.length === 1 ? "term" : "terms";
  const summary = terms.length === 0 ? "none" : terms.join(", ");

  return `${terms.length} ${noun} detected: ${summary}`;
}
