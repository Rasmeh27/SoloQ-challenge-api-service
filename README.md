# SoloQ Challenge — Backend

Backend NestJS del reto competitivo **SoloQ Challenge**: administra un evento de ascenso en
**Ranked Solo/Duo** (queue `420`) de League of Legends entre participantes invitados.

Expone la información que consume el frontend (Next.js, repositorio aparte): landing pública,
resumen del reto, leaderboard, perfiles, historial de partidas, estadísticas del evento,
progreso visible de rango, sincronización administrativa y estado de las integraciones.

El frontend **nunca** consume la API de Riot directamente: solo habla con este backend.

---

## Índice

- [Arquitectura](#arquitectura)
- [Requisitos](#requisitos)
- [Instalación](#instalación)
- [Variables de entorno](#variables-de-entorno)
- [Configuración del reto](#configuración-del-reto)
- [Configuración de participantes](#configuración-de-participantes)
- [Inicialización del reto](#inicialización-del-reto)
- [Sincronización](#sincronización)
- [Endpoints principales](#endpoints-principales)
- [Swagger](#swagger)
- [Pruebas](#pruebas)
- [Build y ejecución en producción](#build-y-ejecución-en-producción)
- [Docker](#docker)
- [Almacenamiento JSON](#almacenamiento-json)
- [Limitaciones de la persistencia local](#limitaciones-de-la-persistencia-local)
- [Migración a base de datos](#migración-a-base-de-datos)
- [progressUnits: qué es y qué no es](#progressunits-qué-es-y-qué-no-es)
- [Seguridad](#seguridad)
- [Aviso legal (Riot Games)](#aviso-legal-riot-games)

---

## Arquitectura

Monolito modular NestJS con separación por responsabilidades reales (dominio, aplicación,
infraestructura, presentación). Sin base de datos: el estado de runtime se guarda en archivos
JSON locales detrás de un puerto de repositorio.

```
src/
├── main.ts                     Arranque HTTP
├── bootstrap.ts                Helmet, CORS, prefijo, versionado, body limit, Swagger
├── app.module.ts               Composición + ValidationPipe/Filter/Interceptor/Throttler globales
├── config/
│   ├── environment.schema.ts   Esquema Zod de variables de entorno
│   ├── environment.config.ts   Configuración tipada de entorno
│   ├── challenge.config.ts     Configuración tipada del reto (validada al arrancar)
│   ├── participants.config.ts  Riot ID de los participantes
│   ├── routing.config.ts       Mapa plataforma → routing regional y hosts de Riot
│   └── riot.constants.ts       queueId 420, RANKED_SOLO_5x5, header de la API key
├── common/                     Errores de dominio, filtro global, guard admin, caché,
│                               request-id, sanitización de logs, mutex, semáforo, clock
└── modules/                    (las reglas de dominio sin dependencias son funciones puras
                                exportadas, no providers: no hay clases-envoltorio)
    ├── health/                 GET /health (sin llamadas a Riot)
    ├── riot/                   Integración aislada con Riot (routing, HTTP, mapeo, errores)
    ├── storage/                Adaptador JSON del puerto de persistencia
    ├── challenge/              Dominio del reto (rango, progreso, estado) + resumen + init
    ├── matches/                Dominio de partidas (estadísticas, elegibilidad, dedupe)
    ├── participants/           Registro, lecturas públicas y validación de cuentas
    ├── leaderboard/            Orden, desempates y paginación
    └── synchronization/        Orquestador, sincronizador por participante y scheduler
```

Puertos e inyección de dependencias (todo reemplazable y testeable):

| Puerto                       | Token                        | Implementación             |
| ---------------------------- | ---------------------------- | -------------------------- |
| `ChallengeStateRepository`   | `CHALLENGE_STATE_REPOSITORY` | `JsonChallengeStateRepository` |
| `RiotApiClient`              | `RIOT_API_CLIENT`            | `HttpRiotApiClient`        |
| `Clock`                      | `CLOCK`                      | `SystemClock`              |
| `Sleeper`                    | `SLEEPER`                    | `SystemSleeper`            |
| `FetchFunction`              | `HTTP_FETCH`                 | `fetch` nativo (undici)    |

Decisiones relevantes:

- **Sin base de datos ni Redis.** Nada de Prisma, TypeORM, Sequelize, Mongoose, PostgreSQL,
  MySQL, SQLite, Redis, Firebase o Supabase.
- **`fetch` nativo** en lugar de Axios: menos dependencias y timeout con `AbortSignal.timeout`.
- **Zod** para validar variables de entorno, la configuración del reto y **todo documento JSON
  leído de disco**.
- La lógica de negocio no toca `fs`: solo `JsonFileStore` (infraestructura) lo hace.
- Los controladores no contienen lógica de negocio ni llaman a Riot.

---

## Requisitos

- **Node.js 24 LTS** ("Krypton"). Es la única línea soportada: `package.json` declara
  `"node": ">=24.0.0 <25.0.0"` y `.npmrc` activa `engine-strict=true`, así que instalar bajo
  otra major **falla** en lugar de producir un build no verificado. La versión exacta usada
  para validar este repositorio está fijada en `.nvmrc` y `.node-version` (**24.19.0**).
- **npm >= 11** (el proyecto usa `package-lock.json`; no hay lockfile de pnpm ni de yarn).
- Una **API key de Riot** ([developer.riotgames.com](https://developer.riotgames.com)). Las keys
  de desarrollo caducan cada 24 h.
- Un directorio con escritura persistente para el estado JSON.

```bash
nvm use
```

> Node 25 **no** está soportado para producción. Si necesitas evaluar otra versión, cambia
> `engines` y vuelve a ejecutar toda la validación: no asumas compatibilidad sin verificarla.

---

## Instalación

```bash
npm install
```

```bash
cp .env.example .env
```

Rellena `RIOT_API_KEY` y `ADMIN_INTERNAL_API_KEY` en `.env`. Para generar una clave
administrativa:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Desarrollo con recarga:

```bash
npm run start:dev
```

La API queda en `http://localhost:3001/api/v1` y Swagger en `http://localhost:3001/docs`.

---

## Variables de entorno

| Variable                        | Requerida            | Por defecto             | Descripción                                                                 |
| ------------------------------- | -------------------- | ----------------------- | --------------------------------------------------------------------------- |
| `NODE_ENV`                      | no                   | `development`           | `development` \| `test` \| `production`.                                    |
| `PORT`                          | no                   | `3001`                  | Puerto HTTP.                                                                |
| `LOG_LEVEL`                     | no                   | `log`                   | `error` \| `warn` \| `log` \| `debug` \| `verbose`.                          |
| `RIOT_API_KEY`                  | para sincronizar     | —                       | API key de Riot. Solo viaja en el header `X-Riot-Token`.                     |
| `RIOT_REQUEST_TIMEOUT_MS`       | no                   | `8000`                  | Timeout por petición a Riot (1000–60000).                                    |
| `RIOT_MAX_CONCURRENCY`          | no                   | `4`                     | Máximo de peticiones concurrentes a Riot (global).                          |
| `RIOT_MAX_RETRIES`              | no                   | `3`                     | Reintentos ante 429/5xx/timeout (0–5).                                       |
| `RIOT_GAME_NAME`                | solo smoke test      | —                       | Riot ID a resolver en `npm run riot:smoke-test`.                             |
| `RIOT_TAG_LINE`                 | solo smoke test      | —                       | Tag del Riot ID para el smoke test.                                          |
| `RIOT_PLATFORM`                 | solo smoke test      | —                       | Plataforma del smoke test (`LA1`, `NA1`, …).                                 |
| `ADMIN_INTERNAL_API_KEY`        | **sí en producción** | —                       | Clave de los endpoints `/admin`, header `x-internal-api-key`. Mínimo 24 caracteres. |
| `STORAGE_DRIVER`                | no                   | `filesystem`            | `filesystem` para desarrollo/Docker o `vercel-blob` para Vercel.            |
| `CHALLENGE_DATA_DIR`            | no                   | `./data`                | Directorio del estado JSON. Debe ser persistente.                           |
| `BLOB_READ_WRITE_TOKEN`         | con `vercel-blob`    | —                       | Token de un Blob Store **privado** conectado al proyecto de backend.        |
| `CRON_SECRET`                   | para Vercel Cron     | —                       | Secreto de 16+ caracteres para la ejecución programada.                    |
| `PUBLIC_CACHE_TTL_SECONDS`      | no                   | `30`                    | TTL de las lecturas agregadas. `0` desactiva la caché.                      |
| `CORS_ORIGINS`                  | no                   | `http://localhost:3000` | Lista separada por comas. `*` permite cualquier origen.                     |
| `PUBLIC_RATE_LIMIT`             | no                   | `120`                   | Peticiones permitidas por ventana.                                          |
| `PUBLIC_RATE_LIMIT_TTL_SECONDS` | no                   | `60`                    | Ventana del rate limit.                                                     |
| `REQUEST_BODY_LIMIT`            | no                   | `64kb`                  | Límite de payload.                                                          |
| `SYNC_ENABLED`                  | no                   | `true`                  | Activa la sincronización programada.                                        |
| `SWAGGER_ENABLED`               | no                   | `true`                  | Publica `/docs`.                                                            |

La validación es estricta y **falla al arrancar** si algo es inválido, indicando la variable
concreta. Si falta `ADMIN_INTERNAL_API_KEY`, los endpoints administrativos quedan
deshabilitados (responden `503`, nunca abiertos).

> `RIOT_API_KEY` **jamás** debe llegar al frontend ni definirse como `NEXT_PUBLIC_*`.
> Tampoco aparece en logs, respuestas, excepciones ni Swagger.

---

## Configuración del reto

Archivo tipado [`src/config/challenge.config.ts`](src/config/challenge.config.ts), validado al
arrancar (fechas ISO 8601 en UTC, `endAt > startAt`, coherencia plataforma/routing, desempates
sin duplicados):

```ts
export const CHALLENGE: ChallengeConfiguration = {
  id: 'soloq-challenge-2026',
  name: 'SoloQ Challenge',
  seasonLabel: 'Temporada 2026',
  description: '...',
  startAt: '2026-08-01T00:00:00.000Z',
  endAt: '2026-10-31T23:59:59.999Z',
  queueId: 420,
  syncIntervalMinutes: 5,
  syncOverlapMinutes: 30,
  accountRefreshTtlHours: 24,   // presupuesto Riot: Account-V1 no se consulta cada ciclo
  profileRefreshTtlHours: 6,    // presupuesto Riot: Summoner-V4 no se consulta cada ciclo
  lateBaselineGraceHours: 24,   // margen para capturar la línea base tras startAt
  defaultPlatform: 'LA1',
  defaultRegionalRoute: 'AMERICAS',
  minimumMatchDurationSeconds: null,
  leaderboardTieBreakers: [...],
  legalDisclaimer: '...',
};
```

El **estado del reto se deriva**, nunca se persiste, así que no puede contradecir las fechas:

| Estado      | Condición                                     |
| ----------- | --------------------------------------------- |
| `DRAFT`     | No inicializado.                              |
| `SCHEDULED` | Inicializado y `now < startAt`.                |
| `ACTIVE`    | `startAt <= now <= endAt`.                     |
| `FINISHED`  | `now > endAt`.                                 |

`minimumMatchDurationSeconds` es opcional: con `null` (por defecto) **no se descartan remakes
ni renders**; las partidas se guardan siempre con sus indicadores
(`gameEndedInEarlySurrender`, `gameEndedInSurrender`) para que las reglas puedan evolucionar
sin volver a descargar el historial. Si se configura, esas partidas dejan de contar **solo**
para las estadísticas.

---

## Configuración de participantes

Archivo tipado [`src/config/participants.config.ts`](src/config/participants.config.ts):

```ts
export const PARTICIPANTS: readonly ParticipantDefinition[] = [
  { id: 'example-player', gameName: 'ExamplePlayer', tagLine: 'LAN', platform: 'LA1', enabled: true },
];
```

Reglas:

- `id` único y estable: es el identificador público de la API y el nombre del archivo JSON.
- `gameName` + `tagLine` único. Los duplicados **fallan al arrancar**.
- No hay CRUD público ni registro dinámico: los cambios se hacen editando el archivo y
  reiniciando.
- Un participante añadido **después** de inicializar el reto queda en
  `PENDING_INITIALIZATION`: no se captura una línea base nueva de forma silenciosa. Vuelve a
  ejecutar la inicialización para capturarla.
- Un participante con `enabled: false` **conserva su historial** y sigue accesible en
  `GET /participants/:id`, pero queda fuera del leaderboard y de la sincronización.

Antes de añadir a alguien puedes validar su Riot ID sin tocar la configuración:

```bash
curl -X POST http://localhost:3001/api/v1/admin/participants/validate -H "x-internal-api-key: $ADMIN_INTERNAL_API_KEY" -H "Content-Type: application/json" -d "{\"gameName\":\"PlayerOne\",\"tagLine\":\"LAN\",\"platform\":\"LA1\"}"
```

---

## Inicialización del reto

Captura la **línea base** (`baselineRank`) de cada participante habilitado, una sola vez.

```bash
curl -X POST http://localhost:3001/api/v1/admin/challenge/initialize -H "x-internal-api-key: $ADMIN_INTERNAL_API_KEY"
```

O por línea de comandos (requiere `npm run build` previo):

```bash
npm run challenge:initialize
```

Comportamiento:

1. Valida que el reto no esté inicializado (si lo está: **409 Conflict**).
2. Resuelve Riot ID → PUUID (Account-V1), perfil (Summoner-V4) y rango actual (League-V4).
3. Guarda `baselineRank`, `currentRank`, `highestObservedRank` y el primer snapshot.
4. Marca el reto como inicializado **solo si todos los participantes habilitados lo lograron**.
5. Devuelve un reporte por participante (`INITIALIZED`, `ALREADY_INITIALIZED`, `FAILED` con
   código de error).

Es **idempotente**: una segunda ejecución nunca reemplaza líneas base ya capturadas; solo
resuelve las que faltan. No existe un parámetro `force` público. `UNRANKED` es una línea base
válida y no aborta el proceso.

### Cobertura de la línea base (no hay reconstrucción retroactiva)

El progreso se mide **desde la captura efectiva de la línea base**, nunca desde `startAt`.
La respuesta lo expone explícitamente:

- `challengeStartAt`: la fecha configurada de inicio.
- `baselineCoverageStartAt`: el instante desde el que el progreso es medible (`initializedAt`).
- Por participante, `baselineRank.capturedAt` y `baselineCoverageStartAt` en su perfil.

Todo lo jugado entre `startAt` y la captura es **invisible** para el reto y **no se puede
reconstruir**: Riot no expone el rango histórico y este backend no lo infiere desde Match-V5.

Por eso, si el reto empezó hace más de `lateBaselineGraceHours` (24 h por defecto), la
inicialización responde **409 `CHALLENGE_LATE_BASELINE_CAPTURE`** y exige reconocimiento
explícito:

```bash
curl -X POST http://localhost:3001/api/v1/admin/challenge/initialize -H "x-internal-api-key: $ADMIN_INTERNAL_API_KEY" -H "Content-Type: application/json" -d "{\"acknowledgeLateBaseline\":true}"
```

Desde CLI, el equivalente es `ACKNOWLEDGE_LATE_BASELINE=true npm run challenge:initialize`.
Este reconocimiento **no** sobrescribe líneas base existentes: la inicialización sigue siendo
idempotente y sigue devolviendo 409 si el reto ya está inicializado.

---

## Sincronización

Manual:

```bash
curl -X POST http://localhost:3001/api/v1/admin/synchronization/run -H "x-internal-api-key: $ADMIN_INTERNAL_API_KEY"
```

```bash
curl -X POST http://localhost:3001/api/v1/admin/synchronization/participants/example-player -H "x-internal-api-key: $ADMIN_INTERNAL_API_KEY"
```

Desde la línea de comandos (requiere `npm run build`):

```bash
npm run challenge:sync
```

Automática en procesos persistentes: cada `challenge.syncIntervalMinutes` minutos vía
`@nestjs/schedule` (desactívala con `SYNC_ENABLED=false`). En Vercel se usa Vercel Cron y el
endpoint protegido `GET /api/v1/cron/synchronization`; no se debe usar el temporizador interno.

Cada ejecución, por participante y con concurrencia limitada:

1. Refresca el Riot ID desde el PUUID (los Riot ID se pueden renombrar).
2. Consulta perfil y rango Ranked Solo actual.
3. Pide los `matchId` nuevos del período, con una ventana de solapamiento
   (`syncOverlapMinutes`) y paginación completa.
4. Descarga **solo** las partidas no procesadas y deduplica por `matchId`.
5. Recalcula estadísticas, actualiza `highestObservedRank` y crea snapshots si procede.
6. Persiste el estado e invalida la caché de lectura.

### Presupuesto de llamadas a Riot

Por ciclo y participante solo se consultan **dos** endpoints: rango actual (League-V4) e IDs
de partidas (Match-V5). Lo demás está acotado:

| Llamada           | Cuándo se hace                                                     |
| ----------------- | ------------------------------------------------------------------ |
| League-V4 (rango) | Cada ciclo.                                                        |
| Match-V5 `/ids`   | Cada ciclo, con ventana acotada y paginación.                      |
| Match-V5 detalle  | Solo para `matchId` nunca procesados.                              |
| Account-V1        | Solo si expiró `accountRefreshTtlHours` (24 h por defecto).          |
| Summoner-V4       | Solo si expiró `profileRefreshTtlHours` (6 h por defecto).           |

Además: concurrencia limitada por participante (`RIOT_MAX_CONCURRENCY`) y un semáforo global
en el cliente HTTP, reintentos acotados y respeto del header `Retry-After` en los 429.

Cada respuesta administrativa de sincronización incluye el consumo real, contando también los
reintentos (que sí gastan cuota):

```json
"riotRequests": {
  "total": 14,
  "byOperation": { "league-v4:entries-by-puuid": 2, "match-v5:ids": 2, "match-v5:by-id": 10 }
}
```

Estos contadores son **solo administrativos**: no aparecen en ningún endpoint público.

Garantías:

- Una sola sincronización a la vez: si ya hay una en curso responde **409 Conflict**.
- El fallo de un participante **no aborta** al resto: queda `FAILED` con `lastError` y
  **conserva intactos** su rango y sus partidas anteriores.
- Si Riot no está disponible, los endpoints públicos siguen sirviendo el último estado válido
  y lo marcan como `STALE`.

Estados por participante: `NEVER_SYNCED`, `PENDING`, `SYNCING`, `SUCCESS`, `PARTIAL`,
`FAILED` (persistidos) y `STALE`, `PENDING_INITIALIZATION` (derivados en lectura).

> Un corte abrupto del proceso puede dejar a un participante en `SYNCING` hasta la siguiente
> sincronización; el flag global `synchronizationInProgress` se limpia al arrancar.

---

## Endpoints principales

Versionado por URI, prefijo `/api/v1`.

### Públicos

| Método | Ruta                                     | Descripción                                             |
| ------ | ---------------------------------------- | ------------------------------------------------------- |
| `GET`  | `/api/v1/health`                         | Estado local: storage, configuración, uptime.            |
| `GET`  | `/api/v1/challenge`                      | Resumen, estado derivado, líder, disclaimer legal.       |
| `GET`  | `/api/v1/leaderboard?limit&offset`       | Clasificación (`limit` 1–100, por defecto 50).           |
| `GET`  | `/api/v1/participants`                   | Participantes habilitados.                               |
| `GET`  | `/api/v1/participants/:id`               | Perfil completo.                                         |
| `GET`  | `/api/v1/participants/:id/matches`       | Historial (`page`, `pageSize`, `championName`, `result`). |
| `GET`  | `/api/v1/participants/:id/progression`   | Snapshots en orden cronológico.                          |

Ninguna lectura pública llama a la API de Riot: todas responden desde el estado local.

### Administrativos (header `x-internal-api-key`)

| Método | Ruta                                                    | Descripción                        |
| ------ | ------------------------------------------------------- | ---------------------------------- |
| `POST` | `/api/v1/admin/challenge/initialize`                    | Captura líneas base (idempotente). |
| `POST` | `/api/v1/admin/synchronization/run`                     | Sincronización global.             |
| `POST` | `/api/v1/admin/synchronization/participants/:id`        | Sincroniza un participante.        |

| `GET`  | `/api/v1/admin/synchronization/status`                  | Estado y último reporte.           |
| `POST` | `/api/v1/admin/participants/validate`                   | Valida y resuelve un Riot ID.      |

### Contrato de error

```json
{
  "statusCode": 404,
  "code": "PARTICIPANT_NOT_FOUND",
  "message": "Participant was not found",
  "details": { "participantId": "example-player" },
  "timestamp": "2026-08-06T12:00:00.000Z",
  "path": "/api/v1/participants/example-player",
  "requestId": "6f1c8f36-6c1e-4f2a-9d9f-6a1b2c3d4e5f"
}
```

Nunca devuelve stacks, mensajes internos de `fs`, del cliente HTTP ni cuerpos de error de Riot.

---

## Swagger

Disponible en **`/docs`** (JSON en `/docs-json`). Documenta DTOs, query params, códigos HTTP,
ejemplos, la autenticación administrativa mediante `x-internal-api-key`, el carácter
aproximado de `progressUnits` y la diferencia entre estadísticas oficiales de Riot y
estadísticas calculadas del evento. No muestra ningún valor secreto.

Desactívalo con `SWAGGER_ENABLED=false`.

---

## Pruebas

```bash
npm test
```

```bash
npm run test:cov
```

```bash
npm run test:e2e
```

- **Unitarias** (`src/**/*.spec.ts`): calculadora de progreso (incluye apex, línea base
  `UNRANKED`, progreso negativo), comparación de rangos, estadísticas (KDA con 0 muertes, win
  rate sin partidas, streaks), dedupe por `matchId`, orden y desempates del leaderboard,
  `RoutingResolver`, inicialización idempotente, `InternalApiKeyGuard`, repositorio JSON
  (escrituras atómicas, JSON corrupto, esquema no soportado), orquestador de sincronización
  (fallos parciales, ejecución concurrente), cliente HTTP de Riot (429 con `Retry-After`, 404,
  401/403 sin reintento, timeouts), mappers de Riot, sanitización de logs y validación de
  entorno.
- **E2E** (`test/*.e2e-spec.ts`): health, challenge, leaderboard, participantes, inicialización
  con y sin API key, sincronización, Swagger y persistencia tras reinicio.

Ninguna prueba automatizada usa la API real de Riot ni una API key real: `RiotApiClient` se
inyecta como doble de test (`FakeRiotApiClient`). El umbral de cobertura es exigente en dominio
y políticas y más laxo en código de conexión, que se valida por e2e.

### Prueba real controlada contra Riot

Las pruebas anteriores no demuestran que la integración real funcione. Para eso existe un
script explícito, de **solo lectura**, con presupuesto acotado:

```bash
npm run build && RIOT_API_KEY=... RIOT_GAME_NAME=PlayerOne RIOT_TAG_LINE=LAN RIOT_PLATFORM=LA1 npm run riot:smoke-test
```

En PowerShell:

```bash
$env:RIOT_API_KEY="..."; $env:RIOT_GAME_NAME="PlayerOne"; $env:RIOT_TAG_LINE="LAN"; $env:RIOT_PLATFORM="LA1"; npm run riot:smoke-test
```

Qué hace: resuelve el Riot ID a PUUID (Account-V1), consulta el perfil (Summoner-V4) y el rango
Ranked Solo (League-V4), pide **como máximo 5** match IDs y descarga **como máximo 1** partida,
validando los DTO y mappers reales. Imprime un resumen sanitizado con el PUUID enmascarado.

Qué **no** hace: no toca el estado del reto, no captura líneas base, no escribe en
`CHALLENGE_DATA_DIR` y nunca imprime ni almacena la API key. Termina con código distinto de
cero ante cualquier error (falta de clave, plataforma inválida, Riot ID inexistente, 401/429).

> Lee las variables del entorno del proceso, no de `.env` (no arranca el contenedor Nest para
> no tocar el estado). Expórtalas antes de ejecutarlo.

---

## Build y ejecución en producción

```bash
npm run build
```

```bash
npm run start:prod
```

Otros comandos: `npm run lint`, `npm run lint:fix`, `npm run format`, `npm run format:check`.

---

## Despliegue en Vercel

Vercel reconoce `src/main.ts` como una aplicación NestJS y la despliega como una única función;
no requiere Docker ni un `listen` alternativo. Crea un proyecto de Vercel con **Root Directory**
`backend` y configura Node.js 24.x.

Como el filesystem de una función no persiste, crea y conecta un **Vercel Blob Store privado** al
proyecto antes de desplegar. Define estas variables sólo para Production:

```dotenv
NODE_ENV=production
STORAGE_DRIVER=vercel-blob
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_...
RIOT_API_KEY=RGAPI-...
ADMIN_INTERNAL_API_KEY=<clave aleatoria de 24+ caracteres>
CORS_ORIGINS=https://<tu-frontend>.vercel.app
SYNC_ENABLED=false
SWAGGER_ENABLED=false
CRON_SECRET=<secreto aleatorio de 16+ caracteres>
```

Migra una sola vez el estado existente antes del primer despliegue. Expón temporalmente el token
del Blob Store sólo en tu terminal local, compila y ejecuta:

```bash
npm run build
npm run storage:migrate-to-vercel-blob
```

El script conserva el layout JSON bajo el prefijo del `challenge.id` y puede repetirse de forma
segura: sobrescribe los mismos documentos sin crear duplicados.

[`vercel.json`](vercel.json) programa la sincronización cada cinco minutos y Vercel autentica la
llamada con `Authorization: Bearer <CRON_SECRET>`. Esa frecuencia requiere Vercel Pro; en Hobby
el despliegue sólo admite un cron diario, por lo que debes cambiar la expresión por una diaria o
usar un programador externo que invoque ese mismo endpoint con el secreto.

El cron y las ejecuciones manuales deben evitar solaparse. La aplicación mantiene un indicador
persistido y recupera un lock que quede abandonado después de 15 minutos, pero si necesitas alta
concurrencia o varias réplicas de escritura usa una base de datos con locks distribuidos.

---

## Docker

```bash
docker build -t soloq-challenge-backend .
```

```bash
docker run --rm -p 3001:3001 --env-file .env -v soloq-challenge-data:/app/data soloq-challenge-backend
```

La imagen es multi-stage sobre **node:24-alpine**, corre como usuario **no root** (`node`), usa
`NODE_ENV=production`, no copia `.env` ni archivos de desarrollo, y declara `VOLUME /app/data`.

### Prueba reproducible de persistencia

```bash
npm run docker:persistence-test
```

El script [`scripts/docker-persistence-test.sh`](scripts/docker-persistence-test.sh) construye
la imagen, levanta un contenedor con un volumen nombrado montado en `CHALLENGE_DATA_DIR`,
comprueba que el usuario **no root** puede escribir ahí, escribe estado a través de la API,
**destruye** el contenedor, arranca otro contenedor nuevo sobre el mismo volumen y verifica que
el documento persistido es idéntico. Falla con código distinto de cero en cualquier paso.

Requiere el daemon de Docker en marcha; no necesita API key de Riot, porque solo comprueba el
almacenamiento.

> **Monta un volumen en `/app/data`.** Sin volumen, el estado del reto (líneas base incluidas)
> se pierde al recrear el contenedor y habría que reinicializar.

No se incluye `docker-compose` con base de datos porque el proyecto no usa ninguna.

---

## Almacenamiento JSON

```
data/
├── challenge-state.json          Flags globales y participantes inicializados
├── participants/
│   ├── example-player.json       Cuenta, rangos, partidas y estadísticas
│   └── ...
└── snapshots/
    ├── example-player.json       Historial de snapshots para la gráfica
    └── ...
```

Los archivos generados en runtime están ignorados por Git (solo se versiona `data/.gitkeep`).

Garantías del adaptador:

- **Escrituras atómicas**: archivo temporal + `rename`. Un fallo a mitad de escritura no
  trunca el documento anterior.
- **Serialización por mutex** en memoria: las escrituras nunca se entrelazan.
- **Validación de esquema** con Zod en cada lectura, y `schemaVersion` en cada documento
  (actualmente **2**). Los documentos escritos por la versión 1 se siguen leyendo: el campo
  añadido (`profileRefreshedAt`) queda en `null` y se refresca en la siguiente sincronización.
  Una versión superior a la soportada se rechaza con un error explícito.
- Archivo inexistente → estado `DRAFT` (no es un error). JSON corrupto o esquema inválido →
  error explícito (`STORAGE_CORRUPTED`) **sin sobrescribir el archivo**.
- Partidas deduplicadas por `matchId`, ordenadas de la más reciente a la más antigua,
  timestamps en UTC.
- No se guardan secretos, ni respuestas completas de Riot, ni los datos de los otros nueve
  participantes de cada partida.

---

## Limitaciones de la persistencia local

El almacenamiento JSON está pensado para **desarrollo local y una única instancia**:

- **No es seguro con múltiples réplicas ni con varios procesos concurrentes**: el mutex es de
  proceso, así que dos instancias sobre el mismo directorio pueden pisarse.
- **No es seguro en despliegues serverless con filesystem efímero** (funciones, contenedores
  sin volumen, plataformas con disco de solo lectura): el estado se perdería.
- Requiere un **único proceso de sincronización**. Si escalas, ejecuta la sincronización en una
  sola instancia.
- Todo el estado se carga en memoria al leer: dimensionado para decenas de participantes, no
  para miles.

Para producción multi-instancia, migra la persistencia (siguiente sección).

---

## Migración a base de datos

La lógica de negocio depende únicamente del puerto
[`ChallengeStateRepository`](src/modules/challenge/domain/challenge-state.repository.ts) y nunca
de `fs`, rutas ni JSON. Para pasar a PostgreSQL:

1. Implementa `ChallengeStateRepository` con el cliente que prefieras (por ejemplo
   `PostgresChallengeStateRepository`).
2. Cambia el binding en [`storage.module.ts`](src/modules/storage/storage.module.ts):
   `{ provide: CHALLENGE_STATE_REPOSITORY, useClass: PostgresChallengeStateRepository }`.
3. Implementa `runExclusively` con una transacción o un lock de base de datos (en JSON es un
   mutex en memoria).
4. Migra los datos existentes leyendo los JSON con el adaptador actual y escribiéndolos con el
   nuevo.

Ningún caso de uso, calculadora, controlador ni DTO necesita cambios.

---

## progressUnits: qué es y qué no es

Métrica pública del progreso del evento. Etiqueta para el frontend: **“Puntos de progreso”**.

```json
{ "units": 252, "status": "CALCULATED", "label": "Puntos de progreso", "isApproximation": true }
```

Se calcula sobre la **posición visible** del rango:

```
visibleRankScore = tierBase + divisionOffset + leaguePoints        (IRON..DIAMOND)
visibleRankScore = 2800 + leaguePoints                             (MASTER, GRANDMASTER, CHALLENGER)

progressUnits = visibleRankScore(actual) - visibleRankScore(línea base)
```

| Tier     | Base | Tier        | Base   | División | Offset |
| -------- | ---- | ----------- | ------ | -------- | ------ |
| IRON     | 0    | EMERALD     | 2000   | IV       | 0      |
| BRONZE   | 400  | DIAMOND     | 2400   | III      | 100    |
| SILVER   | 800  | MASTER      | 2800   | II       | 200    |
| GOLD     | 1200 | GRANDMASTER | 2800   | I        | 300    |
| PLATINUM | 1600 | CHALLENGER  | 2800   |          |        |

Master, Grandmaster y Challenger comparten base: **no** se introducen saltos artificiales de
miles de puntos entre ellos; el tier apex se conserva aparte para presentación y desempates.

**Qué NO es:**

- No son LP oficiales ganados ni perdidos.
- No es MMR, ELO ni MMR oculto.
- No es una clasificación de habilidad alternativa.
- No se calculan LP por partida ni probabilidades de LP a partir del historial.
- **No es retroactivo**: se mide desde `baselineCoverageStartAt` (la captura efectiva de la
  línea base), no desde `startAt`. Lo jugado antes de esa captura no es medible ni
  reconstruible.

`leaguePoints` es únicamente el valor visible que devuelve Riot; no representa el MMR.

Puede ser **negativo** y es `null` cuando no se puede calcular. `null` nunca se sustituye por
`0`; el motivo está en `status`:

| `status`                   | Significado                                              |
| -------------------------- | -------------------------------------------------------- |
| `CALCULATED`               | Calculado.                                               |
| `BASELINE_UNRANKED`        | El participante estaba `UNRANKED` en la línea base.       |
| `CURRENTLY_UNRANKED`       | Ahora no tiene entrada de Ranked Solo/Duo.               |
| `BASELINE_NOT_INITIALIZED` | Aún no hay línea base (añadido tras la inicialización).   |

### Estadísticas oficiales vs. calculadas

- `currentRank.wins` / `currentRank.losses` → totales históricos de la cola que reporta Riot
  (League-V4).
- `statistics` / `eventStatistics` → calculadas por este backend desde Match-V5 **solo dentro
  del período del reto**.

Nunca se mezclan. Los promedios se acumulan con precisión completa y el redondeo ocurre solo en
los mappers de respuesta.

---

## Seguridad

- Helmet, CORS configurable, `ValidationPipe` global con `whitelist` y `forbidNonWhitelisted`,
  transformación de tipos en query params, límite de payload y throttling en endpoints
  públicos.
- `InternalApiKeyGuard` en todos los endpoints administrativos, con comparación en tiempo
  constante y **fail closed** si no hay clave configurada.
- `x-request-id` por petición (se acepta el entrante si es seguro, o se genera) y se devuelve en
  la respuesta y en los errores.
- Logs sanitizados: nunca se registran headers sensibles y cualquier patrón `RGAPI-…` se
  redacta.
- Errores consistentes, sin stacks ni detalles internos.

---

## Aviso legal (Riot Games)

SoloQ Challenge no está avalado por Riot Games y no refleja las opiniones ni los puntos de vista
de Riot Games ni de nadie involucrado oficialmente en la producción o gestión de League of
Legends. League of Legends y Riot Games son marcas registradas o marcas comerciales de Riot
Games, Inc. League of Legends © Riot Games, Inc.

El texto exacto que sirve la API está en `challenge.legalDisclaimer` y se expone en
`GET /api/v1/challenge` para que el frontend lo muestre.
