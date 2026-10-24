// Read-only desktop context for the shared Electron UI. No keyboard recording.
#define UNICODE
#define _UNICODE
#define _WIN32_WINNT 0x0A00
#include <windows.h>
#include <shellapi.h>
#include <iostream>
#include <string>

static std::string Escape(const std::wstring& s) {
    int n = WideCharToMultiByte(CP_UTF8, 0, s.data(), (int)s.size(), nullptr, 0, nullptr, nullptr);
    std::string utf8(n, 0), out;
    if (n) WideCharToMultiByte(CP_UTF8, 0, s.data(), (int)s.size(), utf8.data(), n, nullptr, nullptr);
    for (unsigned char c : utf8) {
        if (c == '"' || c == '\\') { out += '\\'; out += (char)c; }
        else if (c >= 32) out += (char)c;
    }
    return out;
}
int main() {
    std::string request;
    while (std::getline(std::cin, request)) {
        HWND fg = GetForegroundWindow(); DWORD pid = 0;
        DWORD tid = fg ? GetWindowThreadProcessId(fg, &pid) : 0;
        std::wstring name;
        HANDLE p = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, pid);
        if (p) {
            wchar_t buf[32768]; DWORD len = 32768;
            if (QueryFullProcessImageNameW(p, 0, buf, &len)) {
                name.assign(buf, len); auto slash = name.find_last_of(L"\\/");
                if (slash != std::wstring::npos) name = name.substr(slash + 1);
            }
            CloseHandle(p);
        }
        GUITHREADINFO gi = { sizeof gi };
        bool drag = (GetAsyncKeyState(VK_LBUTTON) & 0x8000) && GetGUIThreadInfo(tid, &gi)
            && !(gi.flags & (GUI_INMOVESIZE | GUI_INMENUMODE | GUI_POPUPMENUMODE)) && gi.hwndCapture;
        QUERY_USER_NOTIFICATION_STATE state = QUNS_ACCEPTS_NOTIFICATIONS;
        bool suppressed = SUCCEEDED(SHQueryUserNotificationState(&state)) &&
            (state == QUNS_BUSY || state == QUNS_RUNNING_D3D_FULL_SCREEN || state == QUNS_PRESENTATION_MODE);
        std::cout << "{\"name\":\"" << Escape(name) << "\",\"id\":\"" << Escape(name)
                  << "\",\"dragging\":" << (drag ? "true" : "false")
                  << ",\"suppressed\":" << (suppressed ? "true" : "false") << "}" << std::endl;
    }
}
