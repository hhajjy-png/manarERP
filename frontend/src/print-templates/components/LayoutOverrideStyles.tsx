import type { DocumentLayoutOverrides } from '../designer/layoutOverrideTypes';
import { buildLayoutStyleSheet } from '../designer/layoutOverrideUtils';

interface Props {
  overrides: DocumentLayoutOverrides;
}

export default function LayoutOverrideStyles({ overrides }: Props) {
  const css = buildLayoutStyleSheet(overrides);
  if (!css) return null;
  // dangerouslySetInnerHTML is safe here: css is generated from typed data, not user text
  return <style dangerouslySetInnerHTML={{ __html: css }} />;
}
