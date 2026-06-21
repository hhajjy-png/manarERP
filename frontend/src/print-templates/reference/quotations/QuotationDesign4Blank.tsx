import type { QuotationPrintData } from '../../engine/types';
import QuotationBase from './QuotationBase';
import styles from './QuotationShared.module.css';

export default function QuotationDesign4Blank({ data }: { data?: QuotationPrintData }) {
  return <QuotationBase themeClass={styles.tpl4} showLetterhead={false} data={data} />;
}
