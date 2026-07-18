# Release Runner

Public GitHub-hosted build and release automation for explicitly trusted projects.

This repository is a multi-project runner repository, not a public build service. Every project must have a reviewed workflow that fixes its source repository, Dockerfiles, image names, release channels, and deployment targets. Dispatch payloads must never be allowed to provide arbitrary repositories, Dockerfiles, shell commands, registry destinations, or webhooks.

## Projects

| Project | Trusted source | Workflow | Outputs |
|---------|----------------|----------|---------|
| Control desktop | `Lstsk/control` | `desktop-release.yml` | Signed desktop release artifacts |
| Control containers | `Lstsk/control` | `control-containers.yml` | Private `control-web` and `control-realtime` GHCR images |

Additional repositories owned or controlled by the operator can be added with their own project-specific workflow. Untrusted or arbitrary third-party source must not run in jobs that can access source, registry, signing, or deployment credentials.

## Control Container Flow

1. Private Control CI verifies an exact source commit.
2. The private repository dispatches `build-control-containers` with the source SHA and `staging` or `production` channel.
3. Two public GitHub-hosted runners build the fixed web and realtime Dockerfiles in parallel.
4. Each image is pushed with an immutable `sha-<source-sha>` tag.
5. After both builds succeed, the workflow promotes the matching channel tags.
6. If deployment is enabled, the matching Coolify environment webhook is called.

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

The existing `staging` and `production` GitHub environments require these variables:

```text
CONTROL_WEB_APP_URL
CONTROL_SUPABASE_URL
CONTROL_SUPABASE_PUBLISHABLE_KEY
```

They are public client configuration compiled into the Next.js browser bundle. Do not place server credentials in these variables.

Optional deployment requires these environment secrets:

```text
CONTROL_COOLIFY_WEBHOOK
CONTROL_COOLIFY_TOKEN
```

The Coolify token should have deploy permission only.

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

## Adding Another Trusted Project

Add a separate workflow with fixed project values and reuse the same lifecycle:

```text
validate input -> resolve trusted source SHA -> build immutable images -> promote channel -> optional fixed deployment
```

Keep credentials scoped per project or GitHub environment. Do not turn project settings into externally supplied dispatch inputs merely to reduce workflow duplication.
