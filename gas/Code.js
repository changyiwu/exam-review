/**
 * 考卷檢討後台 — teaching-web 的 exam-review.html 專用後端
 * ---------------------------------------------------------------------------
 * 設計要點（改動前請先讀）：
 *
 * 1. 通行碼與資料夾 ID 一律只存在「考卷檢討-後台」資料夾裡的設定試算表，
 *    絕不能出現在前端。資料夾 ID 一旦外流，密碼層就被整個繞過。
 * 2. 通行碼不在網路上裸奔：前端送 SHA-256，後端讀出儲存格明文自己算一次再比對。
 *    儲存格放明文是刻意的，這樣老師可以直接用手機在試算表裡改。
 * 3. 教室智慧電視是實體上任何人都走得到的裝置，所以「不做」長效登入：
 *    session 存 CacheService、時間到自動失效，前端也必須跟著鎖畫面。
 * 4. list_tree 只回檔名與一次性 handle，不回 fileId 也不回網址。
 *    真正的 Drive 網址只在使用者按下該檔案時，由 get_file_url 當場發出。
 *    handle 對應表跟著 session 一起過期，過期後拿舊 handle 也換不到網址。
 *
 * 部署：clasp push 後，更新既有部署一律用
 *   clasp redeploy <deploymentId>
 * 不可用 clasp deploy（會產生新網址，前端就對不上了）。
 */

// ===== 常數 =====

// 後台資料夾（未分享）。這個 ID 不算秘密——沒有權限的人拿到也打不開。
var BACKEND_FOLDER_ID = '1jI1X3aw-Fgq9GeQ7FsFvS5M1vvsfqrqk';

// ⚠️ 考卷資料夾的 ID 一律不寫在這個檔案裡，只放設定試算表的 FolderId 那一格。
//    那個資料夾是「知道連結的人可檢視」，ID 等同於通行證，而本檔在公開 repo。
var SETTINGS_FILE_NAME = '考卷檢討設定';
var SETTINGS_SHEET_NAME = 'Settings';
var PROP_SPREADSHEET_ID = 'SETTINGS_SPREADSHEET_ID';

var SETTINGS_CACHE_KEY = 'exam_settings_v1';
var SETTINGS_CACHE_SECONDS = 60;      // 改完通行碼最多一分鐘生效

var SESSION_KEY_PREFIX = 'exam_sess_';
var FILEMAP_KEY_PREFIX = 'exam_files_';
var PAIRING_KEY_PREFIX = 'exam_pair_';
var PAIRCODE_KEY_PREFIX = 'exam_code_';   // 電視上顯示的 6 位數 -> pairId

var PAIRING_TTL_SECONDS = 600;        // 配對通道 10 分鐘沒人授權就失效
var MAX_PAIRING_FAILURES = 5;         // 單一配對通道容許的密碼錯誤次數

var DIRECT_FAIL_KEY = 'exam_direct_fails';
var MAX_DIRECT_FAILURES = 10;         // 直接登入的全域失敗上限
var DIRECT_LOCK_SECONDS = 900;        // 超過就鎖 15 分鐘

var DEFAULT_SESSION_MINUTES = 30;
var MAX_SESSION_MINUTES = 360;        // CacheService 的硬上限是 6 小時

var MAX_TREE_DEPTH = 4;
var MAX_TREE_FILES = 300;

// ===== 進入點 =====

function doGet() {
  return ContentService
    .createTextOutput('考卷檢討後台已啟動。此端點只接受 POST。')
    .setMimeType(ContentService.MimeType.TEXT);
}

