# CLAUDE.md — Resacall //

Contexte permanent pour Claude Code. Lis ce fichier en entier avant de toucher au code.

---

## Projet

**Resacall** — SaaS B2B de gestion des appels manqués pour restaurants indépendants.
Workflow core : appel manqué Twilio → WhatsApp automatique → agent Claude IA → réservation → dashboard restaurateur.

**Deux repos :**

- `resacall-api` — backend Node.js (ce repo)
- `resacall-frontend` — frontend Next.js (repo séparé)

---

## Stack

| Couche           | Outil                       | Version           |
| ---------------- | --------------------------- | ----------------- |
| Runtime          | Node.js                     | 20 LTS            |
| Framework        | Fastify                     | 4                 |
| Langage          | TypeScript                  | 5                 |
| Base de données  | MongoDB Atlas               | M0 → Mongoose 8   |
| Queue            | BullMQ                      | 5                 |
| Cache / sessions | Upstash Redis               | serverless        |
| Validation       | Zod                         | 3                 |
| Auth             | JWT maison                  | jsonwebtoken 9    |
| Agent IA         | Anthropic Claude API        | claude-sonnet-4-5 |
| Téléphonie       | Twilio Voice + WhatsApp SDK | Node.js           |
| Emails           | Resend + React Email        | —                 |
| Tests            | Vitest                      | 1                 |
| Lint             | ESLint + Prettier           | —                 |
| Déploiement API  | Railway Starter             | —                 |

---

## Structure de dossiers

```
resacall-api/
├── src/
│   ├── routes/
│   │   ├── webhooks.ts        # POST /webhooks/voice, /missed-call, /whatsapp
│   │   ├── auth.ts            # POST /auth/register|login|refresh|logout|forgot-password|reset-password + GET /auth/me
│   │   ├── restaurants.ts     # GET|PUT /restaurants/:id + settings, availability, exceptions, notifications
│   │   ├── reservations.ts    # GET|POST|PATCH|PUT /restaurants/:id/reservations
│   │   ├── conversations.ts   # GET|POST /restaurants/:id/conversations
│   │   ├── stats.ts           # GET /restaurants/:id/stats/*
│   │   ├── missedCalls.ts     # GET|POST /restaurants/:id/missed-calls
│   │   ├── admin.ts           # GET|PATCH /admin/restaurants (X-Admin-Secret)
│   │   └── utils.ts           # GET /health + GET /restaurants/:id/availability/slots
│   ├── models/
│   │   ├── Restaurant.ts
│   │   ├── MissedCall.ts
│   │   ├── Conversation.ts
│   │   └── Reservation.ts
│   ├── services/
│   │   ├── availability.service.ts   # checkAvailability() + getSlots() — partagé agent + route
│   │   ├── reservation.service.ts    # createReservation() — transaction MongoDB
│   │   ├── whatsapp.service.ts       # envoi WA via Twilio
│   │   ├── email.service.ts          # Resend — ReservationEmail, LargeGroupEmail, CancellationEmail, WelcomeEmail, ResetPasswordEmail
│   │   └── agent.service.ts          # boucle agent Claude + tool use
│   ├── jobs/
│   │   ├── whatsappQueue.ts          # BullMQ Queue + Worker — envoi WA immédiat après appel manqué
│   │   └── agentQueue.ts             # BullMQ Queue + Worker — traitement agent async
│   ├── middleware/
│   │   ├── authenticate.ts           # vérifie Bearer JWT sur routes protégées
│   │   ├── verifyTwilioSignature.ts  # vérifie X-Twilio-Signature — TOUTES les routes /webhooks/twilio/*
│   │   ├── verifyMetaSignature.ts    # vérifie signature Meta — /webhooks/whatsapp
│   │   └── verifyAdminSecret.ts      # vérifie X-Admin-Secret — routes /admin/*
│   ├── utils/
│   │   ├── redis.ts                  # client Upstash Redis partagé
│   │   ├── jwt.ts                    # signAccessToken, signRefreshToken, verifyToken
│   │   └── buildSystemPrompt.ts      # construit le system prompt dynamique par restaurant
│   └── index.ts                      # bootstrap Fastify + MongoDB + BullMQ workers
├── tests/
│   ├── checkAvailability.test.ts
│   └── createReservation.test.ts
├── scripts/
│   └── onboard-restaurant.ts         # npx ts-node — achat numéro Twilio + setup WA
├── CLAUDE.md
├── .env.example
└── package.json
```

