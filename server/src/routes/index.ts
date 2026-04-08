export default [
  {
    method: 'GET',
    path: '/locales',
    handler: 'translator.getLocales',
    config: {
      policies: [],
      auth: false,
    },
  },
  {
    method: 'GET',
    path: '/check-i18n',
    handler: 'translator.checkI18n',
    config: {
      policies: [],
      auth: false,
    },
  },
  {
    method: 'GET',
    path: '/translatable-content',
    handler: 'translator.getTranslatableContent',
    config: {
      policies: [],
      auth: false,
    },
  },
  {
    method: 'POST',
    path: '/translate',
    handler: 'translator.translate',
    config: {
      policies: [],
      auth: false,
    },
  },
];
