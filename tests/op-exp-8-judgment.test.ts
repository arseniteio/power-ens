/**
 * op.exp.8 · el juicio del registro de la actividad.
 *
 *     npx tsx tests/op-exp-8-judgment.test.ts
 *
 * Mismo montaje que sus hermanas: TypeScript suelto con su propio comprobador.
 *
 * Qué se prueba. La policy de op.exp.8 separa DOS PLANOS: el del servidor
 * (cada agente, y el propio manager como servidor) y el central (solo el
 * manager, agent.id=000). Un requisito se mide en cada fila con las evidencias
 * de su plano, y lo que es solo central no aplica en la fila de un agente. Cada
 * caso mueve UN eje y lleva al lado la REVERSIÓN: el MISMO evento del agente con
 * otro parámetro, u otro `now`, cambia el veredicto.
 *
 * Los eventos NO son inventados: son la salida real de los recolectores en
 * `wazuh-real` (agente Linux) y en `wazuh4` (el manager), del 26/09/2026, en
 * modo --prueba. Pasan por el normalizador real como alertas de alerts.json.
 */
import { opExp8PolicyDefinition } from '../public/ens/core/policy-runtime/policies/op-exp-8.policy';
import { buildPolicyContext } from '../public/ens/core/policy-runtime/policy-context-builder';
import { opExp8CatalogDefinition } from '../public/ens/catalog/op-exp-8';
import { opExp8Configuration } from '../public/ens/configuration/data/op-exp-8-parameters';
import { normalizeWazuhAlerts } from '../public/ens/core/data-source/data-source-engine';
import { resolveEvidenceForControl } from '../public/ens/core/evidence/engine';
import { getStateFactEventTypes, keepLatestRunStateFacts } from '../public/ens/core/evidence/state-facts';
import { applyPolicyDecisionsToEvidences } from '../public/ens/core/evaluation/policy-evidence-bridge';
import { evaluateRequirement } from '../public/ens/core/evaluation/requirement/requirement-evaluator';
import type {
  ENSControlConfiguration,
  ENSLevel,
} from '../public/ens/configuration/types';
import type { ENSNormalizedEvent } from '../public/ens/core/data-source/types';

declare const process: { exit(code: number): void };

// --- comprobador mínimo ----------------------------------------------------

const fallos: string[] = [];

const comprueba = (nombre: string, condicion: boolean, detalle: unknown = ''): void => {
  if (condicion) {
    console.log(`  ok   ${nombre}`);

    return;
  }

  fallos.push(nombre);
  console.log(`  FALLA ${nombre}${detalle !== '' ? ` — ${String(detalle)}` : ''}`);
};

const bloque = (titulo: string): void => console.log(`\n${titulo}`);

// --- los hechos reales -----------------------------------------------------

// wazuh-real (agente 024, Ubuntu 24.04), recolector del agente.
const REAL_WAZUH_REAL: Record<string, unknown>[] = [
  {"ensfacil": "op.exp.8", "ts": "2026-09-26T19:11:47Z", "host": "wazuh-real", "event": "audit_log_status", "evidence_id": "EV-01", "requisito": "op.exp.8.1", "plano": "sistema", "fuente": "auditd", "activo": "si", "habilitado_kernel": "1", "reglas_cargadas": 80, "ruta": "/var/log/audit/audit.log"},
  {"ensfacil": "op.exp.8", "ts": "2026-09-26T19:11:47Z", "host": "wazuh-real", "event": "audit_log_status", "evidence_id": "EV-01", "requisito": "op.exp.8.1", "plano": "sistema", "fuente": "journald", "activo": "si", "almacenamiento": "persistente"},
  {"ensfacil": "op.exp.8", "ts": "2026-09-26T19:11:47Z", "host": "wazuh-real", "event": "audit_log_status", "evidence_id": "EV-01", "requisito": "op.exp.8.1", "plano": "sistema", "fuente": "rsyslog", "activo": "si"},
  {"ensfacil": "op.exp.8", "ts": "2026-09-26T19:11:47Z", "host": "wazuh-real", "event": "agent_status", "evidence_id": "EV-02", "requisito": "op.exp.8.2", "plano": "sistema", "estado_conexion": "connected", "ultimo_keepalive": "2026-09-26T19:11:42Z", "ultimo_ack": "2026-09-26T19:11:42Z", "mensajes_enviados": "182786", "mensajes_en_buffer": "0"},
  {"ensfacil": "op.exp.8", "ts": "2026-09-26T19:11:47Z", "host": "wazuh-real", "event": "audit_record_fields", "evidence_id": "EV-03", "requisito": "op.exp.8.1", "plano": "sistema", "fuente": "auditd", "ruta": "/var/log/audit/audit.log", "muestra": 500, "con_usuario": 500, "con_fecha_hora": 500, "con_objeto": 489, "con_tipo_evento": 500, "con_resultado": 500, "campos_ausentes": "-"},
  {"ensfacil": "op.exp.8", "ts": "2026-09-26T19:11:47Z", "host": "wazuh-real", "event": "time_sync_status", "evidence_id": "EV-06", "requisito": "op.exp.8.r2.1", "plano": "sistema", "servicio": "systemd-timesyncd", "sincronizado": "si", "fuentes": "ntp.hetzner.com", "autenticacion": "ninguna", "desfase_segundos": "0.001935", "estrato": "2", "vigilancia_cambio_hora": "no", "zona_horaria": "Etc/UTC"},
  {"ensfacil": "op.exp.8", "ts": "2026-09-26T19:11:48Z", "host": "wazuh-real", "event": "log_access_permissions", "evidence_id": "EV-08", "requisito": "op.exp.8.r4.1", "plano": "sistema", "ruta": "/var/log/audit", "propietario": "root", "grupo": "adm", "modo": "750", "acl": "-", "lectura_mundo": "no", "ficheros_examinados": 5, "cuentas": "root,syslog"},
  {"ensfacil": "op.exp.8", "ts": "2026-09-26T19:11:48Z", "host": "wazuh-real", "event": "log_access_permissions", "evidence_id": "EV-08", "requisito": "op.exp.8.r4.1", "plano": "sistema", "ruta": "/var/log/journal", "propietario": "root", "grupo": "systemd-journal", "modo": "2755", "acl": "group:adm:r-x", "lectura_mundo": "no", "ficheros_examinados": 13, "cuentas": "dioni,root,syslog"},
  {"ensfacil": "op.exp.8", "ts": "2026-09-26T19:11:48Z", "host": "wazuh-real", "event": "log_access_permissions", "evidence_id": "EV-08", "requisito": "op.exp.8.r4.1", "plano": "sistema", "ruta": "/var/log/syslog", "propietario": "syslog", "grupo": "adm", "modo": "640", "acl": "-", "lectura_mundo": "no", "ficheros_examinados": 1, "cuentas": "root,syslog"},
  {"ensfacil": "op.exp.8", "ts": "2026-09-26T19:11:48Z", "host": "wazuh-real", "event": "log_access_permissions", "evidence_id": "EV-08", "requisito": "op.exp.8.r4.1", "plano": "sistema", "ruta": "/var/log/auth.log", "propietario": "syslog", "grupo": "adm", "modo": "640", "acl": "-", "lectura_mundo": "no", "ficheros_examinados": 1, "cuentas": "root,syslog"},
  {"ensfacil": "op.exp.8", "ts": "2026-09-26T19:11:48Z", "host": "wazuh-real", "event": "log_access_permissions", "evidence_id": "EV-08", "requisito": "op.exp.8.r4.1", "plano": "sistema", "ruta": "/var/log/ensfacil", "propietario": "root", "grupo": "root", "modo": "750", "acl": "-", "lectura_mundo": "no", "ficheros_examinados": 10, "cuentas": "root"},
  {"ensfacil": "op.exp.8", "ts": "2026-09-26T19:11:49Z", "host": "wazuh-real", "event": "log_access_permissions", "evidence_id": "EV-08", "requisito": "op.exp.8.r4.1", "plano": "sistema", "ruta": "/var/ossec/logs", "propietario": "wazuh", "grupo": "wazuh", "modo": "770", "acl": "-", "lectura_mundo": "no", "ficheros_examinados": 2, "cuentas": "root,wazuh"},
  {"ensfacil": "op.exp.8", "ts": "2026-09-26T19:11:49Z", "host": "wazuh-real", "event": "collector_run", "resultado": "completada", "evidencias_cubiertas": "EV-01,EV-02,EV-03,EV-06,EV-08", "tipo_servidor": "linux", "emisor": "recolector"},
];

