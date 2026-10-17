# TextBee Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Replace Semaphore with TextBee for manual SMS, automatic notifications, and retries.

**Architecture:** Keep the shared PHP SMS helper and existing logging and notification flows. Replace the provider configuration, HTTP request, and response parser. Preserve historical logs and distinguish gateway acceptance from confirmed delivery.

**Tech Stack:** PHP, cURL, existing database logging, React.

**Spec:** In-chat migration design in this conversation, approved by the user on 2026-10-18.

## Global Constraints

- Preserve Philippine mobile number validation, event deduplication, and existing logs.
- Keep API keys server-side and redact them from provider errors and logs.
- Leave SMS disabled until TextBee credentials are configured.
- Do not send live messages during automated checks.
- Do not mark gateway acceptance as Delivered.

## Review Focus

- Missing credentials must produce Not Configured logs without a network request.
- Local and international Philippine numbers must become E.164 numbers.
- Invalid JSON or a rejected payload must fail even with HTTP 200.
- Provider errors containing credentials must be redacted.
- Existing accepted messages must remain protected against retry.

### Task 1: Replace provider configuration and transport

**Files:** `backend/config/sms_api_config.php`, `backend/config/app_config.local.example.php`, `backend/sms/sms_helper.php`, new `tests/textbee_sms_test.php`.

**Interfaces:** Preserve `sms_config_state(): array` and the caller-facing SMS functions. Introduce `textbee_send(array $state, array $numbers, string $message, int $timeout): array`, `textbee_number(string $number): string`, and `textbee_parse_response(int $http_code, $response, string $curl_error, string $api_key): array`. Send results retain `ok`, `http_code`, `error`, and `response` keys.

- [x] Inspect existing SMS tests and configuration loading without exposing local secrets.
- [x] Add failing tests for configuration readiness, number normalization, response rejection, batch ID extraction, and secret redaction. Run `php tests/textbee_sms_test.php` and confirm the new behavior fails before implementation.
- [x] Add `TEXTBEE_SMS_ENABLED`, `TEXTBEE_API_KEY`, and optional `TEXTBEE_DEVICE_ID`. Use `https://api.textbee.dev/api/v1/gateway/send-sms`.
- [x] Send JSON with `recipients`, `message`, and optional `deviceId`; authenticate using the `x-api-key` header. Normalize recipients to `+639XXXXXXXXX`.
- [x] Require a successful HTTP status and TextBee's successful response with `data.smsBatchId`; preserve that ID for logging before shortening response text.
- [x] Run `php tests/textbee_sms_test.php` and verify all assertions pass.

### Task 2: Connect existing workflows and update guidance

**Files:** `backend/sms/sms_helper.php`, `backend/sms/retry.php`, `backend/sms/status.php`, `backend/reports/situation_report.php`, affected SMS labels/comments in `frontend/src`, `README.md`, new `docs/textbee-sms.md`, existing `docs/semaphore-sms.md`, and affected tests.

**Interfaces:** All SMS entry points use Task 1's transport and result contract. Database columns and public endpoint contracts remain compatible.

- [x] Update manual sending, queued notifications, and retries to call TextBee. Retain validation, deduplication, timeout behavior, and accepted-message retry protection.
- [x] Replace active Semaphore labels, configuration instructions, and provider-specific setup errors. Preserve historical log content.
- [x] Document account creation, Android app registration, SMS permissions, online phone and active SIM requirements, API key/device ID setup, and activation.
- [x] Adapt affected provider tests and run relevant existing SMS and notification regression checks, including disabled configuration and retry protection.
- [x] Run PHP syntax checks on changed PHP files and the frontend build using the project's package scripts. Search for obsolete active Semaphore references and inspect the final diff.
- [ ] Report verified checks and any environment limitations. Once configured and explicitly authorized, send one test SMS to a user-selected number and inspect its log; verify receipt separately on the recipient phone.

## Completion Criteria

All sending paths use TextBee, automated checks pass, setup instructions match the new configuration, secrets remain private, and existing logs remain usable. Live delivery remains unverified until a real phone test is completed.

## Execution Notes

Implemented in the current workspace. The three offline TextBee suites, PHP syntax checks, and frontend build passed. Database-dependent rehearsal suites were not run; workflow regression checks use an in-memory database double. Independent review found one minor historical-provider label issue, corrected to provider-neutral gateway wording. Local TextBee settings are present with sending disabled and credentials blank. Live phone delivery remains pending configuration.
