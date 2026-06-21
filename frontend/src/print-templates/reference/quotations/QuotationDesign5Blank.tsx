import type { QuotationPrintData } from '../../engine/types';
import QuotationBase from './QuotationBase';
import styles from './QuotationShared.module.css';

export default function QuotationDesign5Blank({ data }: { data?: QuotationPrintData }) {
  return <QuotationBase themeClass={styles.tpl5} showLetterhead={false} showChips data={data} />;
}
