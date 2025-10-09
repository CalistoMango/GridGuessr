#!/usr/bin/env node
/**
 * Utility script to ensure new badges exist in Supabase.
 * Safe to run multiple times – it performs upserts by name.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "..", ".env.local") });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  console.error("Missing Supabase configuration. Check NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const supabase = createClient(url, serviceRoleKey);

async function ensureBadge({ name, description, icon, type = "achievement" }) {
  const { data: existing, error: fetchError } = await supabase
    .from("badges")
    .select("id")
    .eq("name", name)
    .maybeSingle();

  if (fetchError) {
    throw new Error(`Failed to query badge "${name}": ${fetchError.message}`);
  }

  if (existing?.id) {
    console.log(`✔ Badge "${name}" already exists (id: ${existing.id})`);
    return existing.id;
  }

  const { data: inserted, error: insertError } = await supabase
    .from("badges")
    .insert([{ name, description, icon, type }])
    .select("id")
    .single();

  if (insertError) {
    throw new Error(`Failed to insert badge "${name}": ${insertError.message}`);
  }

  console.log(`➕ Created badge "${name}" (id: ${inserted.id})`);
  return inserted.id;
}

async function main() {
  try {
    await ensureBadge({
      name: "Grand Prix Master",
      description: "Perfect slate with the wildcard bonus",
      icon: "🏁",
      type: "achievement",
    });

    await ensureBadge({
      name: "Wildcard Wizard",
      description: "Correctly predict the wildcard bonus question",
      icon: "🪄",
      type: "prediction",
    });

    console.log("Done.");
    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

await main();
