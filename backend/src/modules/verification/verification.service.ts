import { prisma } from '../../config/database';
import { translateInvoiceStatusAr } from '../../shared/utils/arabicLabels';

export interface VerificationResult {
  found: boolean;
  documentType?: 'invoice';
  documentNumber?: string;
  status?: string;
  statusAr?: string;
  issueDate?: string;
  updatedAt?: string;
  isCancelled?: boolean;
  isApproved?: boolean;
}

export async function verifyByUuid(uuid: string): Promise<VerificationResult> {
  const invoice = await prisma.invoice.findFirst({
    where: { verificationUuid: uuid },
    select: {
      invoiceNumber: true,
      status: true,
      issueDate: true,
      updatedAt: true,
    },
  });

  if (!invoice) return { found: false };

  return {
    found: true,
    documentType: 'invoice',
    documentNumber: invoice.invoiceNumber,
    status: invoice.status,
    statusAr: translateInvoiceStatusAr(invoice.status),
    issueDate: invoice.issueDate.toISOString(),
    updatedAt: invoice.updatedAt.toISOString(),
    isCancelled: invoice.status === 'CANCELLED',
    isApproved: invoice.status !== 'DRAFT' && invoice.status !== 'CANCELLED',
  };
}
