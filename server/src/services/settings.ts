import type { AcademySettings, SettingsResponse } from '@gymvis/shared';
import { defaultRiskRules, type RiskRules } from '../config/risk';
import { sqlite } from '../db/client';
import { listPlans } from './plans';
import { listPromotions } from './promotions';

interface SettingsRow {
  inactivity_medium: number;
  inactivity_high: number;
  inactivity_critical: number;
  frequency_drop_medium: number;
  frequency_drop_high: number;
}

const selectStmt = sqlite.prepare(
  'SELECT inactivity_medium, inactivity_high, inactivity_critical, frequency_drop_medium, frequency_drop_high FROM academy_settings WHERE academy_id = ?',
);

const upsertStmt = sqlite.prepare(`
  INSERT INTO academy_settings
    (academy_id, inactivity_medium, inactivity_high, inactivity_critical,
     frequency_drop_medium, frequency_drop_high, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(academy_id) DO UPDATE SET
    inactivity_medium = excluded.inactivity_medium,
    inactivity_high = excluded.inactivity_high,
    inactivity_critical = excluded.inactivity_critical,
    frequency_drop_medium = excluded.frequency_drop_medium,
    frequency_drop_high = excluded.frequency_drop_high,
    updated_at = excluded.updated_at
`);

const academyNameStmt = sqlite.prepare('SELECT nome FROM academies WHERE id = ?');
const renameAcademyStmt = sqlite.prepare('UPDATE academies SET nome = ? WHERE id = ?');

/** Limiares em vigor para a academia: os salvos, ou os padrões de fábrica. */
export function getRiskRules(academyId: number): RiskRules {
  const row = selectStmt.get(academyId) as SettingsRow | undefined;
  if (!row) return defaultRiskRules;
  return {
    inactivity: {
      medium: row.inactivity_medium,
      high: row.inactivity_high,
      critical: row.inactivity_critical,
    },
    frequencyDrop: {
      medium: row.frequency_drop_medium,
      high: row.frequency_drop_high,
    },
  };
}

function academyName(academyId: number): string {
  return ((academyNameStmt.get(academyId) as { nome: string } | undefined)?.nome ?? '').trim();
}

export function getSettings(academyId: number): AcademySettings {
  const rules = getRiskRules(academyId);
  return {
    academiaNome: academyName(academyId),
    inactivityMedium: rules.inactivity.medium,
    inactivityHigh: rules.inactivity.high,
    inactivityCritical: rules.inactivity.critical,
    frequencyDropMedium: rules.frequencyDrop.medium,
    frequencyDropHigh: rules.frequencyDrop.high,
  };
}

export function getDefaults(academyId: number): AcademySettings {
  return {
    academiaNome: academyName(academyId),
    inactivityMedium: defaultRiskRules.inactivity.medium,
    inactivityHigh: defaultRiskRules.inactivity.high,
    inactivityCritical: defaultRiskRules.inactivity.critical,
    frequencyDropMedium: defaultRiskRules.frequencyDrop.medium,
    frequencyDropHigh: defaultRiskRules.frequencyDrop.high,
  };
}

export function getSettingsPage(academyId: number): SettingsResponse {
  return {
    settings: getSettings(academyId),
    defaults: getDefaults(academyId),
    plans: listPlans(academyId),
    promotions: listPromotions(academyId),
  };
}

const saveTx = sqlite.transaction((academyId: number, s: AcademySettings) => {
  renameAcademyStmt.run(s.academiaNome.trim(), academyId);
  upsertStmt.run(
    academyId,
    s.inactivityMedium,
    s.inactivityHigh,
    s.inactivityCritical,
    s.frequencyDropMedium,
    s.frequencyDropHigh,
    Date.now(),
  );
});

export function saveSettings(academyId: number, settings: AcademySettings): void {
  saveTx(academyId, settings);
}
