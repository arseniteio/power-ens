import React from 'react';
import {
  EuiBadge,
  EuiBasicTable,
  EuiPage,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import { ENSControlsInAnnexOrder as ENSControls } from '../controls-in-order';

export const EvidenceENS = () => {
  const items = ENSControls.flatMap(control =>
    control.evidences.map(evidence => ({
      controlId: control.id,
      id: evidence.id,
      title: evidence.title,
      requirements: evidence.requirement.join(', '),
      levels: evidence.level.join(', '),
      expectedStatus: evidence.expectedStatus,
      ruleIds: evidence.wazuhRuleIds.join(', '),
      description: evidence.description,
    })),
  );

  const columns = [
    {
      field: 'id',
      name: 'Evidencia',
    },
    {
      field: 'title',
      name: 'Nombre',
    },
    {
      field: 'controlId',
      name: 'Control',
    },
    {
      field: 'requirements',
      name: 'Requisitos ENS',
    },
    {
      field: 'levels',
      name: 'Nivel',
    },
    {
      field: 'expectedStatus',
      name: 'Estado esperado',
      render: status => <EuiBadge>{status}</EuiBadge>,
    },
    {
      field: 'ruleIds',
      name: 'Rule IDs Wazuh',
    },
    {
      field: 'description',
      name: 'Descripción',
    },
  ];

  return (
    <EuiPage paddingSize='m'>
      <EuiPanel>
        <EuiTitle size='m'>
          <h2>ENS Evidence</h2>
        </EuiTitle>
        <EuiText>
          <p>
            Evidencias ENS normalizadas para auditoría, trazabilidad Wazuh y
            cumplimiento por control.
          </p>
        </EuiText>
        <EuiSpacer size='m' />
        <EuiBasicTable items={items} columns={columns} />
      </EuiPanel>
    </EuiPage>
  );
};
