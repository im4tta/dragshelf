// Drag Shelf - a temporary shelf for files, links, text and images.
#define UNICODE
#define _UNICODE
#define WINVER 0x0A00
#define _WIN32_WINNT 0x0A00
#define _WIN32_IE 0x0A00
#include <winsock2.h>
#include <ws2tcpip.h>
#include <cstdint>
#include <windows.h>
#include <windowsx.h>
#include <shellapi.h>
#include <shlobj.h>
#include <shlwapi.h>
#include <shobjidl.h>
#include <objidl.h>
#include <string>
#include <vector>
#include <map>
#include <algorithm>
#include <cstdio>
#include <cmath>

#define WM_TRAY      (WM_APP + 1)
#define WM_DRAGSTART (WM_APP + 2)
#define WM_DRAGEND   (WM_APP + 3)
#define TIMER_HIDE   1
#define ID_SHOW      1
#define ID_STRICT    2
#define ID_AUTOSTART 3
#define ID_EXCL_EDIT 4
#define ID_EXCL_LAST 5
#define ID_EXIT      6
#define ID_RENAME    7
#define ID_CLEAR     8
#define ID_DELSHELF  9
#define ID_CLEARALL  10
#define ID_HOTKEY    20
#define ID_PHONE     21
#define ID_GUIDE     22
#define ID_THEME0    100
#define ID_ACC0      110

typedef std::wstring ws;

// ---------------------------------------------------------------- state
struct Shelf { ws name; std::vector<ws> items; };
static std::vector<Shelf> g_shelves;
static int g_active = 0;
static HWND g_hwnd = nullptr, g_edit = nullptr;
static HINSTANCE g_inst;
static UINT g_dpi = 96;
static HFONT g_font = nullptr, g_fontSmall = nullptr, g_fontBold = nullptr;
static int g_scroll = 0;
static HWND g_phoneWnd = nullptr;
static bool g_pinned = false;       // shown from tray, don't auto-hide
static bool g_strict = true;
static bool g_dropHot = false;
static int g_insertY = -1;
static int g_hoverItem = -1;
static bool g_tracking = false;
static ws g_dataDir, g_stashDir, g_lastExe;
static UINT g_taskbarMsg;
static std::map<ws, HBITMAP> g_thumb;
static NOTIFYICONDATAW g_nid;

// drag-out state
static bool g_selfDrag = false, g_droppedSelf = false;
static int g_dragSrc = 0;
static std::vector<ws> g_dragPaths;
// hover-to-switch
static int g_hoverTab = -1; static DWORD g_hoverTick = 0;

// layout (96-dpi units)
static const int W = 300, TABH = 32, ROWH = 42, MAXROWS = 8, MINROWS = 3;
static inline int S(int v) { return MulDiv(v, g_dpi, 96); }

// colors / theme
static COLORREF C_BG, C_TAB, C_ROW, C_TXT, C_DIM, C_ACC, C_HOT;
static int g_theme = 0, g_accent = 0;   // theme: 0 auto, 1 light, 2 dark
static UINT g_hkMod = MOD_CONTROL | MOD_SHIFT, g_hkVk = 'F';
static const COLORREF ACCENTS[7] = { RGB(0,120,215), RGB(136,98,224), RGB(214,84,150), RGB(210,64,64), RGB(224,128,32), RGB(40,160,90), RGB(0,160,160) };
static const wchar_t* ACCNAMES[7] = { L"Blue", L"Purple", L"Pink", L"Red", L"Orange", L"Green", L"Teal" };
static bool SystemIsDark() {
    DWORD v = 1, sz = sizeof v; HKEY k;
    if (RegOpenKeyExW(HKEY_CURRENT_USER, L"Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize", 0, KEY_READ, &k) == ERROR_SUCCESS) {
        RegQueryValueExW(k, L"AppsUseLightTheme", nullptr, nullptr, (BYTE*)&v, &sz); RegCloseKey(k);
    } return v == 0;
}
static void ApplyTheme() {
    bool dark = g_theme == 2 || (g_theme == 0 && SystemIsDark());
    if (dark) { C_BG = RGB(30,30,34); C_TAB = RGB(58,58,66); C_ROW = RGB(42,42,48); C_TXT = RGB(232,232,236); C_DIM = RGB(150,150,160); C_HOT = RGB(70,70,80); }
    else { C_BG = RGB(246,246,249); C_TAB = RGB(220,223,232); C_ROW = RGB(255,255,255); C_TXT = RGB(28,28,36); C_DIM = RGB(104,104,118); C_HOT = RGB(230,235,246); }
    C_ACC = ACCENTS[std::max(0, std::min(6, g_accent))];
}
static void ShowGuide(); static void TogglePhone(); static void ChangeHotkey(); static ws HotkeyName(UINT mod, UINT vk);

static Shelf& cur() { return g_shelves[g_active]; }
static int TotalItems() { int n = 0; for (auto& s : g_shelves) n += (int)s.items.size(); return n; }

// ---------------------------------------------------------------- helpers
static ws KnownFolder(REFKNOWNFOLDERID id) {
    PWSTR p = nullptr; ws r;
    if (SUCCEEDED(SHGetKnownFolderPath(id, 0, nullptr, &p))) { r = p; CoTaskMemFree(p); }
    return r;
}
static ws Sanitize(ws s) {
    for (auto& c : s) if (wcschr(L"\\/:*?\"<>|\r\n\t", c) || c < 32) c = L'_';
    while (!s.empty() && (s.back() == L' ' || s.back() == L'.')) s.pop_back();
    if (s.size() > 120) s.resize(120);
    return s;
}
static bool Exists(const ws& p) { return GetFileAttributesW(p.c_str()) != INVALID_FILE_ATTRIBUTES; }
static ws UniqueIn(const ws& dir, ws name) {
    name = Sanitize(name); if (name.empty()) name = L"item";
    ws full = dir + L"\\" + name; if (!Exists(full)) return full;
    ws stem = name, ext; size_t dot = name.rfind(L'.');
    if (dot != ws::npos && dot > 0) { stem = name.substr(0, dot); ext = name.substr(dot); }
    for (int i = 2; i < 5000; i++) {
        full = dir + L"\\" + stem + L" (" + std::to_wstring(i) + L")" + ext;
        if (!Exists(full)) return full;
    }
    return full;
}
static bool WriteBytes(const ws& path, const void* data, size_t len) {
    HANDLE h = CreateFileW(path.c_str(), GENERIC_WRITE, 0, nullptr, CREATE_NEW, FILE_ATTRIBUTE_NORMAL, nullptr);
    if (h == INVALID_HANDLE_VALUE) return false;
    DWORD w = 0; bool ok = WriteFile(h, data, (DWORD)len, &w, nullptr) && w == len;
    CloseHandle(h); return ok;
}
static std::string ToUtf8(const ws& s) {
    if (s.empty()) return "";
    int n = WideCharToMultiByte(CP_UTF8, 0, s.data(), (int)s.size(), nullptr, 0, nullptr, nullptr);
    std::string r(n, 0); WideCharToMultiByte(CP_UTF8, 0, s.data(), (int)s.size(), &r[0], n, nullptr, nullptr); return r;
}
static ws FromUtf8(const std::string& s) {
    if (s.empty()) return L"";
    int n = MultiByteToWideChar(CP_UTF8, 0, s.data(), (int)s.size(), nullptr, 0);
    ws r(n, 0); MultiByteToWideChar(CP_UTF8, 0, s.data(), (int)s.size(), &r[0], n); return r;
}
static std::string ReadAll(const ws& path) {
    std::string out; HANDLE h = CreateFileW(path.c_str(), GENERIC_READ, FILE_SHARE_READ, nullptr, OPEN_EXISTING, 0, nullptr);
    if (h == INVALID_HANDLE_VALUE) return out;
    char buf[8192]; DWORD n;
    while (ReadFile(h, buf, sizeof buf, &n, nullptr) && n) out.append(buf, n);
    CloseHandle(h); return out;
}
static ws Timestamp() {
    SYSTEMTIME t; GetLocalTime(&t); wchar_t b[64];
    swprintf(b, 64, L"%04d-%02d-%02d %02d.%02d.%02d", t.wYear, t.wMonth, t.wDay, t.wHour, t.wMinute, t.wSecond); return b;
}

// ---------------------------------------------------------------- persistence
static void Save() {
    std::string o;
    for (auto& s : g_shelves) {
        o += "S\t" + ToUtf8(s.name) + "\n";
        for (auto& i : s.items) o += "I\t" + ToUtf8(i) + "\n";
    }
    DeleteFileW((g_dataDir + L"\\shelves.tmp").c_str());
    ws tmp = g_dataDir + L"\\shelves.tmp";
    if (WriteBytes(tmp, o.data(), o.size()))
        MoveFileExW(tmp.c_str(), (g_dataDir + L"\\shelves.txt").c_str(), MOVEFILE_REPLACE_EXISTING);
}
static void Load() {
    std::string d = ReadAll(g_dataDir + L"\\shelves.txt"); size_t p = 0;
    while (p < d.size()) {
        size_t e = d.find('\n', p); if (e == std::string::npos) e = d.size();
        std::string line = d.substr(p, e - p); p = e + 1;
        if (line.size() < 2 || line[1] != '\t') continue;
        ws v = FromUtf8(line.substr(2));
        if (line[0] == 'S') g_shelves.push_back({ v, {} });
        else if (line[0] == 'I' && !g_shelves.empty()) g_shelves.back().items.push_back(v);
    }
    if (g_shelves.empty()) g_shelves.push_back({ L"Shelf 1", {} });
}
static ws IniPath() { return g_dataDir + L"\\settings.ini"; }

// ---------------------------------------------------------------- dpi / fonts / layout
static void UpdateDpiFor(POINT pt) {
    typedef HRESULT(WINAPI* Fn)(HMONITOR, int, UINT*, UINT*);
    static Fn fn = (Fn)GetProcAddress(LoadLibraryW(L"shcore.dll"), "GetDpiForMonitor");
    UINT dx = 96, dy = 96;
    if (fn) fn(MonitorFromPoint(pt, MONITOR_DEFAULTTONEAREST), 0, &dx, &dy);
    if (!dx) dx = 96;
    if (dx != g_dpi || !g_font) {
        g_dpi = dx;
        if (g_font) { DeleteObject(g_font); DeleteObject(g_fontSmall); DeleteObject(g_fontBold); }
        g_font = CreateFontW(-S(13), 0, 0, 0, FW_NORMAL, 0, 0, 0, DEFAULT_CHARSET, 0, 0, CLEARTYPE_QUALITY, 0, L"Segoe UI");
        g_fontSmall = CreateFontW(-S(11), 0, 0, 0, FW_NORMAL, 0, 0, 0, DEFAULT_CHARSET, 0, 0, CLEARTYPE_QUALITY, 0, L"Segoe UI");
        g_fontBold = CreateFontW(-S(13), 0, 0, 0, FW_SEMIBOLD, 0, 0, 0, DEFAULT_CHARSET, 0, 0, CLEARTYPE_QUALITY, 0, L"Segoe UI");
    }
}
static int Rows() { int n = (int)cur().items.size(); return n + (n >= 2 ? 1 : 0); }
static int WinH() { return S(TABH) + S(ROWH) * std::max(MINROWS, std::min(Rows(), MAXROWS)) + S(8); }
static void ClampScroll() {
    int maxs = std::max(0, Rows() * S(ROWH) - (WinH() - S(TABH) - S(8)));
    g_scroll = std::max(0, std::min(g_scroll, maxs));
}
static void Relayout() {
    ClampScroll();
    int w = S(W), h = WinH();
    SetWindowPos(g_hwnd, nullptr, 0, 0, w, h, SWP_NOMOVE | SWP_NOZORDER | SWP_NOACTIVATE);
    HRGN r = CreateRoundRectRgn(0, 0, w + 1, h + 1, S(14), S(14)); SetWindowRgn(g_hwnd, r, TRUE);
    InvalidateRect(g_hwnd, nullptr, FALSE);
}
static RECT TabRect(int i) {
    int n = (int)g_shelves.size(), left = S(20), right = S(W) - S(64), plusW = S(30);
    int tw = std::min(S(110), (right - left - plusW) / std::max(1, n));
    RECT r; r.top = S(4); r.bottom = S(TABH) - S(2);
    if (i < n) { r.left = left + i * tw; r.right = r.left + tw - S(2); }
    else { r.left = left + n * tw; r.right = r.left + plusW - S(2); }
    return r;
}
static RECT PhoneRect() { RECT r = { S(W) - S(60), S(4), S(W) - S(34), S(TABH) - S(2) }; return r; }
static RECT CloseRect() { RECT r = { S(W) - S(30), S(4), S(W) - S(6), S(TABH) - S(2) }; return r; }

enum { H_NONE, H_TAB, H_PLUS, H_CLOSE, H_ALL, H_ITEM, H_ITEMX, H_CLEAR, H_PHONE };
struct Hit { int t; int i; };
static Hit HitTest(POINT p) {
    if (p.y < S(TABH)) {
        RECT c = CloseRect(); if (PtInRect(&c, p)) return { H_CLOSE, 0 };
        RECT ph = PhoneRect(); if (PtInRect(&ph, p)) return { H_PHONE, 0 };
        for (int i = 0; i < (int)g_shelves.size(); i++) { RECT r = TabRect(i); if (PtInRect(&r, p)) return { H_TAB, i }; }
        RECT r = TabRect((int)g_shelves.size()); if (PtInRect(&r, p)) return { H_PLUS, 0 };
        return { H_NONE, 0 };
    }
    int n = (int)cur().items.size(), off = n >= 2 ? 1 : 0, rows = n + off;
    int k = (p.y - S(TABH) + g_scroll) / S(ROWH);
    if (k < 0 || k >= rows) return { H_NONE, 0 };
    if (off && k == 0) return { p.x >= S(W) - S(92) ? H_CLEAR : H_ALL, 0 };
    if (p.x >= S(W) - S(36)) return { H_ITEMX, k - off };
    return { H_ITEM, k - off };
}
static int InsertIndexAt(int y) {
    int n = (int)cur().items.size(), off = n >= 2 ? 1 : 0;
    double pos = (double)(y - S(TABH) + g_scroll) / S(ROWH) - off;
    int idx = (int)std::floor(pos + 0.5); return std::max(0, std::min(idx, n));
}

