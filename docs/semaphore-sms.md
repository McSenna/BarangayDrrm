# Semaphore SMS configuration

Manual SMS, automatic notifications, and SMS retries use Semaphore's standard
messages endpoint: https://api.semaphore.co/api/v4/messages.

Set these values in `backend/config/app_config.local.php` (ignored by Git), or
as server environment variables. Environment variables take precedence:

```php
'SEMAPHORE_SMS_ENABLED' => true,
'SEMAPHORE_API_KEY' => 'your-api-key',
'SEMAPHORE_SENDER_NAME' => '',
```

An empty sender name uses the account's default registered sender. The account
must have an active registered sender and sufficient credits. No device ID or
Android gateway is required. The old TEXTBEE settings are no longer used.
For production, configure these values separately on the hosting server; the
local secret file is not included in Git or deployment archives.

Messages accepted by Semaphore are recorded as Accepted by Gateway on the
current schema. This does not confirm delivery to the recipient's phone.
API errors, malformed responses, and rejected messages are recorded as failures.
Existing automatic notification triggers and opt-in policies are unchanged.

Offline checks (no SMS sent):

```text
php tests/semaphore_sms_test.php
php -n tests/semaphore_transport_test.php
```

Provider documentation: https://semaphore.co/docs

## "No active sender name found"

This error means the request reached Semaphore, but the account has no active
registered sender. Open Sender Names in the Semaphore dashboard, register a
sender name, and wait for its approval. An API key alone cannot send SMS.
Once approved, set that sender as the account default, or put its exact value in
`SEMAPHORE_SENDER_NAME`. Then retry the failed entry from SMS Logs.
