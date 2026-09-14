#!/usr/bin/env bash
# Engångsskript efter incidenten 2026-09-14: härdad driftsättning av APS och byte av
# alla hemligheter (databaslösenord, JWT_SECRET, adminlösenord).
#
# Kör på servern som den användare som kör docker (INTE med sudo):
#   cd ~/2-APS && git pull && bash deploy/harden-deploy.sh
#
# Databasen och dess data behålls. APS är nere medan skriptet bygger om (några minuter).
set -euo pipefail
cd "$(dirname "$0")/.."

say()  { printf '\n\033[1;34m== %s\033[0m\n' "$*"; }
ok()   { printf '\033[1;32mOK:\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33mVARNING:\033[0m %s\n' "$*"; }
fail() { printf '\n\033[1;31mFEL: %s\033[0m\n' "$*" >&2; exit 1; }

env_get() { { grep -E "^$1=" .env || true; } | tail -1 | cut -d= -f2- | tr -d '\r"'"'"; }
env_set() {
  if grep -qE "^$1=" .env; then sed -i "s|^$1=.*|$1=$2|" .env; else echo "$1=$2" >> .env; fi
}

[ -f docker-compose.yml ] && [ -f .env ] || fail "Kör från APS-katalogen (docker-compose.yml och .env måste finnas)"
grep -q npm_edge docker-compose.yml || fail "docker-compose.yml är gammal — kör 'git pull' först"
command -v openssl >/dev/null || fail "openssl saknas (sudo apt install openssl)"
docker info >/dev/null 2>&1 || fail "Kommer inte åt docker — kör som din vanliga användare, inte med sudo"

PGUSER=$(env_get POSTGRES_USER); PGDB=$(env_get POSTGRES_DB)
[ -n "$PGUSER" ] && [ -n "$PGDB" ] || fail "POSTGRES_USER eller POSTGRES_DB saknas i .env"

say "1/7 Säkerhetskopierar .env"
BAK=".env.bak-$(date +%F-%H%M%S)"
cp -p .env "$BAK"; chmod 600 .env "$BAK"
ok "sparad som $BAK (innehåller de GAMLA lösenorden — radera när allt fungerar)"

say "2/7 Internt nät npm_edge för NPM ↔ APS"
docker network inspect npm_edge >/dev/null 2>&1 || docker network create --internal npm_edge >/dev/null
NPM=$(docker ps --format '{{.Names}} {{.Image}}' | awk '$2 ~ /nginx-proxy-manager/ {print $1; exit}')
[ -n "$NPM" ] || fail "Hittar ingen körande Nginx Proxy Manager-container"
if docker inspect -f '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}' "$NPM" | grep -qw npm_edge; then
  ok "$NPM är redan ansluten till npm_edge"
else
  docker network connect npm_edge "$NPM"
  ok "anslöt $NPM till npm_edge"
fi
NPM_COMPOSE=$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project.config_files"}}' "$NPM" 2>/dev/null || true)

say "3/7 Stoppar APS (databasens data behålls)"
docker compose down --remove-orphans

say "4/7 Byter databaslösenord"
docker compose up -d --wait db
NEWPW=$(openssl rand -hex 24)
docker compose exec -T db psql -v ON_ERROR_STOP=1 -U "$PGUSER" -d "$PGDB" \
  -c "ALTER USER \"$PGUSER\" WITH PASSWORD '$NEWPW';" >/dev/null
env_set POSTGRES_PASSWORD "$NEWPW"
env_set DATABASE_URL "postgresql+psycopg://$PGUSER:$NEWPW@db:5432/$PGDB"
ok "nytt databaslösenord satt i databasen och i .env"

say "5/7 Nya app-hemligheter"
env_set JWT_SECRET "$(openssl rand -hex 32)"
ADMINPW=$(openssl rand -hex 12)
env_set FIRST_ADMIN_PASSWORD "$ADMINPW"
ok "JWT_SECRET och FIRST_ADMIN_PASSWORD bytta (alla inloggningar blir ogiltiga)"

say "6/7 Bygger om från grunden och startar (tar några minuter)"
# api och frontend byggs från grunden. worker/beat har samma Dockerfile som api och
# återanvänder dess lager, så att paketen bara laddas ner en gång. Upp till 3 försök
# om nedladdningen från PyPI/npm tar timeout.
for try in 1 2 3; do
  if docker compose build --pull --no-cache api frontend && docker compose build worker beat; then
    break
  fi
  [ "$try" = 3 ] && fail "Bygget misslyckades 3 gånger — troligen nätverket. Kör skriptet igen senare."
  warn "bygget misslyckades (försök $try av 3), försöker igen om 15 s"
  sleep 15
done
if ! docker compose up -d --wait --wait-timeout 240; then
  docker compose ps -a
  fail "Något startade inte. Kör:  docker compose logs --tail 50  och skicka utskriften"
fi

docker compose exec -T api python - <<'PY' || warn "kunde inte sätta adminlösenordet — se felet ovan"
from sqlalchemy import func, select
from app.config import settings
from app.db import SessionLocal
from app.models import User
from app.security import hash_password

db = SessionLocal()
u = db.scalar(select(User).where(User.email == settings.first_admin_email))
if u is None:
    print(f"VARNING: ingen användare {settings.first_admin_email} hittades — adminlösenordet ändrades inte")
else:
    u.hashed_password = hash_password(settings.first_admin_password)
    db.commit()
    print(f"OK: nytt lösenord satt för {u.email}")
n = db.scalar(select(func.count()).select_from(User))
if n > 1:
    print(f"OBS: det finns {n} användare — övriga bör byta lösenord")
db.close()
PY

say "7/7 Kontroller"
docker compose ps

code=$(docker exec "$NPM" curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://aps-frontend/ 2>/dev/null || true)
[ "$code" = "200" ] && ok "NPM når aps-frontend (HTTP 200)" || warn "NPM → aps-frontend gav '$code' (väntat 200)"

if docker compose exec -T frontend wget -q -T 5 -O /dev/null http://1.1.1.1 >/dev/null 2>&1; then
  warn "frontend NÅR internet — ska inte hända"
else
  ok "frontend når inte internet"
fi
if docker compose exec -T api python -c "import urllib.request; urllib.request.urlopen('http://1.1.1.1', timeout=5)" >/dev/null 2>&1; then
  warn "api NÅR internet — ska inte hända"
else
  ok "api når inte internet"
fi
if docker compose exec -T api sh -c 'touch /app/.skrivtest' >/dev/null 2>&1; then
  warn "api-containerns filsystem är skrivbart"
else
  ok "api-containerns filsystem är skrivskyddat"
fi
[ "$(docker compose exec -T api id -u | tr -d '\r')" != "0" ] && ok "api kör inte som root" || warn "api kör som root"

cat <<EOF

===========================================================================
 KLART

 Nytt adminlösenord:  $ADMINPW
 (användare: $(env_get FIRST_ADMIN_EMAIL)) — spara det i din lösenordshanterare.

 Kvar att göra för hand:
  1. Lägg till nätet npm_edge i NPM:s compose-fil så att kopplingen överlever
     att NPM skapas om. Filen: ${NPM_COMPOSE:-okänd}
       services -> (npm-tjänsten) -> networks: [npm_proxy, npm_edge]
       networks: npm_edge: { external: true }
  2. Kontrollera att sidan fungerar via NPM i webbläsaren.
  3. Radera säkerhetskopian när allt fungerar:  shred -u $BAK
  4. Stäng port 81 (NPM-admin) mot internet.
===========================================================================
EOF
