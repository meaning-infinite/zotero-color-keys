import type Addon from "../src/addon";
import type { ZoteroToolkit } from "zotero-plugin-toolkit/ztoolkit";

declare global {
  const _globalThis: typeof globalThis & {
    addon?: Addon;
    ztoolkit?: ZoteroToolkit;
  };
  const addon: Addon;
  const ztoolkit: ZoteroToolkit;
  const rootURI: string;
  const __env__: "development" | "production";
}

export {};
