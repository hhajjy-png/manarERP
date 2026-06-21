import type { QuotationPrintData } from '../../engine/types';
import QuotationBase from './QuotationBase';
import styles from './QuotationShared.module.css';

export default function QuotationDesign1Blank({ data }: { data?: QuotationPrintData }) {
  return <QuotationBase themeClass={styles.tpl1} showLetterhead={false} data={data} />;
}
