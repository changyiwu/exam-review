"""教材頁本機驗收用的靜態伺服器。

跟 `python -m http.server` 的差別只有一個：每個回應都送 `Cache-Control: no-store`。
Browser pane 會死抓快取的舊版 CSS/JS，`navigate` 帶 force 與加 query 參數都擋不住，
只有伺服器端明講不要快取才有效——所以驗收一律用這支，不要用預設的 http.server。

用法（專案根目錄或任何位置都可以）：

    python tools/nostore.py            # http://127.0.0.1:8765
    python tools/nostore.py 9000       # 換一個埠

網站根目錄固定是本檔的上一層，也就是 repo 根目錄。
"""

import os
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8765


class NoStoreHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def log_message(self, *args):
        pass  # 驗收時的請求量很大，全印出來只會洗版


def main():
    print(f'serving {ROOT}')
    print(f'  http://127.0.0.1:{PORT}/index.html')
    print(f'  http://127.0.0.1:{PORT}/materials/1-1-1/index.html')
    print('  (Cache-Control: no-store)')
    ThreadingHTTPServer(('127.0.0.1', PORT), NoStoreHandler).serve_forever()


if __name__ == '__main__':
    main()
