import { Inject, Injectable } from '@nestjs/common';

import { ConfigurationValidationError } from '../../../common/exceptions/configuration-validation.error';
import { ParticipantNotFoundError } from '../../../common/exceptions/application.exceptions';
import {
  type ParticipantDefinition,
  participantsConfig,
  type ParticipantsConfiguration,
} from '../../../config/participants.config';
import { formatRiotId } from '../../challenge/domain/participant-state';

const PARTICIPANT_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;

function assertUniqueAndWellFormed(definitions: readonly ParticipantDefinition[]): void {
  const seenIds = new Set<string>();
  const seenRiotIds = new Set<string>();

  for (const definition of definitions) {
    if (!PARTICIPANT_ID_PATTERN.test(definition.id)) {
      throw new ConfigurationValidationError(
        `Invalid participant id "${definition.id}": use letters, digits, hyphens or underscores (max 64 characters).`,
      );
    }

    if (definition.gameName.trim().length === 0 || definition.tagLine.trim().length === 0) {
      throw new ConfigurationValidationError(
        `Participant "${definition.id}" must define a non empty gameName and tagLine.`,
      );
    }

    if (seenIds.has(definition.id)) {
      throw new ConfigurationValidationError(`Duplicated participant id "${definition.id}".`);
    }

    const riotIdKey = formatRiotId(definition.gameName, definition.tagLine).toLowerCase();

    if (seenRiotIds.has(riotIdKey)) {
      throw new ConfigurationValidationError(
        `Duplicated Riot ID "${formatRiotId(definition.gameName, definition.tagLine)}".`,
      );
    }

    seenIds.add(definition.id);
    seenRiotIds.add(riotIdKey);
  }
}

/**
 * In-memory roster built from `participants.config.ts`.
 *
 * Uniqueness of ids and of `gameName#tagLine` is validated while the application boots, so
 * a broken roster fails fast instead of producing ambiguous data. There is no public CRUD
 * and no dynamic registration in this phase.
 */
@Injectable()
export class ParticipantRegistry {
  private readonly definitionsById: ReadonlyMap<string, ParticipantDefinition>;
  private readonly definitions: readonly ParticipantDefinition[];

  constructor(@Inject(participantsConfig.KEY) configuration: ParticipantsConfiguration) {
    assertUniqueAndWellFormed(configuration.definitions);

    this.definitions = [...configuration.definitions];
    this.definitionsById = new Map(
      this.definitions.map((definition) => [definition.id, definition]),
    );
  }

  /** Every configured participant, including disabled ones (history is preserved). */
  public all(): readonly ParticipantDefinition[] {
    return this.definitions;
  }

  /** Participants eligible for synchronization and for the public leaderboard. */
  public enabled(): readonly ParticipantDefinition[] {
    return this.definitions.filter((definition) => definition.enabled);
  }

  public find(participantId: string): ParticipantDefinition | null {
    return this.definitionsById.get(participantId) ?? null;
  }

  public require(participantId: string): ParticipantDefinition {
    const definition = this.find(participantId);

    if (definition === null) {
      throw new ParticipantNotFoundError(participantId);
    }

    return definition;
  }

  public riotIdOf(definition: ParticipantDefinition): string {
    return formatRiotId(definition.gameName, definition.tagLine);
  }
}
