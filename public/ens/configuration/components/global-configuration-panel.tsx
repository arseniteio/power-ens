import React, {
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  EuiButton,
  EuiCallOut,
  EuiFieldText,
  EuiFormRow,
  EuiPanel,
  EuiSelect,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';

import {
  updateActiveGlobalConfiguration,
} from '../../../../common/ens/configuration/services';
import {
  ENSGlobalConfiguration,
  ENSLevel,
} from '../../../../common/ens/configuration/types';
import { ENSCatalog } from '../../../../common/ens/catalog';
import type { ENSLevelDimension } from '../../../../common/ens/catalog/types';
import {
  ENS_DIMENSION_LEVEL_KEYS,
  ENS_DIMENSION_NAMES,
  ENS_DIMENSIONS,
  describeDimensionsAboveENSLevel,
  listControlDimensions,
} from '../../../../common/ens/core/control-level';

interface GlobalConfigurationPanelProps {
  configuration: ENSGlobalConfiguration;
  onConfigurationSaved: () => void;
}

const ensLevelOptions = [
  {
    value: 'BAJO',
    text: 'BAJO',
  },
  {
    value: 'MEDIO',
    text: 'MEDIO',
  },
  {
    value: 'ALTO',
    text: 'ALTO',
  },
];

// Dimension level. The first option leaves the key ABSENT (never empty or `null`): the control then uses the global ENS level.
const dimensionLevelOptions = [
  {
    value: '',
    text: 'El mismo que el nivel ENS',
  },
  ...ensLevelOptions,
];

// One short help line per dimension: which catalog controls follow it.
const describeDimensionUse = (dimension: ENSLevelDimension): string => {
  const users = ENSCatalog.filter(control => listControlDimensions(control).includes(dimension)).map(control => control.id);

  return users.length
    ? `Lo usan ${users.join(', ')}. Sin declarar, se usa el nivel ENS.`
    : 'Ningún control lo usa todavía. Sin declarar, se usa el nivel ENS.';
};

const evaluationPeriodOptions = [
  {
    value: 'Últimas 24 horas',
    text: 'Últimas 24 horas',
  },
  {
    value: 'Últimos 7 días',
    text: 'Últimos 7 días',
  },
  {
    value: 'Últimos 30 días',
    text: 'Últimos 30 días',
  },
  {
    value: 'Últimos 90 días',
    text: 'Últimos 90 días',
  },
];

const reportLanguageOptions = [
  {
    value: 'es',
    text: 'Español',
  },
  {
    value: 'en',
    text: 'Inglés',
  },
];

export const GlobalConfigurationPanel = ({
  configuration,
  onConfigurationSaved,
}: GlobalConfigurationPanelProps) => {
  const [
    draftConfiguration,
    setDraftConfiguration,
  ] = useState<ENSGlobalConfiguration>(
    configuration
  );

  const [
    isSaving,
    setIsSaving,
  ] = useState(false);

  const [
    saveError,
    setSaveError,
  ] = useState<string | undefined>();

  const [
    saveSuccess,
    setSaveSuccess,
  ] = useState<string | undefined>();

  useEffect(() => {
    setDraftConfiguration(
      configuration
    );

    setSaveError(undefined);
    setSaveSuccess(undefined);
  }, [configuration]);

  const hasChanges =
    useMemo(
      () =>
        JSON.stringify(
          draftConfiguration
        ) !==
        JSON.stringify(
          configuration
        ),
      [
        draftConfiguration,
        configuration,
      ]
    );

  const updateField = (
    field: keyof ENSGlobalConfiguration,
    value: string
  ) => {
    setDraftConfiguration(
      currentConfiguration => {
        const nextConfiguration = {
          ...currentConfiguration,
          [field]: value,
        } as ENSGlobalConfiguration;

        // An optional field without a value is REMOVED: an absent key is what the validator accepts as "not
        // declared".
        if (
          !value &&
          (Object.values(ENS_DIMENSION_LEVEL_KEYS) as string[]).includes(field)
        ) {
          delete nextConfiguration[field];
        }

        return nextConfiguration;
      }
    );

    setSaveError(undefined);
    setSaveSuccess(undefined);
  };


  const levelsError = describeDimensionsAboveENSLevel(draftConfiguration);

  const handleSave = async () => {
    setIsSaving(true);
    setSaveError(undefined);
    setSaveSuccess(undefined);

    try {
      const persistedConfiguration =
        await updateActiveGlobalConfiguration(
          draftConfiguration
        );

      setDraftConfiguration(
        persistedConfiguration.global
      );

      setSaveSuccess(
        'La configuración global ENS se ha guardado correctamente.'
      );

      onConfigurationSaved();
    } catch (error) {
      setSaveError(
        error instanceof Error
          ? error.message
          : 'No se pudo guardar la configuración global ENS.'
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <EuiPanel
      paddingSize='m'
      color='subdued'
    >
      <EuiTitle size='s'>
        <h3>
          Configuración global de evaluación
        </h3>
      </EuiTitle>

      <EuiSpacer size='s' />

      <EuiText
        size='s'
        color='subdued'
      >
        <p>
          Nivel ENS y periodo de evaluación.
        </p>
      </EuiText>

      <EuiSpacer size='m' />

      {saveError && (
        <>
          <EuiCallOut
            title='No se pudo guardar la configuración'
            color='danger'
            iconType='alert'
          >
            <p>{saveError}</p>
          </EuiCallOut>

          <EuiSpacer size='m' />
        </>
      )}

      {saveSuccess && (
        <>
          <EuiCallOut
            title='Configuración guardada'
            color='success'
            iconType='check'
          >
            <p>{saveSuccess}</p>
          </EuiCallOut>

          <EuiSpacer size='m' />
        </>
      )}

      <EuiFormRow
        label='Cliente'
        helpText='Nombre del cliente o entidad evaluada.'
        fullWidth
      >
        <EuiFieldText
          value={draftConfiguration.clientName}
          onChange={event =>
            updateField(
              'clientName',
              event.target.value
            )
          }
          fullWidth
        />
      </EuiFormRow>

      <EuiFormRow
        label='Organización'
        helpText='Unidad, departamento u organización incluida en el alcance.'
        fullWidth
      >
        <EuiFieldText
          value={draftConfiguration.organization}
          onChange={event =>
            updateField(
              'organization',
              event.target.value
            )
          }
          fullWidth
        />
      </EuiFormRow>

      <EuiFormRow
        label='Nivel ENS'
        helpText='Categoría del sistema: el nivel más alto de sus dimensiones. La usan los controles que se aplican por categoría.'
        fullWidth
      >
        <EuiSelect
          options={ensLevelOptions}
          value={draftConfiguration.ensLevel}
          onChange={event =>
            updateField(
              'ensLevel',
              event.target.value
            )
          }
          fullWidth
        />
      </EuiFormRow>

      {ENS_DIMENSIONS.map(dimension => {
        const key = ENS_DIMENSION_LEVEL_KEYS[dimension];

        return (
          <EuiFormRow
            key={key}
            label={`Nivel de ${ENS_DIMENSION_NAMES[dimension]} (${dimension})`}
            helpText={describeDimensionUse(dimension)}
            fullWidth
          >
            <EuiSelect
              options={dimensionLevelOptions}
              value={draftConfiguration[key] || ''}
              onChange={event => updateField(key, event.target.value)}
              fullWidth
            />
          </EuiFormRow>
        );
      })}

      {levelsError && (
        <>
          <EuiCallOut
            title='Niveles incoherentes'
            color='danger'
            iconType='alert'
            size='s'
          >
            <p>{levelsError}</p>
          </EuiCallOut>

          <EuiSpacer size='m' />
        </>
      )}

      <EuiFormRow
        label='Versión ENS'
        helpText='Marco normativo utilizado para la evaluación.'
        fullWidth
      >
        <EuiFieldText
          value={draftConfiguration.ensVersion}
          onChange={event =>
            updateField(
              'ensVersion',
              event.target.value
            )
          }
          fullWidth
        />
      </EuiFormRow>

      <EuiFormRow
        label='Descripción del alcance (informes)'
        helpText='Texto que describe en los informes los sistemas, servicios o activos evaluados.'
        fullWidth
      >
        <EuiFieldText
          value={draftConfiguration.scope}
          onChange={event =>
            updateField(
              'scope',
              event.target.value
            )
          }
          fullWidth
        />
      </EuiFormRow>

      <EuiFormRow
        label='Periodo de evaluación'
        helpText='Ventana temporal usada para calcular cumplimiento y evidencias.'
        fullWidth
      >
        <EuiSelect
          options={evaluationPeriodOptions}
          value={
            draftConfiguration.evaluationPeriod
          }
          onChange={event =>
            updateField(
              'evaluationPeriod',
              event.target.value
            )
          }
          fullWidth
        />
      </EuiFormRow>

      <EuiFormRow
        label='Zona horaria'
        helpText='Zona utilizada para interpretar eventos y fechas.'
        fullWidth
      >
        <EuiFieldText
          value={draftConfiguration.timezone}
          onChange={event =>
            updateField(
              'timezone',
              event.target.value
            )
          }
          fullWidth
        />
      </EuiFormRow>

      <EuiFormRow
        label='Idioma de informes'
        helpText='Idioma utilizado en los informes Power ENS.'
        fullWidth
      >
        <EuiSelect
          options={reportLanguageOptions}
          value={
            draftConfiguration.reportLanguage
          }
          onChange={event =>
            updateField(
              'reportLanguage',
              event.target.value
            )
          }
          fullWidth
        />
      </EuiFormRow>

      <EuiFormRow
        label='Política aplicada'
        helpText='Política ENS o política interna activa.'
        fullWidth
      >
        <EuiFieldText
          value={draftConfiguration.activePolicy}
          onChange={event =>
            updateField(
              'activePolicy',
              event.target.value
            )
          }
          fullWidth
        />
      </EuiFormRow>

      <EuiSpacer size='m' />

      <EuiButton
        fill
        isLoading={isSaving}
        disabled={
          isSaving ||
          !hasChanges ||
          Boolean(levelsError)
        }
        onClick={handleSave}
      >
        Guardar configuración global
      </EuiButton>
    </EuiPanel>
  );
};