---

## Variables d'environnement

Toutes validées par **Zod au démarrage** — le process crash avec un message clair si une variable est manquante.

```bash
# MongoDB
MONGODB_URI=

# Twilio
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_WEBHOOK_BASE_URL=          # URL publique Railway pour les webhooks
WHATSAPP_VERIFY_TOKEN=            # Token de validation handshake Meta (GET /webhooks/whatsapp)

# Anthropic
ANTHROPIC_API_KEY=

# Upstash Redis
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

# Resend
RESEND_API_KEY=
RESEND_FROM_EMAIL=noreply@resacall.com

# Auth
JWT_SECRET=
JWT_REFRESH_SECRET=

# Admin
ADMIN_SECRET=                      # Header X-Admin-Secret pour les routes /admin/*

# App
NODE_ENV=development
PORT=3000
APP_URL=https://app.resacall.com   # Pour les liens dans les emails
```

---

## Modèles MongoDB

### 4 collections — règles absolues

**`restaurants`** — document pivot. Tout pointe vers lui.

- `phone_number` : index UNIQUE — lookup à chaque webhook Twilio
- `users[]` embedded (pas de collection séparée) — email pour Resend, `password_hash` bcrypt, `notifications.email_enabled`
- `settings` embedded — agent, seuils, messages (pas de delay_minutes — envoi WA toujours immédiat)
- `availability[]` embedded — services midi/soir avec horaires, max_covers, slot_duration, booking_deadline
- `exceptions[]` embedded — fermetures [{date, closed, reason}]
- Ne jamais retourner `password_hash` dans les réponses API

**`missed_calls`** — déclencheur du workflow

- `twilio_call_sid` : index UNIQUE — évite doublon si Twilio renvoie le webhook 2x
- Index compound `{ restaurant_id, caller_number, called_at: -1 }` — déduplication 24h
- Cycle statuts : `pending` → `sent` → `converted` | `ignored`

**`conversations`** — mémoire de l'agent

- Index `{ customer_phone, status }` — **index le plus critique** — détermine la latence de l'agent
- Index TTL `{ expires_at: 1 }` avec `expireAfterSeconds: 0` — abandon automatique après 48h, zéro cron
- `messages[]` au **format natif Claude API** — passé directement sans transformation
- `agent_log[]` — `{ step, tool_name?, input?, output?, error?, ts }` — log de chaque étape de la boucle agent, indispensable pour déboguer les états incohérents en prod
- `extracted` — infos collectées par l'agent (customer_name, party_size, preferred_date, special_request)
- Statuts : `active` | `completed` | `abandoned` | `taken_over`

**`reservations`** — source de vérité planning

- Index compound `{ restaurant_id, date_time }` — requête principale du dashboard
- `confirmation_sent_at` — évite d'envoyer 2 WA de confirmation si le job rejoue après crash
- `source: 'ai' | 'manual'` — stat clé dashboard
- Statuts : `pending` | `pending_review` | `confirmed` | `cancelled` | `no_show`
- `check_availability` filtre `status $in ['pending', 'confirmed']` — cancelled et no_show libèrent les places automatiquement

### Index MongoDB — à créer au démarrage

```typescript
// src/index.ts — avant d'ouvrir le serveur
await db.restaurants.createIndex({ phone_number: 1 }, { unique: true });
await db.missed_calls.createIndex({ twilio_call_sid: 1 }, { unique: true });
await db.missed_calls.createIndex({
  restaurant_id: 1,
  caller_number: 1,
  called_at: -1,
});
await db.conversations.createIndex({ customer_phone: 1, status: 1 }); // CRITIQUE
await db.conversations.createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 });
await db.reservations.createIndex({ restaurant_id: 1, date_time: 1 });
```

