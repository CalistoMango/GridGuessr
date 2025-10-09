import { NextRequest, NextResponse } from 'next/server';

import { authenticateAdmin } from '~/lib/auth';
import {
  buildDriverOfDayCast,
  buildLockReminderCast,
  buildPredictionConsensusCast,
  buildPerfectSlateCast,
  buildRaceResultsSummaryCast,
  buildCloseCallsCast,
  buildLeaderboardUpdateCast,
  postCast,
  deleteCast
} from '~/lib/farcaster';
import { supabaseAdmin } from '~/lib/supabase';

function extractHeaderToken(request: NextRequest): string | null {
  const headerToken = request.headers.get('x-admin-token')?.trim();
  if (headerToken) return headerToken;

  const bearer = request.headers.get('authorization');
  if (bearer?.startsWith('Bearer ')) {
    const token = bearer.slice(7).trim();
    if (token) return token;
  }

  return null;
}

function isAuthorized(body: any, request: NextRequest): boolean {
  const token = extractHeaderToken(request);
  const authResult = authenticateAdmin({
    fid: body?.fid,
    adminFid: body?.adminFid,
    password: body?.password,
    adminPassword: body?.adminPassword,
    token
  });

  return authResult.authenticated;
}

function unauthorizedResponse() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
}

function parseBooleanFlag(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    return value === 'true' || value === '1';
  }
  return false;
}

async function resolveLatestCompletedRace(): Promise<{ id: string } | null> {
  const { data, error } = await supabaseAdmin
    .from('races')
    .select('id')
    .eq('status', 'completed')
    .order('race_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to resolve latest completed race: ${error.message ?? error}`);
  }

  return data ?? null;
}

