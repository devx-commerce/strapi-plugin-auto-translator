import type { Core } from '@strapi/strapi';

const destroy = ({ strapi }: { strapi: Core.Strapi }) => {
  // Cleanup plugin here
  strapi.log.info('Auto Translator plugin destroyed');
};

export default destroy;