---

## Clés Redis (Upstash)

| Clé                                  | Valeur                      | TTL         | Usage                                       |
| ------------------------------------ | --------------------------- | ----------- | ------------------------------------------- |
| `refresh:blacklist:{token}`          | `1`                         | 7 jours     | Blacklist refresh tokens après logout/reset |
| `reset:{uuid}`                       | `{restaurant_id}:{user_id}` | 1 heure     | Token reset password — usage unique         |
| `stats:overview:{resto_id}:{period}` | JSON                        | 5 minutes   | Cache métriques dashboard                   |
| `slots:{resto_id}:{date}:{service}`  | JSON                        | 30 secondes | Cache créneaux disponibles                  |

---

## Auth JWT

- **Access token** : 15 min, signé `JWT_SECRET`, envoyé dans header `Authorization: Bearer`
- **Refresh token** : 7 jours, signé `JWT_REFRESH_SECRET`, httpOnly cookie `refresh_token`
- **Rotation** : chaque `/auth/refresh` invalide l'ancien refresh token (blacklist Redis)
- **Reset password** : invalide TOUS les refresh tokens actifs du user après reset
- `password_hash` : bcrypt `saltRounds: 10` — jamais retourné dans les réponses
- Anti-énumération : `/auth/forgot-password` et `/auth/login` retournent le même message d'erreur, qu'un email existe ou non

---

## Sécurité webhooks — règles non négociables

```typescript
// TOUJOURS vérifier la signature avant tout traitement
// Routes Twilio : POST /webhooks/voice, /webhooks/missed-call
middleware: verifyTwilioSignature; // twilio.validateRequest() — 403 si invalide

// Route Meta : POST /webhooks/whatsapp
middleware: verifyMetaSignature; // X-Twilio-Signature Meta — 403 si invalide

// Routes admin
middleware: verifyAdminSecret; // header X-Admin-Secret — 403 si invalide
```

Les webhooks doivent répondre **200 en moins de 5 secondes**. Tout traitement lourd (agent IA, envoi WA) passe par BullMQ en **async**.

---

## Agent IA — boucle Claude

```typescript
// Pattern de base — src/services/agent.service.ts
const tools = [check_availability, create_reservation, cancel_reservation];

let messages = conversation.messages; // format natif MongoDB → Claude API direct

while (true) {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 1024,
    system: buildSystemPrompt(restaurant, conversation.detected_language),
    tools,
    messages,
  });

  // Sauvegarder chaque tour en base
  await Conversation.updateOne({ _id }, { $push: { messages: { $each: newMessages } } });

  if (response.stop_reason !== 'tool_use') break;

  // Traiter les tool_use et construire les tool_result
  const toolResults = await processToolUse(response.content, restaurant);
  messages = [
    ...messages,
    { role: 'assistant', content: response.content },
    { role: 'user', content: toolResults },
  ];
}

// Envoyer la réponse finale au client via Twilio WA
await whatsappService.send(restaurant.whatsapp_number, conversation.customer_phone, finalText);
```

### System prompt dynamique

```typescript
// src/utils/buildSystemPrompt.ts
// Injecter OBLIGATOIREMENT :
// - Nom du restaurant, timezone, langue détectée
// - Services disponibles (horaires, max_covers, booking_deadline)
// - Date du jour en clair (pour résoudre "demain", "vendredi")
// - agent_instructions si non null (max 500 chars)
// - confirmation_message pour la clôture
// - Langue : "Réponds toujours en {detected_language}"
```

### Les 3 tools de l'agent

| Tool                 | Quand                              | Ce qu'il fait                                                                       |
| -------------------- | ---------------------------------- | ----------------------------------------------------------------------------------- |
| `check_availability` | Avant de proposer un créneau       | Aggregate reservations + vérifie exceptions + booking_deadline + large_group        |
| `create_reservation` | Client a confirmé tous les détails | Transaction MongoDB : INSERT reservation + UPDATE conversation + UPDATE missed_call |
| `cancel_reservation` | Client demande une annulation      | Lookup par customer_phone + date, UPDATE status: cancelled                          |