// wazuh-real, recolector AMPLIADO (26/09, 23:56 UTC, --prueba): lo que las
// reglas de auditd CARGADAS registran por categoría. Se le pone la hora de la
// pasada de las 19:11 para que forme parte de la misma pasada. Es el hecho
// que faltaba: con él, EV-01 ya no puede cumplir por la mera presencia de
// auditd con 80 reglas.
const REAL_COBERTURA_WAZUH_REAL: Record<string, unknown>[] = [
  {"ensfacil": "op.exp.8", "ts": "2026-09-26T19:11:47Z", "host": "wazuh-real", "event": "audit_coverage", "evidence_id": "EV-01", "requisito": "op.exp.8.1", "plano": "sistema", "categoria": "configuracion", "objeto": "rutas", "auditd": "si", "vigiladas": "/etc/ssh,/etc/pam.d,/etc/security,/etc/login.defs,/etc/sudoers,/etc/sudoers.d,/etc/audit,/var/ossec/etc/ossec.conf,/etc/sysctl.conf,/etc/sysctl.d,/etc/apparmor.d,/etc/ufw,/etc/nftables.conf", "sin_vigilar": "/etc/netplan,/etc/hosts,/etc/fstab,/etc/systemd/system,/etc/crontab,/etc/cron.d,/etc/apt/sources.list,/etc/apt/sources.list.d"},
  {"ensfacil": "op.exp.8", "ts": "2026-09-26T19:11:47Z", "host": "wazuh-real", "event": "audit_coverage", "evidence_id": "EV-01", "requisito": "op.exp.8.1", "plano": "sistema", "categoria": "cuentas", "objeto": "rutas", "auditd": "si", "vigiladas": "/etc/group", "sin_vigilar": "/etc/passwd,/etc/shadow,/etc/gshadow"},
  {"ensfacil": "op.exp.8", "ts": "2026-09-26T19:11:47Z", "host": "wazuh-real", "event": "audit_coverage", "evidence_id": "EV-01", "requisito": "op.exp.8.1", "plano": "sistema", "categoria": "privilegios", "objeto": "rutas", "auditd": "si", "vigiladas": "/etc/sudoers,/etc/sudoers.d", "sin_vigilar": "-"},
  {"ensfacil": "op.exp.8", "ts": "2026-09-26T19:11:47Z", "host": "wazuh-real", "event": "audit_coverage", "evidence_id": "EV-01", "requisito": "op.exp.8.1", "plano": "sistema", "categoria": "claves", "objeto": "rutas", "auditd": "si", "vigiladas": "/etc/ssh/ssh_host_rsa_key,/etc/ssh/ssh_host_ecdsa_key,/etc/ssh/ssh_host_ed25519_key,/var/ossec/etc/client.keys", "sin_vigilar": "/etc/ssl/private"},
  {"ensfacil": "op.exp.8", "ts": "2026-09-26T19:11:47Z", "host": "wazuh-real", "event": "audit_coverage", "evidence_id": "EV-01", "requisito": "op.exp.8.1", "plano": "sistema", "categoria": "hora", "objeto": "syscalls", "auditd": "si", "vigiladas": "-", "sin_vigilar": "adjtimex,settimeofday,clock_settime"},
];

// La misma cobertura, completa: lo que saldría con las reglas de op.exp.5,
// op.exp.8 y op.exp.10 cargadas. Solo sirve para los casos que prueban OTRO
// eje de EV-01 y necesitan que este no lo tumbe.
const COBERTURA_COMPLETA = REAL_COBERTURA_WAZUH_REAL.map(l => {
  const todas = [l.vigiladas, l.sin_vigilar].filter(v => v !== '-').join(',');

  return { ...l, vigiladas: todas, sin_vigilar: '-' };
});

