import type { PrintProfile } from './reportTypes';

interface ProfileConfig {
  pageSize: string;
  orientation: 'portrait' | 'landscape';
  margin: string;
  fontSize: string;
  tableFontSize: string;
}

export const PRINT_PROFILES: Record<PrintProfile, ProfileConfig> = {
  'a4-landscape': {
    pageSize:      'A4',
    orientation:   'landscape',
    margin:        '10mm',
    fontSize:      '11px',
    tableFontSize: '10px',
  },
  'a4-portrait': {
    pageSize:      'A4',
    orientation:   'portrait',
    margin:        '12mm',
    fontSize:      '11px',
    tableFontSize: '10px',
  },
  'statement': {
    pageSize:      'A4',
    orientation:   'portrait',
    margin:        '14mm',
    fontSize:      '11px',
    tableFontSize: '10px',
  },
  'journal': {
    pageSize:      'A4',
    orientation:   'landscape',
    margin:        '10mm',
    fontSize:      '10px',
    tableFontSize: '9.5px',
  },
  'receipt': {
    pageSize:      'A5',
    orientation:   'portrait',
    margin:        '8mm',
    fontSize:      '10px',
    tableFontSize: '9px',
  },
  'letter': {
    pageSize:      'A4',
    orientation:   'portrait',
    margin:        '20mm',
    fontSize:      '12px',
    tableFontSize: '11px',
  },
};
