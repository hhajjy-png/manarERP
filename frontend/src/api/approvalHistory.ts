import { api } from './client';

export interface ApprovalHistoryEntry {
  id: number;
  entityType: string;
  entityId: number;
  action: string;
  fromStatus: string;
  toStatus: string;
  user: { id: number; fullName: string } | null;
  comment: string | null;
  reason: string | null;
  createdAt: string;
}

export const approvalHistoryApi = {
  getHistory: (entityType: string, entityId: number): Promise<ApprovalHistoryEntry[]> =>
    api
      .get<{ data: ApprovalHistoryEntry[] }>(`/approval-history/${entityType}/${entityId}`)
      .then((r) => r.data.data),
};