function doPost(e) {
  try {
    var request = JSON.parse(e.postData.contents);
    var action = request.action;

    // 1. 免驗證的登入流程端點
    switch (action) {
      case 'create_pairing':
        return handleCreatePairing();
      case 'check_pairing':
        return handleCheckPairing(request.pairId, request.pollKey);
      case 'login':
        return handleLogin(request);
    }

    // 2. 其餘動作一律驗證 session token
    var session = request.session;
    if (!session || !isSessionValid(session)) {
      return jsonResponse({ success: false, error: 'Unauthorized', code: 401 });
    }

    // 3. 已驗證的動作
    switch (action) {
      case 'check_session':
        return jsonResponse({
          success: true,
          authenticated: true,
          remainingSeconds: sessionRemainingSeconds(session)
        });
      case 'list_tree':
        return handleListTree(session);
      case 'get_file_url':
        return handleGetFileUrl(session, request.handle);
      case 'logout':
        return handleLogout(session);
    }

    return jsonResponse({ success: false, error: '未知的動作：' + action });
  } catch (err) {
    return jsonResponse({ success: false, error: '後端錯誤：' + err.message });
  }
}

function jsonResponse(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

// ===== 設定（試算表） =====

/**
 * 一次性安裝：建立設定試算表、寫好預設列、記住它的 ID。
 * 在 Apps Script 編輯器裡手動執行一次即可（順便完成 Drive 授權）。
 * 已經建過就不會重複建，只會回報現有的 ID。
 */
function setup() {
  var props = PropertiesService.getScriptProperties();
  var existingId = props.getProperty(PROP_SPREADSHEET_ID);

  if (existingId) {
    try {
      var existing = SpreadsheetApp.openById(existingId);
      Logger.log('設定試算表已存在：' + existing.getUrl());
      return existing.getUrl();
    } catch (err) {
      Logger.log('記錄的試算表打不開，重新建立。');
    }
  }

  var ss = SpreadsheetApp.create(SETTINGS_FILE_NAME);
  var sheet = ss.getSheets()[0];
  sheet.setName(SETTINGS_SHEET_NAME);

  sheet.getRange(1, 1, 4, 3).setValues([
    ['Key', 'Value', '說明'],
    ['Password', '', '通行碼。請直接在這一格填明文，前端傳輸與比對都用 SHA-256。'],
    ['SessionMinutes', DEFAULT_SESSION_MINUTES, '登入後多久自動登出（分鐘）。上限 ' + MAX_SESSION_MINUTES + '。'],
    ['FolderId', '', '考卷檢討資料夾的 ID（分享設定為「知道連結的人可檢視」的那一個）。']
  ]);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, 3).setFontWeight('bold');
  sheet.setColumnWidth(1, 140);
  sheet.setColumnWidth(2, 260);
  sheet.setColumnWidth(3, 520);

  // 搬進「考卷檢討-後台」（未分享），不能留在雲端硬碟根目錄
  var file = DriveApp.getFileById(ss.getId());
  DriveApp.getFolderById(BACKEND_FOLDER_ID).addFile(file);
  DriveApp.getRootFolder().removeFile(file);

  props.setProperty(PROP_SPREADSHEET_ID, ss.getId());
  CacheService.getScriptCache().remove(SETTINGS_CACHE_KEY);

  Logger.log('設定試算表已建立：' + ss.getUrl());
  Logger.log('請填入 Password 與 FolderId 兩格後再使用。');
  return ss.getUrl();
}

function getSettingsSpreadsheet() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty(PROP_SPREADSHEET_ID);

  if (id) {
    try {
      return SpreadsheetApp.openById(id);
    } catch (err) {
      // 落到下面用檔名找
    }
  }

  // 後備：在後台資料夾裡用檔名找（試算表被搬動或重建時仍找得到）
  var files = DriveApp.getFolderById(BACKEND_FOLDER_ID).getFilesByName(SETTINGS_FILE_NAME);
  if (files.hasNext()) {
    var found = files.next();
    props.setProperty(PROP_SPREADSHEET_ID, found.getId());
    return SpreadsheetApp.openById(found.getId());
  }

  throw new Error('找不到設定試算表，請先在編輯器執行一次 setup()。');
}

