# exam-review（考卷檢討）（專案藍圖）

> 本檔為跨 Agent 通用的專案藍圖（AGENTS.md 開放標準）。任何 Agent 的每個 session 都應先讀本檔＋`handoff.md`。
> Claude Code 不讀 `agents.md`，改由 `CLAUDE.md` 的 `@agents.md` import 本檔；Claude 專屬規範寫在 `CLAUDE.md`。

## 專案簡介

考卷檢討簡報的**密碼保護入口**。段考檢討用的 PPT／PDF 放在 Google 雲端硬碟，教師在教室智慧電視上打開這個頁面、掃 QR 用手機授權後才看得到檔案清單，時間一到自動登出。

技術上是「純靜態前端 ＋ Google Apps Script 後端」：前端是單一 HTML（Vanilla JS、深色磨砂玻璃風，沿用 teaching-web 的設計語彙），通行碼與資料夾 ID 只存在後端的設定試算表，前端原始碼裡沒有任何秘密。

**為什麼需要後端**：教室智慧電視不方便登入教師的 Google 帳號，所以考卷資料夾只能設成「知道連結的人可檢視」——這讓**連結本身成為秘密**。純靜態頁沒辦法保守秘密（原始碼公開可讀），所以由 GAS 以教師身分執行、驗證通行碼後才吐出檔案網址。

本專案原本是 `teaching-web` 裡的一頁，2026-08-30 拆成獨立專案。

線上網址：<https://changyiwu.github.io/exam-review/>

## 關鍵時程

<!-- 目前無固定時程 -->

## 目標與路線圖

- [x] 階段一：GAS 後端——手機配對登入、session、檔案樹、一次性檔案 handle
- [x] 階段二：前端頁面——QR 掃碼登入／直接登入／手機授權三種入口、檔案樹、倒數自動登出、手動登出
- [x] 階段三：從 `teaching-web` 拆出為獨立專案，初始化至第 3 層級
- [x] 階段四：登入後流程實測——手機授權解鎖、檔案樹渲染、點檔開新分頁（回 `docs.google.com/presentation/…`）、手動登出並確認 DOM 不殘留檔名
- [x] 階段五：`create_pairing` 失敗改為「快速退避 4 次 → 固定 5 秒永不放棄」＋「立即重試」按鈕（原本一次失敗就停在死畫面）
- [x] 階段六：部署 GitHub Pages（<https://changyiwu.github.io/exam-review/>），線上站台驗過 QR 生成、HTTPS、後端跨來源呼叫、手機授權畫面
- [ ] 階段七：用**真的手機**掃 QR 跑一次完整流程（線上網址已可達，只差實機）
- [ ] 階段八：`teaching-web` 側邊欄的 `href` 已在本機改為新網址，**尚未 commit／push**
- [ ] 階段八：倒數歸零自動登出尚未實測（session 40 分鐘，等不到）；把 `SessionMinutes` 暫時改小即可驗

## 資料夾結構

```
exam-review/
├─ index.html            # 前端全部（HTML＋CSS＋JS 單檔）
├─ header-logo.webp      # 頁首圖示（複製自 teaching-web）
├─ vendor/
│  └─ qrcode.min.js      # QR 函式庫，本地載入（教室網路可能擋 CDN，而 QR 在登入關鍵路徑上）
├─ gas/                  # GAS 後端原始碼，由 clasp 推送
│  ├─ Code.js
│  └─ appsscript.json
├─ tools/
│  └─ nostore.py         # 送 Cache-Control: no-store 的靜態伺服器（預設埠 8765）
├─ .clasp.json           # clasp 專案設定（scriptId、rootDir=gas）
├─ agents.md             # 本檔：專案藍圖
├─ handoff.md            # 交接檔（不進 git）
├─ CLAUDE.md             # 橋接檔
├─ .gitignore
└─ .gitattributes
```

## 同步層級（本專案初始化至第 3 層級）

| 層級 | 平台 | 位置 | 讀取時機 |
|------|------|------|---------|
| L1 | 本地（GDrive） | `agents.md`＋`handoff.md`（不進 git，只走雲端硬碟）＋`CLAUDE.md`（橋接） | 每個 session |
| L2 | GitHub | https://github.com/changyiwu/exam-review （公開） | 指定時 |
| L3 | Obsidian | `exam-review/專案工作流程.md` | 有需要時 |

## 三個檔案的職責（依「時效性」分家，不是依「詳細程度」）

