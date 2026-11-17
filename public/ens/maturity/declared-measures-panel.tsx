import React, { useState } from 'react';
import { EuiBasicTable, EuiButtonEmpty, EuiPanel, EuiSpacer, EuiText, EuiTitle } from '@elastic/eui';
import type { ENSConfigurationVersion } from '../../../common/ens/configuration/types';
import { assessmentOf } from '../../../common/ens/maturity/assessments';
import { ENS_DECLARED_MEASURES } from '../../../common/ens/maturity/declared-measures';
import { maturityLabel } from '../../../common/ens/maturity/types';
import { AssessModal } from './measure-maturity';

type Row = (typeof ENS_DECLARED_MEASURES)[number];

export const DeclaredMeasuresPanel = ({ configuration, onSaved }: { configuration: ENSConfigurationVersion; onSaved: () => void }) => {
  const [assessing, setAssessing] = useState<string | undefined>();

  return (
    <EuiPanel hasBorder>
      <EuiTitle size='xs'>
        <h3>Medidas sin motor</h3>
      </EuiTitle>
      <EuiText size='xs' color='subdued'>
        <p>
          Medidas que citan los controles y que Power ENS no mide. Su madurez solo se valora: entra en la madurez de la organización con el nivel
          declarado y sin nivel acreditado.
        </p>
      </EuiText>
      <EuiSpacer size='s' />
      <EuiBasicTable<Row>
        compressed
        items={ENS_DECLARED_MEASURES}
        noItemsMessage='No hay medidas.'
        columns={[
          { field: 'id', name: 'Medida', width: '100px' },
          { field: 'name', name: 'Nombre' },
          { field: 'citedFrom', name: 'Citada en', width: '200px' },
          {
            field: 'id',
            name: 'Valorado',
            width: '210px',
            render: (id: string) => {
              const a = assessmentOf(configuration, id);
              return a?.level === undefined ? 'sin valorar' : `${maturityLabel(a.level)}${a.target === undefined ? '' : ` · objetivo L${a.target}`}`;
            },
          },
          {
            field: 'id',
            name: '',
            width: '90px',
            render: (id: string) => (
              <EuiButtonEmpty size='xs' onClick={() => setAssessing(id)}>
                Valorar
              </EuiButtonEmpty>
            ),
          },
        ]}
      />
      {assessing && <AssessModal measureId={assessing} onClose={() => setAssessing(undefined)} onSaved={onSaved} />}
    </EuiPanel>
  );
};
