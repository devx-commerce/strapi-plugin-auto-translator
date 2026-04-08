import type { Core } from '@strapi/strapi';

const register = ({ strapi }: { strapi: Core.Strapi }) => {
  // Register plugin here
  strapi.log.info('Auto Translator plugin registered');
};

export default register;