---

## BullMQ — 2 queues

### `whatsapp-outbound`

- **Payload** : `{ restaurant_id, caller_number, missed_call_id }`
- **Delay** : aucun — envoi immédiat après appel manqué
- **Retry** : x3 avec backoff exponentiel `1min / 5min / 15min`
- **Déduplication** : vérifier `MissedCall.findOne({ restaurant_id, caller_number, called_at: { $gte: -24h } })` avant envoi

### `agent-process`

- **Payload** : `{ conversation_id, restaurant_id, customer_message, message_sid }`
- **Pas de delay** — traitement immédiat
- **Retry** : x2 (les erreurs Claude API sont rares)

---

## Services partagés

### `availability.service.ts` — utilisé par l'agent ET la route `/availability/slots`

```typescript
// NE PAS dupliquer la logique — un seul service
export async function checkAvailability(
  restaurantId,
  date,
  serviceId,
  partySize,
): Promise<SlotResult[]>;
export async function getSlots(restaurantId, date, serviceId?, partySize?): Promise<SlotResult[]>;

// Ordre des vérifications :
// 1. exceptions[] — fermeture ce jour ?
// 2. booking_deadline — créneau déjà passé ?
// 3. aggregate reservations { status $in ['pending','confirmed'] } — places prises
// 4. remaining_covers = max_covers - party_size_cumulée
// 5. large_group : party_size > threshold → needs_review: true
// Convertir date demandée en UTC via timezone du restaurant (dayjs-timezone)
```

### `reservation.service.ts` — transaction atomique

```typescript
// Transaction MongoDB obligatoire — les 3 updates en une seule opération
// 1. INSERT reservations (status selon auto_confirm + large_group)
// 2. UPDATE missed_calls { status: 'converted' }
// 3. UPDATE conversations { status: 'completed', extracted }
// Après commit : email Resend async + WA confirmation si auto_confirm=true
// confirmation_sent_at évite le double envoi si le job rejoue
```

---

## Conventions de code

### Validation — Zod partout

```typescript
// Valider TOUTES les entrées externes : webhooks, body requêtes, variables d'env
// Pattern :
const schema = z.object({ ... })
const result = schema.safeParse(request.body)
if (!result.success) return reply.status(400).send({ error: result.error.flatten() })
```

### Gestion d'erreurs

```typescript
// Pas de throw nu — toujours logger avant de répondre
// Webhooks : répondre 200 même en cas d'erreur non critique (Twilio re-tente sinon)
// Erreurs attendues à gérer explicitement :
// - signature Twilio invalide → 403 (ne pas créer de document)
// - restaurant inconnu (numéro non enregistré) → 404, log, pas de crash
// - doublon twilio_call_sid → upsert silencieux, pas d'erreur
// - restaurant suspendu → skip l'envoi sans erreur, log l'événement
// - numéro client invalide ou non WA → log, missed_call reste pending, pas de retry infini
```

### Nommage

```typescript
// Fichiers : kebab-case (whatsapp.service.ts)
// Classes/Types/Interfaces : PascalCase (MissedCall, SlotResult)
// Variables/fonctions : camelCase (checkAvailability, missedCallId)
// Constantes d'env : SCREAMING_SNAKE_CASE
// IDs MongoDB : toujours `ObjectId`, jamais `string` brut dans les requêtes
```

### Async

```typescript
// Toujours async/await — jamais de .then().catch() nu
// Les webhooks répondent 200 AVANT de lancer le traitement async :
reply.send({ success: true }); // réponse immédiate
await agentQueue.add('process', payload); // async après
```

---

## Routes — référence rapide

### Auth publiques (pas de JWT)

| Méthode | Route                   | Notes                                                |
| ------- | ----------------------- | ---------------------------------------------------- |
| POST    | `/auth/register`        | Crée restaurant + user owner, status: onboarding     |
| POST    | `/auth/login`           | Retourne access token + httpOnly cookie refresh      |
| POST    | `/auth/refresh`         | Rotation refresh token                               |
| POST    | `/auth/logout`          | Blacklist refresh token Redis                        |
| POST    | `/auth/forgot-password` | Même réponse 200 si email inconnu                    |
| POST    | `/auth/reset-password`  | Token usage unique, invalide tous les refresh tokens |

