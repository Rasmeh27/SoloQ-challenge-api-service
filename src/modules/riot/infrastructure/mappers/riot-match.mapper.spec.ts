import { RiotUnexpectedResponseError } from '../../domain/riot.errors';
import { parseRiotResponse, riotMatchResponseSchema } from '../dto/riot-responses';
import { toProcessedMatch } from './riot-match.mapper';

const PUUID = 'puuid-player-one';
const GAME_START = Date.parse('2026-08-02T18:00:00.000Z');

interface RawParticipant {
  readonly puuid: string;
  readonly [key: string]: unknown;
}

function rawMatch(options: {
  info?: Record<string, unknown>;
  participants?: readonly RawParticipant[];
}): unknown {
  return {
    metadata: { matchId: 'LA1_1', participants: [PUUID, 'puuid-other'] },
    info: {
      gameCreation: GAME_START - 60_000,
      gameStartTimestamp: GAME_START,
      gameEndTimestamp: GAME_START + 1_800_000,
      gameDuration: 1_800,
      gameVersion: '16.15.1',
      queueId: 420,
      participants: options.participants ?? [
        {
          puuid: PUUID,
          win: true,
          championId: 64,
          championName: 'LeeSin',
          teamPosition: 'JUNGLE',
          individualPosition: 'JUNGLE',
          kills: 9,
          deaths: 3,
          assists: 12,
          totalMinionsKilled: 40,
          neutralMinionsKilled: 140,
          visionScore: 28,
          goldEarned: 13_450,
          totalDamageDealtToChampions: 24_310,
          gameEndedInEarlySurrender: false,
          gameEndedInSurrender: false,
        },
        { puuid: 'puuid-other', win: false, championId: 1, kills: 0, deaths: 9, assists: 1 },
      ],
      ...options.info,
    },
  };
}

function parse(raw: unknown): ReturnType<typeof parseRiotResponse<typeof riotMatchResponseSchema>> {
  return parseRiotResponse(riotMatchResponseSchema, raw, 'match-v5:by-id');
}

describe('toProcessedMatch', () => {
  it('maps the requested participant and keeps only the challenge fields', () => {
    const match = toProcessedMatch(parse(rawMatch({})), PUUID);

    expect(match).toEqual({
      matchId: 'LA1_1',
      gameCreation: GAME_START - 60_000,
      gameStartTimestamp: GAME_START,
      gameEndTimestamp: GAME_START + 1_800_000,
      gameDuration: 1_800,
      queueId: 420,
      gameVersion: '16.15.1',
      win: true,
      championId: 64,
      championName: 'LeeSin',
      teamPosition: 'JUNGLE',
      individualPosition: 'JUNGLE',
      kills: 9,
      deaths: 3,
      assists: 12,
      kda: 7,
      totalMinionsKilled: 40,
      neutralMinionsKilled: 140,
      totalCs: 180,
      visionScore: 28,
      goldEarned: 13_450,
      totalDamageDealtToChampions: 24_310,
      gameEndedInEarlySurrender: false,
      gameEndedInSurrender: false,
    });
  });

  it('does not keep any data of the other participants of the match', () => {
    const serialized = JSON.stringify(toProcessedMatch(parse(rawMatch({})), PUUID));

    expect(serialized).not.toContain('puuid-other');
  });

  it('returns null when the PUUID is not part of the match', () => {
    expect(toProcessedMatch(parse(rawMatch({})), 'puuid-unknown')).toBeNull();
  });

  it('derives the duration in seconds from the timestamps', () => {
    const match = toProcessedMatch(
      parse(
        rawMatch({
          info: { gameEndTimestamp: GAME_START + 1_234_000, gameDuration: 999_999 },
        }),
      ),
      PUUID,
    );

    expect(match?.gameDuration).toBe(1_234);
  });

  it('treats a legacy gameDuration in milliseconds as milliseconds', () => {
    const match = toProcessedMatch(
      parse(rawMatch({ info: { gameEndTimestamp: undefined, gameDuration: 1_500_000 } })),
      PUUID,
    );

    expect(match?.gameDuration).toBe(1_500);
    expect(match?.gameEndTimestamp).toBe(GAME_START + 1_500_000);
  });

  it('keeps a plausible gameDuration already expressed in seconds', () => {
    const match = toProcessedMatch(
      parse(rawMatch({ info: { gameEndTimestamp: undefined, gameDuration: 1_500 } })),
      PUUID,
    );

    expect(match?.gameDuration).toBe(1_500);
  });

  it('falls back to gameCreation when the start timestamp is missing', () => {
    const match = toProcessedMatch(
      parse(rawMatch({ info: { gameStartTimestamp: undefined } })),
      PUUID,
    );

    expect(match?.gameStartTimestamp).toBe(GAME_START - 60_000);
  });

  it('defaults the optional participant fields instead of producing undefined', () => {
    const match = toProcessedMatch(
      parse(
        rawMatch({
          participants: [
            { puuid: PUUID, win: false, championId: 5, kills: 1, deaths: 2, assists: 3 },
          ],
        }),
      ),
      PUUID,
    );

    expect(match).toEqual(
      expect.objectContaining({
        championName: '',
        teamPosition: '',
        individualPosition: '',
        totalMinionsKilled: 0,
        neutralMinionsKilled: 0,
        totalCs: 0,
        visionScore: 0,
        goldEarned: 0,
        totalDamageDealtToChampions: 0,
        gameEndedInEarlySurrender: false,
        gameEndedInSurrender: false,
      }),
    );
  });

  it('preserves the remake and surrender flags', () => {
    const match = toProcessedMatch(
      parse(
        rawMatch({
          participants: [
            {
              puuid: PUUID,
              win: false,
              championId: 5,
              kills: 0,
              deaths: 0,
              assists: 0,
              gameEndedInEarlySurrender: true,
              gameEndedInSurrender: true,
            },
          ],
        }),
      ),
      PUUID,
    );

    expect(match?.gameEndedInEarlySurrender).toBe(true);
    expect(match?.gameEndedInSurrender).toBe(true);
  });

  it('rejects a payload that does not look like a Match-V5 response', () => {
    expect(() => parse({ metadata: {}, info: {} })).toThrow(RiotUnexpectedResponseError);
  });
});
