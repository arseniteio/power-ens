/** op.exp.8: judgment of activity logging. */
import { opExp8PolicyDefinition } from '../common/ens/core/policy-runtime/policies/op-exp-8.policy';
import { buildPolicyContext } from '../common/ens/core/policy-runtime/policy-context-builder';
import { opExp8CatalogDefinition } from '../common/ens/catalog/op-exp-8';
import { opExp8Configuration } from '../common/ens/configuration/data/op-exp-8-parameters';
import { normalizeWazuhAlerts } from '../common/ens/core/data-source/data-source-engine';
import { resolveEvidenceForControl } from '../common/ens/core/evidence/engine';
import { getStateFactEventTypes, keepLatestRunStateFacts } from '../common/ens/core/evidence/state-facts';
import { applyPolicyDecisionsToEvidences } from '../common/ens/core/evaluation/policy-evidence-bridge';
import { evaluateRequirement } from '../common/ens/core/evaluation/requirement/requirement-evaluator';
import type {
  ENSControlConfiguration,
  ENSLevel,
} from '../common/ens/configuration/types';
import type { ENSNormalizedEvent } from '../common/ens/core/data-source/types';

declare const process: { exit(code: number): void };

const failures: string[] = [];

const check = (name: string, condition: boolean, detail: unknown = ''): void => {
  if (condition) {
    console.log(`  ok   ${name}`);

    return;
  }

  failures.push(name);
  console.log(`  FAIL ${name}${detail !== '' ? ` — ${String(detail)}` : ''}`);
};

const section = (title: string): void => console.log(`\n${title}`);

const REAL_WAZUH_REAL: Record<string, unknown>[] = [
  {"power_ens": "op.exp.8", "ts": "2026-09-26T19:11:47Z", "host": "wazuh-real", "event": "audit_log_status", "evidence_id": "EV-01", "requisito": "op.exp.8.1", "plano": "sistema", "fuente": "auditd", "activo": "si", "habilitado_kernel": "1", "reglas_cargadas": 80, "ruta": "/var/log/audit/audit.log"},
  {"power_ens": "op.exp.8", "ts": "2026-09-26T19:11:47Z", "host": "wazuh-real", "event": "audit_log_status", "evidence_id": "EV-01", "requisito": "op.exp.8.1", "plano": "sistema", "fuente": "journald", "activo": "si", "almacenamiento": "persistente"},
  {"power_ens": "op.exp.8", "ts": "2026-09-26T19:11:47Z", "host": "wazuh-real", "event": "audit_log_status", "evidence_id": "EV-01", "requisito": "op.exp.8.1", "plano": "sistema", "fuente": "rsyslog", "activo": "si"},
  {"power_ens": "op.exp.8", "ts": "2026-09-26T19:11:47Z", "host": "wazuh-real", "event": "agent_status", "evidence_id": "EV-02", "requisito": "op.exp.8.2", "plano": "sistema", "estado_conexion": "connected", "ultimo_keepalive": "2026-09-26T19:11:42Z", "ultimo_ack": "2026-09-26T19:11:42Z", "mensajes_enviados": "182786", "mensajes_en_buffer": "0"},
  {"power_ens": "op.exp.8", "ts": "2026-09-26T19:11:47Z", "host": "wazuh-real", "event": "audit_record_fields", "evidence_id": "EV-03", "requisito": "op.exp.8.1", "plano": "sistema", "fuente": "auditd", "ruta": "/var/log/audit/audit.log", "muestra": 500, "con_usuario": 500, "con_fecha_hora": 500, "con_objeto": 489, "con_tipo_evento": 500, "con_resultado": 500, "campos_ausentes": "-"},
  {"power_ens": "op.exp.8", "ts": "2026-09-26T19:11:47Z", "host": "wazuh-real", "event": "time_sync_status", "evidence_id": "EV-06", "requisito": "op.exp.8.r2.1", "plano": "sistema", "servicio": "systemd-timesyncd", "sincronizado": "si", "fuentes": "ntp.hetzner.com", "autenticacion": "ninguna", "desfase_segundos": "0.001935", "estrato": "2", "vigilancia_cambio_hora": "no", "zona_horaria": "Etc/UTC"},
  {"power_ens": "op.exp.8", "ts": "2026-09-26T19:11:48Z", "host": "wazuh-real", "event": "log_access_permissions", "evidence_id": "EV-08", "requisito": "op.exp.8.r4.1", "plano": "sistema", "ruta": "/var/log/audit", "propietario": "root", "grupo": "adm", "modo": "750", "acl": "-", "lectura_mundo": "no", "ficheros_examinados": 5, "cuentas": "root,syslog"},
  {"power_ens": "op.exp.8", "ts": "2026-09-26T19:11:48Z", "host": "wazuh-real", "event": "log_access_permissions", "evidence_id": "EV-08", "requisito": "op.exp.8.r4.1", "plano": "sistema", "ruta": "/var/log/journal", "propietario": "root", "grupo": "systemd-journal", "modo": "2755", "acl": "group:adm:r-x", "lectura_mundo": "no", "ficheros_examinados": 13, "cuentas": "dioni,root,syslog"},
  {"power_ens": "op.exp.8", "ts": "2026-09-26T19:11:48Z", "host": "wazuh-real", "event": "log_access_permissions", "evidence_id": "EV-08", "requisito": "op.exp.8.r4.1", "plano": "sistema", "ruta": "/var/log/syslog", "propietario": "syslog", "grupo": "adm", "modo": "640", "acl": "-", "lectura_mundo": "no", "ficheros_examinados": 1, "cuentas": "root,syslog"},
  {"power_ens": "op.exp.8", "ts": "2026-09-26T19:11:48Z", "host": "wazuh-real", "event": "log_access_permissions", "evidence_id": "EV-08", "requisito": "op.exp.8.r4.1", "plano": "sistema", "ruta": "/var/log/auth.log", "propietario": "syslog", "grupo": "adm", "modo": "640", "acl": "-", "lectura_mundo": "no", "ficheros_examinados": 1, "cuentas": "root,syslog"},
  {"power_ens": "op.exp.8", "ts": "2026-09-26T19:11:48Z", "host": "wazuh-real", "event": "log_access_permissions", "evidence_id": "EV-08", "requisito": "op.exp.8.r4.1", "plano": "sistema", "ruta": "/var/log/power-ens", "propietario": "root", "grupo": "root", "modo": "750", "acl": "-", "lectura_mundo": "no", "ficheros_examinados": 10, "cuentas": "root"},
  {"power_ens": "op.exp.8", "ts": "2026-09-26T19:11:49Z", "host": "wazuh-real", "event": "log_access_permissions", "evidence_id": "EV-08", "requisito": "op.exp.8.r4.1", "plano": "sistema", "ruta": "/var/ossec/logs", "propietario": "wazuh", "grupo": "wazuh", "modo": "770", "acl": "-", "lectura_mundo": "no", "ficheros_examinados": 2, "cuentas": "root,wazuh"},
  {"power_ens": "op.exp.8", "ts": "2026-09-26T19:11:49Z", "host": "wazuh-real", "event": "collector_run", "resultado": "completada", "evidencias_cubiertas": "EV-01,EV-02,EV-03,EV-06,EV-08", "tipo_servidor": "linux", "emisor": "recolector"},
];

const REAL_COVERAGE_WAZUH_REAL: Record<string, unknown>[] = [
  {"power_ens": "op.exp.8", "ts": "2026-09-26T19:11:47Z", "host": "wazuh-real", "event": "audit_coverage", "evidence_id": "EV-01", "requisito": "op.exp.8.1", "plano": "sistema", "categoria": "configuracion", "objeto": "rutas", "auditd": "si", "vigiladas": "/etc/ssh,/etc/pam.d,/etc/security,/etc/login.defs,/etc/sudoers,/etc/sudoers.d,/etc/audit,/var/ossec/etc/ossec.conf,/etc/sysctl.conf,/etc/sysctl.d,/etc/apparmor.d,/etc/ufw,/etc/nftables.conf", "sin_vigilar": "/etc/netplan,/etc/hosts,/etc/fstab,/etc/systemd/system,/etc/crontab,/etc/cron.d,/etc/apt/sources.list,/etc/apt/sources.list.d"},
  {"power_ens": "op.exp.8", "ts": "2026-09-26T19:11:47Z", "host": "wazuh-real", "event": "audit_coverage", "evidence_id": "EV-01", "requisito": "op.exp.8.1", "plano": "sistema", "categoria": "cuentas", "objeto": "rutas", "auditd": "si", "vigiladas": "/etc/group", "sin_vigilar": "/etc/passwd,/etc/shadow,/etc/gshadow"},
  {"power_ens": "op.exp.8", "ts": "2026-09-26T19:11:47Z", "host": "wazuh-real", "event": "audit_coverage", "evidence_id": "EV-01", "requisito": "op.exp.8.1", "plano": "sistema", "categoria": "privilegios", "objeto": "rutas", "auditd": "si", "vigiladas": "/etc/sudoers,/etc/sudoers.d", "sin_vigilar": "-"},
  {"power_ens": "op.exp.8", "ts": "2026-09-26T19:11:47Z", "host": "wazuh-real", "event": "audit_coverage", "evidence_id": "EV-01", "requisito": "op.exp.8.1", "plano": "sistema", "categoria": "claves", "objeto": "rutas", "auditd": "si", "vigiladas": "/etc/ssh/ssh_host_rsa_key,/etc/ssh/ssh_host_ecdsa_key,/etc/ssh/ssh_host_ed25519_key,/var/ossec/etc/client.keys", "sin_vigilar": "/etc/ssl/private"},
  {"power_ens": "op.exp.8", "ts": "2026-09-26T19:11:47Z", "host": "wazuh-real", "event": "audit_coverage", "evidence_id": "EV-01", "requisito": "op.exp.8.1", "plano": "sistema", "categoria": "hora", "objeto": "syscalls", "auditd": "si", "vigiladas": "-", "sin_vigilar": "adjtimex,settimeofday,clock_settime"},
];

