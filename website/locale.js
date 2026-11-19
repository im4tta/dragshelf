'use strict';
(() => {
  const translations = {
    'How it works':'របៀបប្រើប្រាស់','Delivery workspace':'កន្លែងរៀបចំការប្រគល់','Tuk scratchpad':'កន្លែងទុក Tuk','Get Drag Shelf':'ទាញយក Drag Shelf',
    'A small tool for the work in between.':'ឧបករណ៍តូចមួយ សម្រាប់ការងារប្រចាំថ្ងៃ។',
    'A little shelf.':'ធ្នើតូចមួយ។','A lot less':'កាត់បន្ថយ','juggling.':'ភាពរញ៉េរញ៉ៃ។',
    'Files here. Links there. One more thing to send.':'ឯកសារនៅទីនេះ។ តំណនៅទីនោះ។ នៅសល់រឿងមួយទៀតត្រូវផ្ញើ។',
    'Bring it all together, then keep moving.':'ប្រមូលអ្វីៗទាំងអស់នៅកន្លែងតែមួយ ហើយបន្តការងារ។',
    'Download Drag Shelf':'ទាញយក Drag Shelf','Download for Windows':'ទាញយកសម្រាប់ Windows','Download for Mac':'ទាញយកសម្រាប់ Mac','All downloads':'ជម្រើសទាញយកទាំងអស់',
    'Free & open source':'ឥតគិតថ្លៃ និងប្រភពបើកចំហ','No account':'មិនត្រូវការគណនី','Drop it here.':'ទម្លាក់នៅទីនេះ។',
    'Hero shot.png':'រូបភាពគំរូ.png','Brand guide.pdf':'ការណែនាំម៉ាក.pdf','One useful link':'តំណមានប្រយោជន៍មួយ',
    'Made for Windows & Mac':'សម្រាប់ Windows និង Mac','English +':'អង់គ្លេស និង','Your files stay yours':'ឯកសាររបស់អ្នក នៅតែជារបស់អ្នក','MIT licensed. Always open.':'អាជ្ញាបណ្ណ MIT។ ប្រភពបើកចំហ។',
    'LESS FRICTION. MORE FLOW.':'កាត់បន្ថយភាពស្មុគស្មាញ។ ធ្វើការកាន់តែរលូន។','From wherever.':'ពីគ្រប់ទីកន្លែង។','To wherever’s next.':'ទៅកាន់ការងារបន្ទាប់។',
    'Your desktop is a workspace.':'ផ្ទៃតុរបស់អ្នក គឺជាកន្លែងធ្វើការ។','Give the things in transit a place to land.':'ផ្ដល់កន្លែងសម្រាប់ឯកសារដែលកំពុងផ្លាស់ទី។',
    'Drag. Shake. There it is.':'អូស។ ក្រឡុក។ ធ្នើបង្ហាញឡើង។',
    'Start dragging a file and shake your mouse, or use a keyboard shortcut. Your shelf appears when you need it.':'ចាប់ផ្ដើមអូសឯកសារ ហើយក្រឡុកកណ្ដុរ ឬប្រើគ្រាប់ចុចកាត់។ ធ្នើនឹងបង្ហាញឡើងពេលអ្នកត្រូវការ។',
    'Put it all in one place.':'ប្រមូលអ្វីៗនៅកន្លែងតែមួយ។',
    'Collect files, folders, images, links and notes. Create separate shelves for separate trains of thought.':'ប្រមូលឯកសារ ថត រូបភាព តំណ និងកំណត់ចំណាំ។ បង្កើតធ្នើផ្សេងៗសម្រាប់គម្រោងផ្សេងៗ។',
    'Take it from here.':'បន្តការងារពីទីនេះ។',
    'Drag one item or everything into the next app. Tick things off as you go. Enjoy a little less back-and-forth.':'អូសធាតុមួយ ឬទាំងអស់ទៅកម្មវិធីបន្ទាប់។ គូសសម្គាល់ការងារដែលរួចរាល់ ហើយកាត់បន្ថយការប្ដូរទៅមក។',
    'WHEN “SEND IT” NEEDS A LITTLE MORE.':'ពេលការផ្ញើ ត្រូវការការរៀបចំបន្ថែម។','Collected.':'ប្រមូល។','Checked.':'ពិនិត្យ។','Client-ready.':'រួចរាល់សម្រាប់អតិថិជន។',
    'Turn a shelf into a finished handoff. Check what’s missing, prepare new copies and see exactly what you’re about to deliver.':'បម្លែងធ្នើទៅជាកញ្ចប់ប្រគល់ដែលរួចរាល់។ ពិនិត្យអ្វីដែលខ្វះ រៀបចំច្បាប់ចម្លងថ្មី និងមើលអ្វីដែលអ្នកនឹងប្រគល់។',
    'Meet your delivery workspace ↗':'ស្វែងយល់ពីកន្លែងរៀបចំការប្រគល់ ↗','The delivery workspace · real app screenshot':'កន្លែងរៀបចំការប្រគល់ · រូបថតពីកម្មវិធីពិត',
    'Know what’s missing.':'ដឹងថាខ្វះអ្វីខ្លះ។','Editable requirements, duplicate checks and file size limits. Your checklist, your call.':'កែតម្រូវតម្រូវការ ពិនិត្យឯកសារស្ទួន និងកំណត់ទំហំឯកសារ។ បញ្ជីត្រួតពិនិត្យរបស់អ្នក អ្នកជាអ្នកសម្រេច។',
    'Prepare the copies.':'រៀបចំច្បាប់ចម្លង។','Consistent names. PNG and JPEG resizing or conversion. Your originals stay unchanged.':'ឈ្មោះមានរបៀបរៀបរយ។ ប្ដូរទំហំ ឬទ្រង់ទ្រាយ PNG និង JPEG។ ឯកសារដើមនៅដដែល។',
    'Send a tidy package.':'ផ្ញើកញ្ចប់ដែលមានរបៀប។','Export a folder or ZIP with instructions, a visual index and a file manifest. Save the recipe for next time.':'នាំចេញជាថត ឬ ZIP ជាមួយសេចក្ដីណែនាំ បញ្ជីរូបភាព និងបញ្ជីឯកសារ។ រក្សាទុករូបមន្តសម្រាប់ប្រើលើកក្រោយ។',
    'SMALL DETAILS. DAILY DIFFERENCE.':'ចំណុចតូចៗ ដែលជួយការងារប្រចាំថ្ងៃ។','Fits into your day.':'សមនឹងការងារប្រចាំថ្ងៃ។','Stays out of your way.':'ងាយប្រើ ដោយមិនរំខាន។',
    'From phone to shelf.':'ពីទូរសព្ទ មកធ្នើ។','Scan a QR code and send photos over your local Wi-Fi. No email to yourself required.':'ស្កេនកូដ QR ហើយផ្ញើរូបថតតាម Wi-Fi ក្នុងបណ្ដាញតែមួយ។ មិនចាំបាច់ផ្ញើអ៊ីមែលមកខ្លួនឯងទេ។',
    'Your desktop, your style.':'ផ្ទៃតុរបស់អ្នក រចនាប័ទ្មរបស់អ្នក។','Light or dark. Eight accents. Adjustable shortcuts. Compact shelves that work across screen sizes.':'រូបរាងភ្លឺ ឬងងឹត។ ពណ៌រំលេចប្រាំបី។ គ្រាប់ចុចកាត់អាចកែបាន។ ធ្នើតូចដែលសមនឹងទំហំអេក្រង់ផ្សេងៗ។',
    'English. And Khmer.':'ភាសាអង់គ្លេស និងភាសាខ្មែរ។','Switch languages in the app. Khmer fonts are bundled for offline use, with localized menus and numbers.':'ប្ដូរភាសាក្នុងកម្មវិធី។ មានពុម្ពអក្សរខ្មែរសម្រាប់ប្រើដោយគ្មានអ៊ីនធឺណិត ជាមួយម៉ឺនុយ និងលេខជាភាសាខ្មែរ។',
    'Local by design.':'រចនាសម្រាប់ប្រើលើកុំព្យូទ័ររបស់អ្នក។','No account or analytics. Files stay on your computer. Optional phone transfers use your local network; optional update checks contact GitHub.':'មិនត្រូវការគណនី និងគ្មានការវិភាគការប្រើប្រាស់។ ឯកសាររក្សាទុកលើកុំព្យូទ័ររបស់អ្នក។ ការផ្ទេរពីទូរសព្ទប្រើបណ្ដាញមូលដ្ឋាន ហើយការពិនិត្យកំណែថ្មីភ្ជាប់ទៅ GitHub។',
    'ONE LESS THING TO JUGGLE.':'កាត់បន្ថយរឿងដែលត្រូវរវល់។','Make room':'ទុកកន្លែង','for your':'សម្រាប់ការងារ','flow.':'ដ៏រលូន។','Free to download. Yours to make part of the day.':'ទាញយកដោយឥតគិតថ្លៃ។ ប្រើជាជំនួយសម្រាប់ការងារប្រចាំថ្ងៃ។',
    'Windows 10 / 11 · x64 installer':'Windows 10 / 11 · កម្មវិធីដំឡើង x64','Universal · Apple Silicon + Intel':'កំណែរួម · Apple Silicon និង Intel',
    'Windows portable':'Windows មិនចាំបាច់ដំឡើង','Release notes ↗':'ព័ត៌មានកំណែថ្មី ↗','Choose your platform to get the latest release.':'ជ្រើសប្រព័ន្ធរបស់អ្នក ដើម្បីទាញយកកំណែថ្មីបំផុត។',
    'A few good questions.':'សំណួរដែលគេសួរញឹកញាប់។','Is Drag Shelf free?':'តើ Drag Shelf ឥតគិតថ្លៃមែនទេ?',
    'Yes. Drag Shelf is free and open source under the MIT license. Browse the source, report issues or contribute on GitHub.':'បាទ/ចាស។ Drag Shelf ឥតគិតថ្លៃ និងមានប្រភពបើកចំហក្រោមអាជ្ញាបណ្ណ MIT។ មើលកូដ រាយការណ៍បញ្ហា ឬរួមចំណែកលើ GitHub។',
    'Does dropping a file make a copy?':'តើការទម្លាក់ឯកសារបង្កើតច្បាប់ចម្លងទេ?',
    'Ordinary filesystem files are referenced in place. Browser images and text are saved locally. The delivery workspace creates new output copies and preserves the originals.':'ឯកសារធម្មតាត្រូវបានយោងពីទីតាំងដើម។ រូបភាព និងអត្ថបទពីកម្មវិធីរុករកត្រូវបានរក្សាទុកក្នុងកុំព្យូទ័រ។ កន្លែងរៀបចំការប្រគល់បង្កើតច្បាប់ចម្លងថ្មី និងរក្សាឯកសារដើម។',
    'How do I install it?':'តើដំឡើងយ៉ាងដូចម្ដេច?',
    'On Windows, run the installer or choose the portable executable. On Mac, open the DMG and drag Drag Shelf to Applications. Current releases are not developer-signed, so your operating system may show a security prompt. See the':'លើ Windows បើកកម្មវិធីដំឡើង ឬជ្រើសកំណែមិនចាំបាច់ដំឡើង។ លើ Mac បើក DMG ហើយអូស Drag Shelf ទៅ Applications។ កំណែបច្ចុប្បន្នមិនទាន់មានហត្ថលេខាអ្នកអភិវឌ្ឍន៍ ដូច្នេះប្រព័ន្ធអាចបង្ហាញសារសុវត្ថិភាព។ សូមមើល',
    'installation guide':'ការណែនាំដំឡើង','. macOS drag detection also needs Accessibility permission.':'។ ការចាប់អូសលើ macOS ក៏ត្រូវការសិទ្ធិ Accessibility ផងដែរ។',
    'Will the app tell me about new versions?':'តើកម្មវិធីជូនដំណឹងពេលមានកំណែថ្មីទេ?',
    'Starting with version 1.4, Drag Shelf checks for releases and offers a matching download. You can check manually or turn automatic checks off in the tray/menu-bar menu. Earlier versions need one manual upgrade first.':'ចាប់ពីកំណែ 1.4 Drag Shelf ពិនិត្យកំណែថ្មី និងផ្ដល់តំណទាញយកដែលសមនឹងប្រព័ន្ធ។ អ្នកអាចពិនិត្យដោយដៃ ឬបិទការពិនិត្យស្វ័យប្រវត្តិក្នុងម៉ឺនុយ។ កំណែចាស់ត្រូវធ្វើបច្ចុប្បន្នភាពដោយដៃម្ដងជាមុន។',
    'Where can I get help or suggest something?':'តើអាចសុំជំនួយ ឬផ្ដល់យោបល់នៅឯណា?',
    'Visit':'ចូលទៅកាន់','GitHub Issues':'បញ្ហាលើ GitHub','to report a problem or suggest an improvement. Include your operating system and app version to help reproduce a problem.':'ដើម្បីរាយការណ៍បញ្ហា ឬផ្ដល់យោបល់កែលម្អ។ សូមបញ្ជាក់ប្រព័ន្ធប្រតិបត្តិការ និងកំណែកម្មវិធី ដើម្បីជួយពិនិត្យបញ្ហា។',
    'A little shelf for everything':'ធ្នើតូចមួយសម្រាប់អ្វីៗគ្រប់យ៉ាង','between here and done.':'ចាប់ពីពេលចាប់ផ្ដើម រហូតដល់រួចរាល់។','Source code ↗':'កូដប្រភព ↗','Privacy':'ឯកជនភាព','MIT license':'អាជ្ញាបណ្ណ MIT','Made by im4tta':'បង្កើតដោយ im4tta',
    'The real Drag Shelf interface with files, links, notes and completion ticks':'ផ្ទាំងកម្មវិធី Drag Shelf ពិត ជាមួយឯកសារ តំណ កំណត់ចំណាំ និងសញ្ញារួចរាល់',
    'Drag Shelf delivery workspace: source files, editable readiness checks and output summary':'កន្លែងរៀបចំការប្រគល់៖ ឯកសារដើម ការពិនិត្យតម្រូវការ និងសេចក្ដីសង្ខេបលទ្ធផល',
    'Drag Shelf showing files, links and notes':'Drag Shelf បង្ហាញឯកសារ តំណ និងកំណត់ចំណាំ','Main navigation':'ម៉ឺនុយចម្បង'
  };
  const originals = []; const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) { const node = walker.currentNode; if (node.parentElement.closest('script,style')) continue; const key = node.textContent.trim(); if (translations[key]) originals.push({ node, text: node.textContent, km: translations[key] }); }
  const attributes = [...document.querySelectorAll('[alt],[aria-label]')].flatMap(el => ['alt','aria-label'].filter(attr => translations[el.getAttribute(attr)]).map(attr => ({ el, attr, en: el.getAttribute(attr), km: translations[el.getAttribute(attr)] })));
  const select = document.createElement('select'); select.className = 'language-switch'; select.setAttribute('aria-label','Language / ភាសា'); select.innerHTML = '<option value="en">EN</option><option value="km">ខ្មែរ</option>'; document.querySelector('.nav').insertBefore(select, document.querySelector('.nav .button'));
  function apply(lang) {
    document.documentElement.lang = lang; select.value = lang;
    originals.forEach(({ node, text, km }) => { node.textContent = lang === 'km' ? ' ' + km + ' ' : text; });
    attributes.forEach(({ el, attr, en, km }) => el.setAttribute(attr, lang === 'km' ? km : en));
    document.title = lang === 'km' ? 'Drag Shelf — ធ្នើតូចមួយ ជួយការងារកាន់តែរលូន' : 'Drag Shelf — A little shelf. A lot less juggling.';
    document.querySelector('meta[name=description]').content = lang === 'km' ? 'ប្រមូលឯកសារ តំណ និងកំណត់ចំណាំ។ រៀបចំកញ្ចប់ប្រគល់ដែលរួចរាល់។ Drag Shelf ឥតគិតថ្លៃសម្រាប់ Windows និង macOS។' : 'Collect files, links and notes. Prepare a finished delivery. Free, open-source Drag Shelf for Windows and macOS.';
    document.querySelector('a[href*="PRIVACY"]').href = 'https://github.com/im4tta/dragshelf/blob/main/PRIVACY' + (lang === 'km' ? '.km' : '') + '.md';
    const url = new URL(location.href); url.searchParams.set('lang', lang); history.replaceState(null, '', url);
    try { localStorage.setItem('dragshelf-language', lang); } catch (_) {}
    dispatchEvent(new Event('landinglanguagechange'));
  }
  select.onchange = () => apply(select.value);
  let saved; try { saved = localStorage.getItem('dragshelf-language'); } catch (_) {}
  apply(new URL(location.href).searchParams.get('lang') === 'km' ? 'km' : new URL(location.href).searchParams.get('lang') === 'en' ? 'en' : saved || (navigator.language.startsWith('km') ? 'km' : 'en'));
})();
