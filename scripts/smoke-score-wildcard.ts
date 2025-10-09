#!/usr/bin/env tsx
/**
 * Smoke test that creates a temporary race & prediction, runs the admin scoring
 * handler, and verifies that the wildcard bonus awards the expected badges.
 * The script cleans up all temporary records afterwards.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "..", ".env.local") });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const adminPassword = process.env.ADMIN_PASSWORD;

if (!url || !serviceRoleKey || !adminPassword) {
  console.error("Missing Supabase or admin credentials. Check .env.local.");
  process.exit(1);
}

const { POST: scoreRace } = await import("../src/app/api/admin/results/route");

const supabase = createClient(url, serviceRoleKey);

type CreatedRecords = {
  userId?: string;
  raceId?: string;
  predictionId?: string;
};

const created: CreatedRecords = {};

async function cleanup() {
  // Clean up in reverse order of creation.
  if (created.predictionId) {
    const { error } = await supabase.from("predictions").delete().eq("id", created.predictionId);
    if (error) console.warn("Failed to delete prediction:", error);
  }

  if (created.raceId) {
    const { error: resultError } = await supabase.from("race_results").delete().eq("race_id", created.raceId);
    if (resultError) console.warn("Failed to delete race results:", resultError);

    const { error: predictionError } = await supabase.from("predictions").delete().eq("race_id", created.raceId);
    if (predictionError) console.warn("Failed to delete race predictions:", predictionError);

    const { error: badgeError } = await supabase.from("user_badges").delete().eq("race_id", created.raceId);
    if (badgeError) console.warn("Failed to delete race badges:", badgeError);

    const { error: raceError } = await supabase.from("races").delete().eq("id", created.raceId);
    if (raceError) console.warn("Failed to delete race:", raceError);
  }

  if (created.userId) {
    const { error } = await supabase.from("user_badges").delete().eq("user_id", created.userId);
    if (error) console.warn("Failed to delete user badges:", error);

    const { error: userError } = await supabase.from("users").delete().eq("id", created.userId);
    if (userError) console.warn("Failed to delete user:", userError);
  }
}

process.on("exit", () => {
  // eslint-disable-next-line no-console
  console.log("Cleanup complete.");
});

process.on("SIGINT", async () => {
  await cleanup();
  process.exit(1);
});

async function ensureTestData() {
  const { data: drivers, error: driversError } = await supabase
    .from("drivers")
    .select("id")
    .order("name")
    .limit(3);
  if (driversError || !drivers || drivers.length < 3) {
    throw new Error(`Unable to load drivers: ${driversError?.message ?? "need at least 3 drivers"}`);
  }

  const { data: teams, error: teamsError } = await supabase.from("teams").select("id").order("name").limit(1);
  if (teamsError || !teams || teams.length === 0) {
    throw new Error(`Unable to load teams: ${teamsError?.message ?? "need at least 1 team"}`);
  }

  const fid = 900000 + Math.floor(Math.random() * 1000);

  const { data: user, error: userError } = await supabase
    .from("users")
    .insert({
      fid,
      username: `test_wildcard_${fid}`,
      display_name: "Wildcard Test User",
      total_points: 0,
      perfect_slates: 0,
    })
    .select("id")
    .single();
  if (userError || !user) throw new Error(`Failed to create user: ${userError?.message}`);
  created.userId = user.id;

  const now = Date.now();
  const raceDate = new Date(now + 60 * 60 * 1000).toISOString();
  const lockTime = new Date(now - 60 * 60 * 1000).toISOString();

  const { data: race, error: raceError } = await supabase
    .from("races")
    .insert({
      name: `Wildcard Bonus Smoke ${fid}`,
      circuit: "Test Circuit",
      country: "Testland",
      race_date: raceDate,
      lock_time: lockTime,
      status: "locked",
      wildcard_question: "Will our test wildcard hit?",
      season: 3025,
      round: fid % 1000,
    })
    .select("id")
    .single();
  if (raceError || !race) throw new Error(`Failed to create race: ${raceError?.message}`);
  created.raceId = race.id;

  const [driver1, driver2, driver3] = drivers;
  const [team] = teams;

  const { data: prediction, error: predictionError } = await supabase
    .from("predictions")
    .insert({
      user_id: user.id,
      race_id: race.id,
      pole_driver_id: driver1.id,
      winner_driver_id: driver1.id,
      second_driver_id: driver2.id,
      third_driver_id: driver3.id,
      fastest_lap_driver_id: driver1.id,
      fastest_pit_team_id: team.id,
      first_dnf_driver_id: null,
      no_dnf: true,
      safety_car: true,
      winning_margin: "7-12s",
      wildcard_answer: true,
    })
    .select("id")
    .single();
  if (predictionError || !prediction) throw new Error(`Failed to create prediction: ${predictionError?.message}`);
  created.predictionId = prediction.id;

  return {
    raceId: race.id,
    driver1: driver1.id,
    driver2: driver2.id,
    driver3: driver3.id,
    teamId: team.id,
  };
}

async function runSmokeTest() {
  const { raceId, driver1, driver2, driver3, teamId } = await ensureTestData();

  const requestBody = {
    adminPassword,
    raceId,
    poleDriverId: driver1,
    winnerDriverId: driver1,
    secondDriverId: driver2,
    thirdDriverId: driver3,
    fastestLapDriverId: driver1,
    fastestPitTeamId: teamId,
    firstDnfDriverId: null,
    noDnf: true,
    safetyCar: true,
    winningMargin: "7-12s",
    wildcardResult: true,
  };

  const request = new NextRequest(
    new Request("https://gridguessr.test/api/admin/results", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(requestBody),
    }),
  );

  const response = await scoreRace(request);
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(`Scoring failed: ${payload?.error ?? "unknown error"}`);
  }

  const { data: predictionRow, error: fetchPredictionError } = await supabase
    .from("predictions")
    .select("score")
    .eq("id", created.predictionId!)
    .single();
  if (fetchPredictionError) throw new Error(`Failed to fetch scored prediction: ${fetchPredictionError.message}`);

  if (predictionRow?.score !== 110) {
    throw new Error(`Unexpected score. Expected 110, got ${predictionRow?.score ?? "null"}`);
  }

  const { data: badges, error: badgesError } = await supabase
    .from("user_badges")
    .select("badge:badges(name)")
    .eq("user_id", created.userId!);
  if (badgesError) throw new Error(`Failed to fetch user badges: ${badgesError.message}`);

  const badgeNames = (badges ?? [])
    .flatMap((entry: any) => {
      const badge = entry?.badge;
      if (!badge) return [];
      if (Array.isArray(badge)) {
        return badge
          .map((item) => (typeof item?.name === "string" ? item.name : null))
          .filter((name): name is string => Boolean(name));
      }
      if (typeof badge === "object" && typeof badge.name === "string") {
        return [badge.name];
      }
      return [];
    });

  const missing = ["Wildcard Wizard", "Grand Prix Master"].filter((name) => !badgeNames.includes(name));
  if (missing.length) {
    throw new Error(`Expected bonus badges missing: ${missing.join(", ")}`);
  }

  console.log("✅ Smoke test passed. Score = 110, badges awarded:", badgeNames);
}

try {
  await runSmokeTest();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await cleanup();
}