const FULL_COVERAGE = REAL_COVERAGE_WAZUH_REAL.map(l => {
  const allOnes = [l.vigiladas, l.sin_vigilar].filter(v => v !== '-').join(',');

  return { ...l, vigiladas: allOnes, sin_vigilar: '-' };
});

const REAL_WAZUH4: Record<string, unknown>[] = [
  {"power_ens": "op.exp.8", "ts": "2026-09-26T19:11:29Z", "host": "Wazuh-4", "event": "audit_log_status", "evidence_id": "EV-01", "requisito": "op.exp.8.1", "plano": "sistema", "fuente": "auditd", "activo": "no_instalado", "reglas_cargadas": 0, "detalle": "auditd no esta instalado: no hay registro de auditoria del sistema"},
  {"power_ens": "op.exp.8", "ts": "2026-09-26T19:11:29Z", "host": "Wazuh-4", "event": "audit_log_status", "evidence_id": "EV-01", "requisito": "op.exp.8.1", "plano": "sistema", "fuente": "journald", "activo": "si", "almacenamiento": "persistente"},
  {"power_ens": "op.exp.8", "ts": "2026-09-26T19:11:29Z", "host": "Wazuh-4", "event": "audit_log_status", "evidence_id": "EV-01", "requisito": "op.exp.8.1", "plano": "sistema", "fuente": "rsyslog", "activo": "si"},
  {"power_ens": "op.exp.8", "ts": "2026-09-26T19:11:29Z", "host": "Wazuh-4", "event": "evidence_state", "evidence_id": "EV-03", "requisito": "op.exp.8.1", "plano": "sistema", "estado": "NO_EVALUABLE", "causa": "COLLECTION", "motivo": "no se puede leer el log de auditoria /var/log/audit/audit.log: sin el no hay registro de auditoria que muestrear"},
  {"power_ens": "op.exp.8", "ts": "2026-09-26T19:11:29Z", "host": "Wazuh-4", "event": "time_sync_status", "evidence_id": "EV-06", "requisito": "op.exp.8.r2.1", "plano": "sistema", "servicio": "systemd-timesyncd", "sincronizado": "si", "fuentes": "ntp.hetzner.com", "autenticacion": "ninguna", "desfase_segundos": "-0.000259", "estrato": "2", "vigilancia_cambio_hora": "no", "zona_horaria": "Etc/UTC"},
  {"power_ens": "op.exp.8", "ts": "2026-09-26T19:11:32Z", "host": "Wazuh-4", "event": "log_access_permissions", "evidence_id": "EV-08", "requisito": "op.exp.8.r4.1", "plano": "sistema", "ruta": "/var/log/journal", "propietario": "root", "grupo": "systemd-journal", "modo": "2755", "acl": "group:adm:r-x", "lectura_mundo": "no", "ficheros_examinados": 68, "cuentas": "dioni,fran,root,syslog"},
  {"power_ens": "op.exp.8", "ts": "2026-09-26T19:11:32Z", "host": "Wazuh-4", "event": "log_access_permissions", "evidence_id": "EV-08", "requisito": "op.exp.8.r4.1", "plano": "sistema", "ruta": "/var/log/syslog", "propietario": "syslog", "grupo": "adm", "modo": "640", "acl": "-", "lectura_mundo": "no", "ficheros_examinados": 1, "cuentas": "root,syslog"},
  {"power_ens": "op.exp.8", "ts": "2026-09-26T19:11:32Z", "host": "Wazuh-4", "event": "log_access_permissions", "evidence_id": "EV-08", "requisito": "op.exp.8.r4.1", "plano": "sistema", "ruta": "/var/log/auth.log", "propietario": "syslog", "grupo": "adm", "modo": "640", "acl": "-", "lectura_mundo": "no", "ficheros_examinados": 1, "cuentas": "root,syslog"},
  {"power_ens": "op.exp.8", "ts": "2026-09-26T19:11:32Z", "host": "Wazuh-4", "event": "log_access_permissions", "evidence_id": "EV-08", "requisito": "op.exp.8.r4.1", "plano": "sistema", "ruta": "/var/log/power-ens", "propietario": "root", "grupo": "wazuh", "modo": "750", "acl": "-", "lectura_mundo": "no", "ficheros_examinados": 6, "cuentas": "root,wazuh"},
  {"power_ens": "op.exp.8", "ts": "2026-09-26T19:11:37Z", "host": "Wazuh-4", "event": "log_access_permissions", "evidence_id": "EV-08", "requisito": "op.exp.8.r4.1", "plano": "sistema", "ruta": "/var/ossec/logs/alerts", "propietario": "wazuh", "grupo": "wazuh", "modo": "750", "acl": "-", "lectura_mundo": "no", "ficheros_examinados": 200, "cuentas": "root,wazuh"},
  {"power_ens": "op.exp.8", "ts": "2026-09-26T19:11:42Z", "host": "Wazuh-4", "event": "log_access_permissions", "evidence_id": "EV-08", "requisito": "op.exp.8.r4.1", "plano": "sistema", "ruta": "/var/ossec/logs/archives", "propietario": "wazuh", "grupo": "wazuh", "modo": "750", "acl": "-", "lectura_mundo": "no", "ficheros_examinados": 200, "cuentas": "root,wazuh"},
  {"power_ens": "op.exp.8", "ts": "2026-09-26T19:11:42Z", "host": "Wazuh-4", "event": "log_access_permissions", "evidence_id": "EV-08", "requisito": "op.exp.8.r4.1", "plano": "sistema", "ruta": "/var/lib/wazuh-indexer", "propietario": "wazuh-indexer", "grupo": "wazuh-indexer", "modo": "750", "acl": "-", "lectura_mundo": "no", "ficheros_examinados": 6, "cuentas": "root,wazuh-indexer"},
  {"power_ens": "op.exp.8", "ts": "2026-09-26T19:11:44Z", "host": "Wazuh-4", "event": "agent_keepalive_observed", "evidence_id": "EV-04", "requisito": "op.exp.8.1,op.exp.8.2", "plano": "central", "agente_id": "000", "agente": "Wazuh-4", "estado_conexion": "active", "ultimo_keepalive": "2026-09-26T19:11:44Z", "local": "si", "ultimo_evento": "2026-09-26T19:11:30Z", "eventos_24h": 866},
  {"power_ens": "op.exp.8", "ts": "2026-09-26T19:11:44Z", "host": "Wazuh-4", "event": "agent_keepalive_observed", "evidence_id": "EV-04", "requisito": "op.exp.8.1,op.exp.8.2", "plano": "central", "agente_id": "024", "agente": "wazuh-real", "estado_conexion": "active", "ultimo_keepalive": "2026-09-26T19:11:00Z", "local": "no", "ultimo_evento": "2026-09-26T19:11:42Z", "eventos_24h": 2875},
  {"power_ens": "op.exp.8", "ts": "2026-09-26T19:11:44Z", "host": "Wazuh-4", "event": "agent_keepalive_observed", "evidence_id": "EV-04", "requisito": "op.exp.8.1,op.exp.8.2", "plano": "central", "agente_id": "025", "agente": "wazuh-fake", "estado_conexion": "active", "ultimo_keepalive": "2026-09-26T19:11:00Z", "local": "no", "ultimo_evento": "2026-09-26T19:00:02Z", "eventos_24h": 6692},
  {"power_ens": "op.exp.8", "ts": "2026-09-26T19:11:44Z", "host": "Wazuh-4", "event": "log_review_recorded", "evidence_id": "EV-05", "requisito": "op.exp.8.r1.1", "plano": "central", "registro": "/tmp/power-ens-dev-op.exp.8/registro-ejemplo.tsv", "revisiones": 2, "ultima_revision": "2026-09-15", "revisor": "rsec", "alcance": "autenticaciones fallidas y sudo", "hallazgos": "dos fuerzas brutas SSH bloqueadas", "referencia": "https://intranet.ejemplo/revisiones/2026-09-15"},
  {"power_ens": "op.exp.8", "ts": "2026-09-26T19:11:44Z", "host": "Wazuh-4", "event": "log_retention_observed", "evidence_id": "EV-07", "requisito": "op.exp.8.r3.1", "plano": "central", "almacen": "alertas_disco", "ruta": "/var/ossec/logs/alerts", "activo": "si", "mas_antiguo": "2026-06-12", "dias_conservados": "106", "ficheros": 105},
  {"power_ens": "op.exp.8", "ts": "2026-09-26T19:11:44Z", "host": "Wazuh-4", "event": "log_retention_observed", "evidence_id": "EV-07", "requisito": "op.exp.8.r3.1", "plano": "central", "almacen": "archives_disco", "ruta": "/var/ossec/logs/archives", "activo": "no", "logall": "no", "logall_json": "no", "mas_antiguo": "2026-06-12", "dias_conservados": "106"},
  {"power_ens": "op.exp.8", "ts": "2026-09-26T19:11:44Z", "host": "Wazuh-4", "event": "evidence_state", "evidence_id": "EV-07", "requisito": "op.exp.8.r3.1", "plano": "central", "estado": "NO_EVALUABLE", "causa": "CONFIGURATION", "motivo": "la retencion de los indices del Wazuh Indexer (politicas ISM sobre wazuh-alerts-*) solo se ve consultando el indexer, y el recolector del manager no usa credenciales por decision del responsable (26/09): la retencion efectiva frente a P-07 queda sin demostrar. En disco el manager conserva alertas desde 2026-06-12 (ver log_retention_observed)"},
  {"power_ens": "op.exp.8", "ts": "2026-09-26T19:11:44Z", "host": "Wazuh-4", "event": "evidence_state", "evidence_id": "EV-08", "requisito": "op.exp.8.r4.1", "plano": "central", "estado": "NO_EVALUABLE", "causa": "CONFIGURATION", "motivo": "los accesos efectivos a los indices (audit log del plugin de seguridad del Wazuh Indexer) y las cuentas y roles del indexer solo se ven consultando el indexer, y el recolector del manager no usa credenciales por decision del responsable (26/09). Se mide quien puede leer los registros en el disco del manager (log_access_permissions); quien accede a los indices queda sin demostrar"},
  {"power_ens": "op.exp.8", "ts": "2026-09-26T19:11:44Z", "host": "Wazuh-4", "event": "evidence_state", "evidence_id": "EV-09", "requisito": "op.exp.8.r4.1", "plano": "central", "estado": "NO_EVALUABLE", "causa": "CONFIGURATION", "motivo": "las copias de los registros (snapshots del Wazuh Indexer y su repositorio) solo se ven consultando el indexer, y el recolector del manager no usa credenciales por decision del responsable (26/09): su existencia, frescura y acceso quedan sin demostrar"},
  {"power_ens": "op.exp.8", "ts": "2026-09-26T19:11:44Z", "host": "Wazuh-4", "event": "correlation_rules_inventory", "evidence_id": "EV-10", "requisito": "op.exp.8.r5.1", "plano": "central", "conjunto": "power_ens", "ruta": "/var/ossec/etc/rules", "ficheros": 12, "reglas": 212, "reglas_con_mitre": 0, "tecnicas_mitre": 0},
  {"power_ens": "op.exp.8", "ts": "2026-09-26T19:11:44Z", "host": "Wazuh-4", "event": "correlation_rules_inventory", "evidence_id": "EV-10", "requisito": "op.exp.8.r5.1", "plano": "central", "conjunto": "local", "ruta": "/var/ossec/etc/rules", "ficheros": 1, "reglas": 1, "reglas_con_mitre": 0, "tecnicas_mitre": 0},
  {"power_ens": "op.exp.8", "ts": "2026-09-26T19:11:45Z", "host": "Wazuh-4", "event": "correlation_rules_inventory", "evidence_id": "EV-10", "requisito": "op.exp.8.r5.1", "plano": "central", "conjunto": "quersystem", "ruta": "/var/ossec/etc/rules", "ficheros": 6, "reglas": 26, "reglas_con_mitre": 7, "tecnicas_mitre": 5},
  {"power_ens": "op.exp.8", "ts": "2026-09-26T19:11:45Z", "host": "Wazuh-4", "event": "correlation_rules_inventory", "evidence_id": "EV-10", "requisito": "op.exp.8.r5.1", "plano": "central", "conjunto": "wazuh", "ruta": "/var/ossec/ruleset/rules", "ficheros": 167, "reglas": 4510, "reglas_con_mitre": 1013, "tecnicas_mitre": 166},
  {"power_ens": "op.exp.8", "ts": "2026-09-26T19:11:45Z", "host": "Wazuh-4", "event": "correlation_rules_inventory", "evidence_id": "EV-10", "requisito": "op.exp.8.r5.1", "plano": "central", "conjunto": "wordpress", "ruta": "/var/ossec/etc/rules", "ficheros": 1, "reglas": 10, "reglas_con_mitre": 1, "tecnicas_mitre": 1},
  {"power_ens": "op.exp.8", "ts": "2026-09-26T19:11:45Z", "host": "Wazuh-4", "event": "correlation_rules_inventory", "evidence_id": "EV-10", "requisito": "op.exp.8.r5.1", "plano": "central", "conjunto": "zz", "ruta": "/var/ossec/etc/rules", "ficheros": 1, "reglas": 2, "reglas_con_mitre": 0, "tecnicas_mitre": 0},
  {"power_ens": "op.exp.8", "ts": "2026-09-26T19:11:45Z", "host": "Wazuh-4", "event": "active_response_configured", "evidence_id": "EV-11", "requisito": "op.exp.8.r5.2", "plano": "central", "comando": "firewall-drop", "comando_definido": "si", "ubicacion": "local", "agente_id": "-", "reglas_id": "5763", "grupos": "-", "nivel": "-", "timeout": "180", "deshabilitada": "no"},
  {"power_ens": "op.exp.8", "ts": "2026-09-26T19:11:45Z", "host": "Wazuh-4", "event": "active_response_configured", "evidence_id": "EV-11", "requisito": "op.exp.8.r5.2", "plano": "central", "comando": "firewall-drop", "comando_definido": "si", "ubicacion": "local", "agente_id": "-", "reglas_id": "107200", "grupos": "-", "nivel": "-", "timeout": "60", "deshabilitada": "no"},
  {"power_ens": "op.exp.8", "ts": "2026-09-26T19:11:45Z", "host": "Wazuh-4", "event": "active_response_configured", "evidence_id": "EV-11", "requisito": "op.exp.8.r5.2", "plano": "central", "comando": "quersystem-yara-linux", "comando_definido": "si", "ubicacion": "local", "agente_id": "-", "reglas_id": "108100,108101", "grupos": "-", "nivel": "-", "timeout": "-", "deshabilitada": "no"},
  {"power_ens": "op.exp.8", "ts": "2026-09-26T19:11:45Z", "host": "Wazuh-4", "event": "active_response_configured", "evidence_id": "EV-11", "requisito": "op.exp.8.r5.2", "plano": "central", "comando": "quersystem-yara-win", "comando_definido": "si", "ubicacion": "local", "agente_id": "-", "reglas_id": "108120,108121", "grupos": "-", "nivel": "-", "timeout": "-", "deshabilitada": "no"},
  {"power_ens": "op.exp.8", "ts": "2026-09-26T19:11:45Z", "host": "Wazuh-4", "event": "active_response_configured", "evidence_id": "EV-11", "requisito": "op.exp.8.r5.2", "plano": "central", "comando": "quersystem-malware-quarantine-linux", "comando_definido": "si", "ubicacion": "local", "agente_id": "-", "reglas_id": "108130", "grupos": "-", "nivel": "-", "timeout": "-", "deshabilitada": "no"},
  {"power_ens": "op.exp.8", "ts": "2026-09-26T19:11:45Z", "host": "Wazuh-4", "event": "active_response_configured", "evidence_id": "EV-11", "requisito": "op.exp.8.r5.2", "plano": "central", "comando": "quersystem-malware-quarantine-win", "comando_definido": "si", "ubicacion": "local", "agente_id": "-", "reglas_id": "108131", "grupos": "-", "nivel": "-", "timeout": "-", "deshabilitada": "no"},
  {"power_ens": "op.exp.8", "ts": "2026-09-26T19:11:45Z", "host": "Wazuh-4", "event": "logging_service_status", "evidence_id": "EV-13", "requisito": "op.exp.8.1,op.exp.8.r4.1", "plano": "central", "servicio": "wazuh-manager", "activo": "si", "activo_desde": "2026-09-21T12:01:53Z", "reinicios": "0", "huella_ossec_conf": "e2055aac5cf3d7a8", "huella_reglas_propias": "3741b3e44ac9ea2e"},
  {"power_ens": "op.exp.8", "ts": "2026-09-26T19:11:45Z", "host": "Wazuh-4", "event": "logging_service_status", "evidence_id": "EV-13", "requisito": "op.exp.8.1,op.exp.8.r4.1", "plano": "central", "servicio": "wazuh-indexer", "activo": "si", "activo_desde": "2026-09-24T22:22:12Z", "reinicios": "0", "huella_ossec_conf": "e2055aac5cf3d7a8", "huella_reglas_propias": "3741b3e44ac9ea2e"},
  {"power_ens": "op.exp.8", "ts": "2026-09-26T19:11:45Z", "host": "Wazuh-4", "event": "logging_service_status", "evidence_id": "EV-13", "requisito": "op.exp.8.1,op.exp.8.r4.1", "plano": "central", "servicio": "wazuh-dashboard", "activo": "si", "activo_desde": "2026-09-25T05:36:27Z", "reinicios": "0", "huella_ossec_conf": "e2055aac5cf3d7a8", "huella_reglas_propias": "3741b3e44ac9ea2e"},
  {"power_ens": "op.exp.8", "ts": "2026-09-26T19:11:45Z", "host": "Wazuh-4", "event": "collector_run", "resultado": "completada", "evidencias_cubiertas": "EV-01,EV-06,EV-08,EV-04,EV-12,EV-05,EV-07,EV-10,EV-11,EV-13", "tipo_servidor": "manager", "emisor": "recolector"},
];

