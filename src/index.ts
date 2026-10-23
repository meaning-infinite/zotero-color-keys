import Addon from "./addon";
import { config } from "../package.json";

type ZoteroWithPlugin = Record<string, unknown>;

const zotero = Zotero as unknown as ZoteroWithPlugin;

// The bootstrap script can load this bundle again after a disable/enable cycle
// without tearing down the old sandbox. Keep the first instance authoritative.
if (!zotero[config.addonInstance]) {
  const plugin = new Addon();

  zotero[config.addonInstance] = plugin;
  _globalThis.addon = plugin;
  Object.defineProperty(_globalThis, "ztoolkit", {
    configurable: true,
    enumerable: true,
    get: () => plugin.data.ztoolkit,
  });
}