| 檔案 | 時效 | 寫入方式 | 放什麼 |
|------|------|---------|--------|
| `handoff.md` | **只對下一個 session 有效**，過期即丟 | 每次收工**整份重寫** | 做到哪、下一步、**這次**的暫時 workaround |
| `agents.md`（本檔） | **長期有效**，每個 session 都適用 | 只有規則本身變了才改 | 目標、路線圖、常設規則、結構 |
| Obsidian（L3）／`git log` | **歷史**：發生過什麼、為什麼 | 只增不刪 | 決策紀錄、踩坑完整版、逐次進度 |

驗收標準：**`handoff.md` 整份刪掉，不應損失任何長期資訊**——會的話代表該升級進本檔卻沒升級。

**本檔不要出現的東西**（會無限膨脹，且開工每次都要重讀）：
- ❌ `## 最近進度`／逐次工作紀錄 → 寫 Obsidian「🗓️ 最近更動紀錄」
- ❌ 決策記錄、取捨理由、踩坑經過的完整版 → Obsidian「決策紀錄」「🕳️ 踩坑筆記」
- ✅ 只留「結論式的規則」：踩過的坑收斂成一條**祈使句**寫進〈工作約定〉或〈安全邊界〉，理由那一大段留在 Obsidian

## 安全邊界（本專案的存在理由，改動前務必先讀）

1. **通行碼與資料夾 ID 絕對不能出現在前端**。兩者都只存在設定試算表。資料夾 ID 一旦進了 `index.html`，任何人讀原始碼就能拼出 Drive 網址，整個密碼層被繞過——這不是「比較不好」，是功能歸零
2. **`list_tree` 只回檔名與一次性 handle，不回 `fileId`、不回網址**。handle → fileId 的對應表跟著 session 存在 `CacheService`，session 過期就換不到網址。真正的 Drive 網址只在使用者點下該檔案時由 `get_file_url` 當場發出
3. **session token 只存記憶體，不進 `localStorage`／`sessionStorage`**。教室智慧電視是實體上任何人都走得到的裝置，存起來等於下課後學生也能繼續看。重新整理或關掉分頁就自動登出，重新掃碼只要幾秒
4. **倒數歸零一律 `location.reload()`，不要只清 DOM**。後端 session 過期不會讓已經渲染出來的檔名消失，也不會讓已開啟的 Drive 網址失效；整頁重載才能把畫面內容與記憶體裡的 token 一次清乾淨
5. **頁面上不提供「變更通行碼」功能**。改密碼一律去設定試算表——電視前站得到的人不該能改密碼
6. **兩個 Drive 資料夾的分享設定不可混放**：
   - `考卷檢討` ＝ 知道連結的人可檢視，**只放 PPT／PDF**。**它的資料夾 ID 不可寫進這個 repo 的任何檔案**（本 repo 公開；那個 ID 等同通行證），只放設定試算表的 `FolderId` 那一格
   - `考卷檢討-後台`（`1jI1X3aw-Fgq9GeQ7FsFvS5M1vvsfqrqk`）＝ **不分享**，放 GAS 專案與設定試算表。這個 ID 可以寫在程式裡，沒有權限的人拿到也打不開
   Drive 權限由上往下繼承，且「我的雲端硬碟」的子項目**無法移除**繼承來的分享權限。設定試算表若放進已分享的資料夾，通行碼就對所有拿到連結的人公開
7. **QR Code 只帶 `pairId`**，領取 token 用的 `pollKey` 不離開大螢幕
8. 本專案擋得住：搜尋引擎索引、學生從網站點進去、暴力破解（通道鎖 5 次／全域 10 次鎖 15 分鐘）。**擋不住**：教師解鎖後被人看到網址列並抄走連結——那是「知道連結的人可檢視」的本質，接受這個殘留風險是當初的選擇

## 專案專屬規則

- **前端維持 Vanilla**：不引入 CSS 框架或前端框架，設計語彙沿用 `teaching-web`（深色磨砂玻璃、`Outfit` ＋ `Noto Sans TC`、Font Awesome 6）
- **登入畫面的版面刻意與 `class-score` 一致**（`login-card` / `qr-container` / `divider` / `login-instructions` 那一套），讓兩個系統在課堂上看起來是同一家的東西
- **更新 GAS 一律 `clasp redeploy <deploymentId>`，不可用 `clasp deploy`**（後者會產生新網址，前端的 `GAS_API_URL` 就對不上）
  - scriptId：`1m1Koi8Usidz5MRANg8PjHD9Au0wj3XWzmt2xgQcds4E_eOf1vMJGqMNW`
  - deploymentId：`AKfycbzpXp7FktNfhSGTHyyM89V0_UW_G7eVd5CmjlXZxoqs2zdaVpmypIZtAVLnazQsdCS4`
