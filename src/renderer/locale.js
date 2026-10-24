'use strict';
window.Locale = (() => {
  let language = I18N.resolveLanguage(new URLSearchParams(location.search).get('lang'));
  const t = (key, values) => I18N.t(language, key, values);
  function apply() {
    document.documentElement.lang = language;
    document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
    document.querySelectorAll('[data-i18n-title]').forEach(el => { el.title = t(el.dataset.i18nTitle); el.setAttribute('aria-label', el.title); });
    document.querySelectorAll('[data-language-select]').forEach(el => { el.value = language; });
  }
  function set(value) {
    const next = I18N.resolveLanguage(value), changed = next !== language; language = next; apply();
    if (changed) dispatchEvent(new Event('languagechange'));
  }
  const api = { t, apply, set, get language() { return language; }, get tag() { return I18N.locale(language); }, number: n => I18N.number(language, n) };
  apply();
  window.shelf.on('state', state => set(state.language));
  window.shelf.invoke('state:get').then(state => set(state.language));
  document.querySelectorAll('[data-language-select]').forEach(el => { el.onchange = () => window.shelf.invoke('act', 'setting', { key: 'language', value: el.value }); });
  return api;
})();
