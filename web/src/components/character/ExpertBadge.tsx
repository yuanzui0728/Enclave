import React from 'react';
import { Colors } from '../../theme/colors';
import type { ExpertDomain } from '../../types/character';

const DOMAIN_LABELS: Record<ExpertDomain, string> = {
  law: '法律', medicine: '医疗', finance: '理财', tech: '技术',
  psychology: '心理', education: '教育', management: '管理', general: '综合',
};

const DOMAIN_COLORS: Record<ExpertDomain, string> = {
  law: Colors.tagLaw, medicine: Colors.tagMedicine, finance: Colors.tagFinance,
  tech: Colors.tagTech, psychology: Colors.tagPsychology, education: Colors.tagEducation,
  management: Colors.tagManagement, general: Colors.textSecondary,
};

export function ExpertBadge({ domain }: { domain: ExpertDomain }) {
  const color = DOMAIN_COLORS[domain];
  return (
    <span style={{
      padding: '2px 8px', borderRadius: 4,
      backgroundColor: color + '20',
      border: `1px solid ${color}60`,
      color, fontSize: 11, fontWeight: 500,
      marginRight: 4, marginBottom: 4, display: 'inline-block',
    }}>
      {DOMAIN_LABELS[domain]}
    </span>
  );
}