const NOW = new Date('2026-09-26T19:30:00Z');

let counter = 0;

const RULE: Record<string, string> = {
  audit_log_status: '110901', agent_status: '110902', audit_record_fields: '110903',
  agent_keepalive_observed: '110915', log_review_recorded: '110905', time_sync_status: '110906',
  clock_change_observed: '110907', log_retention_observed: '110908',
  log_access_permissions: '110909', correlation_rules_inventory: '110910',
  active_response_configured: '110911', active_response_executed: '110912',
  logging_service_status: '110913', audit_coverage: '110914', evidence_state: '110950', collector_run: '110997',
};

const alert = (line: Record<string, unknown>, agent: { id: string; name: string }, ts?: string) => {
  counter += 1;
  const { ts: tsLine, host: _host, ...data } = line as Record<string, unknown> & { ts: string };

  return {
    _id: `alerta-${counter}`,
    _source: {
      '@timestamp': ts || tsLine,
      agent: agent,
      rule: { id: RULE[String(data.event)] || '110900', description: 'op.exp.8' },
      location: '/var/log/power-ens/op_exp_8.json',
      data: Object.fromEntries(Object.entries({ power_ens: 'op.exp.8', ...data }).map(([k, v]) => [k, String(v)])),
    },
  };
};

const AGENT = { id: '024', name: 'wazuh-real' };
const MANAGER = { id: '000', name: 'Wazuh-4' };

