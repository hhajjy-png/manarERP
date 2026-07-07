import type { ReactNode } from 'react';
import type { ModuleConfig } from '../../../config/modules';
import type { InfoItem } from '../ExplorerKit';

export interface EntityHubProps {
  entity: Record<string, any>;
  cfg: ModuleConfig;
  onEdit: () => void;
  onDelete: () => void;
  canUpdate: boolean;
  canDelete: boolean;
  busy: boolean;
}

export type HubComponent = (props: EntityHubProps) => JSX.Element;

/**
 * Build drawer info-grid items for an entity. Prefers a column's `render()` (so
 * enum/currency values read exactly like the table) and falls back to the raw
 * field value. Empty values are dropped downstream by DrawerInfoGrid.
 */
export function buildInfoItems(
  cfg: ModuleConfig,
  entity: Record<string, any>,
  t: (k: string) => string,
): InfoItem[] {
  const renderByKey = new Map<string, (row: any) => ReactNode>();
  cfg.columns.forEach((c) => { if (c.render) renderByKey.set(c.key, c.render); });
  return cfg.fields
    .filter((f) => f.name !== 'name' && f.name !== 'fullName') // shown as the header title
    .map((f) => ({
      label: t(f.label),
      value: renderByKey.has(f.name) ? renderByKey.get(f.name)!(entity) : (entity[f.name] ?? null),
    }));
}
