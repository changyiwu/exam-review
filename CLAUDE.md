@agents.md

<!--
  本檔是「橋接檔」：Claude Code 只讀 CLAUDE.md，不讀 agents.md，
  所以用第一行的 @agents.md 把跨 Agent 專案藍圖 import 進來。
  專案內容一律寫進 agents.md，這裡只放 Claude Code 專屬規範，避免兩份分叉。
-->

## Claude Code 專屬

- **不要向使用者索取通行碼**。要驗登入後的流程時，請使用者在自己的瀏覽器開 `?pair=<pairId>` 完成授權，大螢幕分頁會自己解鎖
- 預覽窗格**隱藏時用 `ref` 點擊不會生效**：要先 `tabs_select` 把分頁移到前景、拍一張 `screenshot`，再用截圖座標點擊
