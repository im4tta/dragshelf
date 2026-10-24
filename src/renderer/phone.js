'use strict';
const $ = s => document.querySelector(s);
$('#ico').innerHTML = window.glyph('phone');
window.shelf.on('state', s => { document.documentElement.dataset.accent = s.settings.accent; document.documentElement.dataset.scheme = s.settings.theme === 'auto' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : s.settings.theme; });
window.shelf.invoke('state:get').then(s => { document.documentElement.dataset.accent = s.settings.accent; document.documentElement.dataset.scheme = s.settings.theme === 'auto' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : s.settings.theme; });
window.shelf.invoke('phone:info').then(i => { $('#qr').innerHTML = i.qr; $('#n').textContent = i.count; });
window.shelf.on('phone:count', n => { $('#n').textContent = n; });
$('#stop').onclick = () => window.shelf.send('phone:close');
