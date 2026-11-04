#!/bin/bash
# ── Delta Warranty & Service — Docker deploy ──────────────────────────────────
# Usage:
#   ./deploy.sh           → build image + export tar
#   ./deploy.sh push      → build + export + upload + restart on server
#   ./deploy.sh restart   → restart the container on the server
#   ./deploy.sh stop      → stop the container on the server
#   ./deploy.sh logs      → tail the server logs
#   ./deploy.sh status    → show container status, uploads size and disk on the server
#   ./deploy.sh backup    → download a .tar.gz of the uploaded photos / videos / PDFs
#   ./deploy.sh local     → build and run locally (uploads kept in ./uploads)
#
# Uploaded files are NOT inside the image or container: they live on the server in
#   $SERVER_PATH/uploads   (mounted into the container at /app/uploads)
# so a new image, a removed container or `docker image prune` never deletes them.
# ─────────────────────────────────────────────────────────────────────────────

set -e

CONFIG_FILE="$(dirname "$0")/deploy.config.sh"
if [ ! -f "$CONFIG_FILE" ]; then
  echo "deploy.config.sh not found next to deploy.sh — copy deploy.config.example.sh to deploy.config.sh and fill in the server details."
  exit 1
fi
source "$CONFIG_FILE"

CMD="${1:-build}"
# Environment file sent to the server: .env.production when present, else .env (override with ENV_FILE in deploy.config.sh)
ENV_FILE="${ENV_FILE:-$( [ -f .env.production ] && echo .env.production || echo .env )}"
UPLOADS_PATH="${UPLOADS_PATH:-$SERVER_PATH/uploads}"

# ── Colors ────────────────────────────────────────────────────────────────────
BOLD='\033[1m'; DIM='\033[2m'
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BLUE='\033[0;34m'; NC='\033[0m'

STEP_START=0
ts()         { date '+%H:%M:%S'; }
step_start() { STEP_START=$SECONDS; echo -e "${CYAN}[$(ts)]${NC} ${BOLD}▶ $1${NC}"; }
step_ok()    { echo -e "${GREEN}[$(ts)]${NC} ${GREEN}✔ $1${NC} ${DIM}($((SECONDS - STEP_START))s)${NC}"; echo ""; }
step_warn()  { echo -e "${YELLOW}[$(ts)]${NC} ${YELLOW}! $1${NC}"; }
step_err()   { echo -e "${RED}[$(ts)]${NC} ${RED}✘ $1${NC}"; }
info()       { echo -e "${DIM}[$(ts)]   $1${NC}"; }

header() {
  echo ""
  echo -e "${BOLD}${BLUE}══════════════════════════════════════════${NC}"
  echo -e "${BOLD}${BLUE}  Delta Warranty & Service — $1${NC}"
  echo -e "${BOLD}${BLUE}══════════════════════════════════════════${NC}"
  echo -e "${DIM}  $(date '+%Y-%m-%d %H:%M:%S')${NC}"
  echo ""
}