const events = (
  lines: Record<string, unknown>[],
  agent: { id: string; name: string },
  changes: (l: Record<string, unknown>) => Record<string, unknown> | undefined = l => l
): ENSNormalizedEvent[] =>
  normalizeWazuhAlerts(
    lines
      .map(l => changes({ ...l }))
      .filter((l): l is Record<string, unknown> => Boolean(l))
      .map(l => alert(l, agent))
  );

const configuration = (values: Record<string, string[] | string>): ENSControlConfiguration => ({
  ...opExp8Configuration,
  parameters: opExp8Configuration.parameters.map(p => ({
    ...p,
    value: values[p.id],
  })),
});

const BASE: Record<string, string[] | string> = {
  'P-01': ['autenticación | sshd, sudo, auditd | 3', 'cambios de configuración | auditd | 5'],
  'P-02': ['wazuh-real | Ubuntu 24.04 | servidor', 'wazuh-fake | Ubuntu 22.04 | laboratorio', 'Wazuh-4 | Ubuntu 22.04 | SIEM'],
  'P-04': '30',
  'P-05': ['ntp.hetzner.com | ninguno'],
  'P-06': '1',
  'P-07': ['autenticación | 365', 'tráfico | 90'],
  'P-08': ['root | total | todo', 'syslog | escritura | sistema', 'wazuh | escritura | Wazuh', 'wazuh-indexer | escritura | índices', 'dioni | lectura | journal propio', 'fran | lectura | journal propio'],
  'P-10': ['wazuh | todas | sí', 'power_ens | ENS | no'],
  'P-11': ['firewall-drop | fuerza bruta SSH (5763) | agente | 180 s'],
  'P-12': '3',
};

const evaluate = (
  evs: ENSNormalizedEvent[],
  values: Record<string, string[] | string> = BASE,
  now: Date = NOW,
  level: ENSLevel = 'ALTO',
  agent = '024'
) => {
  const cfg = configuration(values);
  const ofTheControl = keepLatestRunStateFacts('op.exp.8', evs, now);
  const evidences = resolveEvidenceForControl('op.exp.8', ofTheControl, agent, level, cfg, now);
  const context = buildPolicyContext(opExp8CatalogDefinition, cfg, level, ofTheControl, evidences, now);
  const { decisions } = opExp8PolicyDefinition.evaluator!(context);
  const tabla = applyPolicyDecisionsToEvidences(evidences, decisions, opExp8CatalogDefinition.requirements);
  const requirement = (id: string) =>
    evaluateRequirement(
      opExp8CatalogDefinition.requirements.find(q => q.id === id)!,
      level,
      tabla,
      false,
      decisions,
      'ACTIVE'
    );
  const evidence = (id: string) => tabla.find(e => e.id === id);
  const motive = (req: string) => decisions.find(d => d.requirementId === req)?.reason || '';

  return { evidencias: evidences, decisions, requisito: requirement, evidencia: evidence, motivo: motive };
};

const host = (changes?: (l: Record<string, unknown>) => Record<string, unknown> | undefined) =>
  events([...REAL_WAZUH_REAL, ...FULL_COVERAGE], AGENT, changes);
const realHost = (changes?: (l: Record<string, unknown>) => Record<string, unknown> | undefined) =>
  events([...REAL_WAZUH_REAL, ...REAL_COVERAGE_WAZUH_REAL], AGENT, changes);
const hostWithoutCoverage = () => events(REAL_WAZUH_REAL, AGENT);
const central = (changes?: (l: Record<string, unknown>) => Record<string, unknown> | undefined) =>
  events(REAL_WAZUH4, MANAGER, changes);

section('1. Catalog: Traceability level and cumulative reinforcements');

{
  const levels = (id: string) =>
    opExp8CatalogDefinition.requirements.find(r => r.id === id)!.applicability.levels.join(',');

  check('op.exp.8 is governed by the Traceability dimension', opExp8CatalogDefinition.levelDimension === 'T');
  check('the base applies at the three levels', ['op.exp.8.1', 'op.exp.8.2'].every(id => levels(id) === 'BAJO,MEDIO,ALTO'));
  check('R1 to R4 from MEDIO', ['op.exp.8.r1.1', 'op.exp.8.r2.1', 'op.exp.8.r3.1', 'op.exp.8.r4.1'].every(id => levels(id) === 'MEDIO,ALTO'));
  check('R5 solo en ALTO', ['op.exp.8.r5.1', 'op.exp.8.r5.2'].every(id => levels(id) === 'ALTO'));
  check('the control is ACTIVE', opExp8CatalogDefinition.status === 'ACTIVE', opExp8CatalogDefinition.status);
  check(
    'the policy declares the same levels as the catalog',
    opExp8PolicyDefinition.requirements.every(r => r.levels.join(',') === levels(r.requirementId))
  );
}

section('2. A server\'s row (wazuh-real): its own is measured; the central part does not apply');

{
  const r = evaluate(host());

  check('op.exp.8.1 CUMPLE: auditd covers P-01\'s categories, persistent journald, five fields', r.requisito('op.exp.8.1').status === 'CUMPLE', r.motivo('op.exp.8.1'));
  check('op.exp.8.2 CUMPLE: keepalive from 18 min ago with a 3 h deadline', r.requisito('op.exp.8.2').status === 'CUMPLE', r.motivo('op.exp.8.2'));
  check('op.exp.8.r2.1 NO_CUMPLE: systemd-timesyncd without authentication', r.requisito('op.exp.8.r2.1').status === 'NO_CUMPLE' && /autenticación/.test(r.motivo('op.exp.8.r2.1')), r.motivo('op.exp.8.r2.1'));
  check('op.exp.8.r4.1 CUMPLE with complete P-08', r.requisito('op.exp.8.r4.1').status === 'CUMPLE', r.motivo('op.exp.8.r4.1'));

  ['op.exp.8.r1.1', 'op.exp.8.r3.1', 'op.exp.8.r5.1', 'op.exp.8.r5.2'].forEach(id =>
    check(`${id} NO_APLICA in a server's row: measured on the manager`, r.requisito(id).status === 'NO_APLICA', r.requisito(id).status)
  );

  check('EV-05 comes out NO_APLICA in the table, not «no ha llegado nada»', r.evidencia('EV-05')?.status === 'NO_APLICA', r.evidencia('EV-05')?.status);
  check('EV-13 comes out NO_APLICA in the table', r.evidencia('EV-13')?.status === 'NO_APLICA', r.evidencia('EV-13')?.status);
  check('EV-01 comes out CUMPLE in the table', r.evidencia('EV-01')?.status === 'CUMPLE', r.evidencia('EV-01')?.status);
}

section('3. EV-02 · the last keepalive against P-12');