// ---------------------------------------------------------------- shelf operations
static void AddPaths(int shelf, const std::vector<ws>& paths) {
    if (shelf < 0 || shelf >= (int)g_shelves.size()) return;
    for (auto& p : paths) {
        bool dup = false; for (auto& q : g_shelves[shelf].items) if (!_wcsicmp(p.c_str(), q.c_str())) dup = true;
        if (!dup) g_shelves[shelf].items.push_back(p);
    }
    Save();
}
static int NewShelf() {
    int n = (int)g_shelves.size() + 1; ws nm = L"Shelf " + std::to_wstring(n);
    g_shelves.push_back({ nm, {} }); return (int)g_shelves.size() - 1;
}
static void RemoveItem(int shelf, const ws& path) {
    auto& v = g_shelves[shelf].items;
    v.erase(std::remove_if(v.begin(), v.end(), [&](const ws& s) { return !_wcsicmp(s.c_str(), path.c_str()); }), v.end());
}
static void ClosePhone();
static void HideShelf() { ShowWindow(g_hwnd, SW_HIDE); g_pinned = false; ClosePhone(); }

static bool ExcludedApp(const ws& exe) {
    std::string d = ReadAll(g_dataDir + L"\\excluded.txt"); size_t p = 0;
    ws low = exe; for (auto& c : low) c = towlower(c);
    while (p < d.size()) {
        size_t e = d.find('\n', p); if (e == std::string::npos) e = d.size();
        ws line = FromUtf8(d.substr(p, e - p)); p = e + 1;
        while (!line.empty() && (line.back() == L'\r' || line.back() == L' ')) line.pop_back();
        if (line.empty() || line[0] == L'#') continue;
        for (auto& c : line) c = towlower(c);
        if (line == low || line + L".exe" == low) return true;
    }
    return false;
}
static ws ForegroundExe() {
    HWND fg = GetForegroundWindow(); DWORD pid = 0; if (fg) GetWindowThreadProcessId(fg, &pid);
    if (!pid) return L"";
    HANDLE h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, pid); if (!h) return L"";
    wchar_t buf[MAX_PATH * 2]; DWORD n = MAX_PATH * 2; ws r;
    if (QueryFullProcessImageNameW(h, 0, buf, &n)) r = PathFindFileNameW(buf);
    CloseHandle(h); return r;
}
static bool RealDragInProgress() {
    if (!(GetAsyncKeyState(VK_LBUTTON) & 0x8000)) return false;
    if (!g_strict) return true;
    HWND fg = GetForegroundWindow(); DWORD tid = fg ? GetWindowThreadProcessId(fg, nullptr) : 0;
    GUITHREADINFO gi = { sizeof gi };
    if (!GetGUIThreadInfo(tid, &gi)) return false;
    if (gi.flags & (GUI_INMOVESIZE | GUI_INMENUMODE | GUI_POPUPMENUMODE)) return false;
    return gi.hwndCapture != nullptr;
}
static bool Suppressed() {
    QUERY_USER_NOTIFICATION_STATE st;
    if (SUCCEEDED(SHQueryUserNotificationState(&st)) &&
        (st == QUNS_BUSY || st == QUNS_RUNNING_D3D_FULL_SCREEN || st == QUNS_PRESENTATION_MODE)) return true;
    ws exe = ForegroundExe(); g_lastExe = exe;
    return !exe.empty() && ExcludedApp(exe);
}
static void ShowShelfAt(POINT pt) {
    UpdateDpiFor(pt); g_scroll = 0; Relayout();
    RECT wr; GetWindowRect(g_hwnd, &wr); int w = wr.right - wr.left, h = wr.bottom - wr.top;
    MONITORINFO mi = { sizeof mi }; GetMonitorInfoW(MonitorFromPoint(pt, MONITOR_DEFAULTTONEAREST), &mi);
    RECT wa = mi.rcWork;
    int x = pt.x + S(28); if (x + w > wa.right) x = pt.x - w - S(28);
    int y = pt.y - h / 3;
    x = std::max((int)wa.left, std::min(x, (int)wa.right - w));
    y = std::max((int)wa.top, std::min(y, (int)wa.bottom - h));
    SetWindowPos(g_hwnd, HWND_TOPMOST, x, y, 0, 0, SWP_NOSIZE | SWP_NOACTIVATE | SWP_SHOWWINDOW);
    Relayout();
}

// ---------------------------------------------------------------- thumbnails
static HBITMAP GetThumb(const ws& p) {
    auto it = g_thumb.find(p); if (it != g_thumb.end()) return it->second;
    HBITMAP hb = nullptr; IShellItemImageFactory* f = nullptr;
    if (SUCCEEDED(SHCreateItemFromParsingName(p.c_str(), nullptr, IID_PPV_ARGS(&f)))) {
        SIZE sz = { S(48), S(48) };
        if (FAILED(f->GetImage(sz, SIIGBF_BIGGERSIZEOK, &hb))) hb = nullptr;
        f->Release();
    }
    g_thumb[p] = hb; return hb;
}

// ---------------------------------------------------------------- painting
static void FillRound(HDC dc, RECT r, COLORREF c, int rad) {
    HBRUSH b = CreateSolidBrush(c); HPEN pn = CreatePen(PS_SOLID, 1, c);
    HGDIOBJ ob = SelectObject(dc, b), op = SelectObject(dc, pn);
    RoundRect(dc, r.left, r.top, r.right, r.bottom, rad, rad);
    SelectObject(dc, ob); SelectObject(dc, op); DeleteObject(b); DeleteObject(pn);
}
static void Txt(HDC dc, const ws& s, RECT r, UINT fmt, COLORREF c, HFONT f) {
    SelectObject(dc, f); SetTextColor(dc, c); SetBkMode(dc, TRANSPARENT);
    DrawTextW(dc, s.c_str(), -1, &r, fmt | DT_SINGLELINE | DT_NOPREFIX);
}
static void Paint(HDC hdc, RECT rc) {
    HDC dc = CreateCompatibleDC(hdc); HBITMAP bmp = CreateCompatibleBitmap(hdc, rc.right, rc.bottom);
    HGDIOBJ old = SelectObject(dc, bmp);
    HBRUSH bg = CreateSolidBrush(C_BG); FillRect(dc, &rc, bg); DeleteObject(bg);

    // list
    int n = (int)cur().items.size(), off = n >= 2 ? 1 : 0, rows = n + off;
    int listTop = S(TABH), listBot = rc.bottom - S(4);
    SaveDC(dc); IntersectClipRect(dc, 0, listTop, rc.right, listBot);
    if (n == 0) {
        RECT r = { 0, listTop, rc.right, listBot };
        Txt(dc, L"Drop files, links, text or images here", r, DT_CENTER | DT_VCENTER, C_DIM, g_font);
    }
    for (int k = 0; k < rows; k++) {
        int y = listTop + k * S(ROWH) - g_scroll;
        if (y + S(ROWH) < listTop || y > listBot) continue;
        RECT row = { S(6), y + S(2), rc.right - S(6), y + S(ROWH) - S(2) };
        bool hot = (k - off == g_hoverItem) || (off && k == 0 && g_hoverItem == -2);
        FillRound(dc, row, hot ? C_HOT : C_ROW, S(8));
        if (off && k == 0) {
            RECT cb = { row.right - S(86), row.top + S(7), row.right - S(8), row.bottom - S(7) };
            FillRound(dc, cb, g_hoverItem == -3 ? RGB(196, 60, 60) : C_TAB, S(6));
            Txt(dc, L"Clear all", cb, DT_CENTER | DT_VCENTER, C_TXT, g_fontSmall);
            RECT t = { row.left + S(12), row.top, row.right - S(94), row.bottom };
            Txt(dc, L"All  (" + std::to_wstring(n) + L" items)", t, DT_LEFT | DT_VCENTER, C_TXT, g_fontBold);
            continue;
        }
        const ws& path = cur().items[k - off];
        int box = S(32); int bx = row.left + S(8), by = row.top + (row.bottom - row.top - box) / 2;
        if (HBITMAP hb = GetThumb(path)) {
            BITMAP bm; GetObject(hb, sizeof bm, &bm);
            double sc = std::min((double)box / bm.bmWidth, (double)box / bm.bmHeight);
            int dw = (int)(bm.bmWidth * sc), dh = (int)(bm.bmHeight * sc);
            HDC md = CreateCompatibleDC(dc); HGDIOBJ o2 = SelectObject(md, hb);
            BLENDFUNCTION bf = { AC_SRC_OVER, 0, 255, AC_SRC_ALPHA };
            SetStretchBltMode(dc, HALFTONE);
            AlphaBlend(dc, bx + (box - dw) / 2, by + (box - dh) / 2, dw, dh, md, 0, 0, bm.bmWidth, bm.bmHeight, bf);
            SelectObject(md, o2); DeleteDC(md);
        }
        RECT t = { bx + box + S(10), row.top, row.right - S(34), row.bottom };
        Txt(dc, PathFindFileNameW(path.c_str()), t, DT_LEFT | DT_VCENTER | DT_END_ELLIPSIS, C_TXT, g_font);
        if (hot) {
            RECT x = { row.right - S(30), row.top, row.right - S(6), row.bottom };
            Txt(dc, L"\u00D7", x, DT_CENTER | DT_VCENTER, C_DIM, g_font);
        }
    }
    if (g_insertY >= 0) {
        RECT l = { S(10), g_insertY - S(1), rc.right - S(10), g_insertY + S(1) };
        HBRUSH b = CreateSolidBrush(C_ACC); FillRect(dc, &l, b); DeleteObject(b);
    }
    RestoreDC(dc, -1);

    // tabs
    for (int i = 0; i < (int)g_shelves.size(); i++) {
        RECT r = TabRect(i);
        FillRound(dc, r, i == g_active ? C_TAB : C_BG, S(8));
        RECT t = { r.left + S(6), r.top, r.right - S(6), r.bottom };
        Txt(dc, g_shelves[i].name, t, DT_CENTER | DT_VCENTER | DT_END_ELLIPSIS, i == g_active ? C_TXT : C_DIM, g_font);
        if (i == g_active) { RECT u = { r.left + S(12), r.bottom - S(3), r.right - S(12), r.bottom - S(1) }; HBRUSH ab = CreateSolidBrush(C_ACC); FillRect(dc, &u, ab); DeleteObject(ab); }
    }
    for (int gx = 0; gx < 2; gx++) for (int gy = 0; gy < 3; gy++) {
        RECT d = { S(6) + gx * S(5), S(9) + gy * S(5), S(6) + gx * S(5) + S(3), S(9) + gy * S(5) + S(3) };
        HBRUSH gb = CreateSolidBrush(C_DIM); FillRect(dc, &d, gb); DeleteObject(gb);
    }
    { RECT r = TabRect((int)g_shelves.size()); Txt(dc, L"+", r, DT_CENTER | DT_VCENTER, C_DIM, g_fontBold); }
    { RECT r = CloseRect(); Txt(dc, L"\u00D7", r, DT_CENTER | DT_VCENTER, C_DIM, g_fontBold); }
    { RECT r = PhoneRect(); int cx = (r.left + r.right) / 2, cy = (r.top + r.bottom) / 2;
      HPEN pn = CreatePen(PS_SOLID, std::max(1, S(1)), g_phoneWnd ? C_ACC : C_DIM); HGDIOBJ op = SelectObject(dc, pn), ob = SelectObject(dc, GetStockObject(NULL_BRUSH));
      RoundRect(dc, cx - S(5), cy - S(8), cx + S(5), cy + S(8), S(3), S(3)); MoveToEx(dc, cx - S(2), cy + S(5), nullptr); LineTo(dc, cx + S(2), cy + S(5));
      SelectObject(dc, op); SelectObject(dc, ob); DeleteObject(pn); }

    if (g_dropHot) {
        HPEN pn = CreatePen(PS_SOLID, S(2), C_ACC); HGDIOBJ op = SelectObject(dc, pn), ob = SelectObject(dc, GetStockObject(NULL_BRUSH));
        RoundRect(dc, 1, 1, rc.right - 1, rc.bottom - 1, S(14), S(14));
        SelectObject(dc, op); SelectObject(dc, ob); DeleteObject(pn);
    }
    BitBlt(hdc, 0, 0, rc.right, rc.bottom, dc, 0, 0, SRCCOPY);
    SelectObject(dc, old); DeleteObject(bmp); DeleteDC(dc);
}

