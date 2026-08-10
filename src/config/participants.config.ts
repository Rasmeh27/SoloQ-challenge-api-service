import { registerAs } from '@nestjs/config';

import type { RiotPlatform } from './routing.config';

export const PARTICIPANTS_CONFIG_NAMESPACE = 'participants';

/**
 * Participants are parameterised here on purpose: this phase has no public CRUD and
 * no dynamic registration. Changing the roster means editing this file and restarting.
 *
 * Rules enforced at boot by `ParticipantRegistry`:
 *  - `id` must be unique and stable (it is the public API identifier).
 *  - `gameName` + `tagLine` must be unique.
 *
 * Never store the Riot API key here.
 */
export interface ParticipantDefinition {
  readonly id: string;
  readonly gameName: string;
  readonly tagLine: string;
  readonly platform: RiotPlatform;
  readonly enabled: boolean;
}

export const PARTICIPANTS: readonly ParticipantDefinition[] = [
  {
    id: 'ketisito',
    gameName: 'ketisito',
    tagLine: '5475',
    platform: 'LA1',
    enabled: true,
  },
  {
    id: 'me-voy-alas1030-0088',
    gameName: 'Me voy alas1030',
    tagLine: '0088',
    platform: 'LA1',
    enabled: true,
  },
  {
    id: 'DIOS-BATIDAS',
    gameName: 'DIOS BATIDAS',
    tagLine: 'HKB',
    platform: 'LA1',
    enabled: true,
  },
  {
    id: 'lil-thorfinn',
    gameName: 'lil thorfinn',
    tagLine: 'LOWK',
    platform: 'LA1',
    enabled: true,
  },
  {
    id: 'ElPolaOtp',
    gameName: 'ElPolaOtp ',
    tagLine: '1203',
    platform: 'LA1',
    enabled: true,
  },
  {
    id: 'Ylevennaseb',
    gameName: 'Ylevennaseb',
    tagLine: '5742',
    platform: 'LA1',
    enabled: true,
  },
  {
    id: 'EddavivHaedger',
    gameName: 'EddavivHaedger',
    tagLine: '6745',
    platform: 'LA1',
    enabled: true,
  },
];

export interface ParticipantsConfiguration {
  readonly definitions: readonly ParticipantDefinition[];
}

export const participantsConfig = registerAs(
  PARTICIPANTS_CONFIG_NAMESPACE,
  (): ParticipantsConfiguration => ({ definitions: PARTICIPANTS }),
);