{
  const late = evaluate(host(), BASE, new Date('2026-09-26T23:30:00Z'));
  check('4 h later without new facts: the keepalive expires → op.exp.8.2 NO_CUMPLE', late.requisito('op.exp.8.2').status === 'NO_CUMPLE', late.motivo('op.exp.8.2'));

  const loose = evaluate(host(), { ...BASE, 'P-12': '6' }, new Date('2026-09-26T23:30:00Z'));
  check('REVERSAL: the SAME fact with P-12 = 6 h → CUMPLE', loose.requisito('op.exp.8.2').status === 'CUMPLE', loose.motivo('op.exp.8.2'));

  const withoutDeadline = evaluate(host(), { ...BASE, 'P-12': undefined as unknown as string });
  check('without P-12 → not evaluable, never CUMPLE', withoutDeadline.requisito('op.exp.8.2').status !== 'CUMPLE' && withoutDeadline.requisito('op.exp.8.2').evidenced === false, withoutDeadline.requisito('op.exp.8.2').status);
}

section('4. EV-01 and EV-03 · the audit log and its fields');

{
  const withoutRules = evaluate(host(l => (l.event === 'audit_log_status' && l.fuente === 'auditd' ? { ...l, reglas_cargadas: 0 } : l)));
  check('auditd active without rules → op.exp.8.1 NO_CUMPLE', withoutRules.requisito('op.exp.8.1').status === 'NO_CUMPLE' && /sin ninguna regla/.test(withoutRules.motivo('op.exp.8.1')), withoutRules.motivo('op.exp.8.1'));

  const volatile = evaluate(host(l =>
    l.event === 'audit_log_status' && l.fuente === 'journald' ? { ...l, almacenamiento: 'volatil' }
      : l.event === 'audit_log_status' && l.fuente === 'rsyslog' ? { ...l, activo: 'no' } : l));
  check('volatile journald and no rsyslog → NO_CUMPLE (not preserved)', volatile.requisito('op.exp.8.1').status === 'NO_CUMPLE', volatile.motivo('op.exp.8.1'));

  const volatileJournaldOnly = evaluate(host(l => (l.event === 'audit_log_status' && l.fuente === 'journald' ? { ...l, almacenamiento: 'volatil' } : l)));
  check('REVERSAL: volatile journald but rsyslog active → CUMPLE', volatileJournaldOnly.requisito('op.exp.8.1').status === 'CUMPLE', volatileJournaldOnly.motivo('op.exp.8.1'));

  const withoutResult = evaluate(host(l => (l.event === 'audit_record_fields' ? { ...l, con_resultado: 0, campos_ausentes: 'resultado' } : l)));
  check('a field absent in the WHOLE sample → NO_CUMPLE naming the field', withoutResult.requisito('op.exp.8.1').status === 'NO_CUMPLE' && /resultado/.test(withoutResult.motivo('op.exp.8.1')), withoutResult.motivo('op.exp.8.1'));

  const withoutP01 = evaluate(host(), { ...BASE, 'P-01': undefined as unknown as string });
  check('without P-01 → op.exp.8.1 not proven (what is audited is not on record)', withoutP01.requisito('op.exp.8.1').status === 'NO_CUMPLE' && withoutP01.requisito('op.exp.8.1').evidenced === false, withoutP01.motivo('op.exp.8.1'));

  const directory = evaluate(events([
    ...REAL_WAZUH_REAL,
    ...FULL_COVERAGE,
    { ts: '2026-09-26T19:11:48Z', event: 'audit_log_status', evidence_id: 'EV-01', requisito: 'op.exp.8.1', plano: 'directorio', fuente: 'slapd', activo: 'si', niveles_log: 'none' },
  ], AGENT));
  check('LDAP: slapd with olcLogLevel without stats → NO_CUMPLE', directory.requisito('op.exp.8.1').status === 'NO_CUMPLE' && /stats/.test(directory.motivo('op.exp.8.1')), directory.motivo('op.exp.8.1'));

  const withStats = evaluate(events([
    ...REAL_WAZUH_REAL,
    ...FULL_COVERAGE,
    { ts: '2026-09-26T19:11:48Z', event: 'audit_log_status', evidence_id: 'EV-01', requisito: 'op.exp.8.1', plano: 'directorio', fuente: 'slapd', activo: 'si', niveles_log: 'stats sync' },
  ], AGENT));
  check('REVERSAL: the same slapd with stats → CUMPLE', withStats.requisito('op.exp.8.1').status === 'CUMPLE', withStats.motivo('op.exp.8.1'));

  const numeric = evaluate(events([
    ...REAL_WAZUH_REAL,
    ...FULL_COVERAGE,
    { ts: '2026-09-26T19:11:48Z', event: 'audit_log_status', evidence_id: 'EV-01', requisito: 'op.exp.8.1', plano: 'directorio', fuente: 'slapd', activo: 'si', niveles_log: '256' },
  ], AGENT));
  check('numeric olcLogLevel 256 is stats → CUMPLE', numeric.requisito('op.exp.8.1').status === 'CUMPLE', numeric.motivo('op.exp.8.1'));

  const old = evaluate(host(), BASE, new Date('2026-09-28T19:30:00Z'), 'ALTO');
  check('two days without passes: the state does not describe today → not proven', old.requisito('op.exp.8.1').evidenced === false && /no está informando/.test(old.motivo('op.exp.8.1')), old.motivo('op.exp.8.1'));
}

section('5. EV-06 · synchronization, authentication, skew, source and trace');

{
  const nts = (extra: Record<string, unknown> = {}) =>
    host(l => (l.event === 'time_sync_status' ? { ...l, servicio: 'chrony', autenticacion: 'nts_o_clave', vigilancia_cambio_hora: 'si', ...extra } : l));

  const good = evaluate(nts());
  check('chrony with NTS, declared source, skew 1.9 ms, changes watched → CUMPLE', good.requisito('op.exp.8.r2.1').status === 'CUMPLE', good.motivo('op.exp.8.r2.1'));

  const far = evaluate(nts({ desfase_segundos: '2.5' }));
  check('skew of 2.5 s with P-06 = 1 → NO_CUMPLE', far.requisito('op.exp.8.r2.1').status === 'NO_CUMPLE' && /2.5/.test(far.motivo('op.exp.8.r2.1')), far.motivo('op.exp.8.r2.1'));
  const loose = evaluate(nts({ desfase_segundos: '2.5' }), { ...BASE, 'P-06': '5' });
  check('REVERSAL: the same skew with P-06 = 5 → CUMPLE', loose.requisito('op.exp.8.r2.1').status === 'CUMPLE', loose.motivo('op.exp.8.r2.1'));

  const negativeSkew = evaluate(nts({ desfase_segundos: '-2.5' }));
  check('skew counts in absolute value (-2.5 s also breaches)', negativeSkew.requisito('op.exp.8.r2.1').status === 'NO_CUMPLE', negativeSkew.motivo('op.exp.8.r2.1'));

  const foreign = evaluate(nts({ fuentes: 'pool.ntp.org' }));
  check('source in use that P-05 does not declare → NO_CUMPLE', foreign.requisito('op.exp.8.r2.1').status === 'NO_CUMPLE' && /pool.ntp.org/.test(foreign.motivo('op.exp.8.r2.1')), foreign.motivo('op.exp.8.r2.1'));

  const unwatched2 = evaluate(nts({ vigilancia_cambio_hora: 'no' }));
  check('without an auditd rule for time changes → not proven (not a measured NO_CUMPLE)', unwatched2.requisito('op.exp.8.r2.1').evidenced === false && /augenrules/.test(unwatched2.motivo('op.exp.8.r2.1')), `${unwatched2.requisito('op.exp.8.r2.1').status} ${unwatched2.motivo('op.exp.8.r2.1')}`);

  const unsynchronized = evaluate(nts({ sincronizado: 'no' }));
  check('unsynchronized clock → NO_CUMPLE', unsynchronized.requisito('op.exp.8.r2.1').status === 'NO_CUMPLE', unsynchronized.motivo('op.exp.8.r2.1'));

  const withChange = evaluate(events([
    ...REAL_WAZUH_REAL.map(l => (l.event === 'time_sync_status' ? { ...l, servicio: 'chrony', autenticacion: 'nts_o_clave', vigilancia_cambio_hora: 'si' } : l)),
    { ts: '2026-09-26T19:11:48Z', event: 'clock_change_observed', evidence_id: 'EV-06', requisito: 'op.exp.8.r2.1', plano: 'sistema', actor: 'dioni', usuario_efectivo: 'root', proceso: '/usr/bin/date', syscall: 'clock_settime', veces: 1, ultima: '2026-09-26T19:05:00Z' },
  ], AGENT));
  check('a recorded time change is named with its actor (trace, not a breach)', withChange.requisito('op.exp.8.r2.1').status === 'CUMPLE' && /dioni con \/usr\/bin\/date/.test(withChange.motivo('op.exp.8.r2.1')), withChange.motivo('op.exp.8.r2.1'));

  const P05_NTS = { ...BASE, 'P-05': ['time.cloudflare.com | NTS', 'nts.netnod.se | NTS', 'ptbtime1.ptb.de | NTS'] };
  const byName = evaluate(nts({ fuentes: 'nts.netnod.se,ptbtime1.ptb.de,time.cloudflare.com', fuentes_ip: '194.58.203.196,192.53.103.108,162.159.200.123' }), P05_NTS);
  check('sources by their configured name (chronyc -N) → match P-05 → CUMPLE', byName.requisito('op.exp.8.r2.1').status === 'CUMPLE', byName.motivo('op.exp.8.r2.1'));
  const byIp = evaluate(nts({ fuentes: ',194.58.203.196,192.53.103.108,162.159.200.123' }), P05_NTS);
  check('BEFORE: the IPs of `chronyc -n` with the leading comma → false «fuente no declarada»', byIp.requisito('op.exp.8.r2.1').status === 'NO_CUMPLE' && /P-05 no declara: 194\.58\.203\.196/.test(byIp.motivo('op.exp.8.r2.1')), byIp.motivo('op.exp.8.r2.1'));

  const medio = evaluate(host(), BASE, NOW, 'BAJO');
  check('at Traceability level BAJO, R2 does not apply', medio.requisito('op.exp.8.r2.1').status === 'NO_APLICA', medio.requisito('op.exp.8.r2.1').status);
}