// ---------------------------------------------------------------- reading dropped data
static bool GetMed(IDataObject* d, CLIPFORMAT cf, DWORD tymed, STGMEDIUM* sm, LONG idx = -1) {
    FORMATETC f = { cf, nullptr, DVASPECT_CONTENT, idx, tymed };
    return SUCCEEDED(d->GetData(&f, sm));
}
static bool HasFmt(IDataObject* d, CLIPFORMAT cf, DWORD tymed) {
    FORMATETC f = { cf, nullptr, DVASPECT_CONTENT, -1, tymed }; return d->QueryGetData(&f) == S_OK;
}
static ws HostName(const ws& url) {
    size_t a = url.find(L"://"); a = (a == ws::npos) ? 0 : a + 3;
    size_t b = url.find_first_of(L"/?#", a); ws h = url.substr(a, b == ws::npos ? ws::npos : b - a);
    if (h.rfind(L"www.", 0) == 0) h = h.substr(4);
    return h.empty() ? L"Link" : h;
}
static void StashUrl(const ws& url, std::vector<ws>& out) {
    std::string body = "[InternetShortcut]\r\nURL=" + ToUtf8(url) + "\r\n";
    ws path = UniqueIn(g_stashDir, HostName(url) + L".url");
    if (WriteBytes(path, body.data(), body.size())) out.push_back(path);
}
static void ExtractDropped(IDataObject* d, std::vector<ws>& out) {
    static CLIPFORMAT cfDesc = (CLIPFORMAT)RegisterClipboardFormatW(L"FileGroupDescriptorW");
    static CLIPFORMAT cfCont = (CLIPFORMAT)RegisterClipboardFormatW(L"FileContents");
    static CLIPFORMAT cfUrl = (CLIPFORMAT)RegisterClipboardFormatW(L"UniformResourceLocatorW");
    STGMEDIUM sm;
    // 1. real files / folders (by reference)
    if (GetMed(d, CF_HDROP, TYMED_HGLOBAL, &sm)) {
        HDROP h = (HDROP)GlobalLock(sm.hGlobal);
        if (h) {
            UINT n = DragQueryFileW(h, 0xFFFFFFFF, nullptr, 0);
            for (UINT i = 0; i < n; i++) {
                UINT len = DragQueryFileW(h, i, nullptr, 0); ws p(len, 0);
                DragQueryFileW(h, i, &p[0], len + 1); out.push_back(p);
            }
            GlobalUnlock(sm.hGlobal);
        }
        ReleaseStgMedium(&sm);
        if (!out.empty()) return;
    }
    // 2. virtual files (browsers, mail clients, zip viewers)
    if (GetMed(d, cfDesc, TYMED_HGLOBAL, &sm)) {
        FILEGROUPDESCRIPTORW* g = (FILEGROUPDESCRIPTORW*)GlobalLock(sm.hGlobal);
        if (g) {
            for (UINT i = 0; i < g->cItems; i++) {
                FILEDESCRIPTORW& fd = g->fgd[i];
                if (fd.dwFlags & FD_ATTRIBUTES && (fd.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY)) continue;
                STGMEDIUM cm; ws path = UniqueIn(g_stashDir, PathFindFileNameW(fd.cFileName));
                if (!GetMed(d, cfCont, TYMED_ISTREAM | TYMED_HGLOBAL, &cm, (LONG)i)) continue;
                bool ok = false;
                if (cm.tymed == TYMED_ISTREAM && cm.pstm) {
                    HANDLE fh = CreateFileW(path.c_str(), GENERIC_WRITE, 0, nullptr, CREATE_NEW, FILE_ATTRIBUTE_NORMAL, nullptr);
                    if (fh != INVALID_HANDLE_VALUE) {
                        char buf[65536]; ULONG rd = 0; ok = true;
                        LARGE_INTEGER z = {}; cm.pstm->Seek(z, STREAM_SEEK_SET, nullptr);
                        while (SUCCEEDED(cm.pstm->Read(buf, sizeof buf, &rd)) && rd) { DWORD w; WriteFile(fh, buf, rd, &w, nullptr); }
                        CloseHandle(fh);
                    }
                } else if (cm.tymed == TYMED_HGLOBAL && cm.hGlobal) {
                    void* p = GlobalLock(cm.hGlobal);
                    if (p) { ok = WriteBytes(path, p, GlobalSize(cm.hGlobal)); GlobalUnlock(cm.hGlobal); }
                }
                ReleaseStgMedium(&cm);
                if (ok) out.push_back(path);
            }
            GlobalUnlock(sm.hGlobal);
        }
        ReleaseStgMedium(&sm);
        if (!out.empty()) return;
    }
    // 3. links
    if (GetMed(d, cfUrl, TYMED_HGLOBAL, &sm)) {
        wchar_t* u = (wchar_t*)GlobalLock(sm.hGlobal);
        if (u) { StashUrl(u, out); GlobalUnlock(sm.hGlobal); }
        ReleaseStgMedium(&sm);
        if (!out.empty()) return;
    }
    // 4. text
    if (GetMed(d, CF_UNICODETEXT, TYMED_HGLOBAL, &sm)) {
        wchar_t* t = (wchar_t*)GlobalLock(sm.hGlobal);
        if (t) {
            ws text = t; GlobalUnlock(sm.hGlobal);
            ws trimmed = text; while (!trimmed.empty() && iswspace(trimmed.back())) trimmed.pop_back();
            if ((trimmed.rfind(L"http://", 0) == 0 || trimmed.rfind(L"https://", 0) == 0) && trimmed.find_first_of(L" \r\n") == ws::npos)
                StashUrl(trimmed, out);
            else {
                std::string u8 = ToUtf8(text); ws path = UniqueIn(g_stashDir, L"Text " + Timestamp() + L".txt");
                if (WriteBytes(path, u8.data(), u8.size())) out.push_back(path);
            }
        }
        ReleaseStgMedium(&sm);
        if (!out.empty()) return;
    }
    // 5. bitmaps
    if (GetMed(d, CF_DIB, TYMED_HGLOBAL, &sm)) {
        BYTE* p = (BYTE*)GlobalLock(sm.hGlobal);
        if (p) {
            SIZE_T sz = GlobalSize(sm.hGlobal); BITMAPINFOHEADER* bi = (BITMAPINFOHEADER*)p;
            DWORD colors = bi->biClrUsed ? bi->biClrUsed : (bi->biBitCount <= 8 ? (1u << bi->biBitCount) : 0);
            DWORD offBits = 14 + bi->biSize + colors * 4 + ((bi->biCompression == BI_BITFIELDS && bi->biSize == 40) ? 12 : 0);
            BITMAPFILEHEADER fh = {}; fh.bfType = 0x4D42; fh.bfSize = (DWORD)(14 + sz); fh.bfOffBits = offBits;
            std::string buf((char*)&fh, 14); buf.append((char*)p, sz);
            ws path = UniqueIn(g_stashDir, L"Image " + Timestamp() + L".bmp");
            if (WriteBytes(path, buf.data(), buf.size())) out.push_back(path);
            GlobalUnlock(sm.hGlobal);
        }
        ReleaseStgMedium(&sm);
    }
}

// ---------------------------------------------------------------- OLE drop target (the shelf)
class ShelfTarget : public IDropTarget {
    LONG r = 1;
    DWORD Effect(DWORD allowed) {
        if (g_selfDrag) return DROPEFFECT_MOVE & allowed ? DROPEFFECT_MOVE : DROPEFFECT_NONE;
        if (allowed & DROPEFFECT_COPY) return DROPEFFECT_COPY;
        if (allowed & DROPEFFECT_LINK) return DROPEFFECT_LINK;
        return DROPEFFECT_NONE;
    }
    void Track(POINTL pt) {
        POINT p = { pt.x, pt.y }; ScreenToClient(g_hwnd, &p); Hit h = HitTest(p);
        if (h.t == H_TAB && h.i != g_active && !g_selfDrag) {
            if (h.i != g_hoverTab) { g_hoverTab = h.i; g_hoverTick = GetTickCount(); }
            else if (GetTickCount() - g_hoverTick > 450) { g_active = h.i; g_scroll = 0; g_hoverTab = -1; Relayout(); }
        } else g_hoverTab = -1;
        int newY = -1;
        if (g_selfDrag && p.y >= S(TABH)) newY = S(TABH) + (InsertIndexAt(p.y) + ((int)cur().items.size() >= 2 ? 1 : 0)) * S(ROWH) - g_scroll;
        if (newY != g_insertY) { g_insertY = newY; InvalidateRect(g_hwnd, nullptr, FALSE); }
    }
public:
    HRESULT STDMETHODCALLTYPE QueryInterface(REFIID id, void** o) override {
        if (id == IID_IUnknown || id == IID_IDropTarget) { *o = this; AddRef(); return S_OK; } *o = nullptr; return E_NOINTERFACE;
    }
    ULONG STDMETHODCALLTYPE AddRef() override { return InterlockedIncrement(&r); }
    ULONG STDMETHODCALLTYPE Release() override { LONG n = InterlockedDecrement(&r); if (!n) delete this; return n; }
    HRESULT STDMETHODCALLTYPE DragEnter(IDataObject*, DWORD, POINTL pt, DWORD* e) override {
        g_dropHot = true; *e = Effect(*e); Track(pt); InvalidateRect(g_hwnd, nullptr, FALSE); return S_OK;
    }
    HRESULT STDMETHODCALLTYPE DragOver(DWORD, POINTL pt, DWORD* e) override {
        *e = Effect(*e ? *e : (DROPEFFECT_COPY | DROPEFFECT_MOVE | DROPEFFECT_LINK)); Track(pt); return S_OK;
    }
    HRESULT STDMETHODCALLTYPE DragLeave() override {
        g_dropHot = false; g_insertY = -1; g_hoverTab = -1; InvalidateRect(g_hwnd, nullptr, FALSE); return S_OK;
    }
    HRESULT STDMETHODCALLTYPE Drop(IDataObject* d, DWORD, POINTL pt, DWORD* e) override {
        g_dropHot = false; g_insertY = -1; g_hoverTab = -1;
        POINT p = { pt.x, pt.y }; ScreenToClient(g_hwnd, &p); Hit h = HitTest(p);
        int target = g_active;
        if (h.t == H_TAB) target = h.i;
        else if (h.t == H_PLUS) { target = NewShelf(); }
        if (g_selfDrag) {
            g_droppedSelf = true;
            if (target != g_dragSrc) {
                for (auto& s : g_dragPaths) RemoveItem(g_dragSrc, s);
                AddPaths(target, g_dragPaths);
                if (h.t == H_PLUS) g_active = target;
            } else {
                auto& v = cur().items; int ins = InsertIndexAt(p.y); int before = 0;
                for (int j = 0; j < ins && j < (int)v.size(); j++)
                    for (auto& s : g_dragPaths) if (!_wcsicmp(v[j].c_str(), s.c_str())) { before++; break; }
                ins -= before;
                for (auto& s : g_dragPaths) RemoveItem(g_active, s);
                ins = std::max(0, std::min(ins, (int)v.size()));
                v.insert(v.begin() + ins, g_dragPaths.begin(), g_dragPaths.end());
                Save();
            }
            *e = DROPEFFECT_MOVE;
        } else {
            std::vector<ws> got; ExtractDropped(d, got);
            if (!got.empty()) { AddPaths(target, got); if (h.t == H_PLUS) g_active = target; *e = DROPEFFECT_COPY; }
            else *e = DROPEFFECT_NONE;
        }
        g_scroll = 0; Relayout(); return S_OK;
    }
};

// ---------------------------------------------------------------- OLE drop source (dragging out)
class ShelfSource : public IDropSource {
    LONG r = 1;
public:
    HRESULT STDMETHODCALLTYPE QueryInterface(REFIID id, void** o) override {
        if (id == IID_IUnknown || id == IID_IDropSource) { *o = this; AddRef(); return S_OK; } *o = nullptr; return E_NOINTERFACE;
    }
    ULONG STDMETHODCALLTYPE AddRef() override { return InterlockedIncrement(&r); }
    ULONG STDMETHODCALLTYPE Release() override { LONG n = InterlockedDecrement(&r); if (!n) delete this; return n; }
    HRESULT STDMETHODCALLTYPE QueryContinueDrag(BOOL esc, DWORD ks) override {
        if (esc) return DRAGDROP_S_CANCEL; if (!(ks & MK_LBUTTON)) return DRAGDROP_S_DROP; return S_OK;
    }
    HRESULT STDMETHODCALLTYPE GiveFeedback(DWORD) override { return DRAGDROP_S_USEDEFAULTCURSORS; }
};

static IDataObject* MakeDataObject(const std::vector<ws>& paths) {
    std::vector<PIDLIST_ABSOLUTE> pidls; IShellItemArray* arr = nullptr; IDataObject* d = nullptr;
    for (auto& p : paths) { PIDLIST_ABSOLUTE pl = nullptr; if (SUCCEEDED(SHParseDisplayName(p.c_str(), nullptr, &pl, 0, nullptr))) pidls.push_back(pl); }
    if (!pidls.empty() && SUCCEEDED(SHCreateShellItemArrayFromIDLists((UINT)pidls.size(), (PCIDLIST_ABSOLUTE_ARRAY)pidls.data(), &arr))) {
        arr->BindToHandler(nullptr, BHID_DataObject, IID_PPV_ARGS(&d)); arr->Release();
    }
    for (auto pl : pidls) CoTaskMemFree(pl);
    return d;
}
static void StartDrag(Hit h) {
    std::vector<ws> paths, gone;
    if (h.t == H_ALL) paths = cur().items; else paths.push_back(cur().items[h.i]);
    std::vector<ws> ok;
    for (auto& p : paths) (Exists(p) ? ok : gone).push_back(p);
    if (!gone.empty()) { for (auto& p : gone) RemoveItem(g_active, p); Save(); Relayout(); }
    if (ok.empty()) return;
    IDataObject* d = MakeDataObject(ok); if (!d) return;
    ShelfSource* src = new ShelfSource();
    g_selfDrag = true; g_droppedSelf = false; g_dragSrc = g_active; g_dragPaths = ok;
    DWORD eff = 0;
    HRESULT hr = DoDragDrop(d, src, DROPEFFECT_COPY | DROPEFFECT_MOVE | DROPEFFECT_LINK, &eff);
    g_selfDrag = false; g_insertY = -1; g_hoverItem = -1;
    bool ctrl = GetKeyState(VK_CONTROL) < 0;
    if (hr == DRAGDROP_S_DROP && eff != DROPEFFECT_NONE && !g_droppedSelf && !ctrl) {
        for (auto& p : ok) RemoveItem(g_dragSrc, p);
        Save(); g_scroll = 0; Relayout();
    }
    d->Release(); src->Release();
    if (TotalItems() == 0 && !g_pinned) HideShelf();
    InvalidateRect(g_hwnd, nullptr, FALSE);
}

// ---------------------------------------------------------------- global mouse hook (drag detection)
static volatile LONG g_trk = 0, g_trigd = 0;
static POINT g_p0, g_last; static int g_dir = 0, g_ext = 0, g_rev = 0; static DWORD g_revT = 0, g_revFirst = 0;