### Webhooks (signature vérifiée, pas de JWT)

| Méthode | Route                   | Auth             | Réponse                                                             |
| ------- | ----------------------- | ---------------- | ------------------------------------------------------------------- |
| GET     | `/webhooks/whatsapp`    | Meta signature   | Handshake Meta — répond `hub.challenge`. Requis avant tout test WA. |
| POST    | `/webhooks/voice`       | Twilio signature | TwiML XML < 1s                                                      |
| POST    | `/webhooks/missed-call` | Twilio signature | 200 < 200ms, async BullMQ                                           |
| POST    | `/webhooks/whatsapp`    | Meta signature   | 200 immédiat, async BullMQ                                          |

### Toutes les autres routes nécessitent `Authorization: Bearer <access_token>`

---

## Règles métier critiques

1. **Déduplication WA** : ne jamais envoyer 2 messages WA au même numéro sur le même restaurant dans les 24h
2. **Signature Twilio** : 403 sans créer de document si signature invalide — jamais de traitement partiel
3. **Upsert missed_call** : `findOneAndUpdate({ twilio_call_sid }, ..., { upsert: true })` — idempotent
4. **Webhook répond d'abord** : `reply.send()` AVANT tout appel BullMQ/Claude
5. **check_availability avant create_reservation** : ne jamais créer une résa sans vérifier la dispo
6. **confirmation_sent_at** : vérifier avant d'envoyer le WA de confirmation — évite le doublon si crash/retry
7. **password_hash** : exclure systématiquement des réponses API avec `.select('-password_hash')`
8. **restaurant suspendu** : vérifier `restaurant.status === 'active'` dans le middleware des webhooks WhatsApp
9. **Grand groupe** : `party_size > large_group_threshold` → `status: 'pending_review'` + email immédiat restaurateur
10. **Transaction MongoDB** : INSERT reservation + UPDATE missed_call + UPDATE conversation en une seule opération atomique

---

## Tests

```bash
npm test              # vitest run --reporter=verbose
npm run test:watch    # vitest watch
```

**Fichiers critiques à tester :**

- `tests/checkAvailability.test.ts` — 5 cas : service complet, places dispo, fermeture exception, après booking_deadline, grand groupe
- `tests/createReservation.test.ts` — 4 cas : création complète, pending_review grand groupe, update missed_call, update conversation

**Setup** : `mongodb-memory-server` pour les tests DB — pas de mock Mongoose.

---

## Scripts npm

```bash
npm run dev       # nodemon — hot reload
npm run build     # tsc — compile vers /dist
npm test          # vitest run
npm run lint      # eslint src/
npm run format    # prettier --write src/
```

```bash
# Onboarding restaurant (usage interne équipe)
npx ts-node scripts/onboard-restaurant.ts --name "..." --phone "+33..." --restaurant-id "..."
```

---

## Déploiement Railway

- **Healthcheck** : `GET /health` → `{ status: 'ok', uptime, timestamp }` en < 10ms — **zéro logique métier**
- Railway appelle `/health` toutes les 30s — si pas de réponse → restart automatique
- **Deploy auto** sur push `main`
- **Port** : `process.env.PORT || 3000`
- Les index MongoDB sont créés au démarrage — idempotents (`createIndex` ne recrée pas si déjà existant)

---

## Ce qu'on ne fait PAS dans ce MVP

- Pas de collection `users` séparée — embedded dans `restaurants.users[]`
- Pas de template_sid Twilio pour les messages dans la fenêtre 24h (hors première prise de contact)
- Pas de webhook Voice complexe — TwiML Bin statique suffit pour le MVP
- Pas de CI/CD GitHub Actions — deploy manuel Railway
- Pas de Docker en local — `npm run dev` direct
- Pas de monorepo Turborepo — 2 repos séparés `resacall-api` + `resacall-dashboard`
- Pas de rate limiting sur les routes publiques pour le MVP (à ajouter avant scaling)