function getSettings() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get(SETTINGS_CACHE_KEY);
  if (cached) return JSON.parse(cached);

  var sheet = getSettingsSpreadsheet().getSheetByName(SETTINGS_SHEET_NAME);
  if (!sheet) throw new Error('設定試算表裡找不到 ' + SETTINGS_SHEET_NAME + ' 分頁。');

  var rows = sheet.getDataRange().getValues();
  var map = {};
  for (var i = 1; i < rows.length; i++) {
    var key = String(rows[i][0]).trim();
    if (key) map[key] = rows[i][1];
  }

  var minutes = parseInt(map.SessionMinutes, 10);
  if (isNaN(minutes) || minutes <= 0) minutes = DEFAULT_SESSION_MINUTES;
  if (minutes > MAX_SESSION_MINUTES) minutes = MAX_SESSION_MINUTES;

  var settings = {
    password: map.Password === undefined || map.Password === null ? '' : String(map.Password).trim(),
    sessionMinutes: minutes,
    folderId: map.FolderId === undefined || map.FolderId === null ? '' : String(map.FolderId).trim()
  };

  cache.put(SETTINGS_CACHE_KEY, JSON.stringify(settings), SETTINGS_CACHE_SECONDS);
  return settings;
}

// ===== 雜湊與比對 =====

function sha256Hex(text) {
  var digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8);
  var out = '';
  for (var i = 0; i < digest.length; i++) {
    var byte = digest[i] < 0 ? digest[i] + 256 : digest[i];
    out += (byte < 16 ? '0' : '') + byte.toString(16);
  }
  return out;
}

/** 定時比較，避免以回應時間推測通行碼 */
function constantTimeEquals(a, b) {
  var sa = String(a || '');
  var sb = String(b || '');
  if (sa.length !== sb.length) return false;
  var diff = 0;
  for (var i = 0; i < sa.length; i++) {
    diff |= sa.charCodeAt(i) ^ sb.charCodeAt(i);
  }
  return diff === 0;
}

// ===== Session =====

function createSession(minutes) {
  var token = Utilities.getUuid() + Utilities.getUuid();
  var expiresAt = Date.now() + minutes * 60 * 1000;
  CacheService.getScriptCache()
              .put(SESSION_KEY_PREFIX + token, String(expiresAt), minutes * 60);
  return { token: token, expiresAt: expiresAt, minutes: minutes };
}

function isSessionValid(session) {
  if (!session) return false;
  return CacheService.getScriptCache().get(SESSION_KEY_PREFIX + session) !== null;
}

function sessionRemainingSeconds(session) {
  var raw = CacheService.getScriptCache().get(SESSION_KEY_PREFIX + session);
  if (!raw) return 0;
  return Math.max(0, Math.round((parseInt(raw, 10) - Date.now()) / 1000));
}

function handleLogout(session) {
  var cache = CacheService.getScriptCache();
  cache.remove(SESSION_KEY_PREFIX + session);
  cache.remove(FILEMAP_KEY_PREFIX + session);
  return jsonResponse({ success: true });
}

// ===== 配對（電視顯示配對碼，手機輸入通行碼授權） =====

function readPairing(pairId) {
  if (!pairId) return null;
  var raw = CacheService.getScriptCache().get(PAIRING_KEY_PREFIX + pairId);
  return raw ? JSON.parse(raw) : null;
}

function writePairing(pairId, pairing) {
  CacheService.getScriptCache()
              .put(PAIRING_KEY_PREFIX + pairId, JSON.stringify(pairing), PAIRING_TTL_SECONDS);
}

function removePairing(pairId) {
  var cache = CacheService.getScriptCache();
  var pairing = readPairing(pairId);
  if (pairing && pairing.code) cache.remove(PAIRCODE_KEY_PREFIX + pairing.code);
  cache.remove(PAIRING_KEY_PREFIX + pairId);
}

/** 手機只知道電視上顯示的 6 位數，要靠這張反查表找到真正的通道 */
function resolvePairIdByCode(code) {
  var clean = String(code || '').replace(/\D/g, '');
  if (clean.length !== 6) return null;
  return CacheService.getScriptCache().get(PAIRCODE_KEY_PREFIX + clean);
}