static void Trigger(POINT pt) {
    if (InterlockedExchange(&g_trigd, 1) == 0) PostMessageW(g_hwnd, WM_DRAGSTART, pt.x, pt.y);
}
static LRESULT CALLBACK MouseProc(int code, WPARAM w, LPARAM l) {
    if (code == HC_ACTION) {
        MSLLHOOKSTRUCT* m = (MSLLHOOKSTRUCT*)l;
        if (!(m->flags & LLMHF_INJECTED)) {
            if (w == WM_LBUTTONDOWN) {
                g_trk = 1; g_trigd = 0; g_p0 = g_last = m->pt; g_dir = 0; g_rev = 0;
            } else if (w == WM_LBUTTONUP) {
                if (g_trk) { g_trk = 0; PostMessageW(g_hwnd, WM_DRAGEND, 0, 0); }
            } else if (w == WM_MOUSEMOVE && g_trk && !g_trigd) {
                POINT pt = m->pt; int dx = pt.x - g_p0.x, dy = pt.y - g_p0.y, thr = GetSystemMetrics(SM_CXDRAG) * 2;
                int mdx = pt.x - g_last.x; g_last = pt;
                if (dx * dx + dy * dy >= thr * thr) {
                    // edge of the screen (outer edges only)
                    MONITORINFO mi = { sizeof mi }; HMONITOR mon = MonitorFromPoint(pt, MONITOR_DEFAULTTONEAREST);
                    GetMonitorInfoW(mon, &mi); POINT probe = pt; bool edge = false;
                    if (pt.x <= mi.rcMonitor.left + 1) { probe.x -= 4; edge = true; }
                    else if (pt.x >= mi.rcMonitor.right - 2) { probe.x += 4; edge = true; }
                    else if (pt.y <= mi.rcMonitor.top + 1) { probe.y -= 4; edge = true; }
                    else if (pt.y >= mi.rcMonitor.bottom - 2) { probe.y += 4; edge = true; }
                    if (edge && !MonitorFromPoint(probe, MONITOR_DEFAULTTONULL)) { Trigger(pt); return CallNextHookEx(nullptr, code, w, l); }
                    // shake: three direction reversals of 40+ px within ~1.2 s
                    if (mdx != 0) {
                        int d = mdx > 0 ? 1 : -1;
                        if (g_dir == 0) { g_dir = d; g_ext = pt.x; }
                        else if (d == g_dir) g_ext = pt.x;
                        else if (abs(pt.x - g_ext) >= 40) {
                            DWORD now = m->time;
                            if (g_rev == 0 || now - g_revT > 500) { g_rev = 1; g_revFirst = now; } else g_rev++;
                            g_revT = now; g_dir = d; g_ext = pt.x;
                            if (g_rev >= 3 && now - g_revFirst < 1200) Trigger(pt);
                        }
                    }
                }
            }
        }
    }
    return CallNextHookEx(nullptr, code, w, l);
}

// ---------------------------------------------------------------- tray + settings
static HICON MakeTrayIcon() {
    int s = 32; HDC sdc = GetDC(nullptr); HDC dc = CreateCompatibleDC(sdc);
    HBITMAP col = CreateCompatibleBitmap(sdc, s, s), mask = CreateBitmap(s, s, 1, 1, nullptr);
    HGDIOBJ o = SelectObject(dc, col);
    HBRUSH b = CreateSolidBrush(RGB(0, 120, 215)); RECT r = { 0, 0, s, s }; FillRect(dc, &r, b); DeleteObject(b);
    HBRUSH wb = CreateSolidBrush(RGB(255, 255, 255));
    RECT a = { 7, 20, 25, 23 }; FillRect(dc, &a, wb); RECT c = { 11, 8, 21, 18 }; FillRect(dc, &c, wb); DeleteObject(wb);
    SelectObject(dc, mask); RECT mr = { 0, 0, s, s }; FillRect(dc, &mr, (HBRUSH)GetStockObject(BLACK_BRUSH));
    SelectObject(dc, o);
    ICONINFO ii = { TRUE, 0, 0, mask, col }; HICON ic = CreateIconIndirect(&ii);
    DeleteObject(col); DeleteObject(mask); DeleteDC(dc); ReleaseDC(nullptr, sdc); return ic;
}
static void AddTray() {
    memset(&g_nid, 0, sizeof g_nid); g_nid.cbSize = sizeof g_nid; g_nid.hWnd = g_hwnd; g_nid.uID = 1;
    g_nid.uFlags = NIF_ICON | NIF_MESSAGE | NIF_TIP; g_nid.uCallbackMessage = WM_TRAY;
    HICON ic = (HICON)LoadImageW(g_inst, MAKEINTRESOURCEW(2), IMAGE_ICON, 16, 16, 0);
    g_nid.hIcon = ic ? ic : MakeTrayIcon(); wcscpy(g_nid.szTip, L"Drag Shelf");
    Shell_NotifyIconW(NIM_ADD, &g_nid);
}
static const wchar_t* RUNKEY = L"Software\\Microsoft\\Windows\\CurrentVersion\\Run";
static bool AutostartOn() {
    HKEY k; bool on = false;
    if (RegOpenKeyExW(HKEY_CURRENT_USER, RUNKEY, 0, KEY_READ, &k) == ERROR_SUCCESS) {
        on = RegQueryValueExW(k, L"DragShelf", nullptr, nullptr, nullptr, nullptr) == ERROR_SUCCESS; RegCloseKey(k);
    } return on;
}
static void SetAutostart(bool on) {
    HKEY k; if (RegOpenKeyExW(HKEY_CURRENT_USER, RUNKEY, 0, KEY_WRITE, &k) != ERROR_SUCCESS) return;
    if (on) {
        wchar_t exe[MAX_PATH]; GetModuleFileNameW(nullptr, exe, MAX_PATH); ws v = L"\"" + ws(exe) + L"\"";
        RegSetValueExW(k, L"DragShelf", 0, REG_SZ, (BYTE*)v.c_str(), (DWORD)((v.size() + 1) * 2));
    } else RegDeleteValueW(k, L"DragShelf");
    RegCloseKey(k);
}
static void EnsureExcludedFile() {
    ws p = g_dataDir + L"\\excluded.txt";
    if (!Exists(p)) {
        std::string t = "# Apps (exe names) where Drag Shelf must never pop up. One per line.\r\n# Example:\r\n# game.exe\r\n";
        WriteBytes(p, t.data(), t.size());
    }
}
static void TrayMenu() {
    HMENU m = CreatePopupMenu(), th = CreatePopupMenu(), ac = CreatePopupMenu();
    ws showTxt = ws(IsWindowVisible(g_hwnd) ? L"Hide shelf" : L"Show shelf") + L"\t" + HotkeyName(g_hkMod, g_hkVk);
    AppendMenuW(m, MF_STRING, ID_SHOW, showTxt.c_str());
    AppendMenuW(m, MF_STRING | (g_phoneWnd ? MF_CHECKED : 0), ID_PHONE, L"Photos from phone...");
    AppendMenuW(m, MF_SEPARATOR, 0, nullptr);
    const wchar_t* tn[3] = { L"Match Windows", L"Light", L"Dark" };
    for (int i = 0; i < 3; i++) AppendMenuW(th, MF_STRING | (g_theme == i ? MF_CHECKED : 0), ID_THEME0 + i, tn[i]);
    for (int i = 0; i < 7; i++) AppendMenuW(ac, MF_STRING | (g_accent == i ? MF_CHECKED : 0), ID_ACC0 + i, ACCNAMES[i]);
    AppendMenuW(m, MF_POPUP, (UINT_PTR)th, L"Theme");
    AppendMenuW(m, MF_POPUP, (UINT_PTR)ac, L"Accent color");
    AppendMenuW(m, MF_STRING, ID_HOTKEY, L"Change shortcut...");
    AppendMenuW(m, MF_SEPARATOR, 0, nullptr);
    AppendMenuW(m, MF_STRING, ID_CLEARALL, L"Clear all shelves");
    AppendMenuW(m, MF_STRING | (g_strict ? MF_CHECKED : 0), ID_STRICT, L"Strict drag detection");
    AppendMenuW(m, MF_STRING | (AutostartOn() ? MF_CHECKED : 0), ID_AUTOSTART, L"Start with Windows");
    if (!g_lastExe.empty()) AppendMenuW(m, MF_STRING, ID_EXCL_LAST, (L"Never show over " + g_lastExe).c_str());
    AppendMenuW(m, MF_STRING, ID_EXCL_EDIT, L"Edit excluded apps...");
    AppendMenuW(m, MF_SEPARATOR, 0, nullptr);
    AppendMenuW(m, MF_STRING, ID_GUIDE, L"Show guide");
    AppendMenuW(m, MF_STRING, ID_EXIT, L"Exit");
    POINT pt; GetCursorPos(&pt); SetForegroundWindow(g_hwnd);
    TrackPopupMenu(m, TPM_RIGHTBUTTON | TPM_BOTTOMALIGN, pt.x, pt.y, 0, g_hwnd, nullptr);
    PostMessageW(g_hwnd, WM_NULL, 0, 0); DestroyMenu(m);
}

// ---------------------------------------------------------------- rename editor
static WNDPROC g_editOld = nullptr; static int g_editIdx = -1;
static void EndRename(bool commit) {
    if (!g_edit) return;
    HWND e = g_edit; g_edit = nullptr;
    if (commit && g_editIdx >= 0 && g_editIdx < (int)g_shelves.size()) {
        wchar_t b[64] = {}; GetWindowTextW(e, b, 40); ws n = b;
        while (!n.empty() && iswspace(n.back())) n.pop_back();
        if (!n.empty()) { g_shelves[g_editIdx].name = n; Save(); }
    }
    DestroyWindow(e);
    SetWindowLongPtrW(g_hwnd, GWL_EXSTYLE, GetWindowLongPtrW(g_hwnd, GWL_EXSTYLE) | WS_EX_NOACTIVATE);
    InvalidateRect(g_hwnd, nullptr, FALSE);
}
static LRESULT CALLBACK EditProc(HWND h, UINT m, WPARAM w, LPARAM l) {
    if (m == WM_KEYDOWN && w == VK_RETURN) { EndRename(true); return 0; }
    if (m == WM_KEYDOWN && w == VK_ESCAPE) { EndRename(false); return 0; }
    if (m == WM_KILLFOCUS) { PostMessageW(g_hwnd, WM_USER + 7, 0, 0); }
    return CallWindowProcW(g_editOld, h, m, w, l);
}
static void BeginRename(int idx) {
    if (g_edit) EndRename(false);
    RECT r = TabRect(idx); g_editIdx = idx;
    SetWindowLongPtrW(g_hwnd, GWL_EXSTYLE, GetWindowLongPtrW(g_hwnd, GWL_EXSTYLE) & ~WS_EX_NOACTIVATE);
    g_edit = CreateWindowExW(0, L"EDIT", g_shelves[idx].name.c_str(), WS_CHILD | WS_VISIBLE | ES_AUTOHSCROLL | ES_CENTER,
        r.left, r.top + S(2), std::max((int)(r.right - r.left), S(90)), r.bottom - r.top - S(4), g_hwnd, nullptr, g_inst, nullptr);
    SendMessageW(g_edit, WM_SETFONT, (WPARAM)g_font, TRUE);
    SendMessageW(g_edit, EM_SETLIMITTEXT, 24, 0);
    g_editOld = (WNDPROC)SetWindowLongPtrW(g_edit, GWLP_WNDPROC, (LONG_PTR)EditProc);
    SetForegroundWindow(g_hwnd); SetFocus(g_edit); SendMessageW(g_edit, EM_SETSEL, 0, -1);
}

