import type { ChallengeState } from '../modules/challenge/domain/challenge-state';
import { createEmptyChallengeState } from '../modules/challenge/domain/challenge-state';
import type { ChallengeStateRepository } from '../modules/challenge/domain/challenge-state.repository';
import type { ParticipantState } from '../modules/challenge/domain/participant-state';

/** In-memory adapter of the persistence port, used to test application logic. */
export class InMemoryChallengeStateRepository implements ChallengeStateRepository {
  public challengeState: ChallengeState;
  public readonly participantStates = new Map<string, ParticipantState>();
  public participantSaveCount = 0;
  public writable = true;

  constructor(challengeId = 'test-challenge') {
    this.challengeState = createEmptyChallengeState(challengeId);
  }

  public loadChallengeState(): Promise<ChallengeState> {
    return Promise.resolve(this.challengeState);
  }

  public saveChallengeState(state: ChallengeState): Promise<void> {
    this.challengeState = state;
    return Promise.resolve();
  }

  public loadParticipantState(participantId: string): Promise<ParticipantState | null> {
    return Promise.resolve(this.participantStates.get(participantId) ?? null);
  }

  public loadAllParticipantStates(): Promise<readonly ParticipantState[]> {
    return Promise.resolve([...this.participantStates.values()]);
  }

  public saveParticipantState(state: ParticipantState): Promise<void> {
    this.participantSaveCount += 1;
    this.participantStates.set(state.participantId, state);
    return Promise.resolve();
  }

  public runExclusively<T>(task: () => Promise<T>): Promise<T> {
    return task();
  }

  public isWritable(): Promise<boolean> {
    return Promise.resolve(this.writable);
  }

  public seedParticipant(state: ParticipantState): void {
    this.participantStates.set(state.participantId, state);
  }
}
