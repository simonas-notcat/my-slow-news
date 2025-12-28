/**
 * Claim text formatting utilities for embedding.
 * Converts RDF-style triples into natural language sentences.
 */

/**
 * Format a claim for embedding.
 * Converts the RDF triple (subject, predicate, object) into a natural language sentence.
 *
 * @example
 * formatClaimForEmbedding({ subject: "Rust", predicate: "is-safer-than", object: "C++" })
 * // Returns: "Rust is safer than C++"
 */
export function formatClaimForEmbedding(claim: {
  subject: string;
  predicate: string;
  object: string;
}): string {
  // Convert kebab-case predicate to natural language with spaces
  const predicate = claim.predicate.replace(/-/g, " ");

  return `${claim.subject} ${predicate} ${claim.object}`;
}

/**
 * Format multiple claims for batch embedding.
 *
 * @example
 * formatClaimsForEmbedding([
 *   { subject: "Rust", predicate: "is-safer-than", object: "C++" },
 *   { subject: "TypeScript", predicate: "supports", object: "generics" }
 * ])
 * // Returns: ["Rust is safer than C++", "TypeScript supports generics"]
 */
export function formatClaimsForEmbedding(
  claims: Array<{ subject: string; predicate: string; object: string }>,
): string[] {
  return claims.map(formatClaimForEmbedding);
}
