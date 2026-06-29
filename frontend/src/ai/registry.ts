// ─── Skill Registry ───────────────────────────────────────────────────────────
// Memoized Map of skillId → executor.
// The registry is built once and cached. Future phases may add an LLM caller
// that only chooses a skillId — it will call executeSkill() here unchanged.

import type { SkillResult } from './types';
import { executeBankStatementSkill } from './skills/bankStatement';
import { executePayrollSkill }        from './skills/payroll';
import { executeReportsSkill }        from './skills/reports';
import { executeExpensesSkill }       from './skills/expenses';
import { executeContractsSkill }      from './skills/contracts';
import { executeDashboardSkill }      from './skills/dashboard';

export type SkillExecutor = (prompt: string, intent: string) => Promise<SkillResult>;

const SKILL_MAP: Array<{ id: string; execute: SkillExecutor }> = [
  { id: 'bank-statement', execute: executeBankStatementSkill },
  { id: 'payroll',        execute: executePayrollSkill },
  { id: 'reports',        execute: executeReportsSkill },
  { id: 'expenses',       execute: executeExpensesSkill },
  { id: 'contracts',      execute: executeContractsSkill },
  { id: 'dashboard',      execute: executeDashboardSkill },
];

let _registry: Map<string, SkillExecutor> | null = null;

function getRegistry(): Map<string, SkillExecutor> {
  if (!_registry) {
    _registry = new Map(SKILL_MAP.map(s => [s.id, s.execute]));
  }
  return _registry;
}

export function listSkillIds(): string[] {
  return SKILL_MAP.map(s => s.id);
}

export async function executeSkill(
  skillId: string,
  prompt: string,
  intent: string,
): Promise<SkillResult> {
  const executor = getRegistry().get(skillId);
  if (!executor) {
    const now = Date.now();
    return {
      skillId,
      skillTitleAr: skillId,
      intent,
      prompt,
      title: 'مهارة غير معروفة',
      summary: `المهارة "${skillId}" غير موجودة في السجل.`,
      statistics: [],
      warnings: [{ message: `لم يتم العثور على مهارة بالمعرّف "${skillId}".`, severity: 'danger' }],
      sources: [],
      suggestedQuestions: [],
      isError: true,
      errorMessage: `Unknown skill: ${skillId}`,
      executedAt: now,
      executionMs: 0,
    };
  }
  return executor(prompt, intent);
}
