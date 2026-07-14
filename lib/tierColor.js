const COLORS = {
  green: { border: '#4C9A6A', text: '#5FA97D' },
  amber: { border: '#C98A3E', text: '#D9A257' },
  red:   { border: '#B4483F', text: '#C96158' },
  gray:  { border: '#7C8489', text: '#7C8489' },
};

export function tierColors(str) {
  if (!str) return COLORS.gray;
  const s = str.toUpperCase();
  if (s.includes('NOT CONFIRMED') || s.includes('REFUTED')) return COLORS.red;
  if (s.includes('UNVERIFIED') || s.includes('SOURCED')) return COLORS.amber;
  if (s.includes('VERIFIED')) return COLORS.green;
  return COLORS.gray;
}

export function topicStatusColors(status) {
  if (!status) return COLORS.gray;
  switch (status.toLowerCase()) {
    case 'approved': return COLORS.green;
    case 'pending_review': return COLORS.amber;
    case 'rejected': return COLORS.red;
    // legacy values from before migration 015
    case 'new': return COLORS.green;
    case 'reviewed': return COLORS.amber;
    default: return COLORS.gray;
  }
}
