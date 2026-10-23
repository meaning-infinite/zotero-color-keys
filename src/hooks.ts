import { config } from "../package.json";
import { getString, initLocale } from "./utils/locale";

async function onStartup(): Promise<void> {
  await Promise.all([
    Zotero.initializationPromise,
    Zotero.unlockPromise,
    Zotero.uiReadyPromise,
  ]);

  initLocale();

  try {
    Zotero.PreferencePanes.register({
      pluginID: config.addonID,
      src: rootURI + "content/preferences.xhtml",
      label: getString("prefs-title"),
    });
  } catch (error) {
    addon.data.ztoolkit.log("Failed to register preference pane", error);
  }

  addon.data.initialized = true;
  addon.data.ztoolkit.log("Plugin initialized");
}

async function onMainWindowLoad(_window: Window): Promise<void> {
  addon.data.ztoolkit.log("Main window loaded");
}

async function onMainWindowUnload(_window: Window): Promise<void> {
  addon.data.ztoolkit.log("Main window unloaded");
}

async function onPrefsEvent(
  type: string,
  data: { window: Window; [key: string]: unknown },
): Promise<void> {
  switch (type) {
    case "load":
      addon.data.prefs = { window: data.window };
      addon.data.ztoolkit.log("Preference pane loaded");
      break;
    default:
      break;
  }
}

async function onShutdown(): Promise<void> {
  addon.data.ztoolkit.unregisterAll();
  addon.data.alive = false;
  addon.data.prefs = undefined;
  delete (Zotero as unknown as Record<string, unknown>)[config.addonInstance];
}

export default {
  onStartup,
  onMainWindowLoad,
  onMainWindowUnload,
  onPrefsEvent,
  onShutdown,
};
