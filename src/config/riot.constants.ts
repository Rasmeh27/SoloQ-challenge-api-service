/**
 * Riot Games constants shared by configuration and the Riot integration.
 * Keeping them here avoids magic numbers spread across services.
 */

/** Ranked Solo/Duo queue identifier used by Match-V5. */
export const RANKED_SOLO_QUEUE_ID = 420;

/** Queue type used by League-V4 entries for Ranked Solo/Duo. */
export const RANKED_SOLO_QUEUE_TYPE = 'RANKED_SOLO_5x5';

/** Header Riot expects the API key in. It must never travel as a query parameter. */
export const RIOT_API_KEY_HEADER = 'X-Riot-Token';

/** Maximum page size accepted by Match-V5 `/ids`. */
export const RIOT_MATCH_IDS_MAX_PAGE_SIZE = 100;
