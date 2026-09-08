import type { AcademySettings, SettingsResponse } from '@gymvis/shared';
import { defaultRiskRules, type RiskRules } from '../config/risk';
import { db } from '../db/client';
import { invalidarCache } from './metricsCache';
import { listPlans } from './plans';
import { listPromotions } from './promotions';

interface SettingsRow {
  inactivity_medium: number;
  inactivity_high: number;
  inactivity_critical: number;
  frequency_drop_medium: number;
  frequency_drop_high: number;
}

const SELECIONAR = `
  SELECT inactivity_medium, inactivity_high, inactivity_critical,
         frequency_drop_medium, frequency_drop_high
  FROM academy_settings WHERE academy_id = ?
`;

const SALVAR = `
  INSERT INTO academy_settings
    (academy_id, inactivity_medium, inactivity_high, inactivity_critical,
     frequency_drop_medium, frequency_drop_high, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT (academy_id) DO UPDATE SET
    inactivity_medium = excluded.inactivity_medium,
    inactivity_high = excluded.inactivity_high,
    inactivity_critical = excluded.inactivity_critical,
    frequency_drop_medium = excluded.frequency_drop_medium,
    frequency_drop_high = excluded.frequency_drop_high,
    updated_at = excluded.updated_at
`;

const NOME_ACADEMIA = 'SELECT nome FROM academies WHERE id = ?';
const RENOMEAR_ACADEMIA = 'UPDATE academies SET nome = ? WHERE id = ?';

/** Limiares em vigor para a academia: os salvos, ou os padrões de fábrica. */
export async function getRiskRules(academyId: number): Promise<RiskRules> {
  const row = await db.one<SettingsRow>(SELECIONAR, academyId);
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

async function academyName(academyId: number): Promise<string> {
  const linha = await db.one<{ nome: string }>(NOME_ACADEMIA, academyId);
  return (linha?.nome ?? '').trim();
}

export async function getSettings(academyId: number): Promise<AcademySettings> {
  const [rules, nome] = await Promise.all([getRiskRules(academyId), academyName(academyId)]);
  return {
    academiaNome: nome,
    inactivityMedium: rules.inactivity.medium,
    inactivityHigh: rules.inactivity.high,
    inactivityCritical: rules.inactivity.critical,
    frequencyDropMedium: rules.frequencyDrop.medium,
    frequencyDropHigh: rules.frequencyDrop.high,
  };
}

export async function getDefaults(academyId: number): Promise<AcademySettings> {
  return {
    academiaNome: await academyName(academyId),
    inactivityMedium: defaultRiskRules.inactivity.medium,
    inactivityHigh: defaultRiskRules.inactivity.high,
    inactivityCritical: defaultRiskRules.inactivity.critical,
    frequencyDropMedium: defaultRiskRules.frequencyDrop.medium,
    frequencyDropHigh: defaultRiskRules.frequencyDrop.high,
  };
}

export async function getSettingsPage(academyId: number): Promise<SettingsResponse> {
  const [settings, defaults, plans, promotions] = await Promise.all([
    getSettings(academyId),
    getDefaults(academyId),
    listPlans(academyId),
    listPromotions(academyId),
  ]);
  return { settings, defaults, plans, promotions };
}

export async function saveSettings(academyId: number, settings: AcademySettings): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.run(RENOMEAR_ACADEMIA, settings.academiaNome.trim(), academyId);
    await tx.run(
      SALVAR,
      academyId,
      settings.inactivityMedium,
      settings.inactivityHigh,
      settings.inactivityCritical,
      settings.frequencyDropMedium,
      settings.frequencyDropHigh,
      Date.now(),
    );
  });
  // Os limiares entram no cálculo de risco de cada aluno.
  invalidarCache(academyId);
}
