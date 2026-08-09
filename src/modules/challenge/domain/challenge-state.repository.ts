import type { ChallengeState } from './challenge-state';
import type { ParticipantState } from './participant-state';

export const CHALLENGE_STATE_REPOSITORY = Symbol('ChallengeStateRepository');

/**
 * Persistence port of the challenge.
 *
 * Business logic depends only on this interface: it never touches `fs`, physical paths
 * or JSON files. The current adapter is a local JSON store; replacing it with PostgreSQL
 * means writing another adapter and changing one provider binding.
 */
export interface ChallengeStateRepository {
  /** Returns the stored state, or a fresh DRAFT state when nothing was persisted yet. */
  loadChallengeState(): Promise<ChallengeState>;

  saveChallengeState(state: ChallengeState): Promise<void>;

  /** `null` when the participant has no persisted state (never initialized). */
  loadParticipantState(participantId: string): Promise<ParticipantState | null>;

  loadAllParticipantStates(): Promise<readonly ParticipantState[]>;

  saveParticipantState(state: ParticipantState): Promise<void>;

  /**
   * Runs a read-modify-write sequence with exclusive access, so concurrent callers
   * (scheduled sync, administrative endpoints) cannot interleave.
   */
  runExclusively<T>(task: () => Promise<T>): Promise<T>;

  /** Health probe: whether the storage directory can be written to. */
  isWritable(): Promise<boolean>;
}
