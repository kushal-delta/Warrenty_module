# ── Deploy Configuration ──────────────────────────────────────────────────────
# Copy this file to deploy.config.sh, fill in the client server details, then run ./deploy.sh push
# deploy.config.sh is git-ignored — it holds the server password.

SERVER_IP="10.0.0.6"                               # Linux server IP
SERVER_USER="delta"                                # SSH username
SERVER_PASS=''                                     # SSH password (used via sshpass); blank = SSH key
# SUDO_PASS=''                                     # only if sudo differs from SERVER_PASS
SERVER_PATH="/home/delta/delta-warranty"           # folder on the server (image tar + .env)
APP_PORT="907"                                     # port the app runs on

IMAGE_NAME="delta-warranty"                        # docker image name
CONTAINER_NAME="delta-warranty"                    # docker container name
TAR_FILE="delta-warranty.tar.gz"                   # exported image filename

# Uploaded photos / videos / PDFs — a host folder mounted at /app/uploads, never removed by deploys.
# UPLOADS_PATH="/home/delta/delta-warranty/uploads"  # default: $SERVER_PATH/uploads

# Environment file sent as the server's .env (default: .env.production when present, else .env)
# ENV_FILE=".env.production"