section('6. EV-08 · accounts with read access against P-08');

{
  const withoutDioni = evaluate(host(), { ...BASE, 'P-08': ['root | total | todo', 'syslog | escritura | sistema', 'wazuh | escritura | Wazuh'] });
  check('dioni reads its journal and P-08 does not authorize it → NO_CUMPLE naming path and account', withoutDioni.requisito('op.exp.8.r4.1').status === 'NO_CUMPLE' && /\/var\/log\/journal \(dioni\)/.test(withoutDioni.motivo('op.exp.8.r4.1')), withoutDioni.motivo('op.exp.8.r4.1'));

  const upperCase = evaluate(host(), { ...BASE, 'P-08': ['ROOT | total | todo', 'syslog | x | x', 'wazuh | x | x', 'dioni | x | x'] });
  check('the comparison is case-sensitive (ROOT does not authorize root)', upperCase.requisito('op.exp.8.r4.1').status === 'NO_CUMPLE', upperCase.motivo('op.exp.8.r4.1'));

  const opened = evaluate(host(l => (l.event === 'log_access_permissions' && l.ruta === '/var/log/syslog' ? { ...l, cuentas: 'root,syslog,*', lectura_mundo: 'si' } : l)));
  check('a log readable by anyone → NO_CUMPLE even if P-08 is complete', opened.requisito('op.exp.8.r4.1').status === 'NO_CUMPLE' && /cualquier cuenta/.test(opened.motivo('op.exp.8.r4.1')), opened.motivo('op.exp.8.r4.1'));

  const withoutP08 = evaluate(host(), { ...BASE, 'P-08': undefined as unknown as string });
  check('without P-08 → not proven', withoutP08.requisito('op.exp.8.r4.1').evidenced === false, withoutP08.requisito('op.exp.8.r4.1').status);
}

section('7. Manager row (wazuh4): server + central system');

{
  const r = evaluate(central(), BASE, NOW, 'ALTO', '000');

  check('the manager without auditd → op.exp.8.1 NO_CUMPLE (it is one more server)', r.requisito('op.exp.8.1').status === 'NO_CUMPLE' && /auditd no está activo/.test(r.motivo('op.exp.8.1')), r.motivo('op.exp.8.1'));
  check('Wazuh-4 hours without own alerts is no longer a gap: with its heartbeat up to date, op.exp.8.2 CUMPLE', r.requisito('op.exp.8.2').status === 'CUMPLE' && r.evidencia('EV-04')?.status === 'CUMPLE', r.motivo('op.exp.8.2'));
  check('EV-02 NO_APLICA on the manager (it has no agent of its own)', r.evidencia('EV-02')?.status === 'NO_APLICA', r.evidencia('EV-02')?.status);
  check('R1 CUMPLE: review of 15/09 with a 30-day periodicity', r.requisito('op.exp.8.r1.1').status === 'CUMPLE', r.motivo('op.exp.8.r1.1'));
  check('R3 not proven: the indexer\'s retention is not visible without credentials', r.requisito('op.exp.8.r3.1').evidenced === false && /ISM/.test(r.motivo('op.exp.8.r3.1')), r.motivo('op.exp.8.r3.1'));
  check('and the motive says what IS visible on disk (alerts since 12/06)', /2026-06-12/.test(r.motivo('op.exp.8.r3.1')), r.motivo('op.exp.8.r3.1'));
  check('R4 not proven on the manager: indexer access and snapshots without credentials', r.requisito('op.exp.8.r4.1').evidenced === false, `${r.requisito('op.exp.8.r4.1').status} ${r.motivo('op.exp.8.r4.1')}`);
  check('R5.1 CUMPLE: the manager loads the wazuh and power_ens sets', r.requisito('op.exp.8.r5.1').status === 'CUMPLE', r.motivo('op.exp.8.r5.1'));
  check('R5.2 not proven: response configured but no execution triggered by an alert', r.requisito('op.exp.8.r5.2').evidenced === false && /ninguna respuesta automática disparada/.test(r.motivo('op.exp.8.r5.2')), r.motivo('op.exp.8.r5.2'));

  const notDeclared = evaluate(central(), { ...BASE, 'P-02': ['wazuh-real | x | x', 'srv-inexistente | x | x'] }, NOW, 'ALTO', '000');
  check('a P-02 server that is not in the manager\'s agent base → NO_CUMPLE naming it', notDeclared.requisito('op.exp.8.2').status === 'NO_CUMPLE' && /srv-inexistente: no figura en la base de agentes/.test(notDeclared.motivo('op.exp.8.2')), notDeclared.motivo('op.exp.8.2'));

  const weekly = evaluate(central(), { ...BASE, 'P-04': '7' }, NOW, 'ALTO', '000');
  check('REVERSAL: the same 15/09 review with a 7-day periodicity → NO_CUMPLE', weekly.requisito('op.exp.8.r1.1').status === 'NO_CUMPLE', weekly.motivo('op.exp.8.r1.1'));

  const empty = evaluate(central(l => (l.event === 'log_review_recorded' ? { ...l, revisiones: 0, ultima_revision: '-' } : l)), BASE, NOW, 'ALTO', '000');
  check('empty review record (header only) → measured NO_CUMPLE, not grey', empty.requisito('op.exp.8.r1.1').status === 'NO_CUMPLE' && empty.requisito('op.exp.8.r1.1').evidenced === true, empty.motivo('op.exp.8.r1.1'));

  const absent = evaluate(central(l => (l.event === 'log_review_recorded' ? undefined : l)).concat(
    events([{ ts: '2026-09-26T19:11:44Z', event: 'evidence_state', evidence_id: 'EV-05', requisito: 'op.exp.8.r1.1', plano: 'central', estado: 'NO_EVALUABLE', causa: 'CONFIGURATION', motivo: 'no existe el registro de revisiones de los registros /etc/power-ens/log-review-register.tsv' }], MANAGER)
  ), BASE, NOW, 'ALTO', '000');
  check('absent review record → not proven with the collector\'s motive', absent.requisito('op.exp.8.r1.1').evidenced === false && /log-review-register/.test(absent.motivo('op.exp.8.r1.1')), absent.motivo('op.exp.8.r1.1'));

  const missingSet = evaluate(central(), { ...BASE, 'P-10': ['wazuh | x | x', 'sigma | x | x'] }, NOW, 'ALTO', '000');
  check('a P-10 set that the manager does not load → NO_CUMPLE', missingSet.requisito('op.exp.8.r5.1').status === 'NO_CUMPLE' && /sigma/.test(missingSet.motivo('op.exp.8.r5.1')), missingSet.motivo('op.exp.8.r5.1'));

  const withExecution = evaluate(events([
    ...REAL_WAZUH4,
    { ts: '2026-09-26T19:11:44Z', event: 'active_response_executed', evidence_id: 'EV-12', requisito: 'op.exp.8.r5.2', plano: 'central', agente_id: '024', agente: 'wazuh-real', programa: 'firewall-drop', accion: 'add', regla_origen: '5763', veces: 1, primera: '2026-09-26T18:00:00Z', ultima: '2026-09-26T18:00:00Z', objetivos: '203.0.113.7' },
  ], MANAGER), BASE, NOW, 'ALTO', '000');
  check('with an execution triggered by 5763 → R5.2 CUMPLE', withExecution.requisito('op.exp.8.r5.2').status === 'CUMPLE', withExecution.motivo('op.exp.8.r5.2'));

  const manual = evaluate(events([
    ...REAL_WAZUH4,
    { ts: '2026-09-26T19:11:44Z', event: 'active_response_executed', evidence_id: 'EV-12', requisito: 'op.exp.8.r5.2', plano: 'central', agente_id: '029', agente: 'WIN-OPACC-LAB', programa: 'restart-wazuh.exe', accion: 'add', regla_origen: '-', veces: 1, primera: '2026-09-24T07:09:48Z', ultima: '2026-09-24T07:09:48Z', objetivos: '-' },
  ], MANAGER), BASE, NOW, 'ALTO', '000');
  check('a restart without an alert triggering it does NOT accredit automatic response', manual.requisito('op.exp.8.r5.2').evidenced === false && /restart-wazuh.exe/.test(manual.motivo('op.exp.8.r5.2')), manual.motivo('op.exp.8.r5.2'));

  const plannedMissing = evaluate(events([
    ...REAL_WAZUH4,
    { ts: '2026-09-26T19:11:44Z', event: 'active_response_executed', evidence_id: 'EV-12', requisito: 'op.exp.8.r5.2', plano: 'central', agente_id: '024', agente: 'wazuh-real', programa: 'firewall-drop', accion: 'add', regla_origen: '5763', veces: 1, primera: '2026-09-26T18:00:00Z', ultima: '2026-09-26T18:00:00Z', objetivos: '203.0.113.7' },
  ], MANAGER), { ...BASE, 'P-11': ['disable-account | fuerza bruta | cuenta | 10 min'] }, NOW, 'ALTO', '000');
  check('a P-11 action that is not configured → NO_CUMPLE', plannedMissing.requisito('op.exp.8.r5.2').status === 'NO_CUMPLE' && /disable-account/.test(plannedMissing.motivo('op.exp.8.r5.2')), plannedMissing.motivo('op.exp.8.r5.2'));

  const down = evaluate(central(l => (l.event === 'logging_service_status' && l.servicio === 'wazuh-indexer' ? { ...l, activo: 'no' } : l)), BASE, NOW, 'ALTO', '000');
  check('wazuh-indexer stopped → EV-13 NO_CUMPLE', down.evidencia('EV-13')?.status === 'NO_CUMPLE', down.evidencia('EV-13')?.status);
}