async function resolveNextPredictionRace(): Promise<{ id: string; lock_time: string } | null> {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from('races')
    .select('id, lock_time')
    .in('status', ['upcoming', 'locked'])
    .gte('lock_time', nowIso)
    .order('lock_time', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to resolve next prediction race: ${error.message ?? error}`);
  }

  return data ?? null;
}

function determineDryRunFlag(): boolean {
  if (parseBooleanFlag(process.env.FARCASTER_DRY_RUN)) return true;
  if (parseBooleanFlag(process.env.NEXT_PUBLIC_FARCASTER_DRY_RUN)) return true;
  return false;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!isAuthorized(body, request)) {
      return unauthorizedResponse();
    }

    const action = typeof body?.action === 'string' ? body.action : 'manual-cast';
    const dryRun = determineDryRunFlag();

    switch (action) {
      case 'manual-cast': {
        const text = typeof body?.text === 'string' ? body.text.trim() : '';
        const embedUrlRaw = typeof body?.embedUrl === 'string' ? body.embedUrl.trim() : '';
        const channelIdRaw = typeof body?.channelId === 'string' ? body.channelId.trim() : '';

        if (!text) {
          return NextResponse.json(
            { error: 'Cast text is required.' },
            { status: 400 }
          );
        }

        const payload = {
          text,
          embeds: embedUrlRaw ? [{ url: embedUrlRaw }] : undefined,
          channelId: channelIdRaw || undefined
        };

        const result = await postCast(payload);

        return NextResponse.json({
          success: true,
          dryRun,
          result
        });
      }

      case 'driver-of-day-summary': {
        const raceId = typeof body?.raceId === 'string' && body.raceId.trim().length
          ? body.raceId.trim()
          : null;

        const race = raceId
          ? await supabaseAdmin
              .from('races')
              .select('id')
              .eq('id', raceId)
              .maybeSingle()
              .then(({ data, error }) => {
                if (error) throw error;
                return data;
              })
          : await resolveLatestCompletedRace();

        if (!race?.id) {
          return NextResponse.json(
            { error: 'No completed race found.' },
            { status: 404 }
          );
        }

        const { payload, totalVotes } = await buildDriverOfDayCast({
          raceId: race.id,
          channelId: typeof body?.channelId === 'string' ? body.channelId.trim() || undefined : undefined
        });

        if (!totalVotes) {
          return NextResponse.json(
            { error: 'Driver of the Day has no votes yet.' },
            { status: 409 }
          );
        }

        const result = await postCast(payload);

        return NextResponse.json({
          success: true,
          dryRun,
          result,
          raceId: race.id,
          totalVotes
        });
      }

      case 'race-results-summary': {
        const raceId = typeof body?.raceId === 'string' && body.raceId.trim().length
          ? body.raceId.trim()
          : null;

        const race = raceId
          ? await supabaseAdmin
              .from('races')
              .select('id')
              .eq('id', raceId)
              .maybeSingle()
              .then(({ data, error }) => {
                if (error) throw error;
                return data;
              })
          : await resolveLatestCompletedRace();

        if (!race?.id) {
          return NextResponse.json(
            { error: 'No completed race found.' },
            { status: 404 }
          );
        }

        let payload;
        try {
          payload = await buildRaceResultsSummaryCast({
            raceId: race.id,
            channelId: typeof body?.channelId === 'string' ? body.channelId.trim() || undefined : undefined
          });
        } catch (builderError) {
          const message = builderError instanceof Error ? builderError.message : String(builderError);
          return NextResponse.json(
            { error: message },
            { status: 409 }
          );
        }

        const result = await postCast(payload);

        return NextResponse.json({
          success: true,
          dryRun,
          result,
          raceId: race.id
        });
      }

      case 'perfect-slate-alert': {
        const raceId = typeof body?.raceId === 'string' && body.raceId.trim().length
          ? body.raceId.trim()
          : null;

        const race = raceId
          ? await supabaseAdmin
              .from('races')
              .select('id')
              .eq('id', raceId)
              .maybeSingle()
              .then(({ data, error }) => {
                if (error) throw error;
                return data;
              })
          : await resolveLatestCompletedRace();

        if (!race?.id) {
          return NextResponse.json(
            { error: 'No completed race found.' },
            { status: 404 }
          );
        }

        let templateResult;
        try {
          templateResult = await buildPerfectSlateCast({
            raceId: race.id,
            channelId: typeof body?.channelId === 'string' ? body.channelId.trim() || undefined : undefined
          });
        } catch (builderError) {
          const message = builderError instanceof Error ? builderError.message : String(builderError);
          return NextResponse.json(
            { error: message },
            { status: 409 }
          );
        }

        const result = await postCast(templateResult.payload);

        return NextResponse.json({
          success: true,
          dryRun,
          result,
          raceId: race.id,
          perfectCount: templateResult.perfectCount,
          displayedUsers: templateResult.displayedUsers
        });
      }

      case 'close-calls': {
        const raceId = typeof body?.raceId === 'string' && body.raceId.trim().length
          ? body.raceId.trim()
          : null;

        const race = raceId
          ? await supabaseAdmin
              .from('races')
              .select('id')
              .eq('id', raceId)
              .maybeSingle()
              .then(({ data, error }) => {
                if (error) throw error;
                return data;
              })
          : await resolveLatestCompletedRace();

        if (!race?.id) {
          return NextResponse.json(
            { error: 'No completed race found.' },
            { status: 404 }
          );
        }

        let templateResult;
        try {
          templateResult = await buildCloseCallsCast({
            raceId: race.id,
            channelId: typeof body?.channelId === 'string' ? body.channelId.trim() || undefined : undefined
          });
        } catch (builderError) {
          const message = builderError instanceof Error ? builderError.message : String(builderError);
          return NextResponse.json(
            { error: message },
            { status: 409 }
          );
        }

        const result = await postCast(templateResult.payload);

        return NextResponse.json({
          success: true,
          dryRun,
          result,
          raceId: race.id,
          closeCount: templateResult.closeCount,
          displayedUsers: templateResult.displayedUsers
        });
      }

      case 'leaderboard-update': {
        const raceId = typeof body?.raceId === 'string' && body.raceId.trim().length
          ? body.raceId.trim()
          : null;

        const race = raceId
          ? await supabaseAdmin
              .from('races')
              .select('id')
              .eq('id', raceId)
              .maybeSingle()
              .then(({ data, error }) => {
                if (error) throw error;
                return data;
              })
          : await resolveLatestCompletedRace();

        if (!race?.id) {
          return NextResponse.json(
            { error: 'No completed race found.' },
            { status: 404 }
          );
        }

        let payload;
        try {
          payload = await buildLeaderboardUpdateCast({
            raceId: race.id,
            channelId: typeof body?.channelId === 'string' ? body.channelId.trim() || undefined : undefined
          });
        } catch (builderError) {
          const message = builderError instanceof Error ? builderError.message : String(builderError);
          return NextResponse.json(
            { error: message },
            { status: 409 }
          );
        }

        const result = await postCast(payload);

        return NextResponse.json({
          success: true,
          dryRun,
          result,
          raceId: race.id
        });
      }

      case 'lock-reminder': {
        const explicitRaceId = typeof body?.raceId === 'string' && body.raceId.trim().length
          ? body.raceId.trim()
          : null;

        let targetRace: { id: string; lock_time: string } | null;
        if (explicitRaceId) {
          const { data, error } = await supabaseAdmin
            .from('races')
            .select('id, lock_time')
            .eq('id', explicitRaceId)
            .maybeSingle();

          if (error) {
            throw new Error(`Failed to load race ${explicitRaceId}: ${error.message ?? error}`);
          }

          targetRace = data ?? null;
        } else {
          targetRace = await resolveNextPredictionRace();
        }

        if (!targetRace?.id) {
          return NextResponse.json(
            { error: 'No upcoming race found for lock reminder.' },
            { status: 404 }
          );
        }

        const lockTime = new Date(targetRace.lock_time ?? '').getTime();
        const leadMinutes = Number.isFinite(lockTime)
          ? Math.round((lockTime - Date.now()) / 60000)
          : NaN;

        if (!Number.isFinite(leadMinutes) || leadMinutes <= 0) {
          return NextResponse.json(
            { error: 'Lock time has already passed for the selected race.' },
            { status: 409 }
          );
        }

        const payload = await buildLockReminderCast({
          raceId: targetRace.id,
          leadMinutes,
          channelId: typeof body?.channelId === 'string' ? body.channelId.trim() || undefined : undefined
        });

        const result = await postCast(payload);

        return NextResponse.json({
          success: true,
          dryRun,
          result,
          raceId: targetRace.id,
          leadMinutes
        });
      }

      case 'prediction-consensus': {
        const category = body?.category === 'pole' || body?.category === 'winner' ? body.category : 'winner';
        let race: { id: string } | null = null;

        if (typeof body?.raceId === 'string' && body.raceId.trim().length) {
          const { data, error } = await supabaseAdmin
            .from('races')
            .select('id')
            .eq('id', body.raceId.trim())
            .maybeSingle();

          if (error) {
            throw new Error(`Failed to load race ${body.raceId.trim()}: ${error.message ?? error}`);
          }

          race = data ?? null;
        } else {
          race = await resolveNextPredictionRace();
        }

        if (!race?.id) {
          return NextResponse.json(
            { error: 'No race found for prediction consensus.' },
            { status: 404 }
          );
        }

        let payload: Awaited<ReturnType<typeof buildPredictionConsensusCast>>;
        try {
          payload = await buildPredictionConsensusCast({
            raceId: race.id,
            category,
            channelId: typeof body?.channelId === 'string' ? body.channelId.trim() || undefined : undefined
          });
        } catch (builderError) {
          const message = builderError instanceof Error ? builderError.message : String(builderError);
          return NextResponse.json(
            { error: message },
            { status: 409 }
          );
        }

        const result = await postCast(payload);

        return NextResponse.json({
          success: true,
          dryRun,
          result,
          raceId: race.id,
          category
        });
      }

      case 'delete-cast': {
        const targetHash = typeof body?.targetHash === 'string' ? body.targetHash.trim() : '';
        const signerUuid = typeof body?.signerUuid === 'string' ? body.signerUuid.trim() : undefined;

        if (!targetHash) {
          return NextResponse.json(
            { error: 'Cast hash is required.' },
            { status: 400 }
          );
        }

        const result = await deleteCast({
          targetHash,
          signerUuid,
          dryRun
        });

        return NextResponse.json({
          success: result.success,
          dryRun,
          result
        });
      }

      default:
        return NextResponse.json(
          { error: `Unsupported Farcaster admin action: ${action}` },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('Farcaster admin action failed:', error);
    return NextResponse.json(
      { error: 'Failed to perform Farcaster action.' },
      { status: 500 }
    );
  }
}
