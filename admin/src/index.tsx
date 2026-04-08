import { Initializer } from "./components/Initializer";
import { InjectedTranslateButton } from "./components/InjectedTranslateButton";
import { PLUGIN_ID } from "./pluginId";

export default {
  register(app: any) {
    app.registerPlugin({
      id: PLUGIN_ID,
      initializer: Initializer,
      isReady: false,
      name: PLUGIN_ID,
    });
  },

  bootstrap(app: any) {
    // 
    // Inject translate button into Content Manager edit view header
    const contentManager = app.getPlugin("content-manager");
    // 

    if (contentManager) {
      // 
      contentManager.injectComponent("editView", "right-links", {
        name: "auto-translator-button",
        Component: InjectedTranslateButton,
      });
      // 
    } else {
      // 
    }
  },

  async registerTrads(app: any) {
    const { locales } = app;

    const importedTranslations = await Promise.all(
      (locales as string[]).map((locale) => {
        return import(`./translations/${locale}.json`)
          .then(({ default: data }) => {
            return {
              data: Object.keys(data).reduce((acc, key) => {
                acc[`${PLUGIN_ID}.${key}`] = data[key];
                return acc;
              }, {} as Record<string, string>),
              locale,
            };
          })
          .catch(() => {
            return {
              data: {},
              locale,
            };
          });
      }),
    );

    return importedTranslations;
  },
};
