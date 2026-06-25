/** Types for the Integrations Center — Phase 1 (foundation only). */

export type IntegrationStatus   = 'available' | 'planned' | 'comingSoon';
export type IntegrationCategory = 'bank' | 'import' | 'backup' | 'automation' | 'future';
export type IntegrationMaturity = 'stable' | 'beta' | 'planned' | 'foundation';
export type IntegrationHealth   = 'ok' | 'needsSetup' | 'disabled' | 'unavailable';

export interface IntegrationCapability {
  id:      string;
  labelAr: string;
}

export interface IntegrationSettingsField {
  key:          string;
  labelAr:      string;
  type:         'boolean' | 'text';
  defaultValue: string | boolean;
}

/** Static definition stored in the registry — never changes at runtime. */
export interface IntegrationDefinition {
  id:                   string;
  nameAr:               string;
  nameEn:               string;
  category:             IntegrationCategory;
  descriptionAr:        string;
  descriptionEn:        string;
  status:               IntegrationStatus;
  maturity:             IntegrationMaturity;
  capabilities:         IntegrationCapability[];
  requiredPermissions:  string[];
  /** Frontend route to navigate to, if the integration has a dedicated page. */
  targetRoute:          string | null;
  settingsSchema:       IntegrationSettingsField[];
}

/** Runtime card returned by the API — merges definition + live Settings. */
export interface IntegrationCard extends IntegrationDefinition {
  enabled:    boolean;
  configured: boolean;
  health:     IntegrationHealth;
  lastRunAt:  string | null;
  /** Safe settings values (no secrets). */
  settings:   Record<string, string | boolean>;
}

/** Body for PUT /api/integrations/:id/settings */
export interface IntegrationSettingsUpdate {
  enabled?: boolean;
  notes?:   string;
}

/** Response for POST /api/integrations/:id/run */
export interface IntegrationRunResult {
  success:   boolean;
  status:    'not_implemented' | 'running' | 'completed' | 'error';
  messageAr: string;
  runAt:     string;
}
