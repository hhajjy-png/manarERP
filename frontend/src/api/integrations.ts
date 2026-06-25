import { api } from './client';

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

export interface IntegrationCard {
  id:                  string;
  nameAr:              string;
  nameEn:              string;
  category:            IntegrationCategory;
  descriptionAr:       string;
  descriptionEn:       string;
  status:              IntegrationStatus;
  maturity:            IntegrationMaturity;
  enabled:             boolean;
  configured:          boolean;
  health:              IntegrationHealth;
  capabilities:        IntegrationCapability[];
  requiredPermissions: string[];
  lastRunAt:           string | null;
  targetRoute:         string | null;
  settingsSchema:      IntegrationSettingsField[];
  settings:            Record<string, string | boolean>;
}

export interface IntegrationSettingsUpdate {
  enabled?: boolean;
  notes?:   string;
}

export interface IntegrationRunResult {
  success:   boolean;
  status:    'not_implemented' | 'running' | 'completed' | 'error';
  messageAr: string;
  runAt:     string;
}

export const integrationsApi = {
  list(): Promise<IntegrationCard[]> {
    return api.get<{ data: IntegrationCard[] }>('/integrations').then((r) => r.data.data);
  },

  getById(id: string): Promise<IntegrationCard> {
    return api.get<{ data: IntegrationCard }>(`/integrations/${id}`).then((r) => r.data.data);
  },

  updateSettings(id: string, body: IntegrationSettingsUpdate): Promise<IntegrationCard> {
    return api
      .put<{ data: IntegrationCard }>(`/integrations/${id}/settings`, body)
      .then((r) => r.data.data);
  },

  run(id: string): Promise<IntegrationRunResult> {
    return api
      .post<{ data: IntegrationRunResult }>(`/integrations/${id}/run`)
      .then((r) => r.data.data);
  },
};
