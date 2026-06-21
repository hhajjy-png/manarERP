/** Fields actually sent to the API for each invoice line item. */
export interface InvoiceItemPayload {
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
}

/**
 * Converts a UI item state to the API payload.
 * Explicitly drops uid (React key), priceTouched, workType, location — all UI-only fields.
 */
export function toInvoiceItemPayload(it: InvoiceItemPayload): InvoiceItemPayload {
  return {
    description: it.description,
    quantity: it.quantity,
    unit: it.unit,
    unitPrice: it.unitPrice,
  };
}
