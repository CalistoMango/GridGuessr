#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "..", ".env.local") });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  console.error("Missing Supabase environment variables.");
  process.exit(1);
}

const supabase = createClient(url, serviceRoleKey);

const [table = "races", limit = "1"] = process.argv.slice(2);

const { data, error } = await supabase
  .from(table)
  .select("*")
  .limit(Number(limit));

if (error) {
  console.error(error);
  process.exit(1);
}

console.dir(data, { depth: null });
