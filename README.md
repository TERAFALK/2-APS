# Vänertekno APS

Webbaserad SaaS för avancerad produktionsplanering (Advanced Planning & Scheduling) för
tillverkningsindustrin. Ersätter manuell Excel-planering med en optimeringsmotor som skapar
finite-capacity-scheman, minimerar förseningar och ställtider och maximerar resursutnyttjande.

Se [ARCHITECTURE.md](ARCHITECTURE.md) för arkitektur och tekniska val.

## Teknik

- **Backend:** Python 3.12 · FastAPI · SQLAlchemy 2 · Alembic
- **Planeringsmotor:** Google OR-Tools CP-SAT (`backend/app/aps/engine.py`)
- **Databas:** PostgreSQL 16 · **Kö/cache:** Redis + Celery
- **Frontend:** React 18 + TypeScript + Vite (egen Gantt-vy)
- **Gateway:** Caddy med automatisk HTTPS (Let's Encrypt, auto-förnyelse)
- **Drift:** Docker Compose

## Snabbstart (produktion)

```bash
cp .env.example .env          # fyll i SITE_ADDRESS, lösenord, JWT_SECRET
docker compose up -d --build
docker compose exec api python -m app.seed   # (valfritt) demodata
```

Logga in med `FIRST_ADMIN_EMAIL` / `FIRST_ADMIN_PASSWORD`.
Migrationer körs automatiskt (`alembic upgrade head`) när API-containern startar.

### Två drift-lägen (TLS)

| Läge | `.env` | Vem sköter certet |
|---|---|---|
| **Kunddrift** | `SITE_ADDRESS=https://aps.kund.se`, `HTTP_PORT=80`, `HTTPS_PORT=443` | Caddy skaffar & förnyar Let's Encrypt automatiskt — inget externt behövs |
| **Labb bakom NPM** | `SITE_ADDRESS=:80` | Din Nginx Proxy Manager terminerar TLS och forwardar till `aps-frontend:80` via nätet `npm_edge` |

### Drift bakom NPM (engångssteg på servern)

Frontend ligger bara på interna Docker-nät och kan inte ansluta ut mot internet. NPM når den
via ett eget internt nät, `npm_edge`:

```bash
docker network create --internal npm_edge
docker network connect npm_edge nginx-npm-1     # NPM-containerns namn
```

Lägg också till nätet i NPM:s egen compose-fil, så att kopplingen finns kvar när NPM skapas om:

```yaml
services:
  npm:                       # tjänstens namn i NPM:s compose
    networks: [npm_proxy, npm_edge]
networks:
  npm_proxy: { external: true }
  npm_edge: { external: true }
```

I NPM: Forward Hostname = `aps-frontend`, Port = `80`, Scheme = `http`.

### Låsta beroenden

Bygget använder `frontend/package-lock.json` och `backend/constraints.txt` om de finns, så att även
indirekta beroenden får kända versioner. Skapa dem en gång och checka in dem:

```bash
docker run --rm -v "$PWD/frontend":/app -w /app node:22-alpine npm install --package-lock-only --ignore-scripts
docker compose run --rm --no-deps --entrypoint pip api freeze > backend/constraints.txt
```

### Lokal utveckling

```bash
# backend
cd backend && pip install -r requirements.txt
uvicorn app.main:app --reload           # kräver lokal Postgres + Redis, eller kör bara db/redis via compose

# frontend
cd frontend && npm install && npm run dev   # proxar /api och /ws till :8000
```

## Arbetsflöde

1. Lägg upp grunddata: maskintyper, maskiner, produkter med **routing** (operationssteg).
2. Skapa produktionsorder (produkt, antal, prioritet, leveransdatum).
3. Kör planeringen i **Gantt-vyn** → motorn schemalägger alla operationer på maskiner.
4. Lås enskilda operationer (dubbelklick) för att styra dem manuellt; kör om planeringen.
5. Vid händelser (maskinhaveri, akutorder) triggas om-planering via `POST /api/plan/replan`
   som kör i bakgrunden (Celery) och skapar en ny schemaversion.

## Driftkrav som uppfylls

- Enda exponerade portar: 80/443 via Caddy/NPM. Postgres, Redis, API, worker är interna.
- Inga app-containrar kan ansluta ut mot internet (`internal: true` på alla deras nät).
- App-containrarna är skrivskyddade (`read_only`), kör utan root och med `no-new-privileges`.
- Appen vägrar starta i produktion om hemligheter saknas eller har exempelvärden kvar.
- Automatisk TLS med förnyelse. HSTS + säkerhetsheaders.
- Health checks och `restart: unless-stopped` på alla tjänster.
- Persistent lagring (`db_data`, `redis_data`, `caddy_data`).
- Backup: `docker compose exec db pg_dump -U $POSTGRES_USER $POSTGRES_DB > backup.sql`.

## Tester

```bash
cd backend && python -m pytest        # inkl. test av planeringsmotorn
```

## Roadmap

- **Fas 1 (MVP):** användare/RBAC, grunddata, order, operationer, planeringsmotor, Gantt, dashboard, Docker Compose. ✅
- **Fas 2 (pågår):**
  - ✅ skift-/kalender-constraints (maskiner planeras bara under arbetstid)
  - ✅ underhållsfönster (`POST /api/maintenance`) blockerar maskiner
  - ✅ äkta sekvensberoende ställtider (circuit per maskin i CP-SAT)
  - ✅ om-planering med plan-diff (`GET /api/plan/diff`, vy "Om-planering")
  - ✅ analys: maskinutnyttjande + flaskhalsar (`/api/dashboard/utilization`, `/bottlenecks`)
  - ✅ skapa-formulär för order i frontend
  - kvar: rapport-export, Redis-pub/sub-realtid, integrations-API-spec
- **Fas 3:** ERP (Monitor/SAP/Dynamics/Jeeves), MES, OPC UA/MQTT, AI (förseningsprognos, inlärda operationstider).
```
