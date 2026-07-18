# Control Release Runner

Public GitHub-hosted build and release automation for Control.

This repository is part of the Control software project, not a general-purpose runner or public build service. Its workflows fix the source repository, Dockerfiles, image names, release channels, and deployment targets. Dispatch payloads must never be allowed to provide arbitrary repositories, Dockerfiles, shell commands, registry destinations, or webhooks.

## Projects

| Project | Trusted source | Workflow | Outputs |
|---------|----------------|----------|---------|
| Control desktop | `Lstsk/control` | `desktop-release.yml` | Signed desktop release artifacts |
| Control containers | `Lstsk/control` | `control-containers.yml` | Private `control-web` and `control-realtime` GHCR images |

Unrelated projects and untrusted or arbitrary third-party source must not run in jobs that can access source, registry, signing, or deployment credentials.

## Control Container Flow

1. Private Control CI verifies an exact source commit.
2. The private repository dispatches `build-control-containers` with the source SHA and `staging` or `production` channel.
3. Two public GitHub-hosted runners build the fixed web and realtime Dockerfiles in parallel.
4. Each image is pushed with an immutable `sha-<source-sha>` tag.
5. After both builds succeed, the workflow promotes the matching channel tags.
6. If deployment is enabled, the deploy job joins the private tailnet as an ephemeral tagged node.
7. The matching Coolify environment webhook is called through the VPS's Tailscale address.

The workflow does not accept a source repository, Dockerfile, image name, command, registry, or webhook from its event payload.

Private-source builds do not export Docker layer caches or build artifacts from this public repository. Persistent caches can retain source-derived layers and must not be enabled unless their confidentiality boundary is independently reviewed.

## Required Configuration

Repository secrets:

```text
SOURCE_REPO_TOKEN
CONTROL_GHCR_TOKEN
```

The token must have read-only access to `Lstsk/control`. Workflow checkouts use `persist-credentials: false`.

`CONTROL_GHCR_TOKEN` is a dedicated classic personal access token with `write:packages` access. The repository variable `CONTROL_GHCR_USERNAME` identifies its owner. Using a dedicated package credential keeps the private packages independent from the public repository's inherited Actions access.

The existing `staging` and `production` GitHub environments already provide these public client values as desktop release secrets:

```text
DESKTOP_API_BASE_URL
DESKTOP_SUPABASE_URL
DESKTOP_SUPABASE_PUBLISHABLE_KEY
```

The container workflow reuses them for the matching Next.js build. They are public client configuration compiled into browser bundles; no privileged desktop or server secret is passed to Docker.

Optional deployment requires these environment secrets:

```text
CONTROL_COOLIFY_WEBHOOK
CONTROL_COOLIFY_TOKEN
TS_OAUTH_CLIENT_ID
TS_AUDIENCE
```

It also requires this environment variable:

```text
CONTROL_COOLIFY_TAILSCALE_IP
```

The Coolify token should have deploy permission only. The Tailscale federated identity must be restricted to this repository's deployment environment, have only the auth-key scope needed to create ephemeral nodes, and assign `tag:control-deploy`. Tailnet policy should permit that tag to reach only the Coolify VPS on HTTPS. The workflow routes the public Coolify hostname to `CONTROL_COOLIFY_TAILSCALE_IP`, preserving TLS verification while keeping the API connection private.

## GHCR Packages

The workflow publishes:

```text
ghcr.io/toji-pastr/control-web
ghcr.io/toji-pastr/control-realtime
```

Both packages must remain private because the images contain packaged private server source. Verify visibility after the first publish. The Coolify deployment server needs a read-only GHCR credential for pulls.

Do not enable inherited access from this public repository on either package. The workflow publishes with the dedicated package credential and does not need the public repository added under package Actions access.

## Manual Staging Bootstrap

Before enabling automatic deployments:

1. Run `Control Containers` manually.
2. Select `staging` and leave `deploy` disabled.
3. Confirm both private packages contain the same `sha-*` and `staging` tags.
4. Configure Coolify to pull the images and verify application health.
5. Enable the private source repository's deployment variable only after the webhook path succeeds.

## Repository Scope

Keep this repository associated with Control releases. Its lifecycle is:

```text
validate input -> resolve trusted source SHA -> build immutable images -> promote channel -> optional fixed deployment
```

Keep credentials scoped by GitHub environment. Do not turn project settings into externally supplied dispatch inputs or use this repository as free compute for unrelated projects.
