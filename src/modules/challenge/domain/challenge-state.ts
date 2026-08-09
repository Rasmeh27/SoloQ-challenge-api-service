import type { IsoDateTime } from '../../../common/time/iso-date-time';

/**
 * Version of the persisted documents. Bump it whenever the stored shape changes so the
 * repository can reject files it does not understand instead of guessing.
 *
 * v2 added `profileRefreshedAt` to the participant document. Documents written by v1 are
 * still readable: the missing field defaults to `null` and is refreshed on the next sync.
 *
 * v3 added `trackingStartedAt` to the participant document. It was dropped in v4: match
 * coverage is the same for everybody (`challenge.startAt`) and a per participant window
 * only belongs to rank progress, which already lives in `baselineRank.capturedAt`.
 *
 * v4 replaced it with `earliestMatchCoverageAt`, pure bookkeeping that records how far
 * back Match-V5 was actually swept so late participants can be backfilled. Documents
 * written by v1, v2 and v3 stay readable: the unknown field is dropped and the missing one
 * defaults to `null`, which asks the next synchronization to backfill from the challenge
 * start. No baseline is recaptured and no reinitialization is required.
 */
export const CHALLENGE_STATE_SCHEMA_VERSION = 4;

/** Registry entry written when a participant baseline is captured. */
export interface ChallengeParticipantEntry {
  readonly participantId: string;
  readonly puuid: string;
  readonly initializedAt: IsoDateTime;
}

/**
 * Root aggregate of the challenge. Volatile per participant data lives in
 * `ParticipantState`; this document only keeps global flags and the initialized roster.
 */
export interface ChallengeState {
  readonly schemaVersion: number;
  readonly challengeId: string;
  readonly initialized: boolean;
  readonly initializedAt: IsoDateTime | null;
  readonly lastGlobalSyncAt: IsoDateTime | null;
  readonly lastSuccessfulGlobalSyncAt: IsoDateTime | null;
  readonly synchronizationInProgress: boolean;
  readonly participants: readonly ChallengeParticipantEntry[];
}

export function createEmptyChallengeState(challengeId: string): ChallengeState {
  return {
    schemaVersion: CHALLENGE_STATE_SCHEMA_VERSION,
    challengeId,
    initialized: false,
    initializedAt: null,
    lastGlobalSyncAt: null,
    lastSuccessfulGlobalSyncAt: null,
    synchronizationInProgress: false,
    participants: [],
  };
}

function isParticipantRegistered(state: ChallengeState, participantId: string): boolean {
  return state.participants.some((entry) => entry.participantId === participantId);
}

export function withRegisteredParticipant(
  state: ChallengeState,
  entry: ChallengeParticipantEntry,
): ChallengeState {
  if (isParticipantRegistered(state, entry.participantId)) {
    return state;
  }

  return { ...state, participants: [...state.participants, entry] };
}