// wazuh4 (el manager, agente 000), recolector del manager. El registro de
// revisiones es el de ejemplo de la prueba (el real no existe en el manager).
const REAL_WAZUH4: Record<string, unknown>[] = [
  {"ensfacil": "op.exp.8", "ts": "2026-09-26T19:11:29Z", "host": "Wazuh-4", "event": "audit_log_status", "evidence_id": "EV-01", "requisito": "op.exp.8.1", "plano": "sistema", "fuente": "auditd", "activo": "no_instalado", "reglas_cargadas": 0, "detalle": "auditd no esta instalado: no hay registro de auditoria del sistema"},
  {"ensfacil": "op.exp.8", "ts": "2026-09-26T19:11:29Z", "host": "Wazuh-4", "event": "audit_log_status", "evidence_id": "EV-01", "requisito": "op.exp.8.1", "plano": "sistema", "fuente": "journald", "activo": "si", "almacenamiento": "persistente"},
  {"ensfacil": "op.exp.8", "ts": "2026-09-26T19:11:29Z", "host": "Wazuh-4", "event": "audit_log_status", "evidence_id": "EV-01", "requisito": "op.exp.8.1", "plano": "sistema", "fuente": "rsyslog", "activo": "si"},
  {"ensfacil": "op.exp.8", "ts": "2026-09-26T19:11:29Z", "host": "Wazuh-4", "event": "evidence_state", "evidence_id": "EV-03", "requisito": "op.exp.8.1", "plano": "sistema", "estado": "NO_EVALUABLE", "causa": "COLLECTION", "motivo": "no se puede leer el log de auditoria /var/log/audit/audit.log: sin el no hay registro de auditoria que muestrear"},
  {"ensfacil": "op.exp.8", "ts": "2026-09-26T19:11:29Z", "host": "Wazuh-4", "event": "time_sync_status", "evidence_id": "EV-06", "requisito": "op.exp.8.r2.1", "plano": "sistema", "servicio": "systemd-timesyncd", "sincronizado": "si", "fuentes": "ntp.hetzner.com", "autenticacion": "ninguna", "desfase_segundos": "-0.000259", "estrato": "2", "vigilancia_cambio_hora": "no", "zona_horaria": "Etc/UTC"},
  {"ensfacil": "op.exp.8", "ts": "2026-09-26T19:11:32Z", "host": "Wazuh-4", "event": "log_access_permissions", "evidence_id": "EV-08", "requisito": "op.exp.8.r4.1", "plano": "sistema", "ruta": "/var/log/journal", "propietario": "root", "grupo": "systemd-journal", "modo": "2755", "acl": "group:adm:r-x", "lectura_mundo": "no", "ficheros_examinados": 68, "cuentas": "dioni,fran,root,syslog"},
  {"ensfacil": "op.exp.8", "ts": "2026-09-26T19:11:32Z", "host": "Wazuh-4", "event": "log_access_permissions", "evidence_id": "EV-08", "requisito": "op.exp.8.r4.1", "plano": "sistema", "ruta": "/var/log/syslog", "propietario": "syslog", "grupo": "adm", "modo": "640", "acl": "-", "lectura_mundo": "no", "ficheros_examinados": 1, "cuentas": "root,syslog"},
  {"ensfacil": "op.exp.8", "ts": "2026-09-26T19:11:32Z", "host": "Wazuh-4", "event": "log_access_permissions", "evidence_id": "EV-08", "requisito": "op.exp.8.r4.1", "plano": "sistema", "ruta": "/var/log/auth.log", "propietario": "syslog", "grupo": "adm", "modo": "640", "acl": "-", "lectura_mundo": "no", "ficheros_examinados": 1, "cuentas": "root,syslog"},
  {"ensfacil": "op.exp.8", "ts": "2026-09-26T19:11:32Z", "host": "Wazuh-4", "event": "log_access_permissions", "evidence_id": "EV-08", "requisito": "op.exp.8.r4.1", "plano": "sistema", "ruta": "/var/log/ensfacil", "propietario": "root", "grupo": "wazuh", "modo": "750", "acl": "-", "lectura_mundo": "no", "ficheros_examinados": 6, "cuentas": "root,wazuh"},
  {"ensfacil": "op.exp.8", "ts": "2026-09-26T19:11:37Z", "host": "Wazuh-4", "event": "log_access_permissions", "evidence_id": "EV-08", "requisito": "op.exp.8.r4.1", "plano": "sistema", "ruta": "/var/ossec/logs/alerts", "propietario": "wazuh", "grupo": "wazuh", "modo": "750", "acl": "-", "lectura_mundo": "no", "ficheros_examinados": 200, "cuentas": "root,wazuh"},
  {"ensfacil": "op.exp.8", "ts": "2026-09-26T19:11:42Z", "host": "Wazuh-4", "event": "log_access_permissions", "evidence_id": "EV-08", "requisito": "op.exp.8.r4.1", "plano": "sistema", "ruta": "/var/ossec/logs/archives", "propietario": "wazuh", "grupo": "wazuh", "modo": "750", "acl": "-", "lectura_mundo": "no", "ficheros_examinados": 200, "cuentas": "root,wazuh"},
  {"ensfacil": "op.exp.8", "ts": "2026-09-26T19:11:42Z", "host": "Wazuh-4", "event": "log_access_permissions", "evidence_id": "EV-08", "requisito": "op.exp.8.r4.1", "plano": "sistema", "ruta": "/var/lib/wazuh-indexer", "propietario": "wazuh-indexer", "grupo": "wazuh-indexer", "modo": "750", "acl": "-", "lectura_mundo": "no", "ficheros_examinados": 6, "cuentas": "root,wazuh-indexer"},
  // EV-04 con el recolector del 27/09: el último keepalive de global.db por agente.
  // Formato real de la pasada del 27/09 en wazuh4, con los instantes de esta pasada.
  {"ensfacil": "op.exp.8", "ts": "2026-09-26T19:11:44Z", "host": "Wazuh-4", "event": "agent_keepalive_observed", "evidence_id": "EV-04", "requisito": "op.exp.8.1,op.exp.8.2", "plano": "central", "agente_id": "000", "agente": "Wazuh-4", "estado_conexion": "active", "ultimo_keepalive": "2026-09-26T19:11:44Z", "local": "si", "ultimo_evento": "2026-09-26T19:11:30Z", "eventos_24h": 866},
  {"ensfacil": "op.exp.8", "ts": "2026-09-26T19:11:44Z", "host": "Wazuh-4", "event": "agent_keepalive_observed", "evidence_id": "EV-04", "requisito": "op.exp.8.1,op.exp.8.2", "plano": "central", "agente_id": "024", "agente": "wazuh-real", "estado_conexion": "active", "ultimo_keepalive": "2026-09-26T19:11:00Z", "local": "no", "ultimo_evento": "2026-09-26T19:11:42Z", "eventos_24h": 2875},
  {"ensfacil": "op.exp.8", "ts": "2026-09-26T19:11:44Z", "host": "Wazuh-4", "event": "agent_keepalive_observed", "evidence_id": "EV-04", "requisito": "op.exp.8.1,op.exp.8.2", "plano": "central", "agente_id": "025", "agente": "wazuh-fake", "estado_conexion": "active", "ultimo_keepalive": "2026-09-26T19:11:00Z", "local": "no", "ultimo_evento": "2026-09-26T19:00:02Z", "eventos_24h": 6692},
  {"ensfacil": "op.exp.8", "ts": "2026-09-26T19:11:44Z", "host": "Wazuh-4", "event": "log_review_recorded", "evidence_id": "EV-05", "requisito": "op.exp.8.r1.1", "plano": "central", "registro": "/tmp/ensfacil-dev-op.exp.8/registro-ejemplo.tsv", "revisiones": 2, "ultima_revision": "2026-09-15", "revisor": "rsec", "alcance": "autenticaciones fallidas y sudo", "hallazgos": "dos fuerzas brutas SSH bloqueadas", "referencia": "https://intranet.ejemplo/revisiones/2026-09-15"},
  {"ensfacil": "op.exp.8", "ts": "2026-09-26T19:11:44Z", "host": "Wazuh-4", "event": "log_retention_observed", "evidence_id": "EV-07", "requisito": "op.exp.8.r3.1", "plano": "central", "almacen": "alertas_disco", "ruta": "/var/ossec/logs/alerts", "activo": "si", "mas_antiguo": "2026-06-12", "dias_conservados": "106", "ficheros": 105},
  {"ensfacil": "op.exp.8", "ts": "2026-09-26T19:11:44Z", "host": "Wazuh-4", "event": "log_retention_observed", "evidence_id": "EV-07", "requisito": "op.exp.8.r3.1", "plano": "central", "almacen": "archives_disco", "ruta": "/var/ossec/logs/archives", "activo": "no", "logall": "no", "logall_json": "no", "mas_antiguo": "2026-06-12", "dias_conservados": "106"},
  {"ensfacil": "op.exp.8", "ts": "2026-09-26T19:11:44Z", "host": "Wazuh-4", "event": "evidence_state", "evidence_id": "EV-07", "requisito": "op.exp.8.r3.1", "plano": "central", "estado": "NO_EVALUABLE", "causa": "CONFIGURATION", "motivo": "la retencion de los indices del Wazuh Indexer (politicas ISM sobre wazuh-alerts-*) solo se ve consultando el indexer, y el recolector del manager no usa credenciales por decision del responsable (26/09): la retencion efectiva frente a P-07 queda sin demostrar. En disco el manager conserva alertas desde 2026-06-12 (ver log_retention_observed)"},
  {"ensfacil": "op.exp.8", "ts": "2026-09-26T19:11:44Z", "host": "Wazuh-4", "event": "evidence_state", "evidence_id": "EV-08", "requisito": "op.exp.8.r4.1", "plano": "central", "estado": "NO_EVALUABLE", "causa": "CONFIGURATION", "motivo": "los accesos efectivos a los indices (audit log del plugin de seguridad del Wazuh Indexer) y las cuentas y roles del indexer solo se ven consultando el indexer, y el recolector del manager no usa credenciales por decision del responsable (26/09). Se mide quien puede leer los registros en el disco del manager (log_access_permissions); quien accede a los indices queda sin demostrar"},
  {"ensfacil": "op.exp.8", "ts": "2026-09-26T19:11:44Z", "host": "Wazuh-4", "event": "evidence_state", "evidence_id": "EV-09", "requisito": "op.exp.8.r4.1", "plano": "central", "estado": "NO_EVALUABLE", "causa": "CONFIGURATION", "motivo": "las copias de los registros (snapshots del Wazuh Indexer y su repositorio) solo se ven consultando el indexer, y el recolector del manager no usa credenciales por decision del responsable (26/09): su existencia, frescura y acceso quedan sin demostrar"},
  {"ensfacil": "op.exp.8", "ts": "2026-09-26T19:11:44Z", "host": "Wazuh-4", "event": "correlation_rules_inventory", "evidence_id": "EV-10", "requisito": "op.exp.8.r5.1", "plano": "central", "conjunto": "ensfacil", "ruta": "/var/ossec/etc/rules", "ficheros": 12, "reglas": 212, "reglas_con_mitre": 0, "tecnicas_mitre": 0},
  {"ensfacil": "op.exp.8", "ts": "2026-09-26T19:11:44Z", "host": "Wazuh-4", "event": "correlation_rules_inventory", "evidence_id": "EV-10", "requisito": "op.exp.8.r5.1", "plano": "central", "conjunto": "local", "ruta": "/var/ossec/etc/rules", "ficheros": 1, "reglas": 1, "reglas_con_mitre": 0, "tecnicas_mitre": 0},
  {"ensfacil": "op.exp.8", "ts": "2026-09-26T19:11:45Z", "host": "Wazuh-4", "event": "correlation_rules_inventory", "evidence_id": "EV-10", "requisito": "op.exp.8.r5.1", "plano": "central", "conjunto": "quersystem", "ruta": "/var/ossec/etc/rules", "ficheros": 6, "reglas": 26, "reglas_con_mitre": 7, "tecnicas_mitre": 5},
  {"ensfacil": "op.exp.8", "ts": "2026-09-26T19:11:45Z", "host": "Wazuh-4", "event": "correlation_rules_inventory", "evidence_id": "EV-10", "requisito": "op.exp.8.r5.1", "plano": "central", "conjunto": "wazuh", "ruta": "/var/ossec/ruleset/rules", "ficheros": 167, "reglas": 4510, "reglas_con_mitre": 1013, "tecnicas_mitre": 166},
  {"ensfacil": "op.exp.8", "ts": "2026-09-26T19:11:45Z", "host": "Wazuh-4", "event": "correlation_rules_inventory", "evidence_id": "EV-10", "requisito": "op.exp.8.r5.1", "plano": "central", "conjunto": "wordpress", "ruta": "/var/ossec/etc/rules", "ficheros": 1, "reglas": 10, "reglas_con_mitre": 1, "tecnicas_mitre": 1},
  {"ensfacil": "op.exp.8", "ts": "2026-09-26T19:11:45Z", "host": "Wazuh-4", "event": "correlation_rules_inventory", "evidence_id": "EV-10", "requisito": "op.exp.8.r5.1", "plano": "central", "conjunto": "zz", "ruta": "/var/ossec/etc/rules", "ficheros": 1, "reglas": 2, "reglas_con_mitre": 0, "tecnicas_mitre": 0},
  {"ensfacil": "op.exp.8", "ts": "2026-09-26T19:11:45Z", "host": "Wazuh-4", "event": "active_response_configured", "evidence_id": "EV-11", "requisito": "op.exp.8.r5.2", "plano": "central", "comando": "firewall-drop", "comando_definido": "si", "ubicacion": "local", "agente_id": "-", "reglas_id": "5763", "grupos": "-", "nivel": "-", "timeout": "180", "deshabilitada": "no"},
  {"ensfacil": "op.exp.8", "ts": "2026-09-26T19:11:45Z", "host": "Wazuh-4", "event": "active_response_configured", "evidence_id": "EV-11", "requisito": "op.exp.8.r5.2", "plano": "central", "comando": "firewall-drop", "comando_definido": "si", "ubicacion": "local", "agente_id": "-", "reglas_id": "107200", "grupos": "-", "nivel": "-", "timeout": "60", "deshabilitada": "no"},
  {"ensfacil": "op.exp.8", "ts": "2026-09-26T19:11:45Z", "host": "Wazuh-4", "event": "active_response_configured", "evidence_id": "EV-11", "requisito": "op.exp.8.r5.2", "plano": "central", "comando": "quersystem-yara-linux", "comando_definido": "si", "ubicacion": "local", "agente_id": "-", "reglas_id": "108100,108101", "grupos": "-", "nivel": "-", "timeout": "-", "deshabilitada": "no"},
  {"ensfacil": "op.exp.8", "ts": "2026-09-26T19:11:45Z", "host": "Wazuh-4", "event": "active_response_configured", "evidence_id": "EV-11", "requisito": "op.exp.8.r5.2", "plano": "central", "comando": "quersystem-yara-win", "comando_definido": "si", "ubicacion": "local", "agente_id": "-", "reglas_id": "108120,108121", "grupos": "-", "nivel": "-", "timeout": "-", "deshabilitada": "no"},
  {"ensfacil": "op.exp.8", "ts": "2026-09-26T19:11:45Z", "host": "Wazuh-4", "event": "active_response_configured", "evidence_id": "EV-11", "requisito": "op.exp.8.r5.2", "plano": "central", "comando": "quersystem-malware-quarantine-linux", "comando_definido": "si", "ubicacion": "local", "agente_id": "-", "reglas_id": "108130", "grupos": "-", "nivel": "-", "timeout": "-", "deshabilitada": "no"},
  {"ensfacil": "op.exp.8", "ts": "2026-09-26T19:11:45Z", "host": "Wazuh-4", "event": "active_response_configured", "evidence_id": "EV-11", "requisito": "op.exp.8.r5.2", "plano": "central", "comando": "quersystem-malware-quarantine-win", "comando_definido": "si", "ubicacion": "local", "agente_id": "-", "reglas_id": "108131", "grupos": "-", "nivel": "-", "timeout": "-", "deshabilitada": "no"},
  {"ensfacil": "op.exp.8", "ts": "2026-09-26T19:11:45Z", "host": "Wazuh-4", "event": "logging_service_status", "evidence_id": "EV-13", "requisito": "op.exp.8.1,op.exp.8.r4.1", "plano": "central", "servicio": "wazuh-manager", "activo": "si", "activo_desde": "2026-09-21T12:01:53Z", "reinicios": "0", "huella_ossec_conf": "e2055aac5cf3d7a8", "huella_reglas_propias": "3741b3e44ac9ea2e"},
  {"ensfacil": "op.exp.8", "ts": "2026-09-26T19:11:45Z", "host": "Wazuh-4", "event": "logging_service_status", "evidence_id": "EV-13", "requisito": "op.exp.8.1,op.exp.8.r4.1", "plano": "central", "servicio": "wazuh-indexer", "activo": "si", "activo_desde": "2026-09-24T22:22:12Z", "reinicios": "0", "huella_ossec_conf": "e2055aac5cf3d7a8", "huella_reglas_propias": "3741b3e44ac9ea2e"},
  {"ensfacil": "op.exp.8", "ts": "2026-09-26T19:11:45Z", "host": "Wazuh-4", "event": "logging_service_status", "evidence_id": "EV-13", "requisito": "op.exp.8.1,op.exp.8.r4.1", "plano": "central", "servicio": "wazuh-dashboard", "activo": "si", "activo_desde": "2026-09-25T05:36:27Z", "reinicios": "0", "huella_ossec_conf": "e2055aac5cf3d7a8", "huella_reglas_propias": "3741b3e44ac9ea2e"},
  {"ensfacil": "op.exp.8", "ts": "2026-09-26T19:11:45Z", "host": "Wazuh-4", "event": "collector_run", "resultado": "completada", "evidencias_cubiertas": "EV-01,EV-06,EV-08,EV-04,EV-12,EV-05,EV-07,EV-10,EV-11,EV-13", "tipo_servidor": "manager", "emisor": "recolector"},
];

