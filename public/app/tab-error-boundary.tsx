// Un fallo al pintar una pestaña se queda en ESA pestaña. Sin esto, cualquier
// excepción de render desmontaba la app entera (solo había `Suspense`): la otra
// forma de que una pantalla «desaparezca».
//
// Se monta con `key` = pestaña SOLO. Con la máquina en la `key`, cada cambio de
// máquina desmontaba la pestaña entera: el detalle perdía el último resultado
// (que tiene que seguir a la vista, rotulado con su máquina, mientras llega el
// de la nueva) y la Vista general volvía a pedirlo todo. Cambiar de máquina o de
// control (`resetKey`) borra el error sin desmontar nada; «Reintentar», también.
import React from 'react';
import { EuiButton, EuiCallOut, EuiSpacer, EuiText } from '@elastic/eui';

interface TabErrorBoundaryProps {
  tabName: string;
  // Lo que, al cambiar, vuelve a intentarlo (máquina y control de la URL).
  resetKey?: string;
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
