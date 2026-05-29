export type SearchSetTerm = {
  term: string;
  active: boolean;
};

export type SearchSet = {
  display_name: string;
  slug: string;
  terms: SearchSetTerm[];
};

export type SearchSetCard = {
  displayName: string;
  slug: string;
  activeTerms: string[];
  inactiveTerms: string[];
  summary: string;
};

export function createSearchSetCards(searchSets: SearchSet[]): SearchSetCard[] {
  return searchSets.map((searchSet) => {
    const activeTerms = searchSet.terms.filter((term) => term.active).map((term) => term.term);
    const inactiveTerms = searchSet.terms.filter((term) => !term.active).map((term) => term.term);

    return {
      displayName: searchSet.display_name,
      slug: searchSet.slug,
      activeTerms,
      inactiveTerms,
      summary: `${activeTerms.length} active ${activeTerms.length === 1 ? "term" : "terms"}`,
    };
  });
}
