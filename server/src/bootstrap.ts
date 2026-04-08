import type { Core } from '@strapi/strapi';

const bootstrap = ({ strapi }: { strapi: Core.Strapi }) => {
  // Bootstrap plugin here
  strapi.log.info('Auto Translator plugin bootstrapped');
};

export default bootstrap;
