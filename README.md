# Courtroom Assistant

A phone and desktop app for a self-represented party: hearing prep, a silent tap-to-object mode, a permission-gated live mode, and a hearing strategy that changes plans on its own when what happens in court changes.

**This repository holds no case information.** See SECURITY.md for how private data is protected. Case data, notes and logs live in a private file in the owner's Google Drive, reached through a small Google Apps Script relay that also keeps the AI key private.

## How it fits together

```
Phone / laptop (this app, GitHub Pages)
   │  passcode-protected requests
   ▼
Google Apps Script relay (relay/Code.gs, runs in your Google account)
   ├── Anthropic API  (AI suggestions, outlines, strategy)
   └── Google Drive   ("Courtroom Assistant - Private Case Data.json")
```

## One-time setup

### 1. Turn on GitHub Pages
Repo **Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: `main`, folder `/ (root)` → Save.**
The app appears at `https://crispcleaninc-dot.github.io/courtroom-assistant/` within a minute or two.

### 2. Create the relay
1. Go to script.google.com while signed in to the Google account that should own your data → **New project**. Name it **Courtroom Assistant Relay**.
2. Replace the contents of `Code.gs` with `relay/Code.gs` from this repo. Save.
3. **Project Settings → Script Properties → Add**:
   - `ANTHROPIC_API_KEY` = your key from console.anthropic.com (API keys are billed per use)
   - `APP_PASSCODE` = a long passcode you make up (12+ characters)
4. Run `testSetup` once from the editor and approve the permissions. The log should show `configured: true` and an AI reply.
5. **Deploy → New deployment → Web app → Execute as: Me → Who has access: Anyone → Deploy.** Copy the URL ending in `/exec`.

### 3. Connect the app
Open the app → **Setup** tab → paste the relay URL and passcode → **Save and test**. Do this once per device.

### 4. Install it like an app
In Chrome: **⋮ → Add to Home screen** (Android) or the install icon in the address bar (Windows).

### 5. Register in CAIOCC
Add the relay's `/exec` URL as the health-check URL (`read_monitor`). Opening it returns `{"ok":true,...}`.

## What works offline
Prep, Silent mode, matching what is said against your case, strategy switching and the log all work without signal. AI suggestions, outlines and Drive sync need internet.

## Court rules
Live mode stays locked until a permission record for that day's hearing is entered: a granted SCAO MC 70 accommodation, a written order, or permission the judge gave on the record. Michigan courts require the presiding judge's approval to record (MCR 8.115), and federal courts are stricter. The red **Judge said stop** button shuts listening off and clears the transcript.

This is assistive technology for notes, lookup and organization. It is not a lawyer and does not give legal advice. Anything marked **Verify** or **AI: unverified** must be checked before relying on it.
