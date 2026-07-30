PIPELINE DE AGENTE · op.acc.1 y op.acc.2
=========================================
Calcado del pipeline real de mp.info.6:
  agente escribe ndjson -> logcollector (tail) -> decoder json nativo
  -> reglas 1068xx/1069xx -> wazuh-alerts-* -> plugin ENSFácil

CONTENIDO
---------
 ensfacil_op_acc_1_json_rules.xml   34 reglas, rango 106800-106873  (DESPLEGADA)
 ensfacil_op_acc_2_json_rules.xml   33 reglas, rango 106900-106972  (DESPLEGADA)
 ensfacil_op_acc_1_technical_fact_rules.xml
                                    52 reglas del recolector Python
                                    NO SE DESPLIEGA (ver más abajo)
 muestra_op_acc_1.ndjson            20 eventos de ejemplo (uno por tipo)
 muestra_op_acc_2.ndjson            23 eventos de ejemplo (uno por tipo)
 ensfacil-emit-opacc.sh             emisor con bloqueo y rotación
 agent.conf.fragmento.xml           bloques localfile a añadir

RANGOS (sin colisión con mp.info.6, que ocupa 106600-106722)
------------------------------------------------------------
 op.acc.1 -> 106800 base · 106801-106826 eventos · 106850-53 evidence_state
             106860-63 control_state · 106870-72 score_snapshot
             106873-889 hechos crudos del modelo nuevo (EV-03 -> 106873)
 op.acc.2 -> 106900 base · 106901-106936 eventos · 106950-53 evidence_state
             106960-63 control_state · 106970-72 score_snapshot

INSTALACIÓN (MANAGER)
---------------------
1) Copiar las reglas. UNA A UNA, NO con comodín: en agent/rules/ hay un
   segundo juego para op.acc.1 (ensfacil_op_acc_1_technical_fact_rules.xml)
   que NO se despliega hoy, y `ensfacil_op_acc_*.xml` se lo llevaría por
   delante. Los dos numeran el mismo rango 106800-106899 con un 106800
   distinto: desplegar los dos deja el manager con dos reglas del mismo id.

   cp ensfacil_op_acc_1_json_rules.xml /var/ossec/etc/rules/
   cp ensfacil_op_acc_2_json_rules.xml /var/ossec/etc/rules/
   chown wazuh:wazuh /var/ossec/etc/rules/ensfacil_op_acc_1_json_rules.xml \
                     /var/ossec/etc/rules/ensfacil_op_acc_2_json_rules.xml
   chmod 640 /var/ossec/etc/rules/ensfacil_op_acc_1_json_rules.xml \
             /var/ossec/etc/rules/ensfacil_op_acc_2_json_rules.xml

2) Añadir los localfile al agent.conf del grupo ens:
   nano /var/ossec/etc/shared/ens/agent.conf
   (pegar el contenido de agent.conf.fragmento.xml dentro de <agent_config>)

3) Verificar y reiniciar:
   /var/ossec/bin/wazuh-logtest -v      (ctrl+C tras comprobar que carga)
   systemctl restart wazuh-manager

INSTALACIÓN (AGENTE / CLIENTE)
------------------------------
4) Emisor y directorio de logs:
   mkdir -p /opt/ensfacil /var/log/ensfacil
   cp ensfacil-emit-opacc.sh /opt/ensfacil/
   chmod +x /opt/ensfacil/ensfacil-emit-opacc.sh
   chmod 750 /var/log/ensfacil

5) Los scripts del cliente hacen:
   source /opt/ensfacil/ensfacil-emit-opacc.sh
   ensfacil_emit op.acc.1 account_inventory EV-01 op.acc.1.3 CUMPLE BAJO '"total_cuentas":42'

PRUEBA RÁPIDA (sin scripts todavía)
-----------------------------------
En el agente, volcar las muestras y ver si llegan alertas:
   cat muestra_op_acc_1.ndjson >> /var/log/ensfacil/op_acc_1.json
   cat muestra_op_acc_2.ndjson >> /var/log/ensfacil/op_acc_2.json

Comprobar en el manager (ajusta credenciales):
   curl -sk -u "$OS_USER:$OS_PASS" 'https://localhost:9200/wazuh-alerts*/_search' \
     -H 'Content-Type: application/json' \
     -d '{"size":5,"query":{"match_phrase":{"data.ensfacil":"op.acc.1"}},
          "sort":[{"@timestamp":"desc"}]}' | python3 -m json.tool | head -40

Probar una regla concreta con logtest:
   echo '{"ensfacil":"op.acc.1","event":"account_authenticated","ts":"2026-07-19T10:00:00Z","host":"test","evidence_id":"EV-03","requisito":"op.acc.1.1","usuario":"admin","origen":"10.0.0.55"}' | /var/ossec/bin/wazuh-logtest
   (debe matchear la regla 106873)

CONTRATO DEL EVENTO
-------------------
Campos obligatorios : ensfacil (id del control), event (tipo de evento)
Campos estándar     : ts (ISO8601 Z), host
Campos de evidencia : evidence_id (EV-xx), requisito (op.acc.X.Y),
                      estado (CUMPLE|NO_CUMPLE|NO_EVALUABLE|NO_APLICA),
                      nivel (BAJO|MEDIO|ALTO)
Campos libres       : los que necesite cada evento (usuario, ruta, permisos...)

EVENTOS POR EVIDENCIA
---------------------
op.acc.1
  EV-01 account_inventory, account_active
  EV-02 account_created, account_modified, account_deleted
  EV-03 account_authenticated (hecho crudo; la juzga el motor contra P-04)
        generic_account_login, auth_success (legado, agentes sin actualizar)
  EV-04 account_disabled, account_offboarding
  EV-05 service_account_interactive, interactive_login
  EV-06 multi_role_usage, privilege_use
  EV-07 authorized_list_check, unauthorized_user      (R1: MEDIO/ALTO)
  EV-08 account_deleted, retention_violation

op.acc.2
  EV-01 sca_check, world_writable, umask_check
  EV-02 fim_modified, fim_added, fim_deleted          (+ FIM nativo regla 106923)
  EV-03 access_denied, privilege_escalation, sudo_usage
  EV-04 acl_check, acl_deviation
  EV-05 privilege_check, excessive_privilege, group_membership   (R1: solo ALTO)
  EV-06 access_type_violation, object_access                     (R1: solo ALTO)
  EV-07 rootcheck, suid_sgid, no_owner_file

Todos los controles aceptan además: evidence_state, control_state, score_snapshot.

PENDIENTE TRAS ESTO
-------------------
En el plugin, las evidencias de op.acc.1/op.acc.2 llevan relatedRules con
nombres simbólicos ('ENS-OPACC1-INVENTORY'). mp.info.6 usa IDs numéricos
('106650'), que es lo que alimenta la pestaña de Trazabilidad ENS<->Wazuh.
Conviene alinearlos a los IDs reales (1068xx/1069xx) en una pasada posterior.
