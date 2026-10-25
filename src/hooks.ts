import { config } from "../package.json";
import {
  installBetterNotesBridge,
  uninstallBetterNotesBridge,
} from "./modules/bnBridge";
import { diagnostics } from "./modules/diagnostics";
import {
  installEditorHook,
  uninstallEditorHook,
} from "./modules/editorRegistry";
import { observeKeymap, unobserveKeymap } from "./modules/keymapStore";
import { installPdfBridge, uninstallPdfBridge } from "./modules/pdfBridge";
import { initPrefsPane } from "./modules/prefsPane";
import { getString, initLocale } from "./utils/locale";

let keymapObserver: symbol | null = null;

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

  try {
    installEditorHook();
  } catch (error) {
    addon.data.ztoolkit.log("Failed to install editor hook", error);
  }

  try {
    installBetterNotesBridge();
  } catch (error) {
    addon.data.ztoolkit.log("Failed to install Better Notes bridge", error);
  }

  try {
    installPdfBridge();
  } catch (error) {
    addon.data.ztoolkit.log("Failed to install PDF bridge", error);
  }

  keymapObserver = observeKeymap(() => {
    addon.data.ztoolkit.log("Keymap updated");
  });

  diagnostics.initializedAt = new Date().toISOString();
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
      initPrefsPane(data.window);
      break;
    default:
      break;
  }
}

async function onShutdown(): Promise<void> {
  try {
    uninstallPdfBridge();
  } catch {
    /* ignore */
  }
  try {
    uninstallBetterNotesBridge();
  } catch {
    /* ignore */
  }
  try {
    uninstallEditorHook();
  } catch {
    /* ignore */
  }
  unobserveKeymap(keymapObserver);
  keymapObserver = null;

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