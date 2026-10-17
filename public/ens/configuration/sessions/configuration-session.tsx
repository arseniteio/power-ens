import React, { useEffect, useMemo, useState } from 'react';
import {
  EuiAccordion,
  EuiButton,
  EuiCallOut,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';

import { ENSControlForm, parameterAnchorId } from '../form-engine';
import { applyENSControlParameterValues } from '../engine';
import {
  updateActiveControlConfiguration,
  validateControlParameterValues,
} from '../services';
import {
  ENSControlConfiguration,
  ENSControlParameterValues,
} from '../types';

interface ConfigurationSessionProps {
  control: ENSControlConfiguration;
  onConfigurationSaved: () => void;
  // Qué parámetros se enseñan arriba (por defecto, todos) y cuáles en un
  // desplegable aparte, con su título. Se guarda SIEMPRE el control entero:
  // filtrar lo que se enseña no puede borrar lo que no se enseña.
  parameterIds?: string[];
  secondaryParameterIds?: string[];
  secondaryTitle?: string;
  secondaryDescription?: string;
  // El parámetro que pide la URL: se abre su desplegable y se lleva a la vista.
  focusParameterId?: string;
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
  parameterIds,
  secondaryParameterIds,
  secondaryTitle,
  secondaryDescription,
  focusParameterId,
}: ConfigurationSessionProps) => {
  const mainParameters = parameterIds
    ? control.parameters.filter(parameter => parameterIds.includes(parameter.id))
    : control.parameters;

  const secondaryParameters = secondaryParameterIds
    ? control.parameters.filter(parameter => secondaryParameterIds.includes(parameter.id))
    : [];

  useEffect(() => {
    if (!focusParameterId || typeof document === 'undefined') {
      return;
    }

    const element = document.getElementById(
      parameterAnchorId(control.controlId, focusParameterId)
    );

    element?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
  }, [control.controlId, focusParameterId]);

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

  // Motivos por los que el guardado se ha rechazado sin llegar a salir de la
  // pantalla. Van aparte de `saveError` (errores del servidor) porque el arreglo
  // es distinto: aquí el auditor corrige un campo, allí reintenta.
  const [valueIssues, setValueIssues] =
    useState<string[]>([]);

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

    // Un valor inválido se rechaza aquí, con el motivo. Guardarlo y dejar que el
    // fallo reaparezca luego como un control degradado sin explicación es lo que
    // había que dejar de hacer: la ausencia se arregla rellenando, esto se
    // arregla corrigiendo, y el auditor tiene que poder distinguirlo.
    const issues = validateControlParameterValues(
      control,
      values
    );

    if (issues.length > 0) {
      setValueIssues(
        issues.map(
          issue =>
            `${issue.parameterId} · ${issue.label}: ${issue.reason}.`
        )
      );
      setSaveError(undefined);

      return;
    }

    setValueIssues([]);
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
    setValueIssues([]);
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
        parameters={mainParameters}
        values={values}
        onChange={handleParameterChange}
      />

      {secondaryParameters.length > 0 && (
        <>
          <EuiSpacer size='m' />

          <EuiAccordion
            id={`ens-config-secondary-${control.controlId}`}
            buttonContent={secondaryTitle || 'Otros parámetros'}
            initialIsOpen={
              !!focusParameterId &&
              secondaryParameters.some(parameter => parameter.id === focusParameterId)
            }
            paddingSize='m'
          >
            {secondaryDescription && (
              <EuiText size='s' color='subdued'>
                <p>{secondaryDescription}</p>
              </EuiText>
            )}

            <ENSControlForm
              parameters={secondaryParameters}
              values={values}
              onChange={handleParameterChange}
            />
          </EuiAccordion>
        </>
      )}

      <EuiSpacer size='m' />

      {valueIssues.length > 0 && (
        <>
          <EuiCallOut
            title='Hay valores que no se pueden guardar'
            color='danger'
            iconType='alert'
          >
            <ul>
              {valueIssues.map(issue => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          </EuiCallOut>

          <EuiSpacer size='m' />
        </>
      )}

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
