import { config } from "../../package.json";

interface FluentPattern {
  value: string | null;
  attributes?: Array<{ name: string; value: string }> | null;
}

interface LocalizationLike {
  formatMessagesSync(
    messages: Array<{ id: string; args?: Record<string, unknown> }>,
  ): FluentPattern[];
}

interface LocalizationConstructor {
  new (resources: string[], synchronous?: boolean): LocalizationLike;
}

export function initLocale(): void {
  const LocalizationCtor = addon.data.ztoolkit.getGlobal(
    "Localization",
  ) as LocalizationConstructor;

  // 面板文案在 preferences.ftl，运行期提示在 addon.ftl，一起加载
  addon.data.locale = {
    current: new LocalizationCtor(
      [`${config.addonRef}-addon.ftl`, `${config.addonRef}-preferences.ftl`],
      true,
    ),
  };
}

export function getString(
  id: string,
  options: { branch?: string; args?: Record<string, unknown> } = {},
): string {
  const messageId = `${config.addonRef}-${id}`;
  const localization = addon.data.locale?.current as
    | LocalizationLike
    | undefined;
  const pattern = localization?.formatMessagesSync([
    { id: messageId, args: options.args },
  ])[0];

  if (!pattern) {
    return messageId;
  }

  if (options.branch) {
    return (
      pattern.attributes?.find((attribute) => attribute.name === options.branch)
        ?.value ?? messageId
    );
  }

  return pattern.value ?? messageId;
}

export function getLocaleID(id: string): string {
  return `${config.addonRef}-${id}`;
}