# ── Config sanity ─────────────────────────────────────────────────────────────
check_config() {
  local missing=()
  for var in SERVER_IP SERVER_USER SERVER_PATH APP_PORT IMAGE_NAME CONTAINER_NAME TAR_FILE; do
    [ -z "${!var}" ] && missing+=("$var")
  done
  if [ ${#missing[@]} -gt 0 ]; then
    step_err "deploy.config.sh is missing: ${missing[*]}"
    exit 1
  fi
  if [ -n "$SERVER_PASS" ] && ! command -v sshpass &>/dev/null; then
    step_err "SERVER_PASS is set but sshpass is not installed."
    info "Install it:  brew install hudochenkov/sshpass/sshpass  (macOS) · sudo apt install sshpass (Linux / WSL)"
    info "Or clear SERVER_PASS in deploy.config.sh to use an SSH key instead."
    exit 1
  fi
  if [ -z "$SERVER_PASS" ]; then
    step_warn "SERVER_PASS is empty — falling back to SSH keys."
  fi
}

# ── Remote helpers ────────────────────────────────────────────────────────────
SSH_OPTS=(-o StrictHostKeyChecking=no -o ConnectTimeout=15)

remote() {
  if [ -n "$SERVER_PASS" ]; then
    sshpass -p "$SERVER_PASS" ssh "${SSH_OPTS[@]}" "$SERVER_USER@$SERVER_IP" "$@"
  else
    ssh "${SSH_OPTS[@]}" "$SERVER_USER@$SERVER_IP" "$@"
  fi
}

# upload <local file> [remote name]
upload() {
  local src="$1" dest="${2:-$(basename "$1")}"
  info "Uploading $(basename "$src") ($(du -sh "$src" | cut -f1)) → $SERVER_IP:$SERVER_PATH/$dest"
  if command -v rsync &>/dev/null; then
    if [ -n "$SERVER_PASS" ]; then
      sshpass -p "$SERVER_PASS" rsync -az --progress -e "ssh ${SSH_OPTS[*]}" "$src" "$SERVER_USER@$SERVER_IP:$SERVER_PATH/$dest"
    else
      rsync -az --progress -e "ssh ${SSH_OPTS[*]}" "$src" "$SERVER_USER@$SERVER_IP:$SERVER_PATH/$dest"
    fi
  else
    if [ -n "$SERVER_PASS" ]; then
      sshpass -p "$SERVER_PASS" scp "${SSH_OPTS[@]}" "$src" "$SERVER_USER@$SERVER_IP:$SERVER_PATH/$dest"
    else
      scp "${SSH_OPTS[@]}" "$src" "$SERVER_USER@$SERVER_IP:$SERVER_PATH/$dest"
    fi
  fi
}

download() {
  local src="$1" dest="$2"
  if [ -n "$SERVER_PASS" ]; then
    sshpass -p "$SERVER_PASS" scp "${SSH_OPTS[@]}" "$SERVER_USER@$SERVER_IP:$src" "$dest"
  else
    scp "${SSH_OPTS[@]}" "$SERVER_USER@$SERVER_IP:$src" "$dest"
  fi
}

check_ssh() {
  step_start "Testing SSH to $SERVER_USER@$SERVER_IP"
  if remote "echo ok" >/dev/null 2>&1; then
    step_ok "SSH connection works"
  else
    step_err "Cannot reach $SERVER_IP as $SERVER_USER — check IP, credentials, or network."
    exit 1
  fi
}

# ── Remote docker wrapper ─────────────────────────────────────────────────────
# The deploy user is often not in the server's docker group ("permission denied ... /var/run/docker.sock").
# Emit a shell function `d` that picks the first working route: plain docker, passwordless sudo, then sudo
# with the server password (piped to `sudo -S` from a builtin, so it never appears in the process list).
remote_docker_preamble() {
  local pw="${SUDO_PASS:-$SERVER_PASS}"
  local esc
  esc=$(printf '%s' "$pw" | sed "s/'/'\\\\''/g")
  cat <<PREAMBLE
SUDO_PASS='${esc}'
if docker info >/dev/null 2>&1; then
  d() { docker "\$@"; }
elif sudo -n docker info >/dev/null 2>&1; then
  d() { sudo -n docker "\$@"; }
elif [ -n "\$SUDO_PASS" ] && echo "\$SUDO_PASS" | sudo -S -p '' docker info >/dev/null 2>&1; then
  d() { echo "\$SUDO_PASS" | sudo -S -p '' docker "\$@"; }
else
  echo "  Cannot run docker as \$(whoami): not in the docker group, and sudo did not work." >&2
  echo "  Either set SERVER_PASS in deploy.config.sh, or run this on the server:" >&2
  echo "    sudo usermod -aG docker \$(whoami)   # then log out and back in" >&2
  exit 1
fi
PREAMBLE
}

# ── Commands ──────────────────────────────────────────────────────────────────
do_build() {
  header "Build"
  check_config

  step_start "Building $IMAGE_NAME:latest for linux/amd64"
  docker build --platform linux/amd64 -t "$IMAGE_NAME:latest" .
  step_ok "Image built"

  step_start "Exporting image to $TAR_FILE"
  docker save "$IMAGE_NAME:latest" | gzip > "$TAR_FILE"
  step_ok "Exported ($(du -sh "$TAR_FILE" | cut -f1))"

  echo -e "  Next:  ${BOLD}./deploy.sh push${NC}"
  echo ""
}

do_push() {
  local START=$SECONDS
  do_build
  check_ssh

  if [ ! -f "$ENV_FILE" ]; then
    step_err "$ENV_FILE not found — the container needs it (DATABASE_URL, IERP_DATABASE_URL, JWT_SECRET)."
    exit 1
  fi
  if ! grep -q '^JWT_SECRET=.\+' "$ENV_FILE"; then
    step_warn "JWT_SECRET is not set in $ENV_FILE — set a long random value for production sign-ins."
  fi

  step_start "Preparing $SERVER_PATH and the uploads folder on the server"
  # The uploads folder is created once and never deleted by this script.
  remote "mkdir -p '$SERVER_PATH' '$UPLOADS_PATH/attachments'"
  step_ok "Remote folders ready (uploads: $UPLOADS_PATH)"

  step_start "Uploading image and environment file"
  upload "$TAR_FILE"
  upload "$ENV_FILE" ".env"
  step_ok "Upload complete"

  step_start "Loading image and restarting container"
  echo ""
  remote bash <<REMOTE
    set -e
$(remote_docker_preamble)
    cd "$SERVER_PATH"

    echo "  Loading $TAR_FILE ..."
    d load -i "$TAR_FILE" 2>&1 | sed 's/^/    /'

    echo "  Removing old container (uploads in $UPLOADS_PATH are kept) ..."
    d rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true

    CONFLICT=\$(d ps -q --filter "publish=$APP_PORT")
    if [ -n "\$CONFLICT" ]; then
      echo "  Freeing port $APP_PORT (container \$CONFLICT)"
      d rm -f \$CONFLICT >/dev/null 2>&1 || true
    fi

    echo "  Starting $CONTAINER_NAME on port $APP_PORT ..."
    d run -d \
      --name "$CONTAINER_NAME" \
      --restart unless-stopped \
      --env-file "$SERVER_PATH/.env" \
      -e PORT=$APP_PORT \
      -p $APP_PORT:$APP_PORT \
      -v "$UPLOADS_PATH:/app/uploads" \
      "$IMAGE_NAME:latest" >/dev/null

    sleep 5
    echo ""
    echo "  Status:"
    d ps --filter "name=$CONTAINER_NAME" --format "    {{.Names}}  {{.Status}}  {{.Ports}}"
    echo ""
    echo "  Uploads mounted from $UPLOADS_PATH (\$(du -sh "$UPLOADS_PATH" 2>/dev/null | cut -f1), \$(find "$UPLOADS_PATH" -type f 2>/dev/null | wc -l) files)"
    echo ""
    echo "  Recent logs:"
    d logs --tail=20 "$CONTAINER_NAME" 2>&1 | sed 's/^/    /' || true

    # Only dangling images are pruned — never volumes, so uploads are safe.
    d image prune -f >/dev/null 2>&1 || true
REMOTE
  echo ""
  step_ok "Deployed"

  echo -e "  ${GREEN}${BOLD}Done in $((SECONDS - START))s${NC}"
  echo -e "  App URL: ${BOLD}http://$SERVER_IP:$APP_PORT${NC}"
  echo ""
}

do_restart() {
  header "Restart"
  check_config
  check_ssh
  step_start "Restarting $CONTAINER_NAME"
  remote bash <<REMOTE
$(remote_docker_preamble)
d restart "$CONTAINER_NAME" >/dev/null
d ps --filter "name=$CONTAINER_NAME" --format "    {{.Names}}  {{.Status}}  {{.Ports}}"
REMOTE
  step_ok "Restarted"
  echo -e "  App URL: ${BOLD}http://$SERVER_IP:$APP_PORT${NC}"
  echo ""
}

do_stop() {
  header "Stop"
  check_config
  check_ssh
  step_start "Stopping $CONTAINER_NAME (uploads in $UPLOADS_PATH are kept)"
  remote bash <<REMOTE
$(remote_docker_preamble)
d rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
d ps --format "    {{.Names}}  {{.Status}}"
REMOTE
  step_ok "Stopped"
}

do_logs() {
  header "Logs"
  check_config
  check_ssh
  echo -e "${DIM}  Tailing logs — Ctrl+C to exit${NC}"
  echo ""
  remote bash <<REMOTE
$(remote_docker_preamble)
d logs -f --tail=100 "$CONTAINER_NAME"
REMOTE
}

do_status() {
  header "Status"
  check_config
  check_ssh
  remote bash <<REMOTE
$(remote_docker_preamble)
d ps -a --filter "name=$CONTAINER_NAME" --format "    {{.Names}}  {{.Status}}  {{.Ports}}"
echo
echo "    Uploads: $UPLOADS_PATH — \$(du -sh "$UPLOADS_PATH" 2>/dev/null | cut -f1), \$(find "$UPLOADS_PATH" -type f 2>/dev/null | wc -l) files"
echo
df -h "$SERVER_PATH" | sed 's/^/    /'
REMOTE
  echo ""
}

do_backup() {
  header "Backup uploads"
  check_config
  check_ssh
  local name="uploads-$(date '+%Y%m%d-%H%M%S').tar.gz"
  step_start "Packing $UPLOADS_PATH on the server"
  remote "tar -czf '/tmp/$name' -C '$(dirname "$UPLOADS_PATH")' '$(basename "$UPLOADS_PATH")'"
  step_ok "Packed"
  mkdir -p backups
  step_start "Downloading to backups/$name"
  download "/tmp/$name" "backups/$name"
  remote "rm -f '/tmp/$name'"
  step_ok "Saved backups/$name ($(du -sh "backups/$name" | cut -f1))"
}

do_local() {
  header "Local"
  check_config
  step_start "Building $IMAGE_NAME:local"
  docker build -t "$IMAGE_NAME:local" .
  step_ok "Built"
  docker rm -f "${CONTAINER_NAME}-local" >/dev/null 2>&1 || true
  mkdir -p uploads/attachments
  step_start "Running on port 3001 (uploads → ./uploads)"
  docker run --rm -it --name "${CONTAINER_NAME}-local" \
    --env-file "$ENV_FILE" -e PORT=3001 -p 3001:3001 \
    -v "$(pwd)/uploads:/app/uploads" \
    "$IMAGE_NAME:local"
}

case "$CMD" in
  build)   do_build   ;;
  push)    do_push    ;;
  restart) do_restart ;;
  stop)    do_stop    ;;
  logs)    do_logs    ;;
  status)  do_status  ;;
  backup)  do_backup  ;;
  local)   do_local   ;;
  *)
    echo "Usage: ./deploy.sh [build|push|restart|stop|logs|status|backup|local]"
    exit 1
    ;;
esac
