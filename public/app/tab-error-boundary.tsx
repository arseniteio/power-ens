// A render failure stays in THAT tab. Mounted with `key` = tab ONLY: with the machine in the key every machine change would remount the tab and lose the last result.
// Changing machine or control (`resetKey`) clears the error without unmounting; so does 'Reintentar'.
import React from 'react';
import { EuiButton, EuiCallOut, EuiSpacer, EuiText } from '@elastic/eui';

interface TabErrorBoundaryProps {
  tabName: string;
  resetKey?: string;
  children?: React.ReactNode;
}

interface TabErrorBoundaryState {
  error?: Error;
}

const describeRenderError = (error: unknown): string => {
  const text = String((error as any)?.message || error || '').trim();
  return text || 'Error desconocido al pintar la pantalla.';
};

export class TabErrorBoundary extends React.Component<TabErrorBoundaryProps, TabErrorBoundaryState> {
  state: TabErrorBoundaryState = {};

  static getDerivedStateFromError(error: Error): TabErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error) {
    // eslint-disable-next-line no-console
    console.error(`Power ENS: failed to render «${this.props.tabName}»`, error);
  }

  componentDidUpdate(previous: TabErrorBoundaryProps) {
    if (this.state.error && previous.resetKey !== this.props.resetKey) {
      this.setState({ error: undefined });
    }
  }

  retry = () => this.setState({ error: undefined });

  render() {
    if (!this.state.error) {
      return this.props.children as any;
    }

    return (
      <EuiCallOut color='danger' iconType='alert' title={`No se pudo mostrar «${this.props.tabName}»`}>
        <EuiText size='s'>
          <p>{describeRenderError(this.state.error)}</p>
          <p>Las demás pestañas siguen disponibles.</p>
        </EuiText>
        <EuiSpacer size='s' />
        <EuiButton size='s' iconType='refresh' onClick={this.retry}>
          Reintentar
        </EuiButton>
      </EuiCallOut>
    );
  }
}
