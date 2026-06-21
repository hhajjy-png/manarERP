import type { QuotationPrintData } from '../../engine/types';
import QuotationBase from './QuotationBase';
import styles from './QuotationShared.module.css';

export default function QuotationDesign3({ data }: { data?: QuotationPrintData }) {
  return <QuotationBase themeClass={styles.tpl3} showLetterhead data={data} />;
}