section('9. EV-01 · P-01\'s categories against what the server really audits');

{
  const hoy = evaluate(realHost());
  check(
    'wazuh-real as it is: «cambios de configuración» declared and /etc/netplan, /etc/hosts... unwatched → measured op.exp.8.1 NO_CUMPLE',
    hoy.requisito('op.exp.8.1').status === 'NO_CUMPLE' && hoy.requisito('op.exp.8.1').evidenced === true && /\/etc\/netplan/.test(hoy.motivo('op.exp.8.1')) && /\/etc\/crontab/.test(hoy.motivo('op.exp.8.1')),
    hoy.motivo('op.exp.8.1')
  );
  check('and EV-01 comes out NO_CUMPLE in the table', hoy.evidencia('EV-01')?.status === 'NO_CUMPLE', hoy.evidencia('EV-01')?.status);

  const stale = evaluate(hostWithoutCoverage());
  check(
    'with the earlier collector (without audit_coverage) NEVER CUMPLE: not proven',
    stale.requisito('op.exp.8.1').status === 'NO_CUMPLE' && stale.requisito('op.exp.8.1').evidenced === false,
    `${stale.requisito('op.exp.8.1').status} ${stale.motivo('op.exp.8.1')}`
  );
  check('and the cause is COLLECTION (the collector does not report)', stale.evidencia('EV-01')?.gapCause === 'COLLECTION', stale.evidencia('EV-01')?.gapCause);

  const complete2 = evaluate(host());
  check('REVERSAL: the same categories with all their paths watched → CUMPLE', complete2.requisito('op.exp.8.1').status === 'CUMPLE', complete2.motivo('op.exp.8.1'));

  const withTime = { ...BASE, 'P-01': ['autenticación | sshd | 3', 'cambios de hora | auditd | 5'] };
  const realTime = evaluate(realHost(), withTime);
  check(
    '«cambios de hora» declared and no loaded rule records adjtimex/settimeofday/clock_settime → NO_CUMPLE',
    realTime.requisito('op.exp.8.1').status === 'NO_CUMPLE' && /clock_settime/.test(realTime.motivo('op.exp.8.1')),
    realTime.motivo('op.exp.8.1')
  );
  const oldHour = evaluate(hostWithoutCoverage(), withTime);
  check(
    'without audit_coverage, time is decided with EV-06\'s time_sync_status (vigilancia_cambio_hora=no) → NO_CUMPLE',
    oldHour.requisito('op.exp.8.1').status === 'NO_CUMPLE' && oldHour.requisito('op.exp.8.1').evidenced === true,
    oldHour.motivo('op.exp.8.1')
  );

  const keys = evaluate(realHost(), { ...BASE, 'P-01': ['almacenes de claves | auditd | 7'] });
  check(
    '«almacenes de claves» declared with /etc/ssl/private unwatched → NO_CUMPLE naming it',
    keys.requisito('op.exp.8.1').status === 'NO_CUMPLE' && /\/etc\/ssl\/private/.test(keys.motivo('op.exp.8.1')),
    keys.motivo('op.exp.8.1')
  );

  const privileges = evaluate(realHost(), { ...BASE, 'P-01': ['autenticación | sshd | 3', 'uso de privilegios (sudo) | auditd | 5'] });
  check('REVERSAL: a category that IS fully audited (privileges) → CUMPLE', privileges.requisito('op.exp.8.1').status === 'CUMPLE', privileges.motivo('op.exp.8.1'));

  const odd = evaluate(host(), { ...BASE, 'P-01': ['autenticación | sshd | 3', 'eventos de la aplicación de nóminas | app | 3'] });
  check(
    'a category Power ENS does not know how to observe → not proven, cause CONFIGURATION (never CUMPLE)',
    odd.requisito('op.exp.8.1').evidenced === false && odd.evidencia('EV-01')?.gapCause === 'CONFIGURATION' && /nóminas/.test(odd.motivo('op.exp.8.1')),
    `${odd.requisito('op.exp.8.1').status} ${odd.evidencia('EV-01')?.gapCause} ${odd.motivo('op.exp.8.1')}`
  );

  const ldapOnLinux = evaluate(host(), { ...BASE, 'P-01': [...(BASE['P-01'] as string[]), 'directorio LDAP | slapd | 3'] });
  check('«directorio LDAP» does not apply on a server without slapd: it does not bring it down', ldapOnLinux.requisito('op.exp.8.1').status === 'CUMPLE' && /no aplica a este servidor/.test(ldapOnLinux.motivo('op.exp.8.1')), ldapOnLinux.motivo('op.exp.8.1'));

  const withoutAuditd = evaluate(host(l =>
    l.event === 'audit_coverage' ? { ...l, auditd: 'no_instalado', sin_vigilar: [l.vigiladas, l.sin_vigilar].filter(v => v !== '-').join(','), vigiladas: '-' }
      : l.event === 'audit_log_status' && l.fuente === 'auditd' ? { ...l, activo: 'no_instalado', reglas_cargadas: 0 } : l));
  check('without auditd, the declared category says so: «auditd no está instalado»', withoutAuditd.requisito('op.exp.8.1').status === 'NO_CUMPLE' && /auditd no está instalado, así que nada registra/.test(withoutAuditd.motivo('op.exp.8.1')), withoutAuditd.motivo('op.exp.8.1'));
}

section('10. The cause the collector declares reaches the evidence');

{
  const r = evaluate(central(), BASE, NOW, 'ALTO', '000');
  check('EV-07 (ISM retention, the collector says CONFIGURATION) → gapCause CONFIGURATION', r.evidencia('EV-07')?.gapCause === 'CONFIGURATION', r.evidencia('EV-07')?.gapCause);
  check('EV-09 (snapshots, the collector says CONFIGURATION) → gapCause CONFIGURATION', r.evidencia('EV-09')?.gapCause === 'CONFIGURATION', r.evidencia('EV-09')?.gapCause);

  const absent = evaluate(central(l => (l.event === 'log_review_recorded' ? undefined : l)).concat(
    events([{ ts: '2026-09-26T19:11:44Z', event: 'evidence_state', evidence_id: 'EV-05', requisito: 'op.exp.8.r1.1', plano: 'central', estado: 'NO_EVALUABLE', causa: 'CONFIGURATION', motivo: 'no existe el registro de revisiones de los registros /etc/power-ens/log-review-register.tsv' }], MANAGER)
  ), BASE, NOW, 'ALTO', '000');
  check('absent review record (collector\'s CONFIGURATION) → gapCause CONFIGURATION, not EVIDENCE', absent.evidencia('EV-05')?.gapCause === 'CONFIGURATION', absent.evidencia('EV-05')?.gapCause);

  const nts = host(l => (l.event === 'time_sync_status' ? { ...l, servicio: 'chrony', autenticacion: 'nts_o_clave', vigilancia_cambio_hora: 'si' } : l));
  const withoutP06 = evaluate(nts, { ...BASE, 'P-06': undefined as unknown as string });
  check('without P-06 (admitted skew) → EV-06 unmeasured with cause CONFIGURATION, not COLLECTION', withoutP06.evidencia('EV-06')?.status === 'NO_EVALUABLE' && withoutP06.evidencia('EV-06')?.gapCause === 'CONFIGURATION', `${withoutP06.evidencia('EV-06')?.status} ${withoutP06.evidencia('EV-06')?.gapCause}`);
}

section('11. EV-06 on a server without auditd: the motive says so');

