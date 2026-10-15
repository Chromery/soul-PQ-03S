#!/usr/bin/env python3
"""Read-only production dump, restore into a NEW isolated research database.

Refuses other branches, existing target containers/volumes and snapshot paths.
No production configuration, app services, storage credentials or jobs are started.
"""
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import secrets
import shlex
import subprocess as sp

ROOT = Path(__file__).resolve().parents[2]
PROJECT = "soul-pq-ordinamento"
SSH = ["sudo", "-n", "ssh", "-T", "-o", "BatchMode=yes", "-o", "IdentitiesOnly=yes",
       "-o", "ConnectTimeout=12", "-o", "StrictHostKeyChecking=yes", "-o",
       "UserKnownHostsFile=/home/debian/.ssh/known_hosts", "-i", "/etc/ssh/ssh_host_ed25519_key",
       "root@pq.soul.it"]


def run(args, **kwargs):
    return sp.run(args, check=True, cwd=ROOT, **kwargs)


def output(args):
    return run(args, capture_output=True, text=True).stdout.strip()


def main():
    os.umask(0o077)
    if output(["git", "branch", "--show-current"]) != "ordinamento":
        raise SystemExit("Refusing to operate outside branch ordinamento")
    if output(["docker", "ps", "-aq", "--filter", f"label=com.docker.compose.project={PROJECT}"]):
        raise SystemExit("Research containers already exist; this script never overwrites a snapshot")
    if output(["docker", "volume", "ls", "-q", "--filter", f"label=com.docker.compose.project={PROJECT}"]):
        raise SystemExit("Research volumes already exist; use the existing snapshot")
    base = ROOT / ".research"
    base.mkdir(mode=0o700, exist_ok=True)
    env = base / "local.env"
    if not env.exists():
        env.write_text(f"RESEARCH_DB_PASSWORD={secrets.token_urlsafe(40)}\n")
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    dest = base / stamp
    dest.mkdir(mode=0o700)
    compose = ["/usr/libexec/docker/cli-plugins/docker-compose", "--env-file", str(env), "-f", "compose.ordinamento.yaml", "-p", PROJECT]
    config = json.loads(output(compose + ["config", "--format", "json"]))
    service = config["services"]["postgres"]
    if set(config["services"]) != {"postgres"} or service.get("ports") or service.get("network_mode") != "none":
        raise SystemExit("Unsafe research Compose configuration")
    remote_prefix = "cd /srv/soul-pq && docker compose -p soul-prospect-qualifier "
    remote = output(SSH + [remote_prefix + "ps --format json"])
    services = [json.loads(line) for line in remote.splitlines() if line.strip()]
    db = next(s for s in services if s["Service"] == "postgres")
    if db["Project"] != "soul-prospect-qualifier" or db["State"] != "running" or any(p.get("PublishedPort") for p in db.get("Publishers", [])):
        raise SystemExit("Unexpected production DB deployment")
    dump_command = ('PGOPTIONS="-c default_transaction_read_only=on -c statement_timeout=120000" '
                    'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" '
                    '--no-owner --no-acl --lock-wait-timeout=10000 -Fc -Z 3')
    partial = dest / "production.dump.part"
    with partial.open("xb") as handle:
        run(SSH + [remote_prefix + "exec -T postgres sh -c " + shlex.quote(dump_command)], stdout=handle)
    dump = dest / "production.dump"
    partial.rename(dump)
    run(compose + ["up", "-d", "--wait", "postgres"])
    container = output(compose + ["ps", "-q", "postgres"])
    inspect = json.loads(output(["docker", "inspect", container]))[0]
    if inspect["Config"]["Labels"]["com.docker.compose.project"] != PROJECT or inspect["HostConfig"]["NetworkMode"] != "none" or inspect["HostConfig"].get("PortBindings"):
        raise SystemExit("Unexpected target isolation")
    with dump.open("rb") as handle:
        run(["docker", "exec", "-i", container, "pg_restore", "--list"], stdin=handle, stdout=sp.DEVNULL)
    with dump.open("rb") as handle:
        run(["docker", "exec", "-i", container, "pg_restore", "--exit-on-error", "--no-owner", "--no-acl", "-U", "research", "-d", "soul_ordinamento"], stdin=handle)
    run(["docker", "exec", container, "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "research", "-d", "soul_ordinamento", "-c", "ALTER DATABASE soul_ordinamento SET default_transaction_read_only=on;"], stdout=sp.DEVNULL)
    mode = output(["docker", "exec", container, "psql", "-XAt", "-U", "research", "-d", "soul_ordinamento", "-c", "SHOW default_transaction_read_only"])
    if mode != "on":
        raise SystemExit("Read-only default not enabled")
    manifest = {"snapshot_started_at_utc": stamp, "completed_at_utc": dt.datetime.now(dt.timezone.utc).isoformat(),
                "source": "pq.soul.it:/srv/soul-pq", "source_project": "soul-prospect-qualifier",
                "base_commit": output(["git", "rev-parse", "HEAD"]), "target_project": PROJECT,
                "dump_bytes": dump.stat().st_size, "sha256": hashlib.sha256(dump.read_bytes()).hexdigest(),
                "target_default_read_only": True, "network": "none", "published_ports": [],
                "scope": "Full consistent database snapshot; analytical exports exclude isTest=true.",
                "attachments": "Not included in pg_dump; PropertyDocument contains references only."}
    (dest / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    (base / "LATEST").write_text(stamp + "\n")
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
