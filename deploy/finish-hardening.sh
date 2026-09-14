#!/usr/bin/env bash
# Avslutande steg efter harden-deploy.sh:
#   1. Gör NPM:s koppling till nätet npm_edge permanent (via en override-fil bredvid
#      NPM:s compose-fil — själva compose-filen ändras inte).
#   2. Raderar säkerhetskopiorna av .env (de innehåller de gamla, röjda lösenorden).
#   3. Kontrollerar att NPM inte har standardinloggningen kvar.
#
# Kör på servern som din vanliga användare:
#   cd ~/2-APS && git pull && bash deploy/finish-hardening.sh
set -euo pipefail
cd "$(dirname "$0")/.."
APS_DIR=$(pwd)

say()  { printf '\n\033[1;34m== %s\033[0m\n' "$*"; }
ok()   { printf '\033[1;32mOK:\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33mVARNING:\033[0m %s\n' "$*"; }
fail() { printf '\n\033[1;31mFEL: %s\033[0m\n' "$*" >&2; exit 1; }

find_npm() { docker ps --format '{{.Names}} {{.Image}}' | awk '$2 ~ /nginx-proxy-manager/ {print $1; exit}'; }
nets_of()  { docker inspect -f '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}' "$1"; }
aps_code() { docker exec "$1" curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://aps-frontend/ 2>/dev/null || true; }

NPM=$(find_npm)
[ -n "$NPM" ] || fail "Hittar ingen körande Nginx Proxy Manager-container"
lbl() { docker inspect -f "{{index .Config.Labels \"$1\"}}" "$NPM"; }

say "1/3 Gör NPM:s koppling till npm_edge permanent"
PROJECT=$(lbl com.docker.compose.project)
SVC=$(lbl com.docker.compose.service)
DIR=$(lbl com.docker.compose.project.working_dir)
FILES=$(lbl com.docker.compose.project.config_files)
[ -n "$SVC" ] && [ -n "$DIR" ] || fail "NPM verkar inte vara startad med docker compose — lägg till npm_edge för hand"
case "$FILES" in *,*) fail "NPM startades med flera compose-filer ($FILES) — lägg till npm_edge för hand";; esac

case "$(basename "$FILES")" in
  docker-compose.yml)  OVR=docker-compose.override.yml ;;
  docker-compose.yaml) OVR=docker-compose.override.yaml ;;
  compose.yml)         OVR=compose.override.yml ;;
  compose.yaml)        OVR=compose.override.yaml ;;
  *) fail "Okänt filnamn på NPM:s compose-fil ($FILES) — lägg till npm_edge för hand" ;;
esac
OVR_PATH="$DIR/$OVR"
echo "NPM: container=$NPM  tjänst=$SVC  katalog=$DIR"

SUDO=""; [ -w "$DIR" ] || SUDO=sudo

if [ -e "$OVR_PATH" ]; then
  if grep -q npm_edge "$OVR_PATH"; then
    ok "$OVR_PATH finns redan och innehåller npm_edge"
  else
    fail "$OVR_PATH finns redan med annat innehåll — lägg till npm_edge för hand"
  fi
else
  NETS="$(nets_of "$NPM") npm_edge"
  svc_nets=""; top_nets=""
  for net in $(echo "$NETS" | tr ' ' '\n' | sort -u); do
    owner=$(docker network inspect -f '{{index .Labels "com.docker.compose.project"}}' "$net" 2>/dev/null || true)
    if [ -n "$owner" ] && [ "$owner" = "$PROJECT" ]; then
      # Nät som NPM-projektet själv skapat (t.ex. "default") — behåll dess nyckel.
      key=$(docker network inspect -f '{{index .Labels "com.docker.compose.network"}}' "$net")
      svc_nets+="      $key: {}"$'\n'
    else
      svc_nets+="      $net: {}"$'\n'
      top_nets+="  $net:"$'\n'"    name: $net"$'\n'"    external: true"$'\n'
    fi
  done

  $SUDO tee "$OVR_PATH" >/dev/null <<EOF
# Skapad av 2-APS/deploy/finish-hardening.sh. Ansluter NPM till det interna nätet
# npm_edge, som APS-frontend ligger på (APS har ingen annan väg in eller ut).
services:
  $SVC:
    networks:
${svc_nets}networks:
${top_nets}
EOF
  echo "Skapade $OVR_PATH:"; sed 's/^/    /' "$OVR_PATH"

  rollback() {
    warn "återställer: tar bort $OVR_PATH och startar NPM som förut"
    $SUDO rm -f "$OVR_PATH"
    (cd "$DIR" && docker compose -p "$PROJECT" up -d)
    n=$(find_npm); [ -n "$n" ] && docker network connect npm_edge "$n" 2>/dev/null || true
    fail "$1"
  }

  (cd "$DIR" && docker compose -p "$PROJECT" config -q) || rollback "compose-filen med override blev ogiltig"
  echo "Startar om NPM (alla sajter är nere några sekunder) ..."
  (cd "$DIR" && docker compose -p "$PROJECT" up -d) || rollback "kunde inte starta om NPM"
  sleep 5
  NPM=$(find_npm)
  [ -n "$NPM" ] || rollback "NPM kör inte efter omstarten"
  for net in $NETS; do
    nets_of "$NPM" | grep -qw "$net" || rollback "NPM saknar nätet $net efter omstarten"
  done
fi

code=""
for i in 1 2 3 4 5 6; do code=$(aps_code "$NPM"); [ "$code" = "200" ] && break; sleep 5; done
[ "$code" = "200" ] || fail "NPM når inte aps-frontend (HTTP '$code') — skicka utskriften"
ok "NPM når aps-frontend (HTTP 200), kopplingen överlever nu omstarter och uppdateringar"
ok "NPM:s nät: $(nets_of "$NPM")"

say "2/3 Raderar säkerhetskopiorna av .env"
shopt -s nullglob
baks=("$APS_DIR"/.env.bak-*)
if [ ${#baks[@]} -eq 0 ]; then
  ok "inga säkerhetskopior kvar"
else
  for f in "${baks[@]}"; do shred -u "$f" && ok "raderade $(basename "$f")"; done
fi

say "3/3 Kontrollerar NPM:s adminkonto"
resp=$(curl -s --max-time 5 -H 'Content-Type: application/json' \
  -d '{"identity":"admin@example.com","secret":"changeme"}' http://127.0.0.1:81/api/tokens || true)
if echo "$resp" | grep -q '"token"'; then
  warn "NPM har KVAR standardinloggningen admin@example.com / changeme — byt den direkt på http://10.10.0.15:81"
elif [ -z "$resp" ]; then
  warn "kunde inte nå NPM-admin på port 81 för att kontrollera"
else
  ok "NPM använder inte standardinloggningen"
fi

cat <<'EOF'

===========================================================================
 KLART. Det enda som återstår görs i UniFi (kan inte göras från servern):

   Settings → Routing → Port Forwarding (eller Firewall → Port Forwarding):
   bara port 80 och 443 ska vidarebefordras till 10.10.0.15.
   Finns en regel för port 81 → ta bort den.
===========================================================================
EOF
