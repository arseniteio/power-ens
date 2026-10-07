import React from 'react';
import { EuiFlexGroup, EuiFlexItem, EuiLoadingSpinner, EuiText } from '@elastic/eui';

export const LoadingSpinner = ({ message }: { message?: string }) => (
  <EuiFlexGroup direction="column" alignItems="center" gutterSize="s" style={{ padding: 32 }}>
    <EuiFlexItem grow={false}>
      <EuiLoadingSpinner size="xl" />
    </EuiFlexItem>
    {message && (
      <EuiFlexItem grow={false}>
        <EuiText size="s" color="subdued">
          <p>{message}</p>
        </EuiText>
      </EuiFlexItem>
    )}
  </EuiFlexGroup>
);
