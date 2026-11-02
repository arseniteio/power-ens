import React from 'react';
import {
  EuiAccordion,
  EuiBadge,
  EuiButtonEmpty,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFlyout,
  EuiFlyoutBody,
  EuiFlyoutHeader,
  EuiLink,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';

import {
  describeEvidenceGuide,
  describeRequirementGuide,
  getControlRelation,
} from '../../../../common/ens/catalog/guide';
import type { ENSLinkedItem } from '../../../../common/ens/catalog/guide';
import { statusLabel } from '../../../../common/ens/core/status-label';
import { statusBadgeColor } from '../../status-colors';

export type GuideTarget = { kind: 'requirement' | 'evidence'; id: string };

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <>
    <EuiTitle size='xxs'>
      <h4>{title}</h4>
    </EuiTitle>
    <EuiSpacer size='xs' />
    <EuiText size='s'>{children}</EuiText>
    <EuiSpacer size='m' />
  </>
);

export const GuideCode = ({ target, onOpen }: { target: GuideTarget; onOpen: (target: GuideTarget) => void }) => (
  <EuiLink onClick={() => onOpen(target)} aria-label={`Ver la explicación de ${target.id}`}>
    {target.id}
  </EuiLink>
);

export const ControlRelationPanel = ({ controlId }: { controlId: string }) => {
  const relation = getControlRelation(controlId);

  if (!relation) {
    return null;
  }

  const rows = [
    { title: 'Qué regula el control', text: relation.regulates },
    { title: 'Qué aporta Wazuh', text: relation.wazuh },
    { title: 'Qué mide Power ENS', text: relation.powerEns },
    ...(relation.outside ? [{ title: 'A tener en cuenta', text: relation.outside }] : []),
  ];

  return (
    <EuiPanel hasBorder color='subdued' paddingSize='m'>
      <EuiAccordion
        id={`control-relation-${controlId}`}
        initialIsOpen
        paddingSize='s'
        buttonContent={<strong>{`Cómo se relaciona ${controlId} con Wazuh`}</strong>}
      >
        {rows.map(row => (
          <EuiFlexGroup key={row.title} gutterSize='m' responsive={false} wrap style={{ padding: '4px 0' }}>
            <EuiFlexItem grow={false} style={{ width: 170 }}>
              <EuiText size='s'>
                <strong>{row.title}</strong>
              </EuiText>
            </EuiFlexItem>
            <EuiFlexItem style={{ minWidth: 280 }}>
              <EuiText size='s'>{row.text}</EuiText>
            </EuiFlexItem>
          </EuiFlexGroup>
        ))}
      </EuiAccordion>
    </EuiPanel>
  );
};

const LinkedItems = ({
  kind,
  items,
  onOpen,
}: {
  kind: GuideTarget['kind'];
  items: ENSLinkedItem[];
  onOpen: (target: GuideTarget) => void;
}) => (
  <ul>
    {items.map(item => (
      <li key={item.id}>
        <GuideCode target={{ kind, id: item.id }} onOpen={onOpen} /> {item.title}
      </li>
    ))}
  </ul>
);

const RequirementBody = ({
  controlId,
  id,
  onOpen,
}: {
  controlId: string;
  id: string;
  onOpen: (target: GuideTarget) => void;
}) => {
  const guide = describeRequirementGuide(controlId, id);

  if (!guide) {
    return <EuiText size='s'>{id} no figura en el catálogo de este control.</EuiText>;
  }

  return (
    <>
      <Section title='Qué exige la norma'>
        <p>{guide.normText}</p>
      </Section>
      {guide.interpretation && (
        <Section title='Cómo lo lee Power ENS'>
          <p>{guide.interpretation}</p>
        </Section>
      )}
      {guide.conditions.length > 0 && (
        <Section title='Cuándo se considera incumplido, según el auditor'>
          {guide.conditions.map(condition => (
            <div key={condition.text} style={{ marginBottom: 12 }}>
              <p style={{ marginBottom: 4 }}>
                <EuiBadge color='hollow'>Severidad {condition.severity.toLowerCase()}</EuiBadge> {condition.text}
              </p>
              <EuiText size='xs' color='subdued'>
                {condition.detection}
              </EuiText>
            </div>
          ))}
        </Section>
      )}
      {guide.evidences.length > 0 && (
        <Section title='Evidencias que lo demuestran'>
          <LinkedItems kind='evidence' items={guide.evidences} onOpen={onOpen} />
        </Section>
      )}
      {guide.parameters.length > 0 && (
        <Section title='Parámetros que utiliza'>
          <ul>
            {guide.parameters.map(parameter => (
              <li key={parameter.id}>
                <strong>{parameter.id}</strong> {parameter.title}
              </li>
            ))}
          </ul>
        </Section>
      )}
      <EuiText size='xs' color='subdued'>
        El texto de la norma es literal del RD 311/2022. Las condiciones de incumplimiento son criterio del auditor, sin valor normativo.
      </EuiText>
    </>
  );
};

