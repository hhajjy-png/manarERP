import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import type { Item, PriceOption } from '../components/invoices/InvoiceLineItemsEditor';

// ─────────────────────────────────────────────────────────────────────────
//  تحميل الجهة (عميل/مورّد) والأسعار والعقود لنماذج الفاتورة — مُستخرَج حرفيًا من
//  CreateInvoice وEditInvoice دون أي تغيير سلوكي (refactor بحت). كان لكل منهما
//  نسخته الخاصة من هذا المنطق؛ أصبح الآن مصدرًا واحدًا يتشاركانه.
//
//  الفارق الوحيد بين النسختين الأصليتين كان في قيمة البذرة الابتدائية لـ
//  prevPartyIdRef: عند الإنشاء partyId الابتدائي فارغ ''، وعند التعديل partyId
//  الابتدائي هو عميل/مورّد الفاتورة القائمة. الحارس الثلاثي الشرط أدناه
//  (`partyId !== prevPartyIdRef.current && prevPartyIdRef.current !== ''`)
//  يُغطّي الحالتين بلا تغيير: فارغ ابتدائي ⇐ لا تصفير عند أول اختيار جهة
//  (يطابق CreateInvoice الأصلي)، وقيمة غير فارغة ابتدائية ⇐ الشرط الثالث محقَّق
//  دائمًا فيتصرّف كأنه غير موجود (يطابق EditInvoice الأصلي).
// ─────────────────────────────────────────────────────────────────────────

export type ContractOption = {
  id: number;
  code: string;
  asphaltPlant?: string | null;
  companyName?: string | null;
  status: string;
};

interface UseInvoicePartyPricingParams {
  directionChoice: string;
  customPartyType: 'SALES' | 'PURCHASE';
  partyId: string;
  setPartyId: (v: string) => void;
  setItems: React.Dispatch<React.SetStateAction<Item[]>>;
}

export function useInvoicePartyPricing({
  directionChoice,
  customPartyType,
  partyId,
  setPartyId,
  setItems,
}: UseInvoicePartyPricingParams) {
  const effectivePartySource = directionChoice === 'OTHER' ? customPartyType : directionChoice;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [parties, setParties] = useState<any[]>([]);
  const [prices, setPrices] = useState<PriceOption[]>([]);
  const [contracts, setContracts] = useState<ContractOption[]>([]);
  const [contractId, setContractId] = useState('');

  const firstPartyLoad = useRef(true);
  const firstPartyTypeCheck = useRef(true);
  const prevPartyIdRef = useRef(partyId); // بذرة = partyId الابتدائي (فارغ عند الإنشاء، مُعبّأ عند التعديل)

  // تحميل قائمة الجهة (عملاء/موردون)؛ لا يُصفَّر partyId عند أول تحميل — يحافظ على
  // قيمته الابتدائية القادمة من فاتورة قائمة عند التعديل.
  useEffect(() => {
    (async () => {
      const ep = effectivePartySource === 'SALES' ? '/customers' : '/suppliers';
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = await api.get(ep, { params: { pageSize: 200 } }) as any;
      setParties(res.data.data.data ?? []);
      if (!firstPartyLoad.current) setPartyId('');
      firstPartyLoad.current = false;
    })();
  }, [effectivePartySource]);

  // تصفير الجهة عند تبديل نوع الجهة داخل «أخرى» — تخطي أول تصيير لعدم مسح قيمة ابتدائية.
  useEffect(() => {
    if (firstPartyTypeCheck.current) { firstPartyTypeCheck.current = false; return; }
    if (directionChoice === 'OTHER') setPartyId('');
  }, [customPartyType, directionChoice]);

  // تحميل الأسعار والعقود عند تغيّر الجهة؛ تصفير سعر البنود ورقم العقد فقط عند
  // تغيّر فعلي للجهة (لا عند أول اختيار جهة).
  useEffect(() => {
    if (partyId && partyId !== prevPartyIdRef.current && prevPartyIdRef.current !== '') {
      setItems((prev) => prev.map((it) => ({ ...it, unitPrice: 0, priceTouched: false })));
      setContractId('');
    }
    prevPartyIdRef.current = partyId;

    if (effectivePartySource !== 'SALES' || !partyId) {
      setPrices([]);
      setContracts([]);
      return;
    }
    api.get('/prices/for-invoice', { params: { customerId: partyId } })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then((res: any) => setPrices(res.data?.data ?? []))
      .catch(() => {});
    api.get('/contracts', { params: { customerId: partyId, pageSize: 100 } })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then((res: any) => setContracts(res.data?.data?.data ?? []))
      .catch(() => {});
  }, [partyId, effectivePartySource]);

  const activeContract = contracts.find((c) => String(c.id) === contractId);
  const filterAsphaltPlant = activeContract?.asphaltPlant ?? null;
  const displayPrices = filterAsphaltPlant
    ? prices.filter((p) => p.asphaltPlant === filterAsphaltPlant)
    : prices;

  return {
    effectivePartySource,
    parties,
    prices,
    contracts,
    contractId,
    setContractId,
    activeContract,
    filterAsphaltPlant,
    displayPrices,
  };
}
