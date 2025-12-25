#!/usr/bin/env bun
import { program } from "commander";
import { loadConfig } from "../config";
import { getDb, closeDb } from "../db";

program
  .name("stance")
  .description("Add or update your stance on a claim")
  .argument("<claim>", 'The claim in format "Subject predicate Object"')
  .argument("<stance>", "Your stance: agree, disagree, neutral, uncertain")
  .option("-n, --note <note>", "Optional note explaining your stance")
  .action(async (claimStr, stanceArg, options) => {
    console.log("My Slow News - Stance Manager\n");

    try {
      // Parse the claim
      const parts = claimStr.split(" ");
      if (parts.length < 3) {
        console.error(
          'Error: Claim must be in format "Subject predicate Object"'
        );
        console.error('Example: "Rust is-safer-than C++"');
        process.exit(1);
      }

      const subject = parts[0];
      const predicate = parts[1];
      const object = parts.slice(2).join(" ");

      // Validate stance
      const validStances = ["agree", "disagree", "neutral", "uncertain"];
      const stance = stanceArg.toLowerCase();
      if (!validStances.includes(stance)) {
        console.error(`Error: Stance must be one of: ${validStances.join(", ")}`);
        process.exit(1);
      }

      // Map to database format
      const stanceMap: Record<string, string> = {
        agree: "agrees",
        disagree: "disagrees",
        neutral: "neutral",
        uncertain: "uncertain",
      };

      console.log(`Claim: (${subject}, ${predicate}, ${object})`);
      console.log(`Your stance: ${stance}`);
      if (options.note) {
        console.log(`Note: ${options.note}`);
      }

      const config = loadConfig();
      const db = await getDb(config);

      // Find or create the claim
      const existingClaim = await db.query<any[][]>(
        `SELECT * FROM claim WHERE subject = $subject AND predicate = $predicate AND object = $object`,
        { subject, predicate, object }
      );

      let claimId: string | undefined;

      if (existingClaim[0]?.length > 0) {
        claimId = existingClaim[0]?.[0]?.id;
        if (claimId) {
          console.log(`\nFound existing claim: ${claimId}`);
        }
      }

      if (!claimId) {
        // Create new claim
        const newClaim = await db.query<any[][]>(
          `CREATE claim SET
            subject = $subject,
            predicate = $predicate,
            object = $object,
            confidence = 1.0,
            extracted_at = time::now()`,
          { subject, predicate, object }
        );
        claimId = newClaim[0]?.[0]?.id;
        if (!claimId) {
          console.error("Error: Failed to create claim in database");
          await closeDb();
          process.exit(1);
        }
        console.log(`\nCreated new claim: ${claimId}`);
      }

      // Update or create stance record
      const existingStances = await db.query<any[][]>(
        `SELECT * FROM claim_stances WHERE claim = $claimId`,
        { claimId }
      );

      if (existingStances[0]?.length > 0) {
        const updateResult = await db.query<any[][]>(
          `UPDATE claim_stances SET
            user_stance = $stance,
            user_note = $note
          WHERE claim = $claimId`,
          { claimId, stance: stanceMap[stance], note: options.note || null }
        );
        if (!updateResult[0]?.length) {
          console.error("Warning: Stance update may not have succeeded");
        } else {
          console.log("Updated existing stance record");
        }
      } else {
        const createResult = await db.query<any[][]>(
          `CREATE claim_stances SET
            claim = $claimId,
            content_author_stance = 'not-stated',
            commenter_agree_pct = 0,
            commenter_disagree_pct = 0,
            user_stance = $stance,
            user_note = $note`,
          { claimId, stance: stanceMap[stance], note: options.note || null }
        );
        if (!createResult[0]?.length) {
          console.error("Error: Failed to create stance record");
          await closeDb();
          process.exit(1);
        }
        console.log("Created new stance record");
      }

      await closeDb();
      console.log("\nStance saved successfully!");
    } catch (error) {
      console.error("Error saving stance:", error);
      process.exit(1);
    }
  });

program.parse();
