import type Surreal from "surrealdb";
import type { UserStance } from "../types";

interface ClaimStancesRecord {
  id: string;
  claim: string;
  user_stance?: string;
  user_note?: string;
}

export async function saveStance(
  db: Surreal,
  claimId: string,
  stance: UserStance,
  note?: string
): Promise<void> {
  // Check if stance record exists
  const existing = await db.query<ClaimStancesRecord[][]>(
    `SELECT * FROM claim_stances WHERE claim = $claim`,
    { claim: claimId }
  );

  if (existing[0] && existing[0].length > 0) {
    // Update existing
    await db.query(
      `UPDATE claim_stances SET
        user_stance = $stance,
        user_note = $note
      WHERE claim = $claim`,
      { claim: claimId, stance, note: note || null }
    );
  } else {
    // Create new
    await db.query(
      `CREATE claim_stances SET
        claim = $claim,
        content_author_stance = 'not-stated',
        commenter_agree_pct = 0,
        commenter_disagree_pct = 0,
        user_stance = $stance,
        user_note = $note`,
      { claim: claimId, stance, note: note || null }
    );
  }
}

export async function removeStance(
  db: Surreal,
  claimId: string
): Promise<void> {
  await db.query(
    `UPDATE claim_stances SET
      user_stance = NONE,
      user_note = NONE
    WHERE claim = $claim`,
    { claim: claimId }
  );
}
