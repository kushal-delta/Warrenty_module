# Docker deployment — Delta Warranty & Service

Same setup as the Daily Attendance Report project: the image is built on your machine, exported as a `.tar.gz`, copied to the client server over SSH and started with `docker run`.

## One-time setup

1. **Server** — a Linux server with Docker installed, reachable over SSH, and able to reach both SQL Servers (warranty + iERP).
2. **Deploy config** — copy `deploy.config.example.sh` to `deploy.config.sh` and fill in `SERVER_IP`, `SERVER_USER`, `SERVER_PASS` (or blank for an SSH key), `SERVER_PATH` and `APP_PORT`. This file is git-ignored.
3. **Environment** — create `.env.production` (used instead of `.env` when present) from `.env.example`:
   - `DATABASE_URL` — SolarativeiWarranty, as seen **from the server**
   - `IERP_DATABASE_URL` — SolarativeiERP, as seen from the server
   - `JWT_SECRET` — a long random value (`openssl rand -hex 48`)
4. **Tools on your machine** — Docker, Git Bash / WSL, and `sshpass` if you use a password.

## Commands

| Command | What it does |
|---|---|
| `./deploy.sh` | Build the image and export `delta-warranty.tar.gz` |
| `./deploy.sh push` | Build, upload image + env, replace the container on the server |
| `./deploy.sh restart` / `stop` | Restart / remove the container (uploads stay) |
| `./deploy.sh logs` | Tail the container logs |
| `./deploy.sh status` | Container status, uploads size / file count, disk space |
| `./deploy.sh backup` | Download a `.tar.gz` of all uploads into `backups/` |
| `./deploy.sh local` | Build and run on this machine at http://localhost:3001 |

## Uploaded photos, videos and PDFs

The app stores every attachment (service call / job card photos and videos, replacement PDFs) in `/app/uploads/attachments` inside the container. That path is **mounted from the server folder**:

```
<SERVER_PATH>/uploads   →   /app/uploads   (docker run -v ...)
```

- A new image, `./deploy.sh push`, `stop`, removing the container or `docker image prune` **never deletes** this folder.
- The image itself contains no uploads (`.dockerignore` excludes `uploads/`), so nothing from your PC is shipped.
- To move servers, copy `<SERVER_PATH>/uploads` (or use `./deploy.sh backup`) — the database rows point to these files by id.
- Back up this folder together with the SQL Server databases.

## Notes

- Time zone inside the container is `Asia/Kolkata` (date checks such as "cannot be in the future" follow India time).
- Health check: `GET /api/health` (public) — Docker marks the container unhealthy if it stops answering.
- Videos are up to 100 MB each and photos up to 10 MB; if a reverse proxy (nginx) sits in front, allow that size (`client_max_body_size 110m;`).
