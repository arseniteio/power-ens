import { ENSNormalizedEvent } from '../../data-source/types';
import {
  ImpactEventSeverity,
  ImpactEventsModel,
} from '../models/impact-events.model';

type ImpactMetadata = {
  label: string;
  description: string;
  severity: ImpactEventSeverity;
};

const aliases: Record<string, string> = {
  backup_success: 'backup_ok',
  restore_success: 'restore_ok',
};

const metadata: Record<string, ImpactMetadata> = {
  backup_ok: {
    label: 'Copias realizadas correctamente',
    description: 'Se han detectado copias de seguridad válidas.',
    severity: 'success',
  },
  backup_missing: {
    label: 'Copias de seguridad ausentes',
    description: 'No se ha detectado una copia válida dentro del periodo esperado.',
    severity: 'error',
  },
  backup_error: {
    label: 'Errores de copia',
    description: 'Se han detectado errores durante procesos de copia.',
    severity: 'error',
  },
  backup_warning: {
    label: 'Advertencias de copia',
    description: 'Se han detectado advertencias durante procesos de copia.',
    severity: 'warning',
  },
  backup_timeout: {
    label: 'Tiempos de espera de copia',
    description: 'Se han detectado procesos de copia que excedieron el tiempo permitido.',
    severity: 'error',
  },
  backup_disk_full: {
    label: 'Espacio insuficiente',
    description: 'Se ha detectado falta de espacio durante una copia.',
    severity: 'error',
  },
  backup_network_error: {
    label: 'Errores de red en copias',
    description: 'Se han detectado errores de conectividad durante una copia.',
    severity: 'error',
  },
  restore_ok: {
    label: 'Restauraciones validadas',
    description: 'Se han detectado restauraciones verificadas correctamente.',
    severity: 'success',
  },
  restore_missing: {
    label: 'Pruebas de restauración ausentes',
    description: 'No se ha detectado una prueba de restauración válida.',
    severity: 'error',
  },
  restore_error: {
    label: 'Errores de restauración',
    description: 'Se han detectado fallos durante una restauración.',
    severity: 'error',
  },
  retention_configured: {
    label: 'Retención configurada',
    description: 'Se ha detectado una configuración de retención verificable.',
    severity: 'success',
  },
  backup_modified: {
    label: 'Configuración de copia modificada',
    description: 'Se ha detectado un cambio en la configuración o repositorio de copias.',
    severity: 'warning',
  },
  backup_deleted: {
    label: 'Copias eliminadas',
    description: 'Se ha detectado eliminación de contenido del repositorio de copias.',
    severity: 'error',
  },
  backup_ransomware: {
    label: 'Actividad anómala en copias',
    description: 'Se ha detectado actividad compatible con alteración masiva o ransomware.',
    severity: 'error',
  },
  encfp_changed: {
    label: 'Fingerprint de cifrado modificado',
    description: 'Se ha detectado un cambio en el fingerprint de cifrado.',
    severity: 'error',
  },
  authorized_access: {
    label: 'Accesos autorizados',
    description: 'Se han detectado accesos autorizados al repositorio.',
    severity: 'success',
  },
  unauthorized_access: {
    label: 'Accesos no autorizados',
    description: 'Se han detectado accesos no autorizados al repositorio.',
    severity: 'error',
  },
  offsite_success: {
    label: 'Copias alternativas correctas',
    description: 'Se ha detectado una copia válida en ubicación alternativa.',
    severity: 'success',
  },
  offsite_missing: {
    label: 'Copia alternativa ausente',
    description: 'No se ha detectado la copia alternativa requerida.',
    severity: 'error',
  },
  offsite_error: {
    label: 'Error en copia alternativa',
    description: 'Se ha detectado un error en la copia alternativa.',
    severity: 'error',
  },
  decoder_ok: {
    label: 'Logs interpretados correctamente',
    description: 'Los logs de copia han sido interpretados correctamente.',
    severity: 'success',
  },
};

const canonicalEventKey = (
  event: ENSNormalizedEvent
): string => {
  const separatorIndex =
    event.id.indexOf('#');

  const eventId =
    separatorIndex >= 0
      ? event.id.slice(0, separatorIndex)
      : event.id;

  return `${eventId}|${event.timestamp}`;
};

const operationalEventType = (
  event: ENSNormalizedEvent
): string | undefined => {
  const eventType = String(
    event.eventType || ''
  )
    .trim()
    .toLowerCase();

  const resolved =
    aliases[eventType] || eventType;

  return metadata[resolved]
    ? resolved
    : undefined;
};

export const buildImpactEventsModel = (
  events: ENSNormalizedEvent[] = []
): ImpactEventsModel => {
  const uniqueEvents =
    new Map<string, string>();

  events.forEach(event => {
    if (event.isSynthetic) {
      return;
    }

    const eventType =
      operationalEventType(event);

    if (!eventType) {
      return;
    }

    const eventKey =
      canonicalEventKey(event);

    if (!uniqueEvents.has(eventKey)) {
      uniqueEvents.set(
        eventKey,
        eventType
      );
    }
  });

  const grouped = Array.from(
    uniqueEvents.values()
  ).reduce<Record<string, number>>(
    (acc, eventType) => {
      acc[eventType] =
        (acc[eventType] || 0) + 1;

      return acc;
    },
    {}
  );

  const maxCount = Math.max(
    ...Object.values(grouped),
    1
  );

  const rows = Object.entries(grouped)
    .map(([eventType, count]) => ({
      id: eventType,
      label: metadata[eventType].label,
      description:
        metadata[eventType].description,
      severity:
        metadata[eventType].severity,
      count,
      percent: Math.round(
        (count * 100) / maxCount
      ),
    }))
    .sort(
      (a, b) => b.count - a.count
    )
    .slice(0, 5);

  return {
    title:
      'EVENTOS OPERATIVOS ENS RELEVANTES',
    rows,
  };
};
