# DayStaff phone verifier

Static companion page for the kiosk's **Short code + two-way visual QR** mode.

## Deploy

Deploy `my-netlify-folder` as the Netlify publish directory. The verifier is
then available at:

```
https://<your-site>.netlify.app/verify/
```

Set the same address in **Admin settings → Short code + visual QR → Phone
verifier address**. It must be HTTPS; phone biometrics (WebAuthn) are disabled
on insecure origins.

## How it works

1. The kiosk shows a 10-second QR containing the staff code, session id,
   issue/expiry timestamps and a random nonce. Name data is reduced to masked
   initials.
2. The phone opens this page, pairs once (from the staff profile) using the
   platform authenticator (Face ID, Touch ID, Windows Hello, Android
   biometrics), and stores a random device token + secret in `localStorage`.
3. At attendance time the phone confirms with biometrics, signs the kiosk
   session with HMAC-SHA256, and shows a 5-second return QR.
4. The kiosk scans the return QR, checks the session, code, timestamp, device
   token and signature, then records attendance as `QR_DEVICE_BOUND`.

No attendance or staff data is sent to Netlify. The page is static and caches
itself with a service worker after the first successful load.

## Local testing

WebAuthn only works on `https://` or `http://localhost`. Use Expo/Netlify
preview or:

```sh
npx serve my-netlify-folder
```

and open `http://localhost:<port>/verify/?...` with a test kiosk QR. Most
mobile browsers require a real HTTPS origin for platform credentials, so a
Netlify preview is preferred.