{
  const r = evaluate(central(), BASE, NOW, 'ALTO', '000');
  check(
    'wazuh4 without auditd installed → the motive says auditd is not installed, not that rules need loading',
    /auditd no está instalado/.test(r.motivo('op.exp.8.r2.1')) && !/augenrules --load/.test(r.motivo('op.exp.8.r2.1')),
    r.motivo('op.exp.8.r2.1')
  );

  const installed = evaluate(host(l => (l.event === 'time_sync_status' ? { ...l, vigilancia_cambio_hora: 'no' } : l)));
  check('REVERSAL: with auditd active, what is missing is loading the rules (augenrules --load)', /augenrules --load/.test(installed.motivo('op.exp.8.r2.1')), installed.motivo('op.exp.8.r2.1'));
}

section('8. Only op.exp.8 facts count');

{
  const foreignOne = normalizeWazuhAlerts([{
    _id: 'otro',
    _source: {
      '@timestamp': '2026-09-26T19:11:47Z',
      agent: AGENT,
      data: { power_ens: 'op.exp.1', event: 'agent_status', evidence_id: 'EV-04', ultimo_keepalive: '2026-09-26T19:11:42Z' },
    },
  }]);
  const r = evaluate(foreignOne);
  check('an op.exp.1 agent_status does not accredit op.exp.8.2', r.requisito('op.exp.8.2').status !== 'CUMPLE', r.requisito('op.exp.8.2').status);
}

section('12. EV-04 · gaps by keepalive in the manager\'s series of passes');

{
  const END = Date.parse('2026-09-26T19:11:44Z');
  const withoutEv04 = REAL_WAZUH4.filter(l => l.event !== 'agent_keepalive_observed');
  const pass = (t: number, delay: Record<string, number | null | undefined>) =>
    [
      ['000', 'Wazuh-4', 0],
      ['024', 'wazuh-real', '024' in delay ? delay['024'] : 0.01],
      ['025', 'wazuh-fake', '025' in delay ? delay['025'] : 0.01],
    ]
      .filter(([id]) => delay[String(id)] !== undefined || !(String(id) in delay))
      .map(([id, name, hoursAgo]) => ({
        ts: new Date(t).toISOString().replace('.000Z', 'Z'),
        event: 'agent_keepalive_observed', evidence_id: 'EV-04', requisito: 'op.exp.8.1,op.exp.8.2', plano: 'central',
        agente_id: id, agente: name,
        estado_conexion: hoursAgo === null ? 'never_connected' : Number(hoursAgo) > 1 ? 'disconnected' : 'active',
        ultimo_keepalive: hoursAgo === null ? '-' : new Date(t - Number(hoursAgo) * 3600000).toISOString().replace('.000Z', 'Z'),
        local: id === '000' ? 'si' : 'no',
        ultimo_evento: '-', eventos_24h: 0,
      }));
  const series = (hours: number, delays: (i: number) => Record<string, number | null | undefined> = () => ({}), omit: number[] = []) =>
    events(
      [
        ...withoutEv04,
        ...Array.from({ length: hours }, (_, i) => i)
          .filter(i => !omit.includes(i))
          .flatMap(i => pass(END - (hours - 1 - i) * 3600000, delays(i))),
      ],
      MANAGER
    );
  const ev04 = (evs: ENSNormalizedEvent[], values = BASE, now = NOW) => {
    const r = evaluate(evs, values, now, 'ALTO', '000');
    const decision = r.decisions.find(d => d.trace.ruleId === 'op.exp.8.2/EV-04');

    return { estado: decision?.status, motivo: decision?.reason || '', causa: decision?.cause, r };
  };

  const calm = ev04(series(12));
  check('12 passes with the heartbeat up to date and ZERO events per agent → CUMPLE (calm is not a gap)', calm.estado === 'CUMPLE' && /12 pasadas/.test(calm.motivo), calm.motivo);

  const downtime = ev04(series(12, i => (i === 5 ? { '024': 4 } : {})));
  check('a pass with wazuh-real\'s keepalive 4 h back (P-12 = 3) → NO_CUMPLE naming it', downtime.estado === 'NO_CUMPLE' && /wazuh-real: laguna en 1 de 12 pasadas/.test(downtime.motivo) && /2026-09-26T13:11:44Z/.test(downtime.motivo), downtime.motivo);
  check('and op.exp.8.2 does not comply, MEASURED', downtime.r.requisito('op.exp.8.2').status === 'NO_CUMPLE' && downtime.r.requisito('op.exp.8.2').evidenced === true, downtime.r.requisito('op.exp.8.2').status);
  check('the gap from 6 h ago still counts even though the server has returned (it is not a state fact)', /laguna en 1 de 12/.test(downtime.motivo), downtime.motivo);
  const looseDowntime = ev04(series(12, i => (i === 5 ? { '024': 4 } : {})), { ...BASE, 'P-12': '5' });
  check('REVERSAL: the same series with P-12 = 5 → CUMPLE', looseDowntime.estado === 'CUMPLE', looseDowntime.motivo);

  const gaps = ev04(series(12, () => ({}), [4, 5, 6, 7]));
  check('4 consecutive collector passes are missing (5 h unseen, P-12 = 3) → NO_EVALUABLE, not NO_CUMPLE', gaps.estado === 'NO_EVALUABLE' && gaps.causa === 'COLLECTION' && /Faltan pasadas del recolector del manager/.test(gaps.motivo), `${gaps.estado} ${gaps.causa} ${gaps.motivo}`);
  check('and op.exp.8.2 is left not proven, with a COLLECTION cause', gaps.r.requisito('op.exp.8.2').evidenced === false, gaps.r.requisito('op.exp.8.2').status);
  const looseGaps = ev04(series(12, () => ({}), [4, 5, 6, 7]), { ...BASE, 'P-12': '6' });
  check('REVERSAL: the same holes with P-12 = 6 → CUMPLE', looseGaps.estado === 'CUMPLE', looseGaps.motivo);
  const oneLost = ev04(series(12, () => ({}), [6]));
  check('a single lost pass (2 h between two, P-12 = 3) is not a hole', oneLost.estado === 'CUMPLE', oneLost.motivo);

  const both = ev04(series(12, i => (i === 9 ? { '025': 5 } : {}), [3, 4, 5, 6]));
  check('observed gap and also lost passes → the measurement prevails: NO_CUMPLE', both.estado === 'NO_CUMPLE' && /wazuh-fake/.test(both.motivo), both.motivo);

  const parado = ev04(series(12), BASE, new Date('2026-09-27T00:30:00Z'));
  check('the last pass is 5 h old and P-12 = 3 → NO_EVALUABLE (the collector is not looking)', parado.estado === 'NO_EVALUABLE' && parado.causa === 'COLLECTION' && /hasta ahora/.test(parado.motivo), `${parado.estado} ${parado.motivo}`);

  const never = ev04(series(3, () => ({ '024': null })));
  check('a P-02 server that never connected (no keepalive) → NO_CUMPLE', never.estado === 'NO_CUMPLE' && /wazuh-real: laguna en 3 de 3 pasadas/.test(never.motivo) && /never_connected/.test(never.motivo), never.motivo);

  const lowOne = ev04(series(4, i => (i === 2 ? { '025': undefined } : {})));
  check('a server that disappears from the agent base in a pass → gap', lowOne.estado === 'NO_CUMPLE' && /wazuh-fake: laguna en 1 de 4/.test(lowOne.motivo) && /no figuraba/.test(lowOne.motivo), lowOne.motivo);

  const old = ev04(events([
    ...withoutEv04,
    { ts: '2026-09-26T19:11:44Z', event: 'log_ingestion_status', evidence_id: 'EV-04', requisito: 'op.exp.8.1,op.exp.8.2', plano: 'central', agente_id: '000', agente: 'Wazuh-4', ultimo_evento: '2026-09-26T19:11:30Z', eventos_24h: 866, horas_sin_eventos_24h: 10, mayor_laguna_horas: 5, ventana_observada_horas: 13 },
  ], MANAGER));
  check('only with log_ingestion_status (earlier collector) → NO_EVALUABLE by COLLECTION, neither CUMPLE nor the 5 h gap', old.estado === 'NO_EVALUABLE' && old.causa === 'COLLECTION' && !/laguna de 5 h/.test(old.motivo), `${old.estado} ${old.motivo}`);

  const withoutBase = ev04(events([
    ...withoutEv04,
    ...pass(END - 3600000, {}),
    { ts: '2026-09-26T19:11:44Z', event: 'evidence_state', evidence_id: 'EV-04', requisito: 'op.exp.8.1,op.exp.8.2', plano: 'central', estado: 'NO_EVALUABLE', causa: 'COLLECTION', motivo: 'no se puede leer la base de agentes del manager /var/ossec/queue/db/global.db' },
  ], MANAGER));
  check('global.db unreadable in the last pass → NO_EVALUABLE with the collector\'s motive', withoutBase.estado === 'NO_EVALUABLE' && /global\.db/.test(withoutBase.motivo), withoutBase.motivo);

  check('EV-04 is not declared a state fact: the engine does not discard earlier passes', !getStateFactEventTypes('op.exp.8').has('agent_keepalive_observed'));
}

console.log('');

if (failures.length) {
  console.log(`${failures.length} check(s) FAIL:`);
  failures.forEach(f => console.log(`  - ${f}`));
  process.exit(1);
}

console.log('All checks pass.');
