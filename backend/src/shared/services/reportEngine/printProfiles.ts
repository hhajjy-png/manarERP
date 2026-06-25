import type { PrintProfile } from './reportTypes';

export interface ProfileConfig {
  pageSize:      string;
  orientation:   'portrait' | 'landscape';
  margin:        string;
  fontSize:      string;
  tableFontSize: string;
  headerHeight?:  string;
  footerHeight?:  string;
  logoSize?:      'small' | 'medium' | 'large';
  logoAlignment?: 'start' | 'center' | 'end';
  tableDensity?:  'compact' | 'normal' | 'comfortable';
}

export const PRINT_PROFILES: Record<PrintProfile, ProfileConfig> = {
  'a4-landscape': {
    pageSize:      'A4',
    orientation:   'landscape',
    margin:        '10mm',
    fontSize:      '11px',
    tableFontSize: '10px',
    logoSize:      'small',
    logoAlignment: 'start',
    tableDensity:  'compact',
  },
  'a4-portrait': {
    pageSize:      'A4',
    orientation:   'portrait',
    margin:        '12mm',
    fontSize:      '11px',
    tableFontSize: '10px',
    logoSize:      'small',
    logoAlignment: 'start',
    tableDensity:  'normal',
  },
  'statement': {
    pageSize:      'A4',
    orientation:   'portrait',
    margin:        '14mm',
    fontSize:      '11px',
    tableFontSize: '10px',
    headerHeight:  '70px',
    footerHeight:  '30px',
    logoSize:      'medium',
    logoAlignment: 'start',
    tableDensity:  'comfortable',
  },
  'journal': {
    pageSize:      'A4',
    orientation:   'landscape',
    margin:        '10mm',
    fontSize:      '10px',
    tableFontSize: '9.5px',
    logoSize:      'small',
    logoAlignment: 'start',
    tableDensity:  'compact',
  },
  'receipt': {
    pageSize:      'A5',
    orientation:   'portrait',
    margin:        '8mm',
    fontSize:      '10px',
    tableFontSize: '9px',
    logoSize:      'small',
    logoAlignment: 'center',
    tableDensity:  'compact',
  },
  'letter': {
    pageSize:      'A4',
    orientation:   'portrait',
    margin:        '20mm',
    fontSize:      '12px',
    tableFontSize: '11px',
    headerHeight:  '80px',
    footerHeight:  '40px',
    logoSize:      'medium',
    logoAlignment: 'center',
    tableDensity:  'comfortable',
  },
};
