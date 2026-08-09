import { Inject, Injectable } from '@nestjs/common';

import type { RiotPlatform } from '../../../config/routing.config';
import { formatRiotId } from '../../challenge/domain/participant-state';
import type { RankedPosition } from '../../challenge/domain/rank/ranked-position';
import { RIOT_API_CLIENT, type RiotApiClient } from '../../riot/domain/riot-api.client';
import { RoutingResolver } from '../../riot/infrastructure/routing.resolver';
import { ParticipantRegistry } from '../domain/participant.registry';

export interface ValidateParticipantAccountCommand {
  readonly gameName: string;
  readonly tagLine: string;
  readonly platform: RiotPlatform;
}

export interface ValidatedParticipantAccount {
  readonly riotId: string;
  readonly gameName: string;
  readonly tagLine: string;
  readonly platform: RiotPlatform;
  readonly regionalRoute: string;
  readonly puuid: string;
  readonly summonerLevel: number;
  readonly profileIconId: number;
  readonly currentRank: RankedPosition | null;
  /** Whether this Riot ID is already part of `participants.config.ts`. */
  readonly alreadyConfigured: boolean;
  readonly configuredParticipantId: string | null;
}

/**
 * Resolves and validates a Riot ID against Riot Games.
 *
 * Read only: it does not modify `participants.config.ts` and does not register anything.
 * Adding a participant is still a configuration change plus a restart.
 */
@Injectable()
export class ValidateParticipantAccountUseCase {
  constructor(
    @Inject(RIOT_API_CLIENT) private readonly riot: RiotApiClient,
    private readonly routing: RoutingResolver,
    private readonly registry: ParticipantRegistry,
  ) {}

  public async execute(
    command: ValidateParticipantAccountCommand,
  ): Promise<ValidatedParticipantAccount> {
    const account = await this.riot.resolveAccountByRiotId(
      command.gameName,
      command.tagLine,
      command.platform,
    );
    const profile = await this.riot.fetchSummonerProfile(account.puuid, command.platform);
    const currentRank = await this.riot.fetchRankedSoloPosition(account.puuid, command.platform);
    const configured = this.findConfiguredParticipant(account.gameName, account.tagLine);

    return {
      riotId: formatRiotId(account.gameName, account.tagLine),
      gameName: account.gameName,
      tagLine: account.tagLine,
      platform: command.platform,
      regionalRoute: this.routing.regionalRoute(command.platform),
      puuid: account.puuid,
      summonerLevel: profile.summonerLevel,
      profileIconId: profile.profileIconId,
      currentRank,
      alreadyConfigured: configured !== null,
      configuredParticipantId: configured,
    };
  }

  private findConfiguredParticipant(gameName: string, tagLine: string): string | null {
    const riotIdKey = formatRiotId(gameName, tagLine).toLowerCase();
    const match = this.registry
      .all()
      .find(
        (definition) =>
          formatRiotId(definition.gameName, definition.tagLine).toLowerCase() === riotIdKey,
      );

    return match?.id ?? null;
  }
}
