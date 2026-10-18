// Un fallo al pintar una pestaña se queda en ESA pestaña. Sin esto, cualquier
// excepción de render desmontaba la app entera (solo había `Suspense`): la otra
// forma de que una pantalla «desaparezca». Se monta con `key` = pestaña +
// máquina, así que cambiar de pestaña o de máquina vuelve a intentarlo solo;
// «Reintentar» lo hace sin cambiar nada.
import React from 'react';
import { EuiButton, EuiCallOut, EuiSpacer, EuiText } from '@elastic/eui';

interface TabErrorBoundaryProps {
  tabName: string;
  children?: React.ReactNode;
}

interface TabErrorBoundaryState {
  error?: Error;
}

export const describeRenderError = (error: unknown): string => {
  const texto = String((error as any)?.message || error || '').trim();
  return texto || 'Error desconocido al pintar la pantalla.';
};

export class TabErrorBoundary extends React.Component<TabErrorBoundaryProps, TabErrorBoundaryState> {
  state: TabErrorBoundaryState = {};

  static getDerivedStateFromError(error: Error): TabErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error) {
    // eslint-disable-next-line no-console
    console.error(`ENSFácil: fallo al pintar «${this.props.tabName}»`, error);
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
          <p>Las demás pestañas siguen disponibles. «Reintentar» vuelve a pintar esta con los datos de ahora.</p>
        </EuiText>
        <EuiSpacer size='s' />
        <EuiButton size='s' iconType='refresh' onClick={this.retry}>
          Reintentar
        </EuiButton>
      </EuiCallOut>
    );
  }
}
