'use strict';
const $ = s => document.querySelector(s);
let received = 0;
function localize() { document.title = Locale.t('phoneTitle'); $('#n').textContent = Locale.number(received); }
addEventListener('languagechange', localize);
$('#ico').innerHTML = window.glyph('phone');
window.shelf.on('state', s => { document.documentElement.dataset.accent = s.settings.accent; document.documentElement.dataset.scheme = s.settings.theme === 'auto' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : s.settings.theme; });
window.shelf.invoke('state:get').then(s => { document.documentElement.dataset.accent = s.settings.accent; document.documentElement.dataset.scheme = s.settings.theme === 'auto' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : s.settings.theme; });
window.shelf.invoke('phone:info').then(i => { $('#qr').innerHTML = i.qr; received = i.count; localize(); });
window.shelf.on('phone:count', n => { received = n; localize(); });
$('#stop').onclick = () => window.shelf.send('phone:close');