// Las dos pasadas terminaron a las 19:11 UTC del 26/09.
const AHORA = new Date('2026-09-26T19:30:00Z');

let contador = 0;

const REGLA: Record<string, string> = {
  audit_log_status: '110901', agent_status: '110902', audit_record_fields: '110903',
  agent_keepalive_observed: '110915', log_review_recorded: '110905', time_sync_status: '110906',
  clock_change_observed: '110907', log_retention_observed: '110908',
  log_access_permissions: '110909', correlation_rules_inventory: '110910',
  active_response_configured: '110911', active_response_executed: '110912',
  logging_service_status: '110913', audit_coverage: '110914', evidence_state: '110950', collector_run: '110997',
};

// Una línea del NDJSON del recolector tal como la deja el manager en el índice.
const alerta = (linea: Record<string, unknown>, agente: { id: string; name: string }, ts?: string) => {
  contador += 1;
  const { ts: tsLinea, host: _host, ...data } = linea as Record<string, unknown> & { ts: string };

  return {
    _id: `alerta-${contador}`,
    _source: {
      '@timestamp': ts || tsLinea,
      agent: agente,
      rule: { id: REGLA[String(data.event)] || '110900', description: 'op.exp.8' },
      location: '/var/log/ensfacil/op_exp_8.json',
      data: Object.fromEntries(Object.entries({ ensfacil: 'op.exp.8', ...data }).map(([k, v]) => [k, String(v)])),
    },
  };
};

const AGENTE = { id: '024', name: 'wazuh-real' };
const MANAGER = { id: '000', name: 'Wazuh-4' };

const eventos = (
  lineas: Record<string, unknown>[],
  agente: { id: string; name: string },
  cambia: (l: Record<string, unknown>) => Record<string, unknown> | undefined = l => l
): ENSNormalizedEvent[] =>
  normalizeWazuhAlerts(
    lineas
      .map(l => cambia({ ...l }))
      .filter((l): l is Record<string, unknown> => Boolean(l))
      .map(l => alerta(l, agente))
  );

const configuracion = (valores: Record<string, string[] | string>): ENSControlConfiguration => ({
  ...opExp8Configuration,
  parameters: opExp8Configuration.parameters.map(p => ({
    ...p,
    value: valores[p.id],
  })),
});

// Lo que un auditor declararía para el laboratorio (ver el informe del control).
const BASE: Record<string, string[] | string> = {
  'P-01': ['autenticación | sshd, sudo, auditd | 3', 'cambios de configuración | auditd | 5'],
  'P-02': ['wazuh-real | Ubuntu 24.04 | servidor', 'wazuh-fake | Ubuntu 22.04 | laboratorio', 'Wazuh-4 | Ubuntu 22.04 | SIEM'],
  'P-04': '30',
  'P-05': ['ntp.hetzner.com | ninguno'],
  'P-06': '1',
  'P-07': ['autenticación | 365', 'tráfico | 90'],
  'P-08': ['root | total | todo', 'syslog | escritura | sistema', 'wazuh | escritura | Wazuh', 'wazuh-indexer | escritura | índices', 'dioni | lectura | journal propio', 'fran | lectura | journal propio'],
  'P-10': ['wazuh | todas | sí', 'ensfacil | ENS | no'],
  'P-11': ['firewall-drop | fuerza bruta SSH (5763) | agente | 180 s'],
  'P-12': '3',
};

const evalua = (
  evs: ENSNormalizedEvent[],
  valores: Record<string, string[] | string> = BASE,
  ahora: Date = AHORA,
  nivel: ENSLevel = 'ALTO',
  agente = '024'
) => {
  const cfg = configuracion(valores);
  const delControl = keepLatestRunStateFacts('op.exp.8', evs, ahora);
  const evidencias = resolveEvidenceForControl('op.exp.8', delControl, agente, nivel, cfg, ahora);
  const contexto = buildPolicyContext(opExp8CatalogDefinition, cfg, nivel, delControl, evidencias, ahora);
  const { decisions } = opExp8PolicyDefinition.evaluator!(contexto);
  const tabla = applyPolicyDecisionsToEvidences(evidencias, decisions, opExp8CatalogDefinition.requirements);
  const requisito = (id: string) =>
    evaluateRequirement(
      opExp8CatalogDefinition.requirements.find(q => q.id === id)!,
      nivel,
      tabla,
      false,
      decisions,
      'ACTIVE'
    );
  const evidencia = (id: string) => tabla.find(e => e.id === id);
  const motivo = (req: string) => decisions.find(d => d.requirementId === req)?.reason || '';

  return { evidencias, decisions, requisito, evidencia, motivo };
};

// El servidor con las demás categorías bien cubiertas, para probar cada eje.
const host = (cambia?: (l: Record<string, unknown>) => Record<string, unknown> | undefined) =>
  eventos([...REAL_WAZUH_REAL, ...COBERTURA_COMPLETA], AGENTE, cambia);
// El servidor tal como está hoy: lo que de verdad audita.
const hostReal = (cambia?: (l: Record<string, unknown>) => Record<string, unknown> | undefined) =>
  eventos([...REAL_WAZUH_REAL, ...REAL_COBERTURA_WAZUH_REAL], AGENTE, cambia);
// El servidor con el recolector anterior, que no emitía la cobertura.
const hostSinCobertura = () => eventos(REAL_WAZUH_REAL, AGENTE);
const central = (cambia?: (l: Record<string, unknown>) => Record<string, unknown> | undefined) =>
  eventos(REAL_WAZUH4, MANAGER, cambia);

// --- 1. catálogo ------------------------------------------------------------

bloque('1. Catálogo: nivel de Trazabilidad y refuerzos acumulativos');

{
  const niveles = (id: string) =>
    opExp8CatalogDefinition.requirements.find(r => r.id === id)!.applicability.levels.join(',');

  comprueba('op.exp.8 se rige por la dimensión de Trazabilidad', opExp8CatalogDefinition.levelDimension === 'T');
  comprueba('la base rige en los tres niveles', ['op.exp.8.1', 'op.exp.8.2'].every(id => niveles(id) === 'BAJO,MEDIO,ALTO'));
  comprueba('R1 a R4 desde MEDIO', ['op.exp.8.r1.1', 'op.exp.8.r2.1', 'op.exp.8.r3.1', 'op.exp.8.r4.1'].every(id => niveles(id) === 'MEDIO,ALTO'));
  comprueba('R5 solo en ALTO', ['op.exp.8.r5.1', 'op.exp.8.r5.2'].every(id => niveles(id) === 'ALTO'));
  comprueba('el control está ACTIVE', opExp8CatalogDefinition.status === 'ACTIVE', opExp8CatalogDefinition.status);
  comprueba(
    'la policy declara los mismos niveles que el catálogo',
    opExp8PolicyDefinition.requirements.every(r => r.levels.join(',') === niveles(r.requirementId))
  );
}

// --- 2. la fila de un servidor ---------------------------------------------

bloque('2. Fila de un servidor (wazuh-real): se mide lo suyo; lo central no aplica');

{
  const r = evalua(host());

  comprueba('op.exp.8.1 CUMPLE: auditd cubre las categorías de P-01, journald persistente, cinco campos', r.requisito('op.exp.8.1').status === 'CUMPLE', r.motivo('op.exp.8.1'));
  comprueba('op.exp.8.2 CUMPLE: keepalive de hace 18 min con plazo de 3 h', r.requisito('op.exp.8.2').status === 'CUMPLE', r.motivo('op.exp.8.2'));
  comprueba('op.exp.8.r2.1 NO_CUMPLE: systemd-timesyncd sin autenticación', r.requisito('op.exp.8.r2.1').status === 'NO_CUMPLE' && /autenticación/.test(r.motivo('op.exp.8.r2.1')), r.motivo('op.exp.8.r2.1'));
  comprueba('op.exp.8.r4.1 CUMPLE con P-08 completo', r.requisito('op.exp.8.r4.1').status === 'CUMPLE', r.motivo('op.exp.8.r4.1'));

  ['op.exp.8.r1.1', 'op.exp.8.r3.1', 'op.exp.8.r5.1', 'op.exp.8.r5.2'].forEach(id =>
    comprueba(`${id} NO_APLICA en la fila de un servidor: se mide en el manager`, r.requisito(id).status === 'NO_APLICA', r.requisito(id).status)
  );

  comprueba('EV-05 sale NO_APLICA en la tabla, no «no ha llegado nada»', r.evidencia('EV-05')?.status === 'NO_APLICA', r.evidencia('EV-05')?.status);
  comprueba('EV-13 sale NO_APLICA en la tabla', r.evidencia('EV-13')?.status === 'NO_APLICA', r.evidencia('EV-13')?.status);
  comprueba('EV-01 sale CUMPLE en la tabla', r.evidencia('EV-01')?.status === 'CUMPLE', r.evidencia('EV-01')?.status);
}

// --- 3. EV-02: el keepalive envejece solo ------------------------------------

bloque('3. EV-02 · el último keepalive contra P-12');

{
  const tarde = evalua(host(), BASE, new Date('2026-09-26T23:30:00Z'));
  comprueba('4 h después sin nuevos hechos: el keepalive vence → op.exp.8.2 NO_CUMPLE', tarde.requisito('op.exp.8.2').status === 'NO_CUMPLE', tarde.motivo('op.exp.8.2'));

  const holgado = evalua(host(), { ...BASE, 'P-12': '6' }, new Date('2026-09-26T23:30:00Z'));
  comprueba('REVERSIÓN: el MISMO hecho con P-12 = 6 h → CUMPLE', holgado.requisito('op.exp.8.2').status === 'CUMPLE', holgado.motivo('op.exp.8.2'));

  const sinPlazo = evalua(host(), { ...BASE, 'P-12': undefined as unknown as string });
  comprueba('sin P-12 → no evaluable, nunca CUMPLE', sinPlazo.requisito('op.exp.8.2').status !== 'CUMPLE' && sinPlazo.requisito('op.exp.8.2').evidenced === false, sinPlazo.requisito('op.exp.8.2').status);
}

