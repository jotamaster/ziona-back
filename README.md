# zionaback

API backend en **NestJS** para la aplicación Ziona: PostgreSQL con **Prisma**, validación de entrada con **class-validator**, y configuración vía variables de entorno.

## Stack

| Pieza        | Uso |
| ------------ | --- |
| NestJS 11    | Framework HTTP, módulos, inyección de dependencias |
| Prisma 7     | ORM y migraciones (`prisma/schema.prisma`, `prisma/migrations/`) |
| PostgreSQL   | Base de datos (driver `pg` + adapter `@prisma/adapter-pg`) |
| class-validator / class-transformer | Validación y transformación del body/query en los DTOs |

Dependencias declaradas en `package.json` que aún no están integradas en módulos propios (p. ej. `cookie-parser`, `google-auth-library`) quedan disponibles para uso futuro.

## Requisitos

- Node.js acorde a la versión del proyecto (ver `package.json` / engines si se añaden).
- PostgreSQL accesible y una URL de conexión válida.

## Configuración

Crea un archivo `.env` en la raíz (no se versiona; ver `.gitignore`) con al menos:

```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DATABASE?schema=public"
JWT_SECRET="cambia-esto-por-un-secreto-largo"
JWT_EXPIRES_IN="7d"
```

Opcional:

```env
PORT=3000
```

`PrismaService` usa `ConfigService.getOrThrow('DATABASE_URL')` al arrancar.
`AuthModule` usa `JWT_SECRET` para firmar/verificar y `JWT_EXPIRES_IN` para expiración del token.

## Arranque

```bash
npm install
npx prisma migrate deploy
# en desarrollo, si aplicas cambios de schema:
# npx prisma migrate dev

npm run start:dev
```

La app escucha en `PORT` o **3000** por defecto (`src/main.ts`).

## Comandos útiles

| Comando | Descripción |
| -------- | ----------- |
| `npm run start:dev` | Desarrollo con recarga |
| `npm run build` | Compila a `dist/` |
| `npm run start:prod` | Ejecuta `node dist/src/main.js` |
| `npm run lint` | ESLint |
| `npm run test` | Tests unitarios (`*.spec.ts` en `src/`) |
| `npm run test:e2e` | Tests e2e (`test/`) |
| `npx prisma studio` | UI para inspeccionar datos |

## Comportamiento global

- **`ConfigModule.forRoot({ isGlobal: true })`**: variables de entorno disponibles en toda la app (`src/app.module.ts`).
- **`ValidationPipe` global** (`src/main.ts`): `whitelist`, `forbidNonWhitelisted`, `transform` — los DTOs definen qué entra y qué se rechaza.

## Estructura del código

```
src/
  app.module.ts       # Raíz: Config, Prisma, Users
  main.ts
  modules/
    prisma/           # PrismaService (conexión + adapter pg)
    auth/             # Intercambio de identidad + JWT propio del backend
    users/            # CRUD parcial de usuarios (ver abajo)
    spaces/           # Spaces: CRUD con membership owner/permiso por pertenencia
    invitations/      # Invitations: flujo pending -> accepted/rejected/cancelled
prisma/
  schema.prisma       # Modelo de datos
  migrations/         # Historial SQL (p. ej. init_shared_homes)
prisma.config.ts      # Config de Prisma (schema, migraciones, DATABASE_URL)
test/                 # e2e (app, users)
```

## API implementada

Base URL: `http://localhost:<PORT>` (por defecto 3000).

| Método | Ruta | Descripción |
| ------ | ---- | ----------- |
| `GET` | `/` | Respuesta de bienvenida del `AppService` (`AppController`) |
| `POST` | `/auth/exchange` | Intercambia identidad autenticada del frontend (Google ya resuelto en Next) por JWT propio del backend. Crea/actualiza usuario interno por `googleSub`/`email`. |
| `GET` | `/auth/me` | Devuelve usuario actual autenticado por `Authorization: Bearer <token>` (sin `x-user-id`). |
| `POST` | `/users` | Crea usuario: body `{ email, name, imageUrl? }`. Responde **201** con el usuario creado. |
| `GET` | `/users/by-public-code/:publicCode` | Busca usuario activo por `publicCode` (definido **antes** de `GET /users/:id` para no confundir segmentos). |
| `GET` | `/users/:id` | Busca por UUID (`ParseUUIDPipe`). |

Errores habituales del módulo usuarios: **409** si el email ya existe; **404** si no hay usuario; validación **400** si el body no cumple el DTO.

Lógica relevante en `UsersService`: normalización de email, generación de `publicCode` con reintentos ante colisión única (Prisma `P2002`), soft-delete considerado en lecturas (`deletedAt: null`).

Para `Spaces`, `Invitations` y `Tasks` (estado actual):
- autenticación real con JWT (`Authorization: Bearer <token>`)
- endpoints protegidos con `JwtAuthGuard`
- el usuario actual se resuelve con `@CurrentUser()` y se usa `currentUser.id` en servicios

### Auth

`POST /auth/exchange` espera:

```json
{
  "email": "user@example.com",
  "name": "User Name",
  "imageUrl": "https://...",
  "googleSub": "google-sub-123"
}
```

Reglas:
- valida DTO (`email`, `name`, `googleSub`, `imageUrl?`)
- busca usuario activo por `googleSub`; si no existe, por `email`
- si no existe, crea usuario con `publicCode` autogenerado
- si existe, actualiza `name`, `imageUrl` y `googleSub`
- emite JWT propio con payload `{ sub: user.id, email: user.email }`

