import React from 'react';
import {
  EuiAccordion,
  EuiBadge,
  EuiBasicTable,
  EuiFlexGroup,
  EuiFlexItem,
  EuiHorizontalRule,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import { getENSCatalogControl } from '../../../../common/ens/catalog';
import {
  ENS_TEXT_PROVENANCE_LABELS,
  describeRequirementTexts,
} from '../../../../common/ens/catalog/support/provenance';
import type { ENSTextProvenance } from '../../../../common/ens/catalog/support/provenance';
import {
  ENS_TEMPLATE_COVERAGE_LABELS,
  getTemplateCorrespondence,
} from '../../../../common/ens/catalog/support/template-correspondence';
import type {
  ENSTemplateCorrespondenceRow,
  ENSTemplateCoverage,
} from '../../../../common/ens/catalog/support/template-correspondence';

export const ProvenanceLabel = ({ provenance }: { provenance: ENSTextProvenance }) => (
  <EuiBadge color={provenance === 'BOE' ? 'primary' : 'hollow'}>
    {ENS_TEXT_PROVENANCE_LABELS[provenance]}
  </EuiBadge>
);

export const ProvenancedText = ({ provenance, text }: { provenance: ENSTextProvenance; text: string }) => (
  <EuiText size='xs'>
    <p>
      <ProvenanceLabel provenance={provenance} /> {text}
    </p>
  </EuiText>
);

export const RequirementTextsPanel = ({ controlId }: { controlId: string }) => {
  const control = getENSCatalogControl(controlId);

  if (!control) {
    return null;
  }

  return (
    <EuiAccordion
      id={`requirement-texts-${controlId}`}
      buttonContent={`Texto de los requisitos (${control.requirements.length})`}
      paddingSize='s'
    >
      <EuiText size='xs' color='subdued'>
        <p>
          «{ENS_TEXT_PROVENANCE_LABELS.BOE}»: literal del BOE. «{ENS_TEXT_PROVENANCE_LABELS.CRITERION}»: cómo lo mide Power ENS, sin valor normativo.
        </p>
      </EuiText>
      <EuiSpacer size='s' />
      {control.requirements.map(requirement => (
        <EuiFlexGroup key={requirement.id} gutterSize='s' responsive={false} style={{ padding: '6px 0' }}>
          <EuiFlexItem grow={false} style={{ minWidth: 110 }}>
            <EuiText size='xs'>
              <strong>{requirement.id}</strong>
            </EuiText>
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiText size='xs'>
              <strong>{requirement.title}</strong>
            </EuiText>
            {describeRequirementTexts(requirement).map(text => (
              <ProvenancedText key={text.provenance} provenance={text.provenance} text={text.text} />
            ))}
            <EuiHorizontalRule margin='xs' />
          </EuiFlexItem>
        </EuiFlexGroup>
      ))}
    </EuiAccordion>
  );
};

const coverageColor = (coverage: ENSTemplateCoverage): string =>
  coverage === 'EQUIVALENT' ? 'success' : coverage === 'PARTIAL' ? 'warning' : 'danger';

const correspondenceColumns = (oursName: string) => [
  { field: 'template', name: 'Plantilla', width: '90px', render: (id: string) => <strong>{id}</strong> },
  { field: 'templateName', name: 'Nombre en la plantilla' },
  {
    field: 'ours',
    name: oursName,
    width: '130px',
    render: (ours: string[]) => (ours.length ? ours.join(', ') : '—'),
  },
  {
    field: 'coverage',
    name: 'Cobertura',
    width: '150px',
    render: (coverage: ENSTemplateCoverage) => (
      <EuiBadge color={coverageColor(coverage)}>{ENS_TEMPLATE_COVERAGE_LABELS[coverage]}</EuiBadge>
    ),
  },
  { field: 'note', name: 'Nota' },
];

export const TemplateCorrespondencePanel = ({ controlId }: { controlId: string }) => {
  const correspondence = getTemplateCorrespondence(controlId);

  if (!correspondence) {
    return null;
  }

  const table = (title: string, rows: ENSTemplateCorrespondenceRow[], oursName: string) => (
    <>
      <EuiSpacer size='s' />
      <EuiTitle size='xxs'>
        <h4>{title}</h4>
      </EuiTitle>
      <EuiBasicTable<ENSTemplateCorrespondenceRow> noItemsMessage='No hay datos.' items={rows} columns={correspondenceColumns(oursName)} />
    </>
  );

  return (
    <EuiAccordion
      id={`template-correspondence-${controlId}`}
      buttonContent={correspondence.title}
      paddingSize='s'
    >
      <ProvenancedText provenance='CRITERION' text={correspondence.summary} />
      {table('Requisitos', correspondence.requirements, 'Power ENS')}
      {table('Parámetros', correspondence.parameters, 'Power ENS')}
      {table('Evidencias', correspondence.evidences, 'Power ENS')}
      <EuiSpacer size='s' />
      <EuiText size='xs'>
        <p>
          <strong>Solo en Power ENS:</strong>{' '}
          {correspondence.ownOnly.map(item => `${item.id} (${item.note})`).join(' · ')}
        </p>
      </EuiText>
    </EuiAccordion>
  );
};
