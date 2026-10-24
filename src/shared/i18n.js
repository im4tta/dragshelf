(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.I18N = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const rows = [
    ['showShelf', 'Show shelf', 'បង្ហាញធ្នើ'],
    ['hideShelf', 'Hide shelf', 'លាក់ធ្នើ'],
    ['newShelf', 'New shelf', 'ធ្នើថ្មី'],
    ['shelfName', 'Shelf {n}', 'ធ្នើទី {n}'],
    ['shelf', 'Shelf', 'ធ្នើ'],
    ['dragMove', 'Drag to move', 'អូសដើម្បីផ្លាស់ទី'],
    ['doneTotal', 'Done / total on this shelf', 'ចំនួនរួចរាល់ / ចំនួនសរុបលើធ្នើនេះ'],
    ['phoneMenu', 'Photos from phone…', 'រូបថតពីទូរសព្ទ…'],
    ['phoneTitle', 'Photos from your phone', 'រូបថតពីទូរសព្ទរបស់អ្នក'],
    ['theme', 'Theme', 'រូបរាង'],
    ['systemTheme', 'Match system', 'តាមប្រព័ន្ធ'],
    ['macTheme', 'Match macOS', 'តាម macOS'],
    ['light', 'Light', 'ភ្លឺ'], ['dark', 'Dark', 'ងងឹត'],
    ['accent', 'Accent color', 'ពណ៌រំលេច'],
    ['yellow', 'Yellow', 'លឿង'], ['blue', 'Blue', 'ខៀវ'], ['purple', 'Purple', 'ស្វាយ'],
    ['pink', 'Pink', 'ផ្កាឈូក'], ['red', 'Red', 'ក្រហម'], ['orange', 'Orange', 'ទឹកក្រូច'],
    ['green', 'Green', 'បៃតង'], ['teal', 'Teal', 'ខៀវបៃតង'],
    ['language', 'Language / ភាសា', 'ភាសា / Language'], ['systemLanguage', 'System language', 'តាមភាសាប្រព័ន្ធ'],
    ['shortcutMenu', 'Change shortcut…', 'ប្ដូរគ្រាប់ចុចផ្លូវកាត់…'],
    ['clearShelves', 'Clear all shelves', 'សម្អាតធ្នើទាំងអស់'],
    ['removeAfter', 'Remove items after dragging them out', 'ដកធាតុចេញពីធ្នើក្រោយពេលអូសចេញ'],
    ['strictDrag', 'Strict drag detection', 'ពិនិត្យការអូសយ៉ាងតឹងរ៉ឹង'],
    ['startWindows', 'Start with Windows', 'បើកជាមួយ Windows'],
    ['startLogin', 'Start at login', 'បើកនៅពេលចូលប្រព័ន្ធ'],
    ['excludeApp', 'Never show over {name}', 'កុំបង្ហាញពីលើ {name}'],
    ['editExcluded', 'Edit excluded apps…', 'កែបញ្ជីកម្មវិធីដែលមិនបង្ហាញធ្នើ…'],
    ['detectionOn', 'Drag detection: on', 'ការរកឃើញការអូស៖ បើក'],
    ['enableDetection', 'Enable drag detection…', 'បើកការរកឃើញការអូស…'],
    ['showGuide', 'Show guide', 'បង្ហាញការណែនាំ'],
    ['privacy', 'Privacy policy', 'គោលការណ៍ឯកជនភាព'],
    ['support', 'Help and support', 'ជំនួយ និងការគាំទ្រ'],
    ['about', 'About Drag Shelf', 'អំពី Drag Shelf'], ['quit', 'Quit Drag Shelf', 'ចាកចេញពី Drag Shelf'],
    ['tagline', 'A temporary shelf for files, links, text and images.', 'ធ្នើបណ្ដោះអាសន្នសម្រាប់ឯកសារ តំណ អត្ថបទ និងរូបភាព។'],
    ['open', 'Open', 'បើក'], ['revealMac', 'Show in Finder', 'បង្ហាញក្នុង Finder'],
    ['reveal', 'Show in folder', 'បង្ហាញក្នុងថត'], ['copyPath', 'Copy path', 'ចម្លងផ្លូវឯកសារ'],
    ['markDone', 'Mark as done', 'សម្គាល់ថារួចរាល់'], ['markNotDone', 'Mark as not done', 'សម្គាល់ថាមិនទាន់រួចរាល់'],
    ['remove', 'Remove from shelf', 'ដកចេញពីធ្នើ'], ['rename', 'Rename', 'ប្ដូរឈ្មោះ'],
    ['clearShelf', 'Clear shelf', 'សម្អាតធ្នើ'], ['deleteShelf', 'Delete shelf', 'លុបធ្នើ'],
    ['clearDone', 'Clear done', 'សម្អាតរួចរាល់'], ['clearAll', 'Clear all', 'សម្អាតទាំងអស់'],
    ['dragAll', 'Drag all · {n}', 'អូសទាំងអស់ · {n}'],
    ['dragAllHint', 'Drag everything on this shelf at once', 'អូសធាតុទាំងអស់លើធ្នើនេះក្នុងពេលតែមួយ'],
    ['dropAdd', 'Drop to add', 'ទម្លាក់ដើម្បីបន្ថែម'],
    ['emptyTitle', 'Drop files, links, text or images here', 'ទម្លាក់ឯកសារ តំណ អត្ថបទ ឬរូបភាពនៅទីនេះ'],
    ['emptyHint', 'Or drag something and shake the mouse', 'ឬអូសធាតុណាមួយ រួចក្រវីកណ្ដុរ'],
    ['noHookMac', 'Press {hotkey} or click the menu bar icon', 'ចុច {hotkey} ឬចុចរូបតំណាងលើរបារម៉ឺនុយ'],
    ['noHook', 'Press {hotkey} or click the tray icon', 'ចុច {hotkey} ឬចុចរូបតំណាងនៅជិតនាឡិកា'],
    ['missing', 'Missing', 'រកមិនឃើញ'], ['moved', 'Moved or deleted', 'បានផ្លាស់ទី ឬលុប'],
    ['missingDetail', 'Missing · moved or deleted', 'រកមិនឃើញ · បានផ្លាស់ទី ឬលុប'],
    ['folder', 'Folder', 'ថត'], ['app', 'App', 'កម្មវិធី'], ['file', 'File', 'ឯកសារ'],
    ['link', 'Link', 'តំណ'], ['webLink', 'Web link', 'តំណគេហទំព័រ'], ['text', 'Text', 'អត្ថបទ'],
    ['noNetwork', 'No local network found', 'រកមិនឃើញបណ្ដាញមូលដ្ឋាន'],
    ['networkHelp', 'Connect to the same Wi-Fi as your phone and try again.', 'ភ្ជាប់កុំព្យូទ័រ និងទូរសព្ទទៅ Wi-Fi តែមួយ រួចសាកល្បងម្ដងទៀត។'],
    ['ok', 'OK', 'យល់ព្រម'], ['welcome', 'Welcome to Drag Shelf', 'សូមស្វាគមន៍មកកាន់ Drag Shelf'],
    ['back', 'Back', 'ថយក្រោយ'], ['next', 'Next', 'បន្ទាប់'], ['getStarted', 'Get started', 'ចាប់ផ្ដើម'],
    ['guideTitle0', 'Drag a file, then shake', 'អូសឯកសារ រួចក្រវីកណ្ដុរ'],
    ['guideTitle1', 'Drop it on the shelf', 'ទម្លាក់វាលើធ្នើ'],
    ['guideTitle2', 'Take it back out', 'អូសវាចេញវិញ'],
    ['guideTitle3', 'Tabs, phone photos, shortcut', 'ធ្នើ រូបថតពីទូរសព្ទ និងផ្លូវកាត់'],
    ['guideDesc0', 'Start dragging a file anywhere, then <b>shake the mouse</b> – or push it against a screen edge. The shelf pops up right next to your cursor.', 'ចាប់ផ្ដើមអូសឯកសារពីកន្លែងណាមួយ រួច<b>ក្រវីកណ្ដុរ</b> ឬរុញទៅគែមអេក្រង់។ ធ្នើនឹងបង្ហាញនៅក្បែរទស្សន៍ទ្រនិចរបស់អ្នក។'],
    ['guideDesc1', 'Drop <b>files, folders, links, text or images</b> on it. Files are only referenced, so even huge ones land instantly. Tick the circle to mark something as done.', 'ទម្លាក់<b>ឯកសារ ថត តំណ អត្ថបទ ឬរូបភាព</b>លើធ្នើ។ ឯកសារដើមមិនត្រូវបានចម្លងទេ ដូច្នេះសូម្បីតែឯកសារធំក៏បន្ថែមបានភ្លាមៗ។ ចុចរង្វង់ដើម្បីសម្គាល់ថារួចរាល់។'],
    ['guideDesc2', 'Drag an item – or <b>Drag all</b> – to where you need it. Reorder by dragging inside the shelf. Items leave the shelf once dropped; hold <b>{copyKey}</b> to keep them.', 'អូសធាតុមួយ ឬ<b>អូសទាំងអស់</b>ទៅកន្លែងដែលអ្នកចង់បាន។ អូសនៅក្នុងធ្នើដើម្បីប្ដូរលំដាប់។ ធាតុនឹងចេញពីធ្នើក្រោយពេលទម្លាក់។ សង្កត់ <b>{copyKey}</b> ដើម្បីរក្សាវាលើធ្នើ។'],
    ['guideDesc3', 'Use <b>+</b> for more shelves, scan the phone QR to send photos over your Wi-Fi, and press <b>{hotkey}</b> any time. Everything else lives in the {tray} icon.', 'ចុច <b>+</b> ដើម្បីបន្ថែមធ្នើ។ ស្កេនកូដ QR ដើម្បីផ្ញើរូបថតតាម Wi-Fi និងចុច <b>{hotkey}</b> បានគ្រប់ពេល។ មុខងារផ្សេងទៀតមាននៅក្នុងរូបតំណាង{tray}។'],
    ['menuBar', 'menu bar', 'លើរបារម៉ឺនុយ'], ['systemTray', 'system tray', 'នៅជិតនាឡិកា'],
    ['dropHere', 'Drop files here', 'ទម្លាក់ឯកសារនៅទីនេះ'], ['documents', 'Documents', 'ឯកសារ'],
    ['sampleDraft', 'Q4 goals draft', 'សេចក្ដីព្រាងផែនការ'], ['sampleWork', 'Work', 'ការងារ'],
    ['sampleTrip', 'Trip', 'ដំណើរ'], ['sampleLater', 'Later', 'ពេលក្រោយ'],
    ['sampleSign', 'Sign the offer', 'ចុះហត្ថលេខាលើសំណើ'], ['sampleAccess', 'Accounts & access', 'គណនី និងសិទ្ធិចូលប្រើ'],
    ['showHide', 'show or hide', 'បង្ហាញ ឬលាក់'], ['photosShelf', 'photos to shelf', 'រូបថតទៅធ្នើ'],
    ['copyNote', 'Hold {copyKey} to copy instead of move', 'សង្កត់ {copyKey} ដើម្បីចម្លង ជំនួសការផ្លាស់ទី'],
    ['scan', 'Scan with your phone’s camera', 'ស្កេនដោយកាមេរ៉ាទូរសព្ទរបស់អ្នក'],
    ['sameWifi', 'Same Wi-Fi required. Photos arrive on the shelf; nothing leaves your network.', 'ត្រូវប្រើ Wi-Fi តែមួយ។ រូបថតនឹងចូលធ្នើ ដោយមិនចាកចេញពីបណ្ដាញរបស់អ្នកទេ។'],
    ['received', 'Received', 'បានទទួល'], ['stopClose', 'Stop and close', 'បញ្ឈប់ និងបិទ'],
    ['shortcutTitle', 'Press the new shortcut', 'ចុចគ្រាប់ចុចផ្លូវកាត់ថ្មី'],
    ['shortcutHint', 'Use {keys} together with a key. Esc cancels.', 'ប្រើ {keys} ជាមួយគ្រាប់ចុចមួយទៀត។ ចុច Esc ដើម្បីបោះបង់។'],
    ['shortcutSaved', 'Saved.', 'បានរក្សាទុក។'],
    ['shortcutBusy', 'That shortcut is already used by the system or another app. The previous one stays active.', 'ផ្លូវកាត់នេះត្រូវបានប្រើដោយប្រព័ន្ធ ឬកម្មវិធីផ្សេង។ ផ្លូវកាត់មុននៅតែដំណើរការ។'],
    ['shortcutRetry', 'Try another combination. Esc cancels.', 'សាកល្បងបន្សំគ្រាប់ចុចផ្សេង។ ចុច Esc ដើម្បីបោះបង់។'],
    ['phoneSend', 'Send photos to your computer', 'ផ្ញើរូបថតទៅកុំព្យូទ័ររបស់អ្នក'],
    ['phoneIntro', 'They go straight to your computer over this Wi-Fi.', 'រូបថតនឹងផ្ញើផ្ទាល់ទៅកុំព្យូទ័ររបស់អ្នកតាម Wi-Fi នេះ។'],
    ['phoneChoose', 'Choose photos or videos', 'ជ្រើសរើសរូបថត ឬវីដេអូ'],
    ['sending', 'Sending', 'កំពុងផ្ញើ'], ['sent', 'Sent', 'បានផ្ញើ'], ['failed', 'Failed', 'ផ្ញើមិនបាន'],
    ['badSize', 'File is empty or exceeds 400 MB.', 'ឯកសារទទេ ឬធំជាង 400 MB។'],
    ['diskError', 'Could not save the file. Check available disk space.', 'មិនអាចរក្សាទុកឯកសារបានទេ។ សូមពិនិត្យទំហំផ្ទុកដែលនៅសល់។'],
    ['incomplete', 'Upload was interrupted. Please try again.', 'ការផ្ញើត្រូវបានរំខាន។ សូមសាកល្បងម្ដងទៀត។'],
    ['notFound', 'Transfer link not found or expired.', 'រកមិនឃើញតំណផ្ទេរ ឬតំណនេះផុតសុពលភាព។']
  ];
  const messages = { en: {}, km: {} };
  for (const [key, en, km] of rows) { messages.en[key] = en; messages.km[key] = km; }
  function resolveLanguage(value, system = 'en') { return value === 'km' || value === 'en' ? value : /^km(?:-|$)/i.test(system) ? 'km' : 'en'; }
  function t(language, key, values = {}) {
    const text = messages[resolveLanguage(language)][key] ?? messages.en[key] ?? key;
    return text.replace(/\{(\w+)\}/g, (match, name) => Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : match);
  }
  function locale(language) { return resolveLanguage(language) === 'km' ? 'km-KH' : 'en-US'; }
  function number(language, value) {
    const formatted = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value);
    return resolveLanguage(language) === 'km' ? formatted.replace(/\d/g, digit => '០១២៣៤៥៦៧៨៩'[digit]) : formatted;
  }
  function date(language, value) {
    const d = new Date(value);
    if (resolveLanguage(language) !== 'km') return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);
    const months = ['មករា', 'កុម្ភៈ', 'មីនា', 'មេសា', 'ឧសភា', 'មិថុនា', 'កក្កដា', 'សីហា', 'កញ្ញា', 'តុលា', 'វិច្ឆិកា', 'ធ្នូ'];
    const digits = value => String(value).replace(/\d/g, digit => '០១២៣៤៥៦៧៨៩'[digit]);
    return `${digits(d.getDate())} ${months[d.getMonth()]}, ${digits(String(d.getHours()).padStart(2, '0'))}:${digits(String(d.getMinutes()).padStart(2, '0'))}`;
  }
  return { messages, resolveLanguage, t, locale, number, date };
});
