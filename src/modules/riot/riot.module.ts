import { Module } from '@nestjs/common';

import { RIOT_API_CLIENT } from './domain/riot-api.client';
import { RiotRequestMeter } from './domain/riot-request.meter';
import { HttpRiotApiClient } from './infrastructure/http-riot-api.client';
import { type FetchFunction, HTTP_FETCH, RiotHttpClient } from './infrastructure/riot-http.client';
import { RoutingResolver } from './infrastructure/routing.resolver';

/**
 * Isolated Riot Games integration. Only this module knows about Riot URLs, headers and
 * payloads; the rest of the application depends on the `RiotApiClient` port.
 */
@Module({
  providers: [
    RoutingResolver,
    RiotRequestMeter,
    RiotHttpClient,
    {
      provide: HTTP_FETCH,
      // Native fetch (undici) is used instead of an extra HTTP dependency.
      useFactory: (): FetchFunction => (url, init) => fetch(url, init),
    },
    { provide: RIOT_API_CLIENT, useClass: HttpRiotApiClient },
  ],
  exports: [RIOT_API_CLIENT, RoutingResolver, RiotRequestMeter],
})
export class RiotModule {}