// --- 4. EV-01 y EV-03 ---------------------------------------------------------

bloque('4. EV-01 y EV-03 · el registro de auditoría y sus campos');

{
  const sinReglas = evalua(host(l => (l.event === 'audit_log_status' && l.fuente === 'auditd' ? { ...l, reglas_cargadas: 0 } : l)));
  comprueba('auditd activo sin reglas → op.exp.8.1 NO_CUMPLE', sinReglas.requisito('op.exp.8.1').status === 'NO_CUMPLE' && /sin ninguna regla/.test(sinReglas.motivo('op.exp.8.1')), sinReglas.motivo('op.exp.8.1'));

  const volatil = evalua(host(l =>
    l.event === 'audit_log_status' && l.fuente === 'journald' ? { ...l, almacenamiento: 'volatil' }
      : l.event === 'audit_log_status' && l.fuente === 'rsyslog' ? { ...l, activo: 'no' } : l));
  comprueba('journald volátil y sin rsyslog → NO_CUMPLE (no se conserva)', volatil.requisito('op.exp.8.1').status === 'NO_CUMPLE', volatil.motivo('op.exp.8.1'));

  const soloJournaldVolatil = evalua(host(l => (l.event === 'audit_log_status' && l.fuente === 'journald' ? { ...l, almacenamiento: 'volatil' } : l)));
  comprueba('REVERSIÓN: journald volátil pero rsyslog activo → CUMPLE', soloJournaldVolatil.requisito('op.exp.8.1').status === 'CUMPLE', soloJournaldVolatil.motivo('op.exp.8.1'));

  const sinResultado = evalua(host(l => (l.event === 'audit_record_fields' ? { ...l, con_resultado: 0, campos_ausentes: 'resultado' } : l)));
  comprueba('un campo ausente en TODA la muestra → NO_CUMPLE nombrando el campo', sinResultado.requisito('op.exp.8.1').status === 'NO_CUMPLE' && /resultado/.test(sinResultado.motivo('op.exp.8.1')), sinResultado.motivo('op.exp.8.1'));

  const sinP01 = evalua(host(), { ...BASE, 'P-01': undefined as unknown as string });
  comprueba('sin P-01 → op.exp.8.1 no demostrado (no consta qué se audita)', sinP01.requisito('op.exp.8.1').status === 'NO_CUMPLE' && sinP01.requisito('op.exp.8.1').evidenced === false, sinP01.motivo('op.exp.8.1'));

  const directorio = evalua(eventos([
    ...REAL_WAZUH_REAL,
    ...COBERTURA_COMPLETA,
    { ts: '2026-09-26T19:11:48Z', event: 'audit_log_status', evidence_id: 'EV-01', requisito: 'op.exp.8.1', plano: 'directorio', fuente: 'slapd', activo: 'si', niveles_log: 'none' },
  ], AGENTE));
  comprueba('LDAP: slapd con olcLogLevel sin stats → NO_CUMPLE', directorio.requisito('op.exp.8.1').status === 'NO_CUMPLE' && /stats/.test(directorio.motivo('op.exp.8.1')), directorio.motivo('op.exp.8.1'));

  const conStats = evalua(eventos([
    ...REAL_WAZUH_REAL,
    ...COBERTURA_COMPLETA,
    { ts: '2026-09-26T19:11:48Z', event: 'audit_log_status', evidence_id: 'EV-01', requisito: 'op.exp.8.1', plano: 'directorio', fuente: 'slapd', activo: 'si', niveles_log: 'stats sync' },
  ], AGENTE));
  comprueba('REVERSIÓN: el mismo slapd con stats → CUMPLE', conStats.requisito('op.exp.8.1').status === 'CUMPLE', conStats.motivo('op.exp.8.1'));

  const numerico = evalua(eventos([
    ...REAL_WAZUH_REAL,
    ...COBERTURA_COMPLETA,
    { ts: '2026-09-26T19:11:48Z', event: 'audit_log_status', evidence_id: 'EV-01', requisito: 'op.exp.8.1', plano: 'directorio', fuente: 'slapd', activo: 'si', niveles_log: '256' },
  ], AGENTE));
  comprueba('olcLogLevel numérico 256 es stats → CUMPLE', numerico.requisito('op.exp.8.1').status === 'CUMPLE', numerico.motivo('op.exp.8.1'));

  const viejo = evalua(host(), BASE, new Date('2026-09-28T19:30:00Z'), 'ALTO');
  comprueba('dos días sin pasadas: el estado no describe hoy → no demostrado', viejo.requisito('op.exp.8.1').evidenced === false && /no está informando/.test(viejo.motivo('op.exp.8.1')), viejo.motivo('op.exp.8.1'));
}

// --- 5. EV-06: la referencia de tiempo --------------------------------------

bloque('5. EV-06 · sincronización, autenticación, desfase, fuente y traza');

{
  const nts = (extra: Record<string, unknown> = {}) =>
    host(l => (l.event === 'time_sync_status' ? { ...l, servicio: 'chrony', autenticacion: 'nts_o_clave', vigilancia_cambio_hora: 'si', ...extra } : l));

  const bien = evalua(nts());
  comprueba('chrony con NTS, fuente declarada, desfase 1,9 ms, cambios vigilados → CUMPLE', bien.requisito('op.exp.8.r2.1').status === 'CUMPLE', bien.motivo('op.exp.8.r2.1'));

  const lejos = evalua(nts({ desfase_segundos: '2.5' }));
  comprueba('desfase de 2,5 s con P-06 = 1 → NO_CUMPLE', lejos.requisito('op.exp.8.r2.1').status === 'NO_CUMPLE' && /2.5/.test(lejos.motivo('op.exp.8.r2.1')), lejos.motivo('op.exp.8.r2.1'));
  const holgado = evalua(nts({ desfase_segundos: '2.5' }), { ...BASE, 'P-06': '5' });
  comprueba('REVERSIÓN: el mismo desfase con P-06 = 5 → CUMPLE', holgado.requisito('op.exp.8.r2.1').status === 'CUMPLE', holgado.motivo('op.exp.8.r2.1'));

  const desfaseNegativo = evalua(nts({ desfase_segundos: '-2.5' }));
  comprueba('el desfase cuenta en valor absoluto (-2,5 s también incumple)', desfaseNegativo.requisito('op.exp.8.r2.1').status === 'NO_CUMPLE', desfaseNegativo.motivo('op.exp.8.r2.1'));

  const ajena = evalua(nts({ fuentes: 'pool.ntp.org' }));
  comprueba('fuente en uso que P-05 no declara → NO_CUMPLE', ajena.requisito('op.exp.8.r2.1').status === 'NO_CUMPLE' && /pool.ntp.org/.test(ajena.motivo('op.exp.8.r2.1')), ajena.motivo('op.exp.8.r2.1'));

  const sinVigilar = evalua(nts({ vigilancia_cambio_hora: 'no' }));
  comprueba('sin regla de auditd para los cambios de hora → no demostrado (no NO_CUMPLE medido)', sinVigilar.requisito('op.exp.8.r2.1').evidenced === false && /augenrules/.test(sinVigilar.motivo('op.exp.8.r2.1')), `${sinVigilar.requisito('op.exp.8.r2.1').status} ${sinVigilar.motivo('op.exp.8.r2.1')}`);

  const desincronizado = evalua(nts({ sincronizado: 'no' }));
  comprueba('reloj sin sincronizar → NO_CUMPLE', desincronizado.requisito('op.exp.8.r2.1').status === 'NO_CUMPLE', desincronizado.motivo('op.exp.8.r2.1'));

  const conCambio = evalua(eventos([
    ...REAL_WAZUH_REAL.map(l => (l.event === 'time_sync_status' ? { ...l, servicio: 'chrony', autenticacion: 'nts_o_clave', vigilancia_cambio_hora: 'si' } : l)),
    { ts: '2026-09-26T19:11:48Z', event: 'clock_change_observed', evidence_id: 'EV-06', requisito: 'op.exp.8.r2.1', plano: 'sistema', actor: 'dioni', usuario_efectivo: 'root', proceso: '/usr/bin/date', syscall: 'clock_settime', veces: 1, ultima: '2026-09-26T19:05:00Z' },
  ], AGENTE));
  comprueba('un cambio de hora registrado se nombra con su actor (traza, no incumplimiento)', conCambio.requisito('op.exp.8.r2.1').status === 'CUMPLE' && /dioni con \/usr\/bin\/date/.test(conCambio.motivo('op.exp.8.r2.1')), conCambio.motivo('op.exp.8.r2.1'));

  // chrony con NTS en wazuh-real y wazuh4 (27/09): P-05 declara los NOMBRES.
  // `chronyc -n sources` daba las IP —y la de time.cloudflare.com es anycast y
  // cambia—, con un primer elemento vacío que colaba el separador «====» de la
  // tabla. El recolector usa ahora `chronyc -c -N sources`.
  const P05_NTS = { ...BASE, 'P-05': ['time.cloudflare.com | NTS', 'nts.netnod.se | NTS', 'ptbtime1.ptb.de | NTS'] };
  const porNombre = evalua(nts({ fuentes: 'nts.netnod.se,ptbtime1.ptb.de,time.cloudflare.com', fuentes_ip: '194.58.203.196,192.53.103.108,162.159.200.123' }), P05_NTS);
  comprueba('fuentes por su nombre configurado (chronyc -N) → casan con P-05 → CUMPLE', porNombre.requisito('op.exp.8.r2.1').status === 'CUMPLE', porNombre.motivo('op.exp.8.r2.1'));
  const porIp = evalua(nts({ fuentes: ',194.58.203.196,192.53.103.108,162.159.200.123' }), P05_NTS);
  comprueba('ANTES: las IP de `chronyc -n` con la coma inicial → «fuente no declarada» falsa', porIp.requisito('op.exp.8.r2.1').status === 'NO_CUMPLE' && /P-05 no declara: 194\.58\.203\.196/.test(porIp.motivo('op.exp.8.r2.1')), porIp.motivo('op.exp.8.r2.1'));

  const medio = evalua(host(), BASE, AHORA, 'BAJO');
  comprueba('en nivel de Trazabilidad BAJO, R2 no aplica', medio.requisito('op.exp.8.r2.1').status === 'NO_APLICA', medio.requisito('op.exp.8.r2.1').status);
}

