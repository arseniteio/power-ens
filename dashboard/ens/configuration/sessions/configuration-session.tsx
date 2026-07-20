import React, { useMemo, useState } from 'react';
import {
  EuiButton,
  EuiCallOut,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';

import { ENSControlForm } from '../form-engine';
import { applyENSControlParameterValues } from '../engine';
import {
  updateActiveControlConfiguration,
} from '../services';
import {
  ENSControlConfiguration,
  ENSControlParameterValues,
} from '../types';

interface ConfigurationSessionProps {
  control: ENSControlConfiguration;
  onConfigurationSaved: () => void;
}

const resolveSaveError = (
  error: unknown
): string => {
  if (
    error instanceof Error &&
    error.message.trim()
  ) {
    return error.message.trim();
  }

  if (
    typeof error === 'string' &&
    error.trim()
  ) {
    return error.trim();
  }

  return 'No se pudo guardar la configuración ENS.';
};

export const ConfigurationSession = ({
  control,
  onConfigurationSaved,
}: ConfigurationSessionProps) => {
  const initialValues = useMemo(
    () =>
      control.parameters.reduce<
        ENSControlParameterValues
      >((acc, parameter) => {
        acc[parameter.name] =
          parameter.value;

        return acc;
      }, {}),
    [control]
  );

  const [values, setValues] =
    useState<ENSControlParameterValues>(
      initialValues
    );

  const [savedValues, setSavedValues] =
    useState<
      ENSControlParameterValues | undefined
    >();

  const [isSaving, setIsSaving] =
    useState(false);

  const [saveError, setSaveError] =
    useState<string | undefined>();

  const handleParameterChange = (
    parameterName: string,
    value:
      ENSControlConfiguration[
        'parameters'
      ][number]['value']
  ) => {
    setValues(previous => ({
      ...previous,
      [parameterName]: value,
    }));
  };

  const handleSave = async () => {
    if (isSaving) {
      return;
    }

    setIsSaving(true);
    setSaveError(undefined);

    try {
      const configuredControl =
        applyENSControlParameterValues(
          control,
          values
        );

      const persistedConfiguration =
        await updateActiveControlConfiguration(
          configuredControl
        );

      const persistedControl =
        persistedConfiguration.controls.find(
          item =>
            item.controlId ===
            configuredControl.controlId
        );

      if (!persistedControl) {
        throw new Error(
          `El servidor no devolvió el control ${configuredControl.controlId}.`
        );
      }

      const persistedValues =
        persistedControl.parameters.reduce<
          ENSControlParameterValues
        >((acc, parameter) => {
          acc[parameter.name] =
            parameter.value;

          return acc;
        }, {});

      setValues(persistedValues);
      setSavedValues(persistedValues);
      onConfigurationSaved();
    } catch (error) {
      setSaveError(
        resolveSaveError(error)
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleEdit = () => {
    setSavedValues(undefined);
    setSaveError(undefined);
  };

  if (savedValues) {
    return (
      <EuiPanel
        paddingSize='m'
        color='subdued'
      >
        <EuiTitle size='s'>
          <h3>Configuración guardada</h3>
        </EuiTitle>

        <EuiSpacer size='m' />

        {control.parameters.map(
          parameter => (
            <EuiText
              size='s'
              key={parameter.id}
            >
              <p>
                <strong>
                  {parameter.id} ·{' '}
                  {parameter.label}:
                </strong>{' '}
                {String(
                  savedValues[
                    parameter.name
                  ] ?? 'Sin valor'
                )}
              </p>
            </EuiText>
          )
        )}

        <EuiSpacer size='m' />

        <EuiButton
          onClick={handleEdit}
        >
          Editar configuración
        </EuiButton>
      </EuiPanel>
    );
  }

  return (
    <>
      <ENSControlForm
        parameters={control.parameters}
        values={values}
        onChange={handleParameterChange}
      />

      <EuiSpacer size='m' />

      {saveError && (
        <>
          <EuiCallOut
            title='No se pudo guardar la configuración ENS'
            color='danger'
            iconType='alert'
          >
            <p>{saveError}</p>
          </EuiCallOut>

          <EuiSpacer size='m' />
        </>
      )}

      <EuiButton
        fill
        onClick={handleSave}
        isLoading={isSaving}
        disabled={isSaving}
      >
        {isSaving
          ? 'Guardando configuración...'
          : 'Guardar configuración'}
      </EuiButton>
    </>
  );
};