// ---------------------------------------------------------------- QR code (byte mode, ECC level L, versions 1-6)
namespace qr {
static int gmul(int x, int y) { int z = 0; for (int i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >> 7) * 0x11D); z ^= ((y >> i) & 1) * x; } return z; }
static std::vector<uint8_t> rsDiv(int deg) {
    std::vector<uint8_t> r(deg, 0); r[deg - 1] = 1; int root = 1;
    for (int i = 0; i < deg; i++) { for (int j = 0; j < deg; j++) { r[j] = (uint8_t)gmul(r[j], root); if (j + 1 < deg) r[j] ^= r[j + 1]; } root = gmul(root, 2); }
    return r;
}
static std::vector<uint8_t> rsRem(const std::vector<uint8_t>& data, const std::vector<uint8_t>& div) {
    std::vector<uint8_t> r(div.size(), 0);
    for (uint8_t b : data) { uint8_t f = b ^ r[0]; r.erase(r.begin()); r.push_back(0); for (size_t i = 0; i < r.size(); i++) r[i] ^= (uint8_t)gmul(div[i], f); }
    return r;
}
static int numRaw(int v) { int r = (16 * v + 128) * v + 64; if (v >= 2) { int a = v / 7 + 2; r -= (25 * a - 10) * a - 55; } return r; }
struct Q {
    int n = 0; std::vector<std::vector<bool>> m, f;
    void setF(int x, int y, bool v) { m[y][x] = v; f[y][x] = true; }
    void formatBits(int mask) {
        int data = (1 << 3) | mask, rem = data;
        for (int i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >> 9) * 0x537);
        int bits = ((data << 10) | rem) ^ 0x5412;
        auto bit = [&](int i) { return ((bits >> i) & 1) != 0; };
        for (int i = 0; i <= 5; i++) setF(8, i, bit(i));
        setF(8, 7, bit(6)); setF(8, 8, bit(7)); setF(7, 8, bit(8));
        for (int i = 9; i < 15; i++) setF(14 - i, 8, bit(i));
        for (int i = 0; i < 8; i++) setF(n - 1 - i, 8, bit(i));
        for (int i = 8; i < 15; i++) setF(8, n - 15 + i, bit(i));
        setF(8, n - 8, true);
    }
    void finder(int cx, int cy) {
        for (int dy = -4; dy <= 4; dy++) for (int dx = -4; dx <= 4; dx++) {
            int d = std::max(abs(dx), abs(dy)), x = cx + dx, y = cy + dy;
            if (x >= 0 && x < n && y >= 0 && y < n) setF(x, y, d != 2 && d != 4);
        }
    }
    void align(int cx, int cy) { for (int dy = -2; dy <= 2; dy++) for (int dx = -2; dx <= 2; dx++) setF(cx + dx, cy + dy, std::max(abs(dx), abs(dy)) != 1); }
    void applyMask(int k) {
        for (int y = 0; y < n; y++) for (int x = 0; x < n; x++) {
            bool inv = false;
            switch (k) {
            case 0: inv = (x + y) % 2 == 0; break; case 1: inv = y % 2 == 0; break; case 2: inv = x % 3 == 0; break;
            case 3: inv = (x + y) % 3 == 0; break; case 4: inv = (x / 3 + y / 2) % 2 == 0; break;
            case 5: inv = x * y % 2 + x * y % 3 == 0; break; case 6: inv = (x * y % 2 + x * y % 3) % 2 == 0; break;
            default: inv = ((x + y) % 2 + x * y % 3) % 2 == 0; }
            if (!f[y][x] && inv) m[y][x] = !m[y][x];
        }
    }
    int penalty() {
        int p = 0;
        for (int a = 0; a < n; a++) for (int dir = 0; dir < 2; dir++) {
            int run = 1;
            for (int b = 1; b < n; b++) {
                bool c = dir ? m[b][a] : m[a][b], pv = dir ? m[b - 1][a] : m[a][b - 1];
                if (c == pv) { run++; if (run == 5) p += 3; else if (run > 5) p++; } else run = 1;
            }
        }
        for (int y = 0; y + 1 < n; y++) for (int x = 0; x + 1 < n; x++)
            if (m[y][x] == m[y][x + 1] && m[y][x] == m[y + 1][x] && m[y][x] == m[y + 1][x + 1]) p += 3;
        return p;
    }
};
static std::vector<std::vector<bool>> encode(const std::string& text) {
    static const int ECC[7] = { 0, 7, 10, 15, 20, 26, 18 }, NB[7] = { 0, 1, 1, 1, 1, 1, 2 };
    static const int AL[7][2] = { {0,0},{0,0},{6,18},{6,22},{6,26},{6,30},{6,34} };
    int ver = 1;
    for (; ver <= 6; ver++) { int cap = numRaw(ver) / 8 - ECC[ver] * NB[ver]; if ((int)text.size() <= cap - 2) break; }
    if (ver > 6) return {};
    int raw = numRaw(ver) / 8, dataCw = raw - ECC[ver] * NB[ver];
    std::vector<int> bits; auto app = [&](int v, int len) { for (int i = len - 1; i >= 0; i--) bits.push_back((v >> i) & 1); };
    app(4, 4); app((int)text.size(), 8); for (unsigned char c : text) app(c, 8);
    int capBits = dataCw * 8; app(0, std::min(4, capBits - (int)bits.size()));
    while (bits.size() % 8) bits.push_back(0);
    std::vector<uint8_t> data; for (size_t i = 0; i < bits.size(); i += 8) { int b = 0; for (int j = 0; j < 8; j++) b = (b << 1) | bits[i + j]; data.push_back((uint8_t)b); }
    for (uint8_t pad = 0xEC; (int)data.size() < dataCw; pad ^= 0xEC ^ 0x11) data.push_back(pad);
    int nb = NB[ver], eccLen = ECC[ver], shortLen = raw / nb, numShort = nb - raw % nb;
    std::vector<std::vector<uint8_t>> blocks; std::vector<uint8_t> dv = rsDiv(eccLen); size_t k = 0;
    for (int i = 0; i < nb; i++) {
        int dl = shortLen - eccLen + (i < numShort ? 0 : 1);
        std::vector<uint8_t> dat(data.begin() + k, data.begin() + k + dl); k += dl;
        std::vector<uint8_t> ecc = rsRem(dat, dv);
        if (i < numShort) dat.push_back(0);
        dat.insert(dat.end(), ecc.begin(), ecc.end()); blocks.push_back(dat);
    }
    std::vector<uint8_t> all;
    for (size_t i = 0; i < blocks[0].size(); i++) for (int j = 0; j < nb; j++) if ((int)i != shortLen - eccLen || j >= numShort) all.push_back(blocks[j][i]);
    Q q; q.n = ver * 4 + 17; int n = q.n; q.m.assign(n, std::vector<bool>(n, false)); q.f = q.m;
    for (int i = 0; i < n; i++) { q.setF(6, i, i % 2 == 0); q.setF(i, 6, i % 2 == 0); }
    q.finder(3, 3); q.finder(n - 4, 3); q.finder(3, n - 4);
    if (ver >= 2) q.align(AL[ver][1], AL[ver][1]);
    q.formatBits(0);
    size_t idx = 0, total = all.size() * 8;
    for (int right = n - 1; right >= 1; right -= 2) {
        if (right == 6) right = 5;
        for (int vert = 0; vert < n; vert++) for (int j = 0; j < 2; j++) {
            int x = right - j; bool up = ((right + 1) & 2) == 0; int y = up ? n - 1 - vert : vert;
            if (!q.f[y][x] && idx < total) { q.m[y][x] = ((all[idx >> 3] >> (7 - (idx & 7))) & 1) != 0; idx++; }
        }
    }
    int best = 0, bestP = 1 << 30;
    for (int mk = 0; mk < 8; mk++) { q.applyMask(mk); q.formatBits(mk); int p = q.penalty(); if (p < bestP) { bestP = p; best = mk; } q.applyMask(mk); }
    q.applyMask(best); q.formatBits(best);
    return q.m;
}
}

// ---------------------------------------------------------------- phone photos (QR code + tiny LAN-only web server)
extern "C" BOOLEAN NTAPI SystemFunction036(PVOID, ULONG);
#define WM_PHONEFILE (WM_APP + 4)
static SOCKET g_ls = INVALID_SOCKET; static volatile LONG g_srvRun = 0; static HANDLE g_srvThread = nullptr;
static std::string g_token, g_ip; static int g_port = 0; static volatile LONG g_phoneCount = 0;
static std::string g_phoneUrl; static std::vector<std::vector<bool>> g_qr; static bool g_phonePrevPinned = false;

