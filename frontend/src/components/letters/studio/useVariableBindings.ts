/**
 * Document Automation — resolving a letter's variable bindings.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  FETCHES THE BOUND RECORDS. RESOLVES NOTHING ITSELF.
 * ══════════════════════════════════════════════════════════════════════════
 * The arithmetic of turning records into values is `variables/variableResolver`, which
 * is pure and tested without a network. This hook's only job is the impure half: ask
 * the existing endpoints for the bound employee and contract, and hand what comes back
 * to that function.
 *
 * ── IT READS EXISTING ENDPOINTS AND ADDS NONE ────────────────────────────
 * `/employees/:id` and `/contracts/:id` already serve the modules that own those
 * records. A letters-specific endpoint would be a second reader of a shape the letters
 * module does not own, and would drift the day either module changed.
 *
 * ── A FAILED FETCH IS REPORTED, NOT GUESSED ──────────────────────────────
 * A deleted employee leaves `employee` null and adds `employee` to
 * `unresolvedBindings`. The composer passes that to the validation context, where
 * `W12_bindingUnresolved` names the cause once instead of letting the author chase six
 * separately-unresolved variables. Nothing is invented and nothing falls back.
 */

import { useEffect, useMemo, useState } from 'react';
import { api } from '../../../api/client';
import { type DocumentBindings } from '../../../letters/model/blockTypes';
import {
  type ContractSource,
  type EmployeeSource,
} from '../../../letters/variables/variableResolver';

export type BindingKind = 'employee' | 'contract' | 'project';

export interface ResolvedBindings {
  readonly employee: EmployeeSource | null;
  readonly contract: ContractSource | null;
  /** Bindings that were asked for and did not come back. */
  readonly unresolved: readonly BindingKind[];
  readonly loading: boolean;
}

const EMPTY: ResolvedBindings = { employee: null, contract: null, unresolved: [], loading: false };

/**
 * Map an employee row onto the resolver's source shape.
 *
 * ONE PLACE where the letters module knows the employee module's field names, so a
 * rename there is a compile error here rather than six silently-empty variables.
 *
 * `managerName` is deliberately absent: the `Employee` model carries no manager field,
 * and `{{Manager}}` is marked unavailable in the catalogue for exactly that reason.
 */
function toEmployeeSource(row: Record<string, unknown>): EmployeeSource {
  const value = (key: string): string | null => {
    const raw = row[key];
    return typeof raw === 'string' && raw.trim().length > 0 ? raw : null;
  };
  return {
    name: value('fullName'),
    jobTitle: value('jobTitle'),
    department: value('department'),
    nationality: value('nationality'),
    civilId: value('civilId'),
    phone: value('phone'),
    email: value('email'),
    salary: typeof row.salary === 'number' ? row.salary : null,
  };
}

function toContractSource(row: Record<string, unknown>): ContractSource {
  return { reference: typeof row.code === 'string' && row.code.length > 0 ? row.code : null };
}

export function useVariableBindings(bindings: DocumentBindings | undefined): ResolvedBindings {
  const employeeId = bindings?.employeeId ?? null;
  const contractId = bindings?.contractId ?? null;
  // `projectId` is accepted by the model but never fetched: there is no `Project`
  // model in this ERP, and `{{Project}}` is marked unavailable in the catalogue. The
  // field exists so a future pack turns the variable on without a model migration.

  const [state, setState] = useState<ResolvedBindings>(EMPTY);

  useEffect(() => {
    if (employeeId === null && contractId === null) {
      setState(EMPTY);
      return;
    }

    let cancelled = false;
    setState((current) => ({ ...current, loading: true }));

    (async () => {
      const unresolved: BindingKind[] = [];
      let employee: EmployeeSource | null = null;
      let contract: ContractSource | null = null;

      if (employeeId !== null) {
        try {
          const { data } = await api.get(`/employees/${employeeId}`);
          const row = (data.data ?? data) as Record<string, unknown>;
          employee = row && typeof row === 'object' ? toEmployeeSource(row) : null;
          if (!employee) unresolved.push('employee');
        } catch {
          // Deleted, or the request failed. Both mean "this binding does not resolve",
          // which is a fact to report rather than a state to recover from.
          unresolved.push('employee');
        }
      }

      if (contractId !== null) {
        try {
          const { data } = await api.get(`/contracts/${contractId}`);
          const row = (data.data ?? data) as Record<string, unknown>;
          contract = row && typeof row === 'object' ? toContractSource(row) : null;
          if (!contract) unresolved.push('contract');
        } catch {
          unresolved.push('contract');
        }
      }

      if (!cancelled) setState({ employee, contract, unresolved, loading: false });
    })();

    return () => {
      cancelled = true;
    };
  }, [employeeId, contractId]);

  return useMemo(() => state, [state]);
}