Respuesta:

```json
{
  "accessToken": "<jwt>",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "User Name",
    "imageUrl": "https://...",
    "publicCode": "abc123...",
    "googleSub": "google-sub-123"
  }
}
```

`GET /auth/me`:
- requiere `Authorization: Bearer <jwt>`
- valida token con `JwtAuthGuard`
- retorna el usuario actual desde DB

### Spaces

| Método | Ruta | Reglas principales |
| ------ | ---- | ------------------ |
| `POST` | `/spaces` | Requiere JWT. Crea `Space` y automáticamente un `SpaceMember` con rol `owner` en **transacción**. |
| `GET` | `/spaces` | Requiere JWT. Lista solo espacios donde existe membership activa para el usuario (`Space.deletedAt = null` y `SpaceMember.deletedAt = null`). |
| `GET` | `/spaces/:spaceId` | Requiere JWT. Devuelve detalle solo si el usuario pertenece al espacio (membership activa). |
| `DELETE` | `/spaces/:spaceId` | Requiere JWT. Soft delete: pone `Space.deletedAt` y `deletedByUserId`. Solo el creador del espacio puede eliminar. |

### Invitations

| Método | Ruta | Reglas principales |
| ------ | ---- | ------------------ |
| `POST` | `/spaces/:spaceId/invitations` | Requiere JWT. Crea invitación `pending`. Requiere que el invitador pertenezca activamente al espacio. Busca invitado por `publicCode`. No permite auto-invitación ni invitar a alguien que ya sea miembro activo. No duplica invitaciones `pending` para `spaceId + invitedUserId`. |
| `GET` | `/invitations/received` | Requiere JWT. Lista invitaciones donde `invitedUserId = currentUser.id` (solo `deletedAt: null`) e incluye info mínima de `space` y `invitedBy`. |
| `GET` | `/invitations/sent` | Requiere JWT. Lista invitaciones donde `invitedByUserId = currentUser.id` (solo `deletedAt: null`) e incluye info mínima de `space` y `invitedUser`. |
| `PATCH` | `/invitations/:invitationId/accept` | Requiere JWT. Solo el invitado puede aceptar. Debe existir, no estar soft deleted y estar en `pending`. En **transacción**: cambia a `accepted`, setea `respondedAt` y crea/reactiva membership en `SpaceMember` con rol `member`. Si ya existe membership activa, responde error. |
| `PATCH` | `/invitations/:invitationId/reject` | Requiere JWT. Solo el invitado puede rechazar. Debe estar en `pending`. Cambia a `rejected` y setea `respondedAt`. |
| `PATCH` | `/invitations/:invitationId/cancel` | Requiere JWT. Solo el usuario que envió puede cancelar. Debe estar en `pending`. Cambia a `cancelled` y setea `respondedAt`. |

### Tasks

| Método | Ruta | Reglas principales |
| ------ | ---- | ------------------ |
| `POST` | `/spaces/:spaceId/tasks` | Requiere JWT. Crea tarea en el espacio y permite asignación inicial opcional. |
| `GET` | `/spaces/:spaceId/tasks` | Requiere JWT. Lista tareas activas del espacio con assignees activos. |
| `GET` | `/spaces/:spaceId/tasks/:taskId` | Requiere JWT. Devuelve detalle de tarea activa. |
| `PATCH` | `/spaces/:spaceId/tasks/:taskId` | Requiere JWT. Actualiza campos permitidos de tarea. |
| `PATCH` | `/spaces/:spaceId/tasks/:taskId/complete` | Requiere JWT. Marca tarea como completada. |
| `PATCH` | `/spaces/:spaceId/tasks/:taskId/reopen` | Requiere JWT. Reabre tarea completada. |
| `DELETE` | `/spaces/:spaceId/tasks/:taskId` | Requiere JWT. Soft delete de tarea. |
| `POST` | `/spaces/:spaceId/tasks/:taskId/assignees` | Requiere JWT. Asigna usuarios miembros del espacio a la tarea. |
| `DELETE` | `/spaces/:spaceId/tasks/:taskId/assignees/:userId` | Requiere JWT. Desasigna usuario de la tarea (soft unassign). |
| `GET` | `/spaces/:spaceId/tasks/:taskId/events` | Requiere JWT. Lista historial de eventos de la tarea. |

## Base de datos (modelo)

La migración inicial define un dominio amplio; en esta etapa, **User, Spaces e Invitations** ya están expuestos por HTTP.

- **User**: email y `publicCode` únicos, `googleSub` opcional y único, nombre, imagen opcional, `deletedAt` para borrado lógico.
- **Space**, **SpaceMember**, **Invitation**: espacios compartidos, miembros e invitaciones (roles `SpaceRole`, estados `InvitationStatus`).
- **Task**, **TaskAssignee**, **TaskEvent**: tareas por espacio, asignaciones y auditoría/eventos (`TaskPriority`, `TaskStatus`, `TaskEventType`).

Detalle de campos e índices: `prisma/schema.prisma`.

## Tests

- **Unitarios**: junto al código (`*.spec.ts`), p. ej. `users.service.spec.ts`, `prisma.service.spec.ts`.
- **E2E**: `test/app.e2e-spec.ts`, `test/users.e2e-spec.ts` (supertest contra la app Nest).

## Licencia

`UNLICENSED` (proyecto privado; ver `package.json`).
