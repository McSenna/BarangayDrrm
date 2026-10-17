# httpSMS setup

The application sends SMS through https://api.httpsms.com/v1/messages/send using your Android phone.

1. Install the httpSMS Android app and sign in to the same account as your API key.
2. Grant the app its required SMS permissions and keep the phone connected to the internet with an active SIM.
3. Set these private values in `backend/config/app_config.local.php`, or as environment variables:

```php
'HTTPSMS_SMS_ENABLED' => true,
'HTTPSMS_API_KEY' => 'your-account-api-key',
'HTTPSMS_FROM' => '+639XXXXXXXXX',
```

Use the number of the Android sending phone for `HTTPSMS_FROM`. Never put the key in frontend files or commit the local configuration. PHP requires cURL and mbstring with a working CA certificate bundle.

Sending is disabled until the enabled flag, API key and valid sender are configured. Each recipient receives a separate API request and log entry. Philippine recipient numbers are normalized to +63 format. The provider message ID is recorded when the schema supports it. Gateway acceptance does not confirm delivery; this integration does not consume delivery webhooks.

Manual sends, automatic notifications and retries all use httpSMS. Existing notification timing and duplicate event checks are retained. Before retrying a timeout, check the httpSMS dashboard because the first request may have been accepted.

Offline checks (no real SMS):

```
C:/xampp/php/php.exe -n tests/httpsms_transport_test.php
C:/xampp/php/php.exe tests/httpsms_workflow_test.php
```

After setup, use Send SMS to send a message to your own test recipient and confirm both the SMS Logs result and receipt on that phone.

Provider documentation: https://docs.httpsms.com/