function handleCreatePairing() {
  var pairId = Utilities.getUuid();
  var pollKey = Utilities.getUuid();
  var cache = CacheService.getScriptCache();

  // 配對碼給人看，要短好唸；pairId／pollKey 才是真正的憑證。
  // 同時間可能有別台在配對，撞號就重抽。
  var code = null;
  for (var i = 0; i < 5; i++) {
    var candidate = '' + Math.floor(Math.random() * 900000 + 100000);
    if (!cache.get(PAIRCODE_KEY_PREFIX + candidate)) {
      code = candidate;
      break;
    }
  }
  if (!code) {
    return jsonResponse({ success: false, error: '目前配對通道忙碌，請稍後再試' });
  }

  cache.put(PAIRCODE_KEY_PREFIX + code, pairId, PAIRING_TTL_SECONDS);
  writePairing(pairId, { pollKey: pollKey, code: code, session: null, failures: 0 });

  return jsonResponse({
    success: true,
    pairId: pairId,
    pollKey: pollKey,
    code: code,
    expiresInSeconds: PAIRING_TTL_SECONDS
  });
}

function handleCheckPairing(pairId, pollKey) {
  var pairing = readPairing(pairId);

  if (!pairing || !pollKey || pairing.pollKey !== pollKey) {
    return jsonResponse({
      success: false,
      expired: true,
      error: '登入通道已失效，請重新整理頁面'
    });
  }

  if (!pairing.session) {
    return jsonResponse({ success: true, authenticated: false });
  }

  // 一次性交付：交出去就把通道銷毀
  removePairing(pairId);

  return jsonResponse({
    success: true,
    authenticated: true,
    session: pairing.session.token,
    expiresAt: pairing.session.expiresAt,
    sessionMinutes: pairing.session.minutes
  });
}

// ===== 登入 =====

function handleLogin(request) {
  var settings = getSettings();

  if (!settings.password) {
    return jsonResponse({
      success: false,
      error: '後端尚未設定通行碼，請在設定試算表填入 Password。'
    });
  }

  var expectedHash = sha256Hex(settings.password);
  var providedHash = String(request.passwordHash || '').toLowerCase();
  // 手機端只會送 code（電視上顯示的 6 位數），在這裡換成真正的 pairId
  var pairId = request.pairId || (request.code ? resolvePairIdByCode(request.code) : null);

  if (request.code && !pairId) {
    return jsonResponse({ success: false, expired: true, error: '找不到這組配對碼，請確認電視上的數字，或在電視重新整理頁面' });
  }

  // (A) 手機授權電視：把 session 掛進該配對通道
  if (pairId) {
    var pairing = readPairing(pairId);
    if (!pairing) {
      return jsonResponse({ success: false, expired: true, error: '登入通道已失效，請在電視上重新整理頁面' });
    }
    if (pairing.failures >= MAX_PAIRING_FAILURES) {
      return jsonResponse({ success: false, error: '通行碼錯誤次數過多，請在電視上重新整理頁面取得新的登入通道' });
    }
    if (!constantTimeEquals(providedHash, expectedHash)) {
      pairing.failures += 1;
      writePairing(pairId, pairing);
      var left = MAX_PAIRING_FAILURES - pairing.failures;
      return jsonResponse({
        success: false,
        error: left > 0 ? '通行碼錯誤，尚可嘗試 ' + left + ' 次' : '通行碼錯誤次數過多，請在電視上重新整理頁面取得新的登入通道'
      });
    }

    pairing.session = createSession(settings.sessionMinutes);
    writePairing(pairId, pairing);
    return jsonResponse({ success: true, authenticated: true, paired: true });
  }

  // (B) 直接登入（自己的電腦或手機）
  var cache = CacheService.getScriptCache();
  var fails = parseInt(cache.get(DIRECT_FAIL_KEY) || '0', 10);
  if (fails >= MAX_DIRECT_FAILURES) {
    return jsonResponse({ success: false, error: '通行碼錯誤次數過多，請等 15 分鐘後再試' });
  }

  if (!constantTimeEquals(providedHash, expectedHash)) {
    cache.put(DIRECT_FAIL_KEY, String(fails + 1), DIRECT_LOCK_SECONDS);
    var remaining = MAX_DIRECT_FAILURES - fails - 1;
    return jsonResponse({
      success: false,
      error: remaining > 0 ? '通行碼錯誤，尚可嘗試 ' + remaining + ' 次' : '通行碼錯誤次數過多，請等 15 分鐘後再試'
    });
  }

  cache.remove(DIRECT_FAIL_KEY);
  var s = createSession(settings.sessionMinutes);
  return jsonResponse({
    success: true,
    authenticated: true,
    session: s.token,
    expiresAt: s.expiresAt,
    sessionMinutes: s.minutes
  });
}

