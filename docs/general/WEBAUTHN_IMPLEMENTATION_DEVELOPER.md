# WebAuthn / Passkey Implementation — Developer Guide

This document describes the code-level implementation of WebAuthn (passkeys) in the codebase.

Overview
- Purpose: Add passwordless registration & authentication via WebAuthn.
- Stack: client uses `@simplewebauthn/browser`, server uses `@simplewebauthn/server` and `@simplewebauthn/types`.

Key modules
- `src/lib/webauthn/registration.ts`: client registration helpers (`registerPasskey`, `getPasskeys`, `deletePasskey`, `renamePasskey`).
- `src/lib/webauthn/authentication.ts`: client authentication helper (`authenticateWithPasskey`).
- `src/lib/webauthn/server.ts`: server generation/verification helpers (options generation and verification for registration & authentication) and in-memory challenge store (dev only).
- API routes: `src/app/api/auth/webauthn/*` (options and verify routes for register/authenticate). These endpoints call the server helpers and return/verify payloads expected by the client.
- UI: `src/components/PasskeySettings.tsx` — lists, registers, renames and deletes credentials.
- Prisma model: `prisma/schema.prisma` includes `WebAuthnCredential` (credentialId Bytes, publicKey Bytes, counter Int, transports String[], credentialName, timestamps).

Flows
- Registration
  - Client calls `/api/auth/webauthn/register/options` to obtain registration options.
  - Client calls `startRegistration` (from `@simplewebauthn/browser`) and sends returned attestation to `/api/auth/webauthn/register/verify`.
  - Server verifies attestation using `@simplewebauthn/server` helpers; on success creates `WebAuthnCredential` record with `credentialId`, `publicKey`, `counter`, `transports`, `aaguid`, `credentialName`.

- Authentication
  - Client calls `/api/auth/webauthn/authenticate/options` to obtain assertion options (challenge + allowed credentials).
  - Client calls `startAuthentication` and posts assertion to `/api/auth/webauthn/authenticate/verify`.
  - Server verifies assertion, validates the counter to detect cloned authenticators, and updates `counter` and `lastUsedAt` in DB on success.

Types and data handling
- Client code treats `attestation`/`assertion` response fields as `Record<string, unknown>` and explicitly serializes `response.clientDataJSON`, `response.attestationObject`, `response.authenticatorData`, `response.signature`, and `response.userHandle` as base64/base64url-compatible binary (server expects Uint8Array via `toUint8Array`).
- Server converts credentialId/publicKey to `Uint8Array` prior to calling `@simplewebauthn/server` verify helpers. Explicit casts are used where upstream types are `unknown`.

Storage & challenge management
- Current challenge storage: in-memory Map (development only). The server code provides helpers to set/get/delete expected challenges.
- Production recommendation: replace in-memory store with Redis or persistent store to survive restarts and allow multi-instance deployments.

Security notes observed in code
- Counter checks: server validates authenticator `counter` to detect cloned credentials and rejects responses with lower-than-expected counters.
- Transports, aaguid, and attestation info are saved (where available) for audit/security decisioning.
- Challenges are single-use; code stores expected challenge per operation and validates it on verify.

Developer tasks & TODOs
- Replace in-memory challenge store with Redis for production.
- Consider configurable attestation and attestation conveyance preferences (current defaults are in code).
- Add automated integration tests that run registration + authentication flows using a test authenticator (or `@simplewebauthn/browser` mocks).

References
- See implementation files for exact shapes and behavior: `src/lib/webauthn/registration.ts`, `src/lib/webauthn/authentication.ts`, `src/lib/webauthn/server.ts`, `src/components/PasskeySettings.tsx`.
