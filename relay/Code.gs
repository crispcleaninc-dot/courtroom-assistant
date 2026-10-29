/**
 * Courtroom Assistant Relay (Google Apps Script)
 * Runs in the owner's own Google account.
 *
 * What it does:
 *   - Keeps the Anthropic API key private (the phone app never sees it).
 *   - Loads and saves the private case-data file in Google Drive.
 *   - Answers a health check for CAIOCC (open the web app URL: returns ok:true).
 *
 * Script Properties (Project Settings > Script Properties):
 *   ANTHROPIC_API_KEY   required  your key from console.anthropic.com
 *   APP_PASSCODE        required  a long passcode (16+ characters) you also type into the app's Setup tab
 *   DATA_FILE_ID        optional  Drive file ID of the case-data file (set automatically on first save)
 *   MODEL_QUICK         optional  default claude-sonnet-5-5  (live suggestions)
 *   MODEL_DEFAULT       optional  default claude-sonnet-5-5  (outlines)
 *   MODEL_COMPLEX       optional  default claude-opus-5-5    (strategy building)
 *
 * Deploy: Deploy > New deployment > Web app > Execute as: Me > Who has access: Anyone.
 * "Anyone" is needed so your phone can reach it; every request still needs APP_PASSCODE.
 */

var VERSION = '1.0.0';
var DATA_FILE_NAME = 'Courtroom Assistant - Private Case Data.json';

function doGet() { // health check only: reveals no data
  return json_({ ok: true, app: 'Courtroom Assistant Relay', version: VERSION, time: new Date().toISOString(),
                 configured: !!prop_('ANTHROPIC_API_KEY') && !!prop_('APP_PASSCODE') });
}

function doPost(e) {
  var req;
  try { req = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: 'bad_request' }); }
  var pass = prop_('APP_PASSCODE');
  if (!pass) return json_({ ok: false, error: 'relay_not_configured' });
  if (locked_()) { audit_('blocked', false); return json_({ ok: false, error: 'locked', message: 'Too many wrong passcodes. Try again in 15 minutes.' }); }
  if (!req || !safeEqual_(String(req.passcode || ''), pass)) { failed_(); audit_(String(req && req.action || '?'), false); Utilities.sleep(1200); return json_({ ok: false, error: 'unauthorized' }); }
  if (!rateOk_()) return json_({ ok: false, error: 'rate_limited' });
  audit_(String(req.action || '?'), true);
  try {
    switch (req.action) {
      case 'ping': return json_({ ok: true, version: VERSION });
      case 'ai':   return json_(ai_(req));
      case 'load': return json_(load_());
      case 'save': return json_(save_(req.data));
      default:     return json_({ ok: false, error: 'unknown_action' });
    }
  } catch (err) {
    return json_({ ok: false, error: 'server_error', message: String(err && err.message || err).slice(0, 300) });
  }
}

/* ---------- AI ---------- */
function ai_(req) {
  var key = prop_('ANTHROPIC_API_KEY');
  if (!key) return { ok: false, error: 'no_api_key' };
  var tier = req.tier === 'complex' ? 'MODEL_COMPLEX' : req.tier === 'quick' ? 'MODEL_QUICK' : 'MODEL_DEFAULT';
  var fallback = tier === 'MODEL_COMPLEX' ? 'claude-opus-5-5' : 'claude-sonnet-5-5';
  var model = prop_(tier) || fallback;
  var body = {
    model: model,
    max_tokens: Math.min(Number(req.max_tokens) || 1500, 4000),
    system: String(req.system || '').slice(0, 20000),
    messages: [{ role: 'user', content: String(req.prompt || '').slice(0, 60000) }]
  };
  var res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    payload: JSON.stringify(body)
  });
  var code = res.getResponseCode();
  var out = {};
  try { out = JSON.parse(res.getContentText()); } catch (e) {}
  if (code === 429) return { ok: false, error: 'rate_limited' };
  if (code >= 300) return { ok: false, error: 'ai_error', status: code, message: (out.error && out.error.message) || ('HTTP ' + code) };
  var text = (out.content || []).filter(function (b) { return b.type === 'text'; }).map(function (b) { return b.text; }).join('');
  return { ok: true, text: text, model: out.model || model };
}