// --- 6. EV-08: quién puede leer los registros -------------------------------

bloque('6. EV-08 · cuentas con lectura contra P-08');

{
  const sinDioni = evalua(host(), { ...BASE, 'P-08': ['root | total | todo', 'syslog | escritura | sistema', 'wazuh | escritura | Wazuh'] });
  comprueba('dioni lee su journal y P-08 no la autoriza → NO_CUMPLE nombrando ruta y cuenta', sinDioni.requisito('op.exp.8.r4.1').status === 'NO_CUMPLE' && /\/var\/log\/journal \(dioni\)/.test(sinDioni.motivo('op.exp.8.r4.1')), sinDioni.motivo('op.exp.8.r4.1'));

  const mayusculas = evalua(host(), { ...BASE, 'P-08': ['ROOT | total | todo', 'syslog | x | x', 'wazuh | x | x', 'dioni | x | x'] });
  comprueba('la comparación distingue mayúsculas (ROOT no autoriza a root)', mayusculas.requisito('op.exp.8.r4.1').status === 'NO_CUMPLE', mayusculas.motivo('op.exp.8.r4.1'));

  const abierto = evalua(host(l => (l.event === 'log_access_permissions' && l.ruta === '/var/log/syslog' ? { ...l, cuentas: 'root,syslog,*', lectura_mundo: 'si' } : l)));
  comprueba('un registro legible por cualquiera → NO_CUMPLE aunque P-08 esté completo', abierto.requisito('op.exp.8.r4.1').status === 'NO_CUMPLE' && /cualquier cuenta/.test(abierto.motivo('op.exp.8.r4.1')), abierto.motivo('op.exp.8.r4.1'));

  const sinP08 = evalua(host(), { ...BASE, 'P-08': undefined as unknown as string });
  comprueba('sin P-08 → no demostrado', sinP08.requisito('op.exp.8.r4.1').evidenced === false, sinP08.requisito('op.exp.8.r4.1').status);
}

// --- 7. la fila del manager -------------------------------------------------

bloque('7. Fila del manager (wazuh4): servidor + sistema central');

{
  const r = evalua(central(), BASE, AHORA, 'ALTO', '000');

  comprueba('el manager sin auditd → op.exp.8.1 NO_CUMPLE (es un servidor más)', r.requisito('op.exp.8.1').status === 'NO_CUMPLE' && /auditd no está activo/.test(r.motivo('op.exp.8.1')), r.motivo('op.exp.8.1'));
  comprueba('Wazuh-4 horas sin alertas propias ya no es laguna: con su latido al día, op.exp.8.2 CUMPLE', r.requisito('op.exp.8.2').status === 'CUMPLE' && r.evidencia('EV-04')?.status === 'CUMPLE', r.motivo('op.exp.8.2'));
  comprueba('EV-02 NO_APLICA en el manager (no tiene agente propio)', r.evidencia('EV-02')?.status === 'NO_APLICA', r.evidencia('EV-02')?.status);
  comprueba('R1 CUMPLE: revisión del 15/09 con periodicidad de 30 días', r.requisito('op.exp.8.r1.1').status === 'CUMPLE', r.motivo('op.exp.8.r1.1'));
  comprueba('R3 no demostrado: la retención del indexer no se ve sin credenciales', r.requisito('op.exp.8.r3.1').evidenced === false && /ISM/.test(r.motivo('op.exp.8.r3.1')), r.motivo('op.exp.8.r3.1'));
  comprueba('y el motivo dice lo que SÍ se ve en disco (alertas desde el 12/06)', /2026-06-12/.test(r.motivo('op.exp.8.r3.1')), r.motivo('op.exp.8.r3.1'));
  comprueba('R4 no demostrado en el manager: accesos al indexer y snapshots sin credenciales', r.requisito('op.exp.8.r4.1').evidenced === false, `${r.requisito('op.exp.8.r4.1').status} ${r.motivo('op.exp.8.r4.1')}`);
  comprueba('R5.1 CUMPLE: el manager carga los conjuntos wazuh y ensfacil', r.requisito('op.exp.8.r5.1').status === 'CUMPLE', r.motivo('op.exp.8.r5.1'));
  comprueba('R5.2 no demostrado: respuesta configurada pero ninguna ejecución disparada por una alerta', r.requisito('op.exp.8.r5.2').evidenced === false && /ninguna respuesta automática disparada/.test(r.motivo('op.exp.8.r5.2')), r.motivo('op.exp.8.r5.2'));

  const noDeclarado = evalua(central(), { ...BASE, 'P-02': ['wazuh-real | x | x', 'srv-inexistente | x | x'] }, AHORA, 'ALTO', '000');
  comprueba('un servidor de P-02 que no figura en la base de agentes del manager → NO_CUMPLE nombrándolo', noDeclarado.requisito('op.exp.8.2').status === 'NO_CUMPLE' && /srv-inexistente: no figura en la base de agentes/.test(noDeclarado.motivo('op.exp.8.2')), noDeclarado.motivo('op.exp.8.2'));

  const semanal = evalua(central(), { ...BASE, 'P-04': '7' }, AHORA, 'ALTO', '000');
  comprueba('REVERSIÓN: la misma revisión del 15/09 con periodicidad de 7 días → NO_CUMPLE', semanal.requisito('op.exp.8.r1.1').status === 'NO_CUMPLE', semanal.motivo('op.exp.8.r1.1'));

  const vacio = evalua(central(l => (l.event === 'log_review_recorded' ? { ...l, revisiones: 0, ultima_revision: '-' } : l)), BASE, AHORA, 'ALTO', '000');
  comprueba('registro de revisiones vacío (solo cabecera) → NO_CUMPLE medido, no gris', vacio.requisito('op.exp.8.r1.1').status === 'NO_CUMPLE' && vacio.requisito('op.exp.8.r1.1').evidenced === true, vacio.motivo('op.exp.8.r1.1'));

  const ausente = evalua(central(l => (l.event === 'log_review_recorded' ? undefined : l)).concat(
    eventos([{ ts: '2026-09-26T19:11:44Z', event: 'evidence_state', evidence_id: 'EV-05', requisito: 'op.exp.8.r1.1', plano: 'central', estado: 'NO_EVALUABLE', causa: 'CONFIGURATION', motivo: 'no existe el registro de revisiones de los registros /etc/ensfacil/log-review-register.tsv' }], MANAGER)
  ), BASE, AHORA, 'ALTO', '000');
  comprueba('registro de revisiones ausente → no demostrado con el motivo del recolector', ausente.requisito('op.exp.8.r1.1').evidenced === false && /log-review-register/.test(ausente.motivo('op.exp.8.r1.1')), ausente.motivo('op.exp.8.r1.1'));

  const conjuntoFalta = evalua(central(), { ...BASE, 'P-10': ['wazuh | x | x', 'sigma | x | x'] }, AHORA, 'ALTO', '000');
  comprueba('un conjunto de P-10 que el manager no carga → NO_CUMPLE', conjuntoFalta.requisito('op.exp.8.r5.1').status === 'NO_CUMPLE' && /sigma/.test(conjuntoFalta.motivo('op.exp.8.r5.1')), conjuntoFalta.motivo('op.exp.8.r5.1'));

  const conEjecucion = evalua(eventos([
    ...REAL_WAZUH4,
    { ts: '2026-09-26T19:11:44Z', event: 'active_response_executed', evidence_id: 'EV-12', requisito: 'op.exp.8.r5.2', plano: 'central', agente_id: '024', agente: 'wazuh-real', programa: 'firewall-drop', accion: 'add', regla_origen: '5763', veces: 1, primera: '2026-09-26T18:00:00Z', ultima: '2026-09-26T18:00:00Z', objetivos: '203.0.113.7' },
  ], MANAGER), BASE, AHORA, 'ALTO', '000');
  comprueba('con una ejecución disparada por la 5763 → R5.2 CUMPLE', conEjecucion.requisito('op.exp.8.r5.2').status === 'CUMPLE', conEjecucion.motivo('op.exp.8.r5.2'));

  const manual = evalua(eventos([
    ...REAL_WAZUH4,
    { ts: '2026-09-26T19:11:44Z', event: 'active_response_executed', evidence_id: 'EV-12', requisito: 'op.exp.8.r5.2', plano: 'central', agente_id: '029', agente: 'WIN-OPACC-LAB', programa: 'restart-wazuh.exe', accion: 'add', regla_origen: '-', veces: 1, primera: '2026-09-24T07:09:48Z', ultima: '2026-09-24T07:09:48Z', objetivos: '-' },
  ], MANAGER), BASE, AHORA, 'ALTO', '000');
  comprueba('un reinicio sin alerta que lo dispare NO acredita respuesta automática', manual.requisito('op.exp.8.r5.2').evidenced === false && /restart-wazuh.exe/.test(manual.motivo('op.exp.8.r5.2')), manual.motivo('op.exp.8.r5.2'));

  const previstaFalta = evalua(eventos([
    ...REAL_WAZUH4,
    { ts: '2026-09-26T19:11:44Z', event: 'active_response_executed', evidence_id: 'EV-12', requisito: 'op.exp.8.r5.2', plano: 'central', agente_id: '024', agente: 'wazuh-real', programa: 'firewall-drop', accion: 'add', regla_origen: '5763', veces: 1, primera: '2026-09-26T18:00:00Z', ultima: '2026-09-26T18:00:00Z', objetivos: '203.0.113.7' },
  ], MANAGER), { ...BASE, 'P-11': ['disable-account | fuerza bruta | cuenta | 10 min'] }, AHORA, 'ALTO', '000');
  comprueba('una acción de P-11 que no está configurada → NO_CUMPLE', previstaFalta.requisito('op.exp.8.r5.2').status === 'NO_CUMPLE' && /disable-account/.test(previstaFalta.motivo('op.exp.8.r5.2')), previstaFalta.motivo('op.exp.8.r5.2'));

  const caido = evalua(central(l => (l.event === 'logging_service_status' && l.servicio === 'wazuh-indexer' ? { ...l, activo: 'no' } : l)), BASE, AHORA, 'ALTO', '000');
  comprueba('wazuh-indexer parado → EV-13 NO_CUMPLE', caido.evidencia('EV-13')?.status === 'NO_CUMPLE', caido.evidencia('EV-13')?.status);
}

