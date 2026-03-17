// Colours and election phase labels shared by every page.

export const colors = {
  bg: '#0a0f1a',
  panel: '#0d1424',
  border: '#1f2937',
  borderStrong: '#374151',
  text: '#e5e7eb',
  textStrong: '#f9fafb',
  muted: '#9ca3af',
  faint: '#6b7280',
  amber: '#f59e0b',
  blue: '#3b82f6',
  green: '#10b981',
  red: '#ef4444',
  purple: '#8b5cf6',
};

// Index = the ElectionState enum value in the contract.
export const PHASE_LABELS = ['NOT STARTED', 'REGISTRATION', 'VOTING', 'REVEALING', 'ENDED'];
export const PHASE_COLORS = ['#6b7280', '#3b82f6', '#10b981', '#f59e0b', '#ef4444'];
export const PHASE_DESCRIPTIONS = [
  'The election has not begun.',
  'Candidates are being registered. Voting is not open yet.',
  'Voters can cast sealed votes.',
  'Voters can now reveal their sealed votes so they get counted.',
  'The election is over. Results are final.',
];

export const fonts = {
  heading: '"Bebas Neue", "IBM Plex Mono", monospace',
  mono: '"IBM Plex Mono", monospace',
};