/* ---------- Private data in Drive ---------- */
function dataFile_(create) {
  var id = prop_('DATA_FILE_ID');
  if (id) { try { return DriveApp.getFileById(id); } catch (e) {} }
  var it = DriveApp.getFilesByName(DATA_FILE_NAME);
  if (it.hasNext()) { var f = it.next(); PropertiesService.getScriptProperties().setProperty('DATA_FILE_ID', f.getId()); return f; }
  if (!create) return null;
  var nf = DriveApp.createFile(DATA_FILE_NAME, '{}', 'application/json');
  PropertiesService.getScriptProperties().setProperty('DATA_FILE_ID', nf.getId());
  return nf;
}
function load_() {
  var f = dataFile_(false);
  if (!f) return { ok: true, data: null };
  var txt = f.getBlob().getDataAsString();
  var data = null; try { data = JSON.parse(txt); } catch (e) { return { ok: false, error: 'data_file_unreadable' }; }
  return { ok: true, data: data, updated: f.getLastUpdated().toISOString() };
}
function save_(data) {
  if (!data || typeof data !== 'object') return { ok: false, error: 'nothing_to_save' };
  var txt = JSON.stringify(data);
  if (txt.length > 4500000) return { ok: false, error: 'too_large' };
  var lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    var f = dataFile_(true);
    // keep one backup copy of the previous version in the same folder
    var prev = f.getBlob().getDataAsString();
    if (prev && prev.length > 2) {
      var bk = DriveApp.getFilesByName(DATA_FILE_NAME.replace('.json', ' (previous).json'));
      if (bk.hasNext()) bk.next().setContent(prev); else DriveApp.createFile(DATA_FILE_NAME.replace('.json', ' (previous).json'), prev, 'application/json');
    }
    f.setContent(txt);
    return { ok: true, updated: new Date().toISOString() };
  } finally { lock.releaseLock(); }
}

/* ---------- security ---------- */
// Constant-time comparison so the passcode can't be guessed by timing.
function safeEqual_(a, b) {
  var ha = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, a), hb = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, b), d = 0;
  for (var i = 0; i < ha.length; i++) d |= (ha[i] ^ hb[i]);
  return d === 0;
}
// 5 wrong passcodes within 15 minutes locks the relay for 15 minutes.
function failed_() { var c = CacheService.getScriptCache(); var n = Number(c.get('fails') || 0) + 1; c.put('fails', String(n), 900); if (n >= 5) c.put('lock', '1', 900); }
function locked_() { return CacheService.getScriptCache().get('lock') === '1'; }
// Keeps the last 200 requests (time, action, allowed). Run showAccessLog() in the editor to read it.
function audit_(action, ok) {
  var P = PropertiesService.getScriptProperties(); var log = [];
  try { log = JSON.parse(P.getProperty('AUDIT_LOG') || '[]'); } catch (e) {}
  log.push([new Date().toISOString(), action, ok ? 'ok' : 'DENIED']); if (log.length > 200) log = log.slice(-200);
  P.setProperty('AUDIT_LOG', JSON.stringify(log));
}
function showAccessLog() { Logger.log(PropertiesService.getScriptProperties().getProperty('AUDIT_LOG') || '[]'); }

/* ---------- helpers ---------- */
function prop_(k) { return PropertiesService.getScriptProperties().getProperty(k); }
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function rateOk_() { // max 40 requests per minute
  var c = CacheService.getScriptCache(); var k = 'rl_' + Math.floor(Date.now() / 60000);
  var n = Number(c.get(k) || 0) + 1; c.put(k, String(n), 120); return n <= 40;
}

/* Run once from the editor to test your key (View > Logs). */
function testSetup() {
  Logger.log(JSON.stringify(doGet().getContent()));
  Logger.log(JSON.stringify(ai_({ tier: 'quick', system: 'Reply with OK.', prompt: 'Say OK', max_tokens: 10 })));
}
