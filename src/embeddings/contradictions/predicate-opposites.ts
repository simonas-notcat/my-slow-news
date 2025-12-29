/**
 * Map of predicates to their opposites.
 * Used for detecting direct contradictions.
 */
export const PREDICATE_OPPOSITES: Record<string, string[]> = {
  // Support/Opposition
  supports: ["opposes", "rejects", "criticizes"],
  opposes: ["supports", "endorses", "promotes"],
  endorses: ["opposes", "rejects", "criticizes"],
  rejects: ["supports", "endorses", "accepts"],

  // Comparative
  "is-better-than": ["is-worse-than"],
  "is-worse-than": ["is-better-than"],
  "is-faster-than": ["is-slower-than"],
  "is-slower-than": ["is-faster-than"],
  "is-safer-than": ["is-less-safe-than", "is-more-dangerous-than"],
  "is-less-safe-than": ["is-safer-than"],
  "is-more-popular-than": ["is-less-popular-than"],
  "is-less-popular-than": ["is-more-popular-than"],
  outperforms: ["underperforms"],
  underperforms: ["outperforms"],

  // Presence/Absence
  has: ["lacks", "missing"],
  lacks: ["has", "includes", "contains"],
  includes: ["excludes", "lacks"],
  excludes: ["includes", "has"],

  // State changes
  released: ["cancelled", "discontinued"],
  cancelled: ["released", "launched"],
  deprecated: ["introduced", "released"],
  introduced: ["deprecated", "removed"],

  // Adoption
  uses: ["abandoned", "dropped"],
  abandoned: ["uses", "adopted"],
  adopted: ["rejected", "abandoned"],
  "migrated-to": ["migrated-from"],
  "migrated-from": ["migrated-to"],
};

/**
 * Check if two predicates are opposites.
 */
export function arePredicatesOpposite(p1: string, p2: string): boolean {
  const opposites1 = PREDICATE_OPPOSITES[p1] || [];
  const opposites2 = PREDICATE_OPPOSITES[p2] || [];

  return opposites1.includes(p2) || opposites2.includes(p1);
}

/**
 * Negation patterns that indicate contradiction.
 */
export const NEGATION_PATTERNS = [
  { positive: /^has[-\s]/, negative: /^lacks[-\s]|^missing[-\s]/ },
  { positive: /^is[-\s]/, negative: /^is[-\s]not[-\s]|^isnt[-\s]/ },
  { positive: /^can[-\s]/, negative: /^cannot[-\s]|^cant[-\s]/ },
  { positive: /^supports[-\s]/, negative: /^does[-\s]not[-\s]support/ },
];

/**
 * Check if two objects represent negation of each other.
 */
export function areObjectsNegated(obj1: string, obj2: string): boolean {
  const normalized1 = obj1.toLowerCase().replace(/[^a-z0-9\s-]/g, "");
  const normalized2 = obj2.toLowerCase().replace(/[^a-z0-9\s-]/g, "");

  for (const pattern of NEGATION_PATTERNS) {
    if (
      (pattern.positive.test(normalized1) &&
        pattern.negative.test(normalized2)) ||
      (pattern.negative.test(normalized1) && pattern.positive.test(normalized2))
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Get all opposite predicates for a given predicate.
 */
export function getOppositePredicates(predicate: string): string[] {
  return PREDICATE_OPPOSITES[predicate] || [];
}

/**
 * Comparative predicates that can have reversed arguments.
 */
export const COMPARATIVE_PREDICATES = [
  "is-better-than",
  "is-worse-than",
  "is-faster-than",
  "is-slower-than",
  "is-safer-than",
  "is-less-safe-than",
  "is-more-popular-than",
  "is-less-popular-than",
  "outperforms",
  "underperforms",
];

/**
 * Check if a predicate is comparative.
 */
export function isComparativePredicate(predicate: string): boolean {
  return COMPARATIVE_PREDICATES.includes(predicate);
}
