const adminRoutes = [
  {
    method: 'GET',
    path: '/locales',
    handler: 'translator.getLocales',
    config: {
      policies: [],
    },
  },
  {
    method: 'GET',
    path: '/check-i18n',
    handler: 'translator.checkI18n',
    config: {
      policies: [],
    },
  },
  {
    method: 'GET',
    path: '/translatable-content',
    handler: 'translator.getTranslatableContent',
    config: {
      policies: [],
    },
  },
  {
    method: 'POST',
    path: '/translate',
    handler: 'translator.translate',
    config: {
      policies: [],
    },
  },
];

const contentApiRoutes = [
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

export default {
  admin: {
    type: 'admin',
    routes: adminRoutes,
  },
  'content-api': {
    type: 'content-api',
    routes: contentApiRoutes,
  },
};