// ===== 檔案樹 =====

/**
 * 回傳資料夾樹。檔案一律只給 handle，不給 fileId、不給網址。
 * handle -> fileId 的對應表跟著 session 存進 cache，session 一過期就換不到網址。
 */
function handleListTree(session) {
  var settings = getSettings();
  if (!settings.folderId) {
    return jsonResponse({ success: false, error: '後端尚未設定資料夾，請在設定試算表填入 FolderId。' });
  }

  var root;
  try {
    root = DriveApp.getFolderById(settings.folderId);
  } catch (err) {
    return jsonResponse({ success: false, error: '設定的 FolderId 打不開，請確認試算表裡的值。' });
  }

  var fileMap = {};
  var counter = { files: 0, truncated: false };
  var tree = buildTree(root, 0, fileMap, counter);

  CacheService.getScriptCache().put(
    FILEMAP_KEY_PREFIX + session,
    JSON.stringify(fileMap),
    Math.max(60, sessionRemainingSeconds(session))
  );

  return jsonResponse({
    success: true,
    name: root.getName(),
    tree: tree,
    truncated: counter.truncated,
    remainingSeconds: sessionRemainingSeconds(session)
  });
}

function buildTree(folder, depth, fileMap, counter) {
  var nodes = [];

  var subFolders = folder.getFolders();
  while (subFolders.hasNext()) {
    var sub = subFolders.next();
    nodes.push({
      type: 'folder',
      name: sub.getName(),
      children: depth + 1 < MAX_TREE_DEPTH ? buildTree(sub, depth + 1, fileMap, counter) : []
    });
  }

  var files = folder.getFiles();
  while (files.hasNext()) {
    if (counter.files >= MAX_TREE_FILES) {
      counter.truncated = true;
      break;
    }
    var file = files.next();
    var handle = Utilities.getUuid();
    fileMap[handle] = file.getId();
    counter.files += 1;

    nodes.push({
      type: 'file',
      name: file.getName(),
      handle: handle,
      mimeType: file.getMimeType(),
      size: file.getSize(),
      modified: Utilities.formatDate(file.getLastUpdated(), 'Asia/Taipei', 'yyyy-MM-dd')
    });
  }

  // 資料夾在前、檔案在後，各自依名稱排序（1-七上、2-七下… 的數字前綴就是靠這個排對）
  nodes.sort(function (a, b) {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
    return a.name.localeCompare(b.name, 'zh-Hant');
  });

  return nodes;
}

function handleGetFileUrl(session, handle) {
  var raw = CacheService.getScriptCache().get(FILEMAP_KEY_PREFIX + session);
  if (!raw) {
    return jsonResponse({ success: false, error: '檔案清單已過期，請重新整理' });
  }

  var fileMap = JSON.parse(raw);
  var fileId = fileMap[handle];
  if (!fileId) {
    return jsonResponse({ success: false, error: '找不到這個檔案，請重新整理' });
  }

  try {
    return jsonResponse({ success: true, url: DriveApp.getFileById(fileId).getUrl() });
  } catch (err) {
    return jsonResponse({ success: false, error: '檔案打不開，可能已被刪除或移動' });
  }
}