// --- 9. EV-01: lo que P-01 declara auditable, contra lo que se audita ------

bloque('9. EV-01 · las categorías de P-01 contra lo que el servidor audita de verdad');

{
  // El defecto: wazuh-real salía CUMPLE por tener auditd activo con 80 reglas,
  // mientras op.exp.5, op.exp.10 y EV-06 demostraban que no se auditaban los
  // cambios de configuración, de hora ni de los almacenes de claves.
  const hoy = evalua(hostReal());
  comprueba(
    'wazuh-real tal como está: «cambios de configuración» declarada y /etc/netplan, /etc/hosts… sin vigilar → op.exp.8.1 NO_CUMPLE medido',
    hoy.requisito('op.exp.8.1').status === 'NO_CUMPLE' && hoy.requisito('op.exp.8.1').evidenced === true && /\/etc\/netplan/.test(hoy.motivo('op.exp.8.1')) && /\/etc\/crontab/.test(hoy.motivo('op.exp.8.1')),
    hoy.motivo('op.exp.8.1')
  );
  comprueba('y EV-01 sale NO_CUMPLE en la tabla', hoy.evidencia('EV-01')?.status === 'NO_CUMPLE', hoy.evidencia('EV-01')?.status);

  const antiguo = evalua(hostSinCobertura());
  comprueba(
    'con el recolector anterior (sin audit_coverage) NUNCA CUMPLE: no demostrado',
    antiguo.requisito('op.exp.8.1').status === 'NO_CUMPLE' && antiguo.requisito('op.exp.8.1').evidenced === false,
    `${antiguo.requisito('op.exp.8.1').status} ${antiguo.motivo('op.exp.8.1')}`
  );
  comprueba('y la causa es de RECOGIDA (el recolector no informa)', antiguo.evidencia('EV-01')?.gapCause === 'COLLECTION', antiguo.evidencia('EV-01')?.gapCause);

  const completo = evalua(host());
  comprueba('REVERSIÓN: las mismas categorías con todas sus rutas vigiladas → CUMPLE', completo.requisito('op.exp.8.1').status === 'CUMPLE', completo.motivo('op.exp.8.1'));

  const conHora = { ...BASE, 'P-01': ['autenticación | sshd | 3', 'cambios de hora | auditd | 5'] };
  const horaReal = evalua(hostReal(), conHora);
  comprueba(
    '«cambios de hora» declarada y ninguna regla cargada registra adjtimex/settimeofday/clock_settime → NO_CUMPLE',
    horaReal.requisito('op.exp.8.1').status === 'NO_CUMPLE' && /clock_settime/.test(horaReal.motivo('op.exp.8.1')),
    horaReal.motivo('op.exp.8.1')
  );
  const horaAntigua = evalua(hostSinCobertura(), conHora);
  comprueba(
    'sin audit_coverage, la hora se decide con el time_sync_status de EV-06 (vigilancia_cambio_hora=no) → NO_CUMPLE',
    horaAntigua.requisito('op.exp.8.1').status === 'NO_CUMPLE' && horaAntigua.requisito('op.exp.8.1').evidenced === true,
    horaAntigua.motivo('op.exp.8.1')
  );

  const claves = evalua(hostReal(), { ...BASE, 'P-01': ['almacenes de claves | auditd | 7'] });
  comprueba(
    '«almacenes de claves» declarada con /etc/ssl/private sin vigilar → NO_CUMPLE nombrándola',
    claves.requisito('op.exp.8.1').status === 'NO_CUMPLE' && /\/etc\/ssl\/private/.test(claves.motivo('op.exp.8.1')),
    claves.motivo('op.exp.8.1')
  );

  const privilegios = evalua(hostReal(), { ...BASE, 'P-01': ['autenticación | sshd | 3', 'uso de privilegios (sudo) | auditd | 5'] });
  comprueba('REVERSIÓN: una categoría que SÍ se audita entera (privilegios) → CUMPLE', privilegios.requisito('op.exp.8.1').status === 'CUMPLE', privilegios.motivo('op.exp.8.1'));

  const rara = evalua(host(), { ...BASE, 'P-01': ['autenticación | sshd | 3', 'eventos de la aplicación de nóminas | app | 3'] });
  comprueba(
    'una categoría que ENSFácil no sabe observar → no demostrada, causa CONFIGURATION (nunca CUMPLE)',
    rara.requisito('op.exp.8.1').evidenced === false && rara.evidencia('EV-01')?.gapCause === 'CONFIGURATION' && /nóminas/.test(rara.motivo('op.exp.8.1')),
    `${rara.requisito('op.exp.8.1').status} ${rara.evidencia('EV-01')?.gapCause} ${rara.motivo('op.exp.8.1')}`
  );

  const ldapEnLinux = evalua(host(), { ...BASE, 'P-01': [...(BASE['P-01'] as string[]), 'directorio LDAP | slapd | 3'] });
  comprueba('«directorio LDAP» no aplica en un servidor sin slapd: no lo tumba', ldapEnLinux.requisito('op.exp.8.1').status === 'CUMPLE' && /no aplica a este servidor/.test(ldapEnLinux.motivo('op.exp.8.1')), ldapEnLinux.motivo('op.exp.8.1'));

  const sinAuditd = evalua(host(l =>
    l.event === 'audit_coverage' ? { ...l, auditd: 'no_instalado', sin_vigilar: [l.vigiladas, l.sin_vigilar].filter(v => v !== '-').join(','), vigiladas: '-' }
      : l.event === 'audit_log_status' && l.fuente === 'auditd' ? { ...l, activo: 'no_instalado', reglas_cargadas: 0 } : l));
  comprueba('sin auditd, la categoría declarada lo dice: «auditd no está instalado»', sinAuditd.requisito('op.exp.8.1').status === 'NO_CUMPLE' && /auditd no está instalado, así que nada registra/.test(sinAuditd.motivo('op.exp.8.1')), sinAuditd.motivo('op.exp.8.1'));
}

// --- 10. la causa llega intacta ---------------------------------------------

bloque('10. La causa que declara el recolector llega a la evidencia');

{
  const r = evalua(central(), BASE, AHORA, 'ALTO', '000');
  comprueba('EV-07 (retención ISM, el recolector dice CONFIGURATION) → gapCause CONFIGURATION', r.evidencia('EV-07')?.gapCause === 'CONFIGURATION', r.evidencia('EV-07')?.gapCause);
  comprueba('EV-09 (snapshots, el recolector dice CONFIGURATION) → gapCause CONFIGURATION', r.evidencia('EV-09')?.gapCause === 'CONFIGURATION', r.evidencia('EV-09')?.gapCause);

  const ausente = evalua(central(l => (l.event === 'log_review_recorded' ? undefined : l)).concat(
    eventos([{ ts: '2026-09-26T19:11:44Z', event: 'evidence_state', evidence_id: 'EV-05', requisito: 'op.exp.8.r1.1', plano: 'central', estado: 'NO_EVALUABLE', causa: 'CONFIGURATION', motivo: 'no existe el registro de revisiones de los registros /etc/ensfacil/log-review-register.tsv' }], MANAGER)
  ), BASE, AHORA, 'ALTO', '000');
  comprueba('registro de revisiones ausente (CONFIGURATION del recolector) → gapCause CONFIGURATION, no EVIDENCE', ausente.evidencia('EV-05')?.gapCause === 'CONFIGURATION', ausente.evidencia('EV-05')?.gapCause);

  const nts = host(l => (l.event === 'time_sync_status' ? { ...l, servicio: 'chrony', autenticacion: 'nts_o_clave', vigilancia_cambio_hora: 'si' } : l));
  const sinP06 = evalua(nts, { ...BASE, 'P-06': undefined as unknown as string });
  comprueba('sin P-06 (desfase admitido) → EV-06 sin medir con causa CONFIGURATION, no COLLECTION', sinP06.evidencia('EV-06')?.status === 'NO_EVALUABLE' && sinP06.evidencia('EV-06')?.gapCause === 'CONFIGURATION', `${sinP06.evidencia('EV-06')?.status} ${sinP06.evidencia('EV-06')?.gapCause}`);
}

// --- 11. EV-06 en el manager sin auditd ------------------------------------

bloque('11. EV-06 en un servidor sin auditd: el motivo lo dice');

{
  const r = evalua(central(), BASE, AHORA, 'ALTO', '000');
  comprueba(
    'wazuh4 sin auditd instalado → el motivo dice que auditd no está instalado, no que cargue reglas',
    /auditd no está instalado/.test(r.motivo('op.exp.8.r2.1')) && !/augenrules --load/.test(r.motivo('op.exp.8.r2.1')),
    r.motivo('op.exp.8.r2.1')
  );

  const instalado = evalua(host(l => (l.event === 'time_sync_status' ? { ...l, vigilancia_cambio_hora: 'no' } : l)));
  comprueba('REVERSIÓN: con auditd activo, lo que falta es cargar las reglas (augenrules --load)', /augenrules --load/.test(instalado.motivo('op.exp.8.r2.1')), instalado.motivo('op.exp.8.r2.1'));
}

