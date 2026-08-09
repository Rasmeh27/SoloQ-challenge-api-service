import {
  MILLISECONDS_PER_SECOND,
  SECONDS_PER_MINUTE,
  MINUTES_PER_HOUR,
} from '../../../../common/time/time.constants';
import { computeKda, type ProcessedMatch } from '../../../matches/domain/processed-match';
import type { RiotMatchInfoResponse, RiotMatchResponse } from '../dto/riot-responses';

const UNKNOWN_POSITION = '';
const MAX_PLAUSIBLE_DURATION_SECONDS = 3 * MINUTES_PER_HOUR * SECONDS_PER_MINUTE;

/**
 * Riot reports `gameDuration` in seconds since patch 11.20 (when `gameEndTimestamp` is
 * present) and in milliseconds before that. Deriving it from the timestamps when both are
 * available is the most reliable option.
 */
function resolveDurationSeconds(info: RiotMatchInfoResponse, gameStartTimestamp: number): number {
  if (info.gameEndTimestamp !== undefined) {
    return Math.max(
      0,
      Math.round((info.gameEndTimestamp - gameStartTimestamp) / MILLISECONDS_PER_SECOND),
    );
  }

  return info.gameDuration > MAX_PLAUSIBLE_DURATION_SECONDS
    ? Math.round(info.gameDuration / MILLISECONDS_PER_SECOND)
    : Math.round(info.gameDuration);
}

/**
 * Reduces a Match-V5 payload to the requested participant.
 * Returns `null` when the PUUID is not part of the match, so the caller can skip it
 * instead of storing an inconsistent record.
 */
export function toProcessedMatch(
  response: RiotMatchResponse,
  puuid: string,
): ProcessedMatch | null {
  const participant = response.info.participants.find((entry) => entry.puuid === puuid);

  if (participant === undefined) {
    return null;
  }

  const gameStartTimestamp = response.info.gameStartTimestamp ?? response.info.gameCreation;
  const gameDuration = resolveDurationSeconds(response.info, gameStartTimestamp);
  const gameEndTimestamp =
    response.info.gameEndTimestamp ?? gameStartTimestamp + gameDuration * MILLISECONDS_PER_SECOND;
  const totalMinionsKilled = participant.totalMinionsKilled ?? 0;
  const neutralMinionsKilled = participant.neutralMinionsKilled ?? 0;

  return {
    matchId: response.metadata.matchId,
    gameCreation: response.info.gameCreation,
    gameStartTimestamp,
    gameEndTimestamp,
    gameDuration,
    queueId: response.info.queueId,
    gameVersion: response.info.gameVersion ?? '',
    win: participant.win,
    championId: participant.championId,
    championName: participant.championName ?? '',
    teamPosition: participant.teamPosition ?? UNKNOWN_POSITION,
    individualPosition: participant.individualPosition ?? UNKNOWN_POSITION,
    kills: participant.kills,
    deaths: participant.deaths,
    assists: participant.assists,
    kda: computeKda(participant.kills, participant.deaths, participant.assists),
    totalMinionsKilled,
    neutralMinionsKilled,
    totalCs: totalMinionsKilled + neutralMinionsKilled,
    visionScore: participant.visionScore ?? 0,
    goldEarned: participant.goldEarned ?? 0,
    totalDamageDealtToChampions: participant.totalDamageDealtToChampions ?? 0,
    gameEndedInEarlySurrender: participant.gameEndedInEarlySurrender ?? false,
    gameEndedInSurrender: participant.gameEndedInSurrender ?? false,
  };
}
