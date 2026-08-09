import { Injectable } from '@nestjs/common';

import {
  isRiotPlatform,
  PLATFORM_ROUTING,
  type PlatformRouting,
  type RiotPlatform,
  type RiotRegionalRoute,
  toBaseUrl,
} from '../../../config/routing.config';
import { UnsupportedPlatformError } from '../domain/riot.errors';

/**
 * Single source of truth for Riot base URLs.
 *
 * Account-V1 and Match-V5 use regional routing; Summoner-V4 and League-V4 use platform
 * routing. No service builds Riot URLs on its own.
 */
@Injectable()
export class RoutingResolver {
  public routingFor(platform: string): PlatformRouting {
    if (!isRiotPlatform(platform)) {
      throw new UnsupportedPlatformError(platform);
    }

    return PLATFORM_ROUTING[platform];
  }

  /** Summoner-V4, League-V4. */
  public platformBaseUrl(platform: RiotPlatform): string {
    return toBaseUrl(this.routingFor(platform).platformHost);
  }

  /** Account-V1, Match-V5. */
  public regionalBaseUrl(platform: RiotPlatform): string {
    return toBaseUrl(this.routingFor(platform).regionalHost);
  }

  public regionalRoute(platform: RiotPlatform): RiotRegionalRoute {
    return this.routingFor(platform).regionalRoute;
  }
}
