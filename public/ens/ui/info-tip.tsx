import React from 'react';
import { EuiIconTip } from '@elastic/eui';

export const InfoTip = ({ content }: { content: React.ReactNode }) => (
  <EuiIconTip type='iInCircle' color='subdued' size='m' content={content} aria-label='Información' />
);