- **部署設定不可改**：`executeAs: USER_DEPLOYING`（後端要以教師身分讀 Drive）、`access: ANYONE_ANONYMOUS`（電視沒登入 Google，非如此不可；安全由通行碼層負責）
- **前端 `fetch` 不可帶 `Content-Type` 標頭**：讓瀏覽器送成 `text/plain` 以避開 CORS preflight。GAS 不回應 `OPTIONS`，加了標頭整個 API 就掛掉
- **QR 函式庫一律本地載入**（`vendor/qrcode.min.js`），不要改用 CDN：它在登入關鍵路徑上，教室網路擋掉 CDN 就登不進去
- **外部連結一律 `target="_blank" rel="noopener noreferrer"`**
- **新增 GAS 端點時要分清楚免驗證與需驗證**：只有 `create_pairing`／`check_pairing`／`login` 免驗證，其餘一律先過 `isSessionValid`
- **連線失敗的復原一律「先快後慢、但永不放棄」**：前 4 次退避（800×2ⁿ ms）處理一秒內就會好的瞬間失敗（登出／倒數重新導向時 fetch 被導覽中斷），之後轉固定 5 秒無限重試。**不可以設重試上限**——教室電視是無人看顧的裝置，網路過幾分鐘才恢復時它必須自己好，停在那裡等人來按等於當掉。另外保留一顆「立即重試」按鈕給不想等的人，且 `startPairing()` 進入時要 `clearTimeout(retryTimer)`，否則手動重試會跟排程中的重試疊成兩條鏈

## 工作約定

- 任何 Agent、任何電腦：**開工先讀 `handoff.md`，收工必更新 `handoff.md`**
- `handoff.md` **不進 git**（含真實電腦名與本機絕對路徑），已列入 `.gitignore`，跨電腦靠雲端硬碟同步——不要把它加回版控
- 所有回應與文件使用繁體中文；涉及檔案操作時回報完整產出位置
- Windows 指令優先使用 PowerShell
- 只 stage 本次任務相關檔案，**不使用無差別的 `git add .`**；僅在使用者明確授權時 commit 與 push
- 收工前檢查程式碼是否含通行碼、資料夾 ID、學生姓名等敏感資料
- 本機驗收一律走 HTTP：`python tools/nostore.py`（會送 `Cache-Control: no-store`）。預覽窗格會供快取的舊版 CSS/JS，`navigate` 帶 `force` 或加 query 參數都擋不住
- **不要用 `curl -L` 測 GAS 端點**：GAS 會 302 轉址，curl 重送時掉了 `Content-Length`，一律回 `411 Length Required`，看起來像後端壞掉。要測就在瀏覽器裡用 `fetch`
- **量版面溢出前先確認 `innerWidth` 不是 0**：預覽窗格尚未配置版面時所有 `getBoundingClientRect()` 都回 0，掃描程式會把畫面上每一個元素都報成溢出。先 `resize_window` 指定寬度、確認 `innerWidth` 正確再量
- **判斷「會不會出現捲軸」一律量 `scrollWidth - clientWidth`**，不要用 `offsetWidth - clientWidth`（後者含 border，會有 1px 假陽性）。但 `overflow: hidden` ＋ `text-overflow: ellipsis` 的元素本來就 `scrollWidth > clientWidth`，那是截斷不是捲軸，要排除
- **`text-overflow: ellipsis` 對 inline 元素無效**：`<span>` 要先 `display: block` 才截得掉，否則長檔名會把整張卡片撐破（實測撐破 181px）。同排的 flex 項目還要補 `min-width: 0` 解掉 min-content 底線
- **QR 函式庫會生成「一個內聯隱藏的 canvas ＋ 一張 img」**：CSS 只對 `img` 下樣式。若連 `canvas` 也寫 `display: block` 會冒出第二個 QR；反過來說，用 `querySelector('img, canvas')` 取到的是那個隱藏的 canvas，量出來會是 0×0，看起來像 QR 沒生成
- **`min-height: 100vh` 的 flex 置中容器不會裁切過高的內容**（容器會跟著長高），不必為此改寫成 grid 彈簧。但若改成固定 `height` 就會裁，且上緣捲不到
- 驗收登入後的流程需要真的通行碼；**不要向使用者索取通行碼**，改用「請使用者在自己的瀏覽器開 `?pair=<pairId>` 完成授權」，大螢幕分頁會自己解鎖。`pairId` 可從頁面每 3 秒一次的 `check_pairing` 請求 body 攔下來