static const char* PHONE_PAGE = R"HTML(<!doctype html><meta name=viewport content="width=device-width,initial-scale=1"><title>Drag Shelf</title>
<style>body{font-family:system-ui,sans-serif;margin:0;padding:24px;background:#1e1e22;color:#eee;text-align:center}
h1{font-size:22px}label{display:block;margin:20px auto;padding:18px;border-radius:12px;background:#0078d7;color:#fff;font-size:18px;max-width:340px}
#log{text-align:left;max-width:340px;margin:12px auto;font-size:15px;line-height:1.7;word-break:break-all}</style>
<h1>Send photos to your PC</h1><p>They go straight to your computer over this Wi-Fi.</p>
<label>Choose photos or videos<input id=f type=file accept="image/*,video/*" multiple hidden></label><div id=log></div>
<script>
var f=document.getElementById('f'),log=document.getElementById('log');
f.onchange=async function(){for(const x of f.files){const d=document.createElement('div');d.textContent='Sending '+x.name+' ...';log.appendChild(d);
try{const r=await fetch(location.pathname.replace(/\/$/,'')+'/up?name='+encodeURIComponent(x.name),{method:'POST',body:x});d.textContent=(r.ok?'Sent ':'Failed ')+x.name}catch(e){d.textContent='Failed '+x.name}}f.value=''};
</script>)HTML";

static bool PrivateAddr(const sockaddr_in& a) {
    DWORD ip = ntohl(a.sin_addr.s_addr);
    return (ip >> 24) == 10 || (ip >> 20) == 0xAC1 || (ip >> 16) == 0xC0A8 || (ip >> 24) == 127 || (ip >> 16) == 0xA9FE;
}
static void SendAll(SOCKET s, const char* d, size_t n) { size_t o = 0; while (o < n) { int k = send(s, d + o, (int)(n - o), 0); if (k <= 0) return; o += k; } }
static void Reply(SOCKET s, int code, const char* type, const std::string& body) {
    char h[256]; int n = snprintf(h, sizeof h, "HTTP/1.1 %d %s\r\nContent-Type: %s\r\nContent-Length: %zu\r\nConnection: close\r\nCache-Control: no-store\r\n\r\n",
        code, code == 200 ? "OK" : "Error", type, body.size());
    SendAll(s, h, n); SendAll(s, body.data(), body.size());
}
static std::string UrlDecode(const std::string& s) {
    std::string r; for (size_t i = 0; i < s.size(); i++) {
        if (s[i] == '%' && i + 2 < s.size() + 0 && isxdigit((unsigned char)s[i + 1]) && isxdigit((unsigned char)s[i + 2])) { r += (char)strtol(s.substr(i + 1, 2).c_str(), nullptr, 16); i += 2; }
        else if (s[i] == '+') r += ' '; else r += s[i];
    } return r;
}
static DWORD WINAPI ConnThread(LPVOID p) {
    SOCKET c = (SOCKET)(UINT_PTR)p; DWORD to = 20000; setsockopt(c, SOL_SOCKET, SO_RCVTIMEO, (char*)&to, sizeof to);
    sockaddr_in pa; int pl = sizeof pa;
    if (getpeername(c, (sockaddr*)&pa, &pl) != 0 || !PrivateAddr(pa)) { closesocket(c); return 0; }
    std::string buf; char tmp[8192]; size_t hend = std::string::npos;
    while (hend == std::string::npos && buf.size() < 16384) {
        int n = recv(c, tmp, sizeof tmp, 0); if (n <= 0) { closesocket(c); return 0; }
        buf.append(tmp, n); hend = buf.find("\r\n\r\n");
    }
    if (hend == std::string::npos) { closesocket(c); return 0; }
    std::string head = buf.substr(0, hend), rest = buf.substr(hend + 4);
    size_t sp1 = head.find(' '), sp2 = head.find(' ', sp1 + 1);
    if (sp1 == std::string::npos || sp2 == std::string::npos) { closesocket(c); return 0; }
    std::string method = head.substr(0, sp1), path = head.substr(sp1 + 1, sp2 - sp1 - 1), base = "/" + g_token;
    if (method == "GET" && (path == base || path == base + "/")) Reply(c, 200, "text/html; charset=utf-8", PHONE_PAGE);
    else if (method == "POST" && path.compare(0, base.size() + 4, base + "/up?") == 0) {
        std::string low = head; for (auto& ch : low) ch = (char)tolower((unsigned char)ch);
        size_t cl = low.find("\r\ncontent-length:"); unsigned long long len = 0;
        if (cl != std::string::npos) len = _strtoui64(low.c_str() + cl + 17, nullptr, 10);
        std::string q = path.substr(base.size() + 4), name; size_t np = q.find("name=");
        if (np != std::string::npos) { size_t e = q.find('&', np); name = UrlDecode(q.substr(np + 5, e == std::string::npos ? std::string::npos : e - np - 5)); }
        ws wname = Sanitize(FromUtf8(name)); if (wname.empty()) wname = L"photo.jpg";
        if (len == 0 || len > 400ull * 1024 * 1024) { Reply(c, 413, "text/plain", "bad size"); closesocket(c); return 0; }
        ws dir = g_stashDir + L"\\Phone"; SHCreateDirectoryExW(nullptr, dir.c_str(), nullptr);
        ws full = UniqueIn(dir, wname);
        HANDLE fh = CreateFileW(full.c_str(), GENERIC_WRITE, 0, nullptr, CREATE_NEW, FILE_ATTRIBUTE_NORMAL, nullptr);
        if (fh == INVALID_HANDLE_VALUE) { Reply(c, 500, "text/plain", "disk"); closesocket(c); return 0; }
        unsigned long long got = 0; DWORD w;
        size_t first = (size_t)std::min<unsigned long long>(rest.size(), len);
        WriteFile(fh, rest.data(), (DWORD)first, &w, nullptr); got = first;
        while (got < len) {
            int n = recv(c, tmp, (int)std::min<unsigned long long>(sizeof tmp, len - got), 0); if (n <= 0) break;
            WriteFile(fh, tmp, n, &w, nullptr); got += n;
        }
        CloseHandle(fh);
        if (got == len) { Reply(c, 200, "text/plain", "ok"); PostMessageW(g_hwnd, WM_PHONEFILE, (WPARAM) new ws(full), 0); }
        else DeleteFileW(full.c_str());
    } else Reply(c, 404, "text/plain", "not found");
    closesocket(c); return 0;
}
static DWORD WINAPI SrvThread(LPVOID) {
    while (g_srvRun) {
        fd_set fs; FD_ZERO(&fs); FD_SET(g_ls, &fs); timeval tv = { 0, 400000 };
        if (select(0, &fs, nullptr, nullptr, &tv) > 0) {
            SOCKET c = accept(g_ls, nullptr, nullptr);
            if (c != INVALID_SOCKET) { HANDLE t = CreateThread(nullptr, 0, ConnThread, (LPVOID)(UINT_PTR)c, 0, nullptr); if (t) CloseHandle(t); else closesocket(c); }
        }
    }
    closesocket(g_ls); g_ls = INVALID_SOCKET; return 0;
}
static std::string LocalIp() {
    SOCKET u = socket(AF_INET, SOCK_DGRAM, 0);
    if (u != INVALID_SOCKET) {
        sockaddr_in d = {}; d.sin_family = AF_INET; d.sin_port = htons(9); d.sin_addr.s_addr = inet_addr("192.0.2.1");
        if (connect(u, (sockaddr*)&d, sizeof d) == 0) {
            sockaddr_in me; int ml = sizeof me;
            if (getsockname(u, (sockaddr*)&me, &ml) == 0 && me.sin_addr.s_addr != 0 && PrivateAddr(me) && (ntohl(me.sin_addr.s_addr) >> 24) != 127) {
                closesocket(u); return inet_ntoa(me.sin_addr);
            }
        }
        closesocket(u);
    }
    char host[256]; if (gethostname(host, sizeof host) != 0) return "";
    addrinfo hints = {}, *res = nullptr; hints.ai_family = AF_INET; std::string out;
    if (getaddrinfo(host, nullptr, &hints, &res) == 0) {
        for (addrinfo* a = res; a; a = a->ai_next) {
            sockaddr_in* sa = (sockaddr_in*)a->ai_addr;
            if (PrivateAddr(*sa) && (ntohl(sa->sin_addr.s_addr) >> 24) != 127) { out = inet_ntoa(sa->sin_addr); break; }
        }
        freeaddrinfo(res);
    }
    return out;
}
static void StopPhoneServer() {
    if (!g_srvRun) return;
    g_srvRun = 0; if (g_srvThread) { WaitForSingleObject(g_srvThread, 2000); CloseHandle(g_srvThread); g_srvThread = nullptr; }
}
static bool StartPhoneServer() {
    if (g_srvRun) return true;
    WSADATA wd; WSAStartup(MAKEWORD(2, 2), &wd);
    g_ip = LocalIp(); if (g_ip.empty()) return false;
    SOCKET s = socket(AF_INET, SOCK_STREAM, 0); if (s == INVALID_SOCKET) return false;
    sockaddr_in a = {}; a.sin_family = AF_INET; a.sin_addr.s_addr = htonl(INADDR_ANY); a.sin_port = 0;
    if (bind(s, (sockaddr*)&a, sizeof a) != 0 || listen(s, 8) != 0) { closesocket(s); return false; }
    int al = sizeof a; getsockname(s, (sockaddr*)&a, &al); g_port = ntohs(a.sin_port);
    unsigned char rnd[10]; SystemFunction036(rnd, sizeof rnd); char hx[32] = {};
    for (int i = 0; i < 10; i++) snprintf(hx + i * 2, 3, "%02x", rnd[i]);
    g_token = hx; g_ls = s; g_srvRun = 1; g_phoneCount = 0;
    g_srvThread = CreateThread(nullptr, 0, SrvThread, nullptr, 0, nullptr);
    g_phoneUrl = "http://" + g_ip + ":" + std::to_string(g_port) + "/" + g_token;
    return g_srvThread != nullptr;
}
static void ClosePhone() {
    StopPhoneServer(); if (g_phoneWnd) { DestroyWindow(g_phoneWnd); g_phoneWnd = nullptr; }
    g_pinned = g_phonePrevPinned;
    if (!g_pinned && TotalItems() == 0 && IsWindowVisible(g_hwnd)) HideShelf();
}
static const int PH_W = 300, PH_H = 392;
static RECT PhoneCloseRect() { RECT r = { S(80), S(PH_H) - S(48), S(PH_W) - S(80), S(PH_H) - S(16) }; return r; }
static LRESULT CALLBACK PhoneProc(HWND h, UINT m, WPARAM w, LPARAM l) {
    switch (m) {
    case WM_ERASEBKGND: return 1;
    case WM_MOUSEACTIVATE: return MA_NOACTIVATE;
    case WM_PAINT: {
        PAINTSTRUCT ps; HDC hdc = BeginPaint(h, &ps); RECT rc; GetClientRect(h, &rc);
        HDC dc = CreateCompatibleDC(hdc); HBITMAP bmp = CreateCompatibleBitmap(hdc, rc.right, rc.bottom); HGDIOBJ old = SelectObject(dc, bmp);
        HBRUSH bg = CreateSolidBrush(C_BG); FillRect(dc, &rc, bg); DeleteObject(bg);
        RECT t = { S(12), S(12), rc.right - S(12), S(36) };
        Txt(dc, L"Send photos from your phone", t, DT_CENTER | DT_VCENTER, C_TXT, g_fontBold);
        int n = (int)g_qr.size(), quiet = 3, box = S(236);
        if (n) {
            int ms = std::max(1, box / (n + quiet * 2)); int side = ms * (n + quiet * 2);
            int ox = (rc.right - side) / 2, oy = S(44);
            RECT white = { ox, oy, ox + side, oy + side }; HBRUSH wb = CreateSolidBrush(RGB(255, 255, 255)); FillRect(dc, &white, wb); DeleteObject(wb);
            HBRUSH kb = CreateSolidBrush(RGB(0, 0, 0));
            for (int y = 0; y < n; y++) for (int x = 0; x < n; x++) if (g_qr[y][x]) {
                RECT mr = { ox + (x + quiet) * ms, oy + (y + quiet) * ms, ox + (x + quiet + 1) * ms, oy + (y + quiet + 1) * ms }; FillRect(dc, &mr, kb);
            }
            DeleteObject(kb);
        }
        RECT c1 = { S(12), S(44) + S(240), rc.right - S(12), S(44) + S(262) };
        Txt(dc, L"Scan with your phone camera (same Wi-Fi)", c1, DT_CENTER | DT_VCENTER, C_TXT, g_fontSmall);
        RECT c2 = { S(12), c1.bottom, rc.right - S(12), c1.bottom + S(20) };
        Txt(dc, L"Photos arrive on the shelf. Nothing leaves your network.", c2, DT_CENTER | DT_VCENTER, C_DIM, g_fontSmall);
        RECT c3 = { S(12), c2.bottom, rc.right - S(12), c2.bottom + S(20) };
        Txt(dc, L"Received: " + std::to_wstring((int)g_phoneCount), c3, DT_CENTER | DT_VCENTER, C_ACC, g_fontBold);
        RECT cb = PhoneCloseRect(); FillRound(dc, cb, C_TAB, S(8)); Txt(dc, L"Stop and close", cb, DT_CENTER | DT_VCENTER, C_TXT, g_font);
        BitBlt(hdc, 0, 0, rc.right, rc.bottom, dc, 0, 0, SRCCOPY); SelectObject(dc, old); DeleteObject(bmp); DeleteDC(dc); EndPaint(h, &ps); return 0; }
    case WM_LBUTTONUP: { POINT p = { GET_X_LPARAM(l), GET_Y_LPARAM(l) }; RECT cb = PhoneCloseRect(); if (PtInRect(&cb, p)) ClosePhone(); return 0; }
    case WM_NCHITTEST: { POINT p = { GET_X_LPARAM(l), GET_Y_LPARAM(l) }; ScreenToClient(h, &p); RECT cb = PhoneCloseRect(); return PtInRect(&cb, p) ? HTCLIENT : HTCAPTION; }
    }
    return DefWindowProcW(h, m, w, l);
}
static void TogglePhone() {
    if (g_phoneWnd) { ClosePhone(); return; }
    if (!StartPhoneServer()) { MessageBoxW(nullptr, L"No local network (Wi-Fi or LAN) was found. Connect to the same Wi-Fi as your phone and try again.", L"Drag Shelf", MB_OK | MB_ICONINFORMATION | MB_TOPMOST); return; }
    g_qr = qr::encode(g_phoneUrl);
    g_phonePrevPinned = g_pinned; g_pinned = true;
    POINT cp; GetCursorPos(&cp);
    if (!IsWindowVisible(g_hwnd)) ShowShelfAt(cp);
    RECT sr; GetWindowRect(g_hwnd, &sr);
    static bool reg = false;
    if (!reg) { WNDCLASSEXW wc = { sizeof wc }; wc.lpfnWndProc = PhoneProc; wc.hInstance = g_inst; wc.hCursor = LoadCursorW(nullptr, IDC_ARROW); wc.lpszClassName = L"DragShelfPhone"; RegisterClassExW(&wc); reg = true; }
    MONITORINFO mi = { sizeof mi }; GetMonitorInfoW(MonitorFromWindow(g_hwnd, MONITOR_DEFAULTTONEAREST), &mi);
    int w = S(PH_W), hgt = S(PH_H); int x = sr.right + S(10); if (x + w > mi.rcWork.right) x = sr.left - w - S(10);
    x = std::max((int)mi.rcWork.left, x); int y = std::max((int)mi.rcWork.top, std::min((int)sr.top, (int)mi.rcWork.bottom - hgt));
    g_phoneWnd = CreateWindowExW(WS_EX_TOPMOST | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE, L"DragShelfPhone", L"Phone", WS_POPUP, x, y, w, hgt, nullptr, nullptr, g_inst, nullptr);
    HRGN r = CreateRoundRectRgn(0, 0, w + 1, hgt + 1, S(14), S(14)); SetWindowRgn(g_phoneWnd, r, TRUE);
    ShowWindow(g_phoneWnd, SW_SHOWNOACTIVATE);
}

// ---------------------------------------------------------------- shortcut
static ws HotkeyName(UINT mod, UINT vk) {
    ws s; if (mod & MOD_CONTROL) s += L"Ctrl+"; if (mod & MOD_SHIFT) s += L"Shift+"; if (mod & MOD_ALT) s += L"Alt+"; if (mod & MOD_WIN) s += L"Win+";
    wchar_t b[64] = {}; LONG sc = MapVirtualKeyW(vk, MAPVK_VK_TO_VSC) << 16;
    if (vk >= VK_PRIOR && vk <= VK_DELETE) sc |= (1 << 24);
    if (GetKeyNameTextW(sc, b, 64) > 0) s += b; else s += L"?";
    return s;
}
static bool g_keyDone = false, g_keyOk = false; static UINT g_keyMod = 0, g_keyVk = 0, g_keyLiveMod = 0;
static UINT ModsNow() {
    UINT m = 0; if (GetKeyState(VK_CONTROL) < 0) m |= MOD_CONTROL; if (GetKeyState(VK_SHIFT) < 0) m |= MOD_SHIFT;
    if (GetKeyState(VK_MENU) < 0) m |= MOD_ALT; if ((GetKeyState(VK_LWIN) < 0) || (GetKeyState(VK_RWIN) < 0)) m |= MOD_WIN; return m;
}
static LRESULT CALLBACK KeyProc(HWND h, UINT m, WPARAM w, LPARAM l) {
    switch (m) {
    case WM_ERASEBKGND: return 1;
    case WM_PAINT: {
        PAINTSTRUCT ps; HDC dc = BeginPaint(h, &ps); RECT rc; GetClientRect(h, &rc);
        HBRUSH bg = CreateSolidBrush(C_BG); FillRect(dc, &rc, bg); DeleteObject(bg);
        RECT a = { 0, S(14), rc.right, S(44) }; Txt(dc, L"Press the new shortcut", a, DT_CENTER | DT_VCENTER, C_TXT, g_fontBold);
        ws cur; if (g_keyLiveMod & MOD_CONTROL) cur += L"Ctrl+"; if (g_keyLiveMod & MOD_SHIFT) cur += L"Shift+"; if (g_keyLiveMod & MOD_ALT) cur += L"Alt+"; if (g_keyLiveMod & MOD_WIN) cur += L"Win+";
        if (cur.empty()) cur = L"...";
        RECT b = { S(30), S(52), rc.right - S(30), S(88) }; FillRound(dc, b, C_TAB, S(8)); Txt(dc, cur, b, DT_CENTER | DT_VCENTER, C_ACC, g_fontBold);
        RECT c = { 0, S(98), rc.right, S(122) }; Txt(dc, L"Use Ctrl, Shift or Alt with a key.  Esc cancels.", c, DT_CENTER | DT_VCENTER, C_DIM, g_fontSmall);
        EndPaint(h, &ps); return 0; }
    case WM_KEYDOWN: case WM_SYSKEYDOWN: {
        UINT vk = (UINT)w;
        if (vk == VK_ESCAPE) { g_keyDone = true; DestroyWindow(h); return 0; }
        g_keyLiveMod = ModsNow(); InvalidateRect(h, nullptr, FALSE);
        if (vk == VK_CONTROL || vk == VK_SHIFT || vk == VK_MENU || vk == VK_LWIN || vk == VK_RWIN) return 0;
        if (!(g_keyLiveMod & (MOD_CONTROL | MOD_ALT | MOD_SHIFT | MOD_WIN))) return 0;
        g_keyMod = g_keyLiveMod; g_keyVk = vk; g_keyOk = true; g_keyDone = true; DestroyWindow(h); return 0; }
    case WM_KEYUP: case WM_SYSKEYUP: g_keyLiveMod = ModsNow(); InvalidateRect(h, nullptr, FALSE); return 0;
    case WM_CLOSE: g_keyDone = true; DestroyWindow(h); return 0;
    }
    return DefWindowProcW(h, m, w, l);
}
static void ChangeHotkey() {
    static bool reg = false;
    if (!reg) { WNDCLASSEXW wc = { sizeof wc }; wc.lpfnWndProc = KeyProc; wc.hInstance = g_inst; wc.hCursor = LoadCursorW(nullptr, IDC_ARROW); wc.lpszClassName = L"DragShelfKey"; RegisterClassExW(&wc); reg = true; }
    POINT cp; GetCursorPos(&cp); UpdateDpiFor(cp);
    MONITORINFO mi = { sizeof mi }; GetMonitorInfoW(MonitorFromPoint(cp, MONITOR_DEFAULTTONEAREST), &mi);
    int w = S(340), h = S(150), x = (mi.rcWork.left + mi.rcWork.right - w) / 2, y = (mi.rcWork.top + mi.rcWork.bottom - h) / 2;
    g_keyDone = false; g_keyOk = false; g_keyLiveMod = 0;
    UnregisterHotKey(g_hwnd, 1);
    HWND kw = CreateWindowExW(WS_EX_TOPMOST | WS_EX_TOOLWINDOW, L"DragShelfKey", L"Shortcut", WS_POPUP | WS_BORDER, x, y, w, h, nullptr, nullptr, g_inst, nullptr);
    ShowWindow(kw, SW_SHOW); SetForegroundWindow(kw); SetFocus(kw);
    MSG msg; while (!g_keyDone && GetMessageW(&msg, nullptr, 0, 0) > 0) { TranslateMessage(&msg); DispatchMessageW(&msg); }
    if (g_keyOk) {
        if (RegisterHotKey(g_hwnd, 1, g_keyMod | MOD_NOREPEAT, g_keyVk)) {
            g_hkMod = g_keyMod; g_hkVk = g_keyVk;
            WritePrivateProfileStringW(L"main", L"hkmod", std::to_wstring(g_hkMod).c_str(), IniPath().c_str());
            WritePrivateProfileStringW(L"main", L"hkvk", std::to_wstring(g_hkVk).c_str(), IniPath().c_str());
        } else {
            MessageBoxW(nullptr, L"That shortcut is already used by Windows or another app. The previous shortcut stays active.", L"Drag Shelf", MB_OK | MB_ICONINFORMATION | MB_TOPMOST);
            RegisterHotKey(g_hwnd, 1, g_hkMod | MOD_NOREPEAT, g_hkVk);
        }
    } else RegisterHotKey(g_hwnd, 1, g_hkMod | MOD_NOREPEAT, g_hkVk);
}

// ---------------------------------------------------------------- first-launch guide (animated)
static HWND g_guide = nullptr; static int g_gpage = 0; static DWORD g_gt0 = 0;
static const int GN = 4, GW = 520, GH = 400;
static void GFile(HDC dc, int x, int y, int sz, COLORREF c) {
    RECT r = { x, y, x + sz * 3 / 4, y + sz }; FillRound(dc, r, c, S(4));
    RECT l1 = { x + sz / 8, y + sz * 5 / 8, x + sz * 5 / 8, y + sz * 5 / 8 + S(2) }; HBRUSH b = CreateSolidBrush(RGB(255, 255, 255)); FillRect(dc, &l1, b);
    RECT l2 = { x + sz / 8, y + sz * 3 / 4, x + sz * 5 / 8, y + sz * 3 / 4 + S(2) }; FillRect(dc, &l2, b); DeleteObject(b);
}
static void GCursor(HDC dc, int x, int y) {
    POINT p[7] = { {x, y}, {x, y + S(16)}, {x + S(4), y + S(12)}, {x + S(7), y + S(19)}, {x + S(9), y + S(18)}, {x + S(6), y + S(11)}, {x + S(11), y + S(11)} };
    HBRUSH b = CreateSolidBrush(RGB(255, 255, 255)); HPEN pn = CreatePen(PS_SOLID, 1, RGB(0, 0, 0));
    HGDIOBJ ob = SelectObject(dc, b), op = SelectObject(dc, pn); Polygon(dc, p, 7); SelectObject(dc, ob); SelectObject(dc, op); DeleteObject(b); DeleteObject(pn);
}
static void GShelf(HDC dc, int x, int y, int w, int h, int tabs, int rows, bool hot, int pulsePlus) {
    RECT r = { x, y, x + w, y + h }; FillRound(dc, r, C_BG, S(12));
    HPEN pn = CreatePen(PS_SOLID, hot ? S(2) : 1, hot ? C_ACC : C_HOT); HGDIOBJ op = SelectObject(dc, pn), ob = SelectObject(dc, GetStockObject(NULL_BRUSH));
    RoundRect(dc, r.left, r.top, r.right, r.bottom, S(12), S(12)); SelectObject(dc, op); SelectObject(dc, ob); DeleteObject(pn);
    for (int i = 0; i < tabs; i++) { RECT t = { x + S(8) + i * S(52), y + S(8), x + S(8) + i * S(52) + S(48), y + S(26) }; FillRound(dc, t, i == 0 ? C_TAB : C_ROW, S(5)); }
    RECT p = { x + S(8) + tabs * S(52), y + S(8), x + S(8) + tabs * S(52) + S(20), y + S(26) };
    if (pulsePlus) { RECT pp = p; InflateRect(&pp, S(3), S(3)); FillRound(dc, pp, C_ACC, S(6)); }
    Txt(dc, L"+", p, DT_CENTER | DT_VCENTER, pulsePlus ? RGB(255, 255, 255) : C_DIM, g_fontBold);
    for (int i = 0; i < rows; i++) { RECT rw = { x + S(8), y + S(34) + i * S(30), x + w - S(8), y + S(34) + i * S(30) + S(26) }; FillRound(dc, rw, C_ROW, S(6));
        RECT ic = { rw.left + S(6), rw.top + S(5), rw.left + S(22), rw.top + S(21) }; FillRound(dc, ic, C_ACC, S(3));
        RECT tx = { rw.left + S(30), rw.top, rw.right - S(6), rw.bottom }; Txt(dc, i == 0 ? L"photo.jpg" : L"notes.txt", tx, DT_LEFT | DT_VCENTER, C_TXT, g_fontSmall); }
}
static double Ease(double t) { t = std::max(0.0, std::min(1.0, t)); return t * t * (3 - 2 * t); }
static void GScene(HDC dc, RECT a, int page, double lt) {
    HBRUSH sb = CreateSolidBrush(C_ROW); FillRect(dc, &a, sb); DeleteObject(sb);
    int w = a.right - a.left, h = a.bottom - a.top, fs = S(44);
    int shW = S(170), shH = S(124), shX = a.right - shW - S(24), shY = a.top + (h - shH) / 2;
    if (page == 0) {
        int fx = a.left + w / 3 + (int)(std::sin(lt * 8) * S(60) * (lt < 2.2 ? 1 : 0.0)), fy = a.top + (h - fs) / 2;
        if (lt > 1.4) GShelf(dc, shX, shY, shW, shH, 1, 0, false, 0);
        GFile(dc, fx, fy, fs, C_ACC); GCursor(dc, fx + fs / 3, fy + fs / 2);
    } else if (page == 1) {
        double p = Ease(lt / 2.0); int fx = a.left + S(50) + (int)((shX + S(20) - a.left - S(50)) * p), fy = a.top + h / 2 - fs / 2 + (int)((shY + S(40) - (a.top + h / 2 - fs / 2)) * p);
        GShelf(dc, shX, shY, shW, shH, 1, lt > 2.1 ? 1 : 0, lt > 1.2 && lt < 2.1, 0);
        if (lt < 2.1) { GFile(dc, fx, fy, (int)(fs * (1 - 0.35 * p)), C_ACC); GCursor(dc, fx + fs / 3, fy + fs / 2); }
    } else if (page == 2) {
        int sx = a.left + S(24); GShelf(dc, sx, shY, shW, shH, 1, lt > 2.6 ? 0 : 1, false, 0);
        int fx0 = sx + S(14), fy0 = shY + S(38), fx1 = a.right - S(110), fy1 = a.top + (h - fs) / 2; double p = Ease((lt - 0.5) / 2.0);
        RECT fd = { a.right - S(120), a.top + (h - S(70)) / 2, a.right - S(30), a.top + (h - S(70)) / 2 + S(70) }; FillRound(dc, fd, RGB(224, 170, 60), S(8));
        Txt(dc, L"Folder", fd, DT_CENTER | DT_BOTTOM, RGB(70, 45, 0), g_fontSmall);
        if (lt >= 0.5 && lt < 2.6) { int fx = fx0 + (int)((fx1 - fx0) * p), fy = fy0 + (int)((fy1 - fy0) * p); GFile(dc, fx, fy, (int)(S(16) + (fs - S(16)) * Ease(p * 2)), C_ACC); GCursor(dc, fx + S(10), fy + S(14)); }
        else if (lt >= 2.6) GFile(dc, fd.left + S(30), fd.top + S(10), S(28), C_ACC);
        RECT cp = { sx, a.bottom - S(26), sx + S(260), a.bottom - S(6) }; Txt(dc, L"Hold Ctrl to copy instead of move", cp, DT_LEFT | DT_VCENTER, C_DIM, g_fontSmall);
    } else {
        GShelf(dc, a.left + S(24), shY, S(190), shH, 3, 2, false, ((int)(lt * 2) % 2) == 0);
        ws nm = HotkeyName(g_hkMod, g_hkVk); size_t pos = 0; int kx = a.left + S(250), ky = a.top + S(28);
        std::vector<ws> parts; while (true) { size_t e = nm.find(L'+', pos); if (e == ws::npos || e + 1 >= nm.size()) { parts.push_back(nm.substr(pos)); break; } parts.push_back(nm.substr(pos, e - pos)); pos = e + 1; }
        for (auto& pt : parts) { int kw = std::max(S(34), (int)pt.size() * S(9) + S(16)); RECT k = { kx, ky, kx + kw, ky + S(30) }; FillRound(dc, k, C_TAB, S(6)); Txt(dc, pt, k, DT_CENTER | DT_VCENTER, C_TXT, g_fontBold); kx += kw + S(6); }
        RECT cap = { a.left + S(250), ky + S(36), a.right - S(10), ky + S(56) }; Txt(dc, L"show or hide", cap, DT_LEFT | DT_VCENTER, C_DIM, g_fontSmall);
        RECT ph = { a.left + S(262), a.top + S(100), a.left + S(300), a.top + S(100) + S(64) }; FillRound(dc, ph, C_TAB, S(8));
        for (int i = 0; i < 3; i++) { int rad = S(14) + i * S(10); double ph0 = lt * 2 - i * 0.4; if (std::fmod(ph0, 2.0) > 0 && std::fmod(ph0, 2.0) < 1.4) { HPEN pn = CreatePen(PS_SOLID, S(2), C_ACC); HGDIOBJ op = SelectObject(dc, pn), ob = SelectObject(dc, GetStockObject(NULL_BRUSH)); Arc(dc, ph.right + S(4) - rad, ph.top + S(32) - rad, ph.right + S(4) + rad, ph.top + S(32) + rad, ph.right + S(4), ph.top + S(32) - rad, ph.right + S(4), ph.top + S(32) + rad); SelectObject(dc, op); SelectObject(dc, ob); DeleteObject(pn); } }
        RECT pc = { ph.right + S(50), a.top + S(116), a.right - S(10), a.top + S(150) }; Txt(dc, L"photos to shelf", pc, DT_LEFT | DT_VCENTER, C_DIM, g_fontSmall);
    }
}
static ws GDesc(int i) {
    switch (i) {
    case 0: return L"Start dragging a file anywhere, then shake the mouse, or push it against a screen edge. The shelf appears next to your cursor.";
    case 1: return L"Drop files, folders, links, text or images on it. Files are only referenced, so even huge ones land instantly.";
    case 2: return L"Drag an item, or the All row, to where you need it. Reorder by dragging inside the shelf.";
    default: return L"Use + for new shelf tabs, scan the phone QR to send photos over your Wi-Fi, and press " + HotkeyName(g_hkMod, g_hkVk) + L" any time. Everything is in the tray menu.";
    }
}
static const wchar_t* GTitle(int i) {
    static const wchar_t* t[GN] = { L"Drag a file, then shake", L"Drop it on the shelf", L"Take it back out", L"Tabs, phone photos, shortcut" }; return t[i];
}
static RECT GBtn(int which) { // 0 back, 1 next
    RECT r = { which ? S(GW) - S(140) : S(24), S(GH) - S(54), which ? S(GW) - S(24) : S(110), S(GH) - S(18) }; return r;
}
static void CloseGuide() {
    if (!g_guide) return; KillTimer(g_guide, 1);
    WritePrivateProfileStringW(L"main", L"guide_done", L"1", IniPath().c_str()); DestroyWindow(g_guide); g_guide = nullptr;
}
static LRESULT CALLBACK GuideProc(HWND h, UINT m, WPARAM w, LPARAM l) {
    switch (m) {
    case WM_ERASEBKGND: return 1;
    case WM_TIMER: InvalidateRect(h, nullptr, FALSE); return 0;
    case WM_PAINT: {
        PAINTSTRUCT ps; HDC hdc = BeginPaint(h, &ps); RECT rc; GetClientRect(h, &rc);
        HDC dc = CreateCompatibleDC(hdc); HBITMAP bmp = CreateCompatibleBitmap(hdc, rc.right, rc.bottom); HGDIOBJ old = SelectObject(dc, bmp);
        HBRUSH bg = CreateSolidBrush(C_BG); FillRect(dc, &rc, bg); DeleteObject(bg);
        double t = (GetTickCount() - g_gt0) / 1000.0, lt = std::fmod(t, 4.5);
        RECT sc = { S(24), S(24), rc.right - S(24), S(24) + S(190) }; SaveDC(dc); IntersectClipRect(dc, sc.left, sc.top, sc.right, sc.bottom); GScene(dc, sc, g_gpage, lt); RestoreDC(dc, -1);
        HFONT big = CreateFontW(-S(20), 0, 0, 0, FW_SEMIBOLD, 0, 0, 0, DEFAULT_CHARSET, 0, 0, CLEARTYPE_QUALITY, 0, L"Segoe UI");
        RECT tt = { S(24), S(226), rc.right - S(24), S(256) }; Txt(dc, GTitle(g_gpage), tt, DT_LEFT | DT_VCENTER, C_TXT, big); DeleteObject(big);
        RECT dd = { S(24), S(260), rc.right - S(24), S(330) }; SelectObject(dc, g_font); SetTextColor(dc, C_DIM); SetBkMode(dc, TRANSPARENT);
        ws d = GDesc(g_gpage); DrawTextW(dc, d.c_str(), -1, &dd, DT_LEFT | DT_WORDBREAK | DT_NOPREFIX);
        for (int i = 0; i < GN; i++) { int cx = rc.right / 2 - (GN * S(14)) / 2 + i * S(14) + S(7), cy = S(GH) - S(36); HBRUSH b = CreateSolidBrush(i == g_gpage ? C_ACC : C_TAB); HPEN pn = CreatePen(PS_SOLID, 1, i == g_gpage ? C_ACC : C_TAB);
            HGDIOBJ ob = SelectObject(dc, b), op = SelectObject(dc, pn); Ellipse(dc, cx - S(4), cy - S(4), cx + S(4), cy + S(4)); SelectObject(dc, ob); SelectObject(dc, op); DeleteObject(b); DeleteObject(pn); }
        if (g_gpage > 0) { RECT b = GBtn(0); FillRound(dc, b, C_TAB, S(8)); Txt(dc, L"Back", b, DT_CENTER | DT_VCENTER, C_TXT, g_font); }
        { RECT b = GBtn(1); FillRound(dc, b, C_ACC, S(8)); Txt(dc, g_gpage == GN - 1 ? L"Get started" : L"Next", b, DT_CENTER | DT_VCENTER, RGB(255, 255, 255), g_fontBold); }
        BitBlt(hdc, 0, 0, rc.right, rc.bottom, dc, 0, 0, SRCCOPY); SelectObject(dc, old); DeleteObject(bmp); DeleteDC(dc); EndPaint(h, &ps); return 0; }
    case WM_LBUTTONUP: {
        POINT p = { GET_X_LPARAM(l), GET_Y_LPARAM(l) }; RECT b0 = GBtn(0), b1 = GBtn(1);
        if (g_gpage > 0 && PtInRect(&b0, p)) { g_gpage--; g_gt0 = GetTickCount(); }
        else if (PtInRect(&b1, p)) { if (g_gpage == GN - 1) CloseGuide(); else { g_gpage++; g_gt0 = GetTickCount(); } }
        return 0; }
    case WM_KEYDOWN: if (w == VK_ESCAPE) CloseGuide(); else if (w == VK_RIGHT) { if (g_gpage < GN - 1) { g_gpage++; g_gt0 = GetTickCount(); } } else if (w == VK_LEFT) { if (g_gpage > 0) { g_gpage--; g_gt0 = GetTickCount(); } } return 0;
    case WM_CLOSE: CloseGuide(); return 0;
    }
    return DefWindowProcW(h, m, w, l);
}
static void ShowGuide() {
    if (g_guide) { SetForegroundWindow(g_guide); return; }
    static bool reg = false;
    if (!reg) { WNDCLASSEXW wc = { sizeof wc }; wc.lpfnWndProc = GuideProc; wc.hInstance = g_inst; wc.hCursor = LoadCursorW(nullptr, IDC_ARROW); wc.lpszClassName = L"DragShelfGuide"; wc.hIcon = LoadIconW(g_inst, MAKEINTRESOURCEW(2)); RegisterClassExW(&wc); reg = true; }
    POINT cp; GetCursorPos(&cp); UpdateDpiFor(cp);
    RECT r = { 0, 0, S(GW), S(GH) }; DWORD st = WS_CAPTION | WS_SYSMENU; AdjustWindowRectEx(&r, st, FALSE, WS_EX_TOPMOST);
    MONITORINFO mi = { sizeof mi }; GetMonitorInfoW(MonitorFromPoint(cp, MONITOR_DEFAULTTONEAREST), &mi);
    int w = r.right - r.left, h = r.bottom - r.top, x = (mi.rcWork.left + mi.rcWork.right - w) / 2, y = (mi.rcWork.top + mi.rcWork.bottom - h) / 2;
    g_gpage = 0; g_gt0 = GetTickCount();
    g_guide = CreateWindowExW(WS_EX_TOPMOST, L"DragShelfGuide", L"Welcome to Drag Shelf", st, x, y, w, h, nullptr, nullptr, g_inst, nullptr);
    SetTimer(g_guide, 1, 33, nullptr); ShowWindow(g_guide, SW_SHOW); SetForegroundWindow(g_guide);
}

// ---------------------------------------------------------------- window procedure
static Hit g_down = { H_NONE, 0 }; static POINT g_downPt;

static LRESULT CALLBACK WndProc(HWND h, UINT m, WPARAM w, LPARAM l) {
    switch (m) {
    case WM_ERASEBKGND: return 1;
    case WM_NCHITTEST: {
        POINT p = { GET_X_LPARAM(l), GET_Y_LPARAM(l) }; ScreenToClient(h, &p);
        if (!g_edit && HitTest(p).t == H_NONE) return HTCAPTION;   // grip / empty space moves the shelf
        return HTCLIENT; }
    case WM_NCLBUTTONDBLCLK: case WM_NCRBUTTONUP: case WM_NCRBUTTONDOWN: return 0;
    case WM_PAINT: { PAINTSTRUCT ps; HDC dc = BeginPaint(h, &ps); RECT rc; GetClientRect(h, &rc); Paint(dc, rc); EndPaint(h, &ps); return 0; }
    case WM_MOUSEACTIVATE: return g_edit ? MA_ACTIVATE : MA_NOACTIVATE;
    case WM_USER + 7: if (g_edit && GetFocus() != g_edit) EndRename(true); return 0;
    case WM_LBUTTONDOWN: {
        if (g_edit) EndRename(true);
        g_downPt = { GET_X_LPARAM(l), GET_Y_LPARAM(l) }; g_down = HitTest(g_downPt); return 0; }
    case WM_MOUSEMOVE: {
        POINT p = { GET_X_LPARAM(l), GET_Y_LPARAM(l) };
        if (!g_tracking) { TRACKMOUSEEVENT t = { sizeof t, TME_LEAVE, h, 0 }; TrackMouseEvent(&t); g_tracking = true; }
        Hit ht = HitTest(p); int hv = ht.t == H_CLEAR ? -3 : ht.t == H_ALL ? -2 : (ht.t == H_ITEM || ht.t == H_ITEMX) ? ht.i : -1;
        if (hv != g_hoverItem) { g_hoverItem = hv; InvalidateRect(h, nullptr, FALSE); }
        if ((w & MK_LBUTTON) && (g_down.t == H_ITEM || g_down.t == H_ALL) &&
            (abs(p.x - g_downPt.x) > GetSystemMetrics(SM_CXDRAG) || abs(p.y - g_downPt.y) > GetSystemMetrics(SM_CYDRAG))) {
            Hit d = g_down; g_down = { H_NONE, 0 }; StartDrag(d);
        }
        return 0; }
    case WM_MOUSELEAVE: g_tracking = false; g_hoverItem = -1; InvalidateRect(h, nullptr, FALSE); return 0;
    case WM_MOUSEWHEEL: g_scroll -= GET_WHEEL_DELTA_WPARAM(w) * S(ROWH) / 120 / 1; ClampScroll(); InvalidateRect(h, nullptr, FALSE); return 0;
    case WM_LBUTTONUP: {
        POINT p = { GET_X_LPARAM(l), GET_Y_LPARAM(l) }; Hit u = HitTest(p); Hit d = g_down; g_down = { H_NONE, 0 };
        if (d.t != u.t || d.i != u.i) return 0;
        if (u.t == H_CLOSE) { HideShelf(); }
        else if (u.t == H_TAB) { g_active = u.i; g_scroll = 0; Relayout(); }
        else if (u.t == H_PHONE) { TogglePhone(); }
        else if (u.t == H_PLUS) { g_active = NewShelf(); Save(); g_scroll = 0; Relayout(); }
        else if (u.t == H_CLEAR) { cur().items.clear(); Save(); g_scroll = 0; Relayout();
            if (TotalItems() == 0 && !g_pinned) HideShelf(); }
        else if (u.t == H_ITEMX) { RemoveItem(g_active, cur().items[u.i]); Save(); Relayout();
            if (TotalItems() == 0 && !g_pinned) HideShelf(); }
        return 0; }
    case WM_LBUTTONDBLCLK: {
        POINT p = { GET_X_LPARAM(l), GET_Y_LPARAM(l) }; Hit u = HitTest(p);
        if (u.t == H_TAB) BeginRename(u.i);
        else if (u.t == H_ITEM) ShellExecuteW(h, L"open", cur().items[u.i].c_str(), nullptr, nullptr, SW_SHOWNORMAL);
        return 0; }
    case WM_RBUTTONUP: {
        POINT p = { GET_X_LPARAM(l), GET_Y_LPARAM(l) }; Hit u = HitTest(p);
        if (u.t == H_TAB) {
            g_active = u.i; Relayout(); HMENU mn = CreatePopupMenu();
            AppendMenuW(mn, MF_STRING, ID_RENAME, L"Rename");
            AppendMenuW(mn, MF_STRING, ID_CLEAR, L"Clear shelf");
            AppendMenuW(mn, MF_STRING | (g_shelves.size() > 1 ? 0 : MF_GRAYED), ID_DELSHELF, L"Delete shelf");
            POINT sp; GetCursorPos(&sp); TrackPopupMenu(mn, TPM_RIGHTBUTTON, sp.x, sp.y, 0, h, nullptr); DestroyMenu(mn);
        } else if (u.t == H_ITEM) { RemoveItem(g_active, cur().items[u.i]); Save(); Relayout(); }
        return 0; }
    case WM_COMMAND:
        switch (LOWORD(w)) {
        case ID_SHOW: if (IsWindowVisible(h)) HideShelf(); else { POINT pt; GetCursorPos(&pt); g_pinned = true; ShowShelfAt(pt); } break;
        case ID_STRICT: g_strict = !g_strict; WritePrivateProfileStringW(L"main", L"strict", g_strict ? L"1" : L"0", IniPath().c_str()); break;
        case ID_AUTOSTART: SetAutostart(!AutostartOn()); break;
        case ID_EXCL_EDIT: EnsureExcludedFile(); ShellExecuteW(nullptr, L"open", L"notepad.exe", (g_dataDir + L"\\excluded.txt").c_str(), nullptr, SW_SHOWNORMAL); break;
        case ID_EXCL_LAST: { EnsureExcludedFile(); std::string line = ToUtf8(g_lastExe) + "\r\n";
            HANDLE f = CreateFileW((g_dataDir + L"\\excluded.txt").c_str(), FILE_APPEND_DATA, FILE_SHARE_READ, nullptr, OPEN_EXISTING, 0, nullptr);
            if (f != INVALID_HANDLE_VALUE) { DWORD n; WriteFile(f, line.data(), (DWORD)line.size(), &n, nullptr); CloseHandle(f); } break; }
        case ID_CLEARALL: for (auto& sh : g_shelves) sh.items.clear(); Save(); Relayout(); if (!g_pinned) HideShelf(); break;
        case ID_HOTKEY: ChangeHotkey(); break;
        case ID_PHONE: TogglePhone(); break;
        case ID_GUIDE: ShowGuide(); break;
        case ID_RENAME: BeginRename(g_active); break;
        case ID_CLEAR: cur().items.clear(); Save(); Relayout(); break;
        case ID_DELSHELF: if (g_shelves.size() > 1) { g_shelves.erase(g_shelves.begin() + g_active); g_active = std::max(0, g_active - 1); Save(); Relayout(); } break;
        case ID_EXIT: DestroyWindow(h); break;
        default:
            if (LOWORD(w) >= ID_THEME0 && LOWORD(w) < ID_THEME0 + 3) { g_theme = LOWORD(w) - ID_THEME0; ApplyTheme(); WritePrivateProfileStringW(L"main", L"theme", std::to_wstring(g_theme).c_str(), IniPath().c_str()); InvalidateRect(h, nullptr, FALSE); if (g_phoneWnd) InvalidateRect(g_phoneWnd, nullptr, FALSE); }
            else if (LOWORD(w) >= ID_ACC0 && LOWORD(w) < ID_ACC0 + 7) { g_accent = LOWORD(w) - ID_ACC0; ApplyTheme(); WritePrivateProfileStringW(L"main", L"accent", std::to_wstring(g_accent).c_str(), IniPath().c_str()); InvalidateRect(h, nullptr, FALSE); if (g_phoneWnd) InvalidateRect(g_phoneWnd, nullptr, FALSE); }
        } return 0;
    case WM_HOTKEY:
        if (IsWindowVisible(h)) { if (g_phoneWnd) ClosePhone(); HideShelf(); } else { POINT pt; GetCursorPos(&pt); g_pinned = true; ShowShelfAt(pt); }
        return 0;
    case WM_SETTINGCHANGE:
        if (g_theme == 0 && l && !wcscmp((const wchar_t*)l, L"ImmersiveColorSet")) { ApplyTheme(); InvalidateRect(h, nullptr, FALSE); if (g_phoneWnd) InvalidateRect(g_phoneWnd, nullptr, FALSE); }
        return 0;
    case WM_PHONEFILE: { ws* p = (ws*)w; AddPaths(g_active, { *p }); delete p; g_scroll = 0; Relayout(); InterlockedIncrement(&g_phoneCount); if (g_phoneWnd) InvalidateRect(g_phoneWnd, nullptr, FALSE); return 0; }
    case WM_TRAY:
        if (l == WM_LBUTTONUP) { if (IsWindowVisible(h)) HideShelf(); else { POINT pt; GetCursorPos(&pt); g_pinned = true; ShowShelfAt(pt); } }
        else if (l == WM_RBUTTONUP) TrayMenu();
        return 0;
    case WM_DRAGSTART: {
        POINT pt = { (LONG)w, (LONG)l };
        if (IsWindowVisible(h)) return 0;
        if (!RealDragInProgress() || Suppressed()) { InterlockedExchange(&g_trigd, 0); return 0; }
        ShowShelfAt(pt); return 0; }
    case WM_DRAGEND: SetTimer(h, TIMER_HIDE, 350, nullptr); return 0;
    case WM_TIMER:
        if (w == TIMER_HIDE) { KillTimer(h, TIMER_HIDE); if (!g_selfDrag && !g_pinned && TotalItems() == 0 && IsWindowVisible(h)) HideShelf(); }
        return 0;
    case WM_DESTROY: UnregisterHotKey(h, 1); StopPhoneServer(); Shell_NotifyIconW(NIM_DELETE, &g_nid); PostQuitMessage(0); return 0;
    default:
        if (m == g_taskbarMsg) AddTray();
    }
    return DefWindowProcW(h, m, w, l);
}

int WINAPI wWinMain(HINSTANCE inst, HINSTANCE, PWSTR, int) {
    g_inst = inst;
    HANDLE mtx = CreateMutexW(nullptr, TRUE, L"Local\\DragShelfSingleInstance");
    if (GetLastError() == ERROR_ALREADY_EXISTS) {
        // a newer launch replaces the running copy
        HWND oldw = FindWindowW(L"DragShelfWnd", nullptr);
        if (oldw) PostMessageW(oldw, WM_CLOSE, 0, 0);
        DWORD r = WaitForSingleObject(mtx, 5000);
        if (r != WAIT_OBJECT_0 && r != WAIT_ABANDONED) return 0;
    }
    OleInitialize(nullptr);
    g_dataDir = KnownFolder(FOLDERID_LocalAppData) + L"\\DragShelf"; g_stashDir = g_dataDir + L"\\stash";
    SHCreateDirectoryExW(nullptr, g_stashDir.c_str(), nullptr);
    g_strict = GetPrivateProfileIntW(L"main", L"strict", 1, IniPath().c_str()) != 0;
    g_theme = GetPrivateProfileIntW(L"main", L"theme", 0, IniPath().c_str()); if (g_theme < 0 || g_theme > 2) g_theme = 0;
    g_accent = GetPrivateProfileIntW(L"main", L"accent", 0, IniPath().c_str()); if (g_accent < 0 || g_accent > 6) g_accent = 0;
    g_hkMod = GetPrivateProfileIntW(L"main", L"hkmod", MOD_CONTROL | MOD_SHIFT, IniPath().c_str());
    g_hkVk = GetPrivateProfileIntW(L"main", L"hkvk", 'F', IniPath().c_str());
    ApplyTheme();
    Load(); EnsureExcludedFile();
    g_taskbarMsg = RegisterWindowMessageW(L"TaskbarCreated");

    WNDCLASSEXW wc = { sizeof wc }; wc.style = CS_DBLCLKS; wc.lpfnWndProc = WndProc; wc.hInstance = inst;
    wc.hCursor = LoadCursorW(nullptr, IDC_ARROW); wc.lpszClassName = L"DragShelfWnd";
    wc.hIcon = LoadIconW(inst, MAKEINTRESOURCEW(2));
    RegisterClassExW(&wc);
    POINT zero = { 0, 0 }; UpdateDpiFor(zero);
    g_hwnd = CreateWindowExW(WS_EX_TOPMOST | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE, wc.lpszClassName, L"Drag Shelf", WS_POPUP,
        0, 0, S(W), WinH(), nullptr, nullptr, inst, nullptr);
    RegisterDragDrop(g_hwnd, new ShelfTarget());
    AddTray();
    RegisterHotKey(g_hwnd, 1, g_hkMod | MOD_NOREPEAT, g_hkVk);
    if (!GetPrivateProfileIntW(L"main", L"guide_done", 0, IniPath().c_str())) ShowGuide();
    HHOOK hook = SetWindowsHookExW(WH_MOUSE_LL, MouseProc, inst, 0);

    MSG msg; while (GetMessageW(&msg, nullptr, 0, 0) > 0) { TranslateMessage(&msg); DispatchMessageW(&msg); }
    if (hook) UnhookWindowsHookEx(hook);
    RevokeDragDrop(g_hwnd); OleUninitialize(); CloseHandle(mtx);
    return 0;
}