const EvidenceBody = ({
  controlId,
  id,
  onOpen,
}: {
  controlId: string;
  id: string;
  onOpen: (target: GuideTarget) => void;
}) => {
  const guide = describeEvidenceGuide(controlId, id);

  if (!guide) {
    return <EuiText size='s'>{id} no figura en el catálogo de este control.</EuiText>;
  }

  return (
    <>
      {guide.question && (
        <Section title='Qué responde'>
          <p>{guide.question}</p>
        </Section>
      )}
      <Section title='Cómo la juzga Power ENS'>
        <p>{guide.measurement}</p>
      </Section>
      {guide.proof ? (
        <Section title='Qué pide el auditor'>
          <p>{guide.proof}</p>
        </Section>
      ) : (
        <Section title='Qué pide el auditor'>
          <p>Esta evidencia es propia de Power ENS: no tiene equivalente en la plantilla del auditor.</p>
        </Section>
      )}
      {guide.setup && (
        <Section title={`Cómo se obtiene, según el auditor${guide.module ? ` (${guide.module})` : ''}`}>
          <p>{guide.setup}</p>
        </Section>
      )}
      {guide.requirements.length > 0 && (
        <Section title='Requisitos que cubre'>
          <LinkedItems kind='requirement' items={guide.requirements} onOpen={onOpen} />
        </Section>
      )}
      <EuiText size='xs' color='subdued'>
        Lo que indica el auditor es una propuesta técnica, sin valor normativo. Lo que se evalúa hoy es lo que describe «Cómo la juzga Power ENS».
      </EuiText>
    </>
  );
};

export const ControlGuideFlyout = ({
  controlId,
  target,
  status,
  onOpen,
  onClose,
  onShowFacts,
}: {
  controlId: string;
  target: GuideTarget;
  status?: string;
  onOpen: (target: GuideTarget) => void;
  onClose: () => void;
  onShowFacts: () => void;
}) => {
  const title =
    target.kind === 'requirement'
      ? describeRequirementGuide(controlId, target.id)?.title
      : describeEvidenceGuide(controlId, target.id)?.title;

  return (
    <EuiFlyout size='m' ownFocus onClose={onClose} aria-labelledby='ens-control-guide-title'>
      <EuiFlyoutHeader hasBorder>
        <EuiFlexGroup gutterSize='s' alignItems='center' responsive={false} wrap>
          <EuiFlexItem grow={false}>
            <EuiBadge color='hollow'>{target.id}</EuiBadge>
          </EuiFlexItem>
          {status && (
            <EuiFlexItem grow={false}>
              <EuiBadge color={statusBadgeColor(status)}>{statusLabel(status)}</EuiBadge>
            </EuiFlexItem>
          )}
        </EuiFlexGroup>
        <EuiSpacer size='s' />
        <EuiTitle size='s'>
          <h2 id='ens-control-guide-title'>{title || target.id}</h2>
        </EuiTitle>
      </EuiFlyoutHeader>
      <EuiFlyoutBody>
        {target.kind === 'requirement' ? (
          <RequirementBody controlId={controlId} id={target.id} onOpen={onOpen} />
        ) : (
          <>
            <EvidenceBody controlId={controlId} id={target.id} onOpen={onOpen} />
            <EuiSpacer size='m' />
            <EuiButtonEmpty size='s' flush='left' iconType='list' onClick={onShowFacts}>
              Ver los hechos en Evidencias
            </EuiButtonEmpty>
          </>
        )}
      </EuiFlyoutBody>
    </EuiFlyout>
  );
};
