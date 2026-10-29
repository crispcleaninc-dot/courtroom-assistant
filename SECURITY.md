# Security and privacy

This repository is public so the app can be hosted for free on GitHub Pages. **It contains only program code.** It holds no names, case numbers, facts, notes, passcodes or keys, and it must never hold any.

## Where private information lives

| What | Where | Who can reach it |
|---|---|---|
| Case data, notes, strategy, hearing logs | One private JSON file in the owner's Google Drive | Only the owner's Google account, through the relay |
| AI key (Anthropic) | Script Properties of the owner's Apps Script relay | Only the owner's Google account |
| Relay passcode | Relay Script Properties, and each device the owner sets up | The owner |
| Copies on a phone or computer | The browser on that device, encrypted with AES-256 when PIN lock is on | Whoever knows the PIN |

## Protections built in

- **Device PIN lock**: AES-256-GCM encryption of everything stored on the device, with the key derived from the PIN (PBKDF2, 310,000 rounds). Auto-locks after 15 minutes. After 10 wrong PINs the device copy is erased; the Drive copy is untouched.
- **Relay passcode**: every request must carry it; compared in constant time. Five wrong attempts in 15 minutes lock the relay for 15 minutes. Max 40 requests per minute.
- **Access log**: the relay records the last 200 requests (time, action, allowed or denied). Run `showAccessLog` in the Apps Script editor to see it.
- **Health check reveals nothing**: opening the relay URL only says whether it is running.
- **Strict content security policy**: the app may only talk to its own site and the Google Apps Script relay. No ads, trackers or outside scripts.
- **Backups**: each save keeps the previous version as "(previous).json" in Drive; Drive also keeps file history.
- **Live mode** stays locked without a permission record for that day's hearing. No audio is ever saved by the app.

## What to know

- AI suggestions send the relevant case text to Anthropic's API to get an answer. Don't put anything in notes you would not want processed that way.
- Chrome's speech recognition (Live mode) sends audio to Google's speech service to turn it into text.
- If a device is lost: change `APP_PASSCODE` in the relay's Script Properties. That cuts off the lost device right away.
- Never commit case files, exports, keys or passcodes to this repository. `.gitignore` blocks the common file names, but it is not a substitute for care.