// --- 8. solo cuentan los hechos de op.exp.8 --------------------------------

bloque('8. Solo cuentan los hechos de op.exp.8');

{
  const ajeno = normalizeWazuhAlerts([{
    _id: 'otro',
    _source: {
      '@timestamp': '2026-09-26T19:11:47Z',
      agent: AGENTE,
      data: { ensfacil: 'op.exp.1', event: 'agent_status', evidence_id: 'EV-04', ultimo_keepalive: '2026-09-26T19:11:42Z' },
    },
  }]);
  const r = evalua(ajeno);
  comprueba('un agent_status de op.exp.1 no acredita op.exp.8.2', r.requisito('op.exp.8.2').status !== 'CUMPLE', r.requisito('op.exp.8.2').status);
}

// --- 12. EV-04: la continuidad por el latido, pasada a pasada ----------------

bloque('12. EV-04 · lagunas por el keepalive en la serie de pasadas del manager');

{
  // La pasada real de wazuh4 sin sus hechos de EV-04, y una serie horaria de
  // hechos de keepalive que termina en la pasada de las 19:11:44.
  const FIN = Date.parse('2026-09-26T19:11:44Z');
  const sinEv04 = REAL_WAZUH4.filter(l => l.event !== 'agent_keepalive_observed');
  const pasada = (t: number, retraso: Record<string, number | null | undefined>) =>
    [
      ['000', 'Wazuh-4', 0],
      ['024', 'wazuh-real', '024' in retraso ? retraso['024'] : 0.01],
      ['025', 'wazuh-fake', '025' in retraso ? retraso['025'] : 0.01],
    ]
      .filter(([id]) => retraso[String(id)] !== undefined || !(String(id) in retraso))
      .map(([id, nombre, horasAtras]) => ({
        ts: new Date(t).toISOString().replace('.000Z', 'Z'),
        event: 'agent_keepalive_observed', evidence_id: 'EV-04', requisito: 'op.exp.8.1,op.exp.8.2', plano: 'central',
        agente_id: id, agente: nombre,
        estado_conexion: horasAtras === null ? 'never_connected' : Number(horasAtras) > 1 ? 'disconnected' : 'active',
        ultimo_keepalive: horasAtras === null ? '-' : new Date(t - Number(horasAtras) * 3600000).toISOString().replace('.000Z', 'Z'),
        local: id === '000' ? 'si' : 'no',
        ultimo_evento: '-', eventos_24h: 0,
      }));
  // `horas` pasadas horarias hacia atrás; `retrasos(i)` da, para la pasada i
  // (0 = la más antigua), cuánto quedaba atrás el keepalive de cada agente.
  const serie = (horas: number, retrasos: (i: number) => Record<string, number | null | undefined> = () => ({}), omitir: number[] = []) =>
    eventos(
      [
        ...sinEv04,
        ...Array.from({ length: horas }, (_, i) => i)
          .filter(i => !omitir.includes(i))
          .flatMap(i => pasada(FIN - (horas - 1 - i) * 3600000, retrasos(i))),
      ],
      MANAGER
    );
  const ev04 = (evs: ENSNormalizedEvent[], valores = BASE, ahora = AHORA) => {
    const r = evalua(evs, valores, ahora, 'ALTO', '000');
    // La decisión de la EVIDENCIA (la del requisito lleva `trace.ruleId` sin barra).
    const decision = r.decisions.find(d => d.trace.ruleId === 'op.exp.8.2/EV-04');

    return { estado: decision?.status, motivo: decision?.reason || '', causa: decision?.cause, r };
  };

  const tranquilo = ev04(serie(12));
  comprueba('12 pasadas con el latido al día y CERO eventos por agente → CUMPLE (tranquilo no es laguna)', tranquilo.estado === 'CUMPLE' && /12 pasadas/.test(tranquilo.motivo), tranquilo.motivo);

  const caida = ev04(serie(12, i => (i === 5 ? { '024': 4 } : {})));
  comprueba('una pasada con el keepalive de wazuh-real 4 h atrás (P-12 = 3) → NO_CUMPLE nombrándola', caida.estado === 'NO_CUMPLE' && /wazuh-real: laguna en 1 de 12 pasadas/.test(caida.motivo) && /2026-09-26T13:11:44Z/.test(caida.motivo), caida.motivo);
  comprueba('y op.exp.8.2 no conforma, MEDIDO', caida.r.requisito('op.exp.8.2').status === 'NO_CUMPLE' && caida.r.requisito('op.exp.8.2').evidenced === true, caida.r.requisito('op.exp.8.2').status);
  comprueba('la laguna de hace 6 h sigue contando aunque el servidor ya haya vuelto (no es un hecho de estado)', /laguna en 1 de 12/.test(caida.motivo), caida.motivo);
  const caidaHolgada = ev04(serie(12, i => (i === 5 ? { '024': 4 } : {})), { ...BASE, 'P-12': '5' });
  comprueba('REVERSIÓN: la misma serie con P-12 = 5 → CUMPLE', caidaHolgada.estado === 'CUMPLE', caidaHolgada.motivo);

  const huecos = ev04(serie(12, () => ({}), [4, 5, 6, 7]));
  comprueba('faltan 4 pasadas seguidas del recolector (5 h sin mirar, P-12 = 3) → NO_EVALUABLE, no NO_CUMPLE', huecos.estado === 'NO_EVALUABLE' && huecos.causa === 'COLLECTION' && /Faltan pasadas del recolector del manager/.test(huecos.motivo), `${huecos.estado} ${huecos.causa} ${huecos.motivo}`);
  comprueba('y op.exp.8.2 queda no demostrado, con causa de RECOGIDA', huecos.r.requisito('op.exp.8.2').evidenced === false, huecos.r.requisito('op.exp.8.2').status);
  const huecosHolgados = ev04(serie(12, () => ({}), [4, 5, 6, 7]), { ...BASE, 'P-12': '6' });
  comprueba('REVERSIÓN: los mismos huecos con P-12 = 6 → CUMPLE', huecosHolgados.estado === 'CUMPLE', huecosHolgados.motivo);
  const unaPerdida = ev04(serie(12, () => ({}), [6]));
  comprueba('una sola pasada perdida (2 h entre dos, P-12 = 3) no es un hueco', unaPerdida.estado === 'CUMPLE', unaPerdida.motivo);

  const ambas = ev04(serie(12, i => (i === 9 ? { '025': 5 } : {}), [3, 4, 5, 6]));
  comprueba('laguna observada y además pasadas perdidas → manda la medida: NO_CUMPLE', ambas.estado === 'NO_CUMPLE' && /wazuh-fake/.test(ambas.motivo), ambas.motivo);

  const parado = ev04(serie(12), BASE, new Date('2026-09-27T00:30:00Z'));
  comprueba('la última pasada tiene 5 h y P-12 = 3 → NO_EVALUABLE (el recolector no está mirando)', parado.estado === 'NO_EVALUABLE' && parado.causa === 'COLLECTION' && /hasta ahora/.test(parado.motivo), `${parado.estado} ${parado.motivo}`);

  const nunca = ev04(serie(3, () => ({ '024': null })));
  comprueba('un servidor de P-02 que nunca conectó (sin keepalive) → NO_CUMPLE', nunca.estado === 'NO_CUMPLE' && /wazuh-real: laguna en 3 de 3 pasadas/.test(nunca.motivo) && /never_connected/.test(nunca.motivo), nunca.motivo);

  const baja = ev04(serie(4, i => (i === 2 ? { '025': undefined } : {})));
  comprueba('un servidor que desaparece de la base de agentes en una pasada → laguna', baja.estado === 'NO_CUMPLE' && /wazuh-fake: laguna en 1 de 4/.test(baja.motivo) && /no figuraba/.test(baja.motivo), baja.motivo);

  // Los hechos del recolector anterior (horas sin alertas) ya no deciden nada.
  const viejo = ev04(eventos([
    ...sinEv04,
    { ts: '2026-09-26T19:11:44Z', event: 'log_ingestion_status', evidence_id: 'EV-04', requisito: 'op.exp.8.1,op.exp.8.2', plano: 'central', agente_id: '000', agente: 'Wazuh-4', ultimo_evento: '2026-09-26T19:11:30Z', eventos_24h: 866, horas_sin_eventos_24h: 10, mayor_laguna_horas: 5, ventana_observada_horas: 13 },
  ], MANAGER));
  comprueba('solo con log_ingestion_status (recolector anterior) → NO_EVALUABLE por RECOGIDA, ni CUMPLE ni la laguna de 5 h', viejo.estado === 'NO_EVALUABLE' && viejo.causa === 'COLLECTION' && !/laguna de 5 h/.test(viejo.motivo), `${viejo.estado} ${viejo.motivo}`);

  const sinBase = ev04(eventos([
    ...sinEv04,
    ...pasada(FIN - 3600000, {}),
    { ts: '2026-09-26T19:11:44Z', event: 'evidence_state', evidence_id: 'EV-04', requisito: 'op.exp.8.1,op.exp.8.2', plano: 'central', estado: 'NO_EVALUABLE', causa: 'COLLECTION', motivo: 'no se puede leer la base de agentes del manager /var/ossec/queue/db/global.db' },
  ], MANAGER));
  comprueba('global.db ilegible en la última pasada → NO_EVALUABLE con el motivo del recolector', sinBase.estado === 'NO_EVALUABLE' && /global\.db/.test(sinBase.motivo), sinBase.motivo);

  comprueba('EV-04 no se declara hecho de estado: el motor no descarta las pasadas anteriores', !getStateFactEventTypes('op.exp.8').has('agent_keepalive_observed'));
}

// --- salida ----------------------------------------------------------------

console.log('');

if (fallos.length) {
  console.log(`${fallos.length} comprobación(es) fallan:`);
  fallos.forEach(f => console.log(`  - ${f}`));
  process.exit(1);
}

console.log('Todas las comprobaciones pasan.');
