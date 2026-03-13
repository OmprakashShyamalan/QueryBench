type ConfigLike = {
  config_name?: string | null;
  database_name?: string | null;
};

export function getConfigDisplayName(config?: ConfigLike | null): string {
  const displayName = config?.config_name?.trim();
  if (displayName) return displayName;
  return config?.database_name?.trim() ?? '';
}

export function configMatchesTag(config: ConfigLike | null | undefined, tag?: string | null): boolean {
  const normalizedTag = tag?.trim() ?? '';
  if (!config || !normalizedTag) return false;

  return [config.config_name, config.database_name]
    .map(value => value?.trim() ?? '')
    .some(value => value !== '' && value === normalizedTag);
}

export function findConfigByTag<T extends ConfigLike>(configs: T[], tag?: string | null): T | undefined {
  return configs.find(config => configMatchesTag(config, tag));
}

export function getConfigDisplayTag<T extends ConfigLike>(configs: T[], tag?: string | null): string {
  const config = findConfigByTag(configs, tag);
  return getConfigDisplayName(config) || (tag?.trim() ?? '');
}