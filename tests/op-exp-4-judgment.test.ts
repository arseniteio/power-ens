/**
 * op.exp.4 · el juicio de mantenimiento y actualizaciones de seguridad.
 *
 *     npx tsx tests/op-exp-4-judgment.test.ts
 *
 * Mismo montaje que sus hermanas: TypeScript suelto con su propio comprobador.
 *
 * Qué se prueba. La policy de op.exp.4 mide lo que ninguna primitiva expresa
 * (plazos por criticidad contra el reloj, fin de soporte contra hoy, ventanas
 * horarias, precedencia del punto de reversión) y deja a las primitivas lo que
 * sí cabe en ellas (EV-04, EV-06). Cada caso mueve UN eje y lleva al lado la
 * REVERSIÓN que demuestra que no pasaría siempre: el MISMO evento del agente con
 * otro parámetro, u otro `now`, cambia el veredicto.
 *
 * Los eventos se construyen como alertas de `alerts.json` y pasan por el
 * normalizador real: los números llegan como texto y `evidence_id` con comas se
 * parte en uno por evidencia, igual que en producción.
 */
import { opExp4PolicyDefinition } from '../dashboard/ens/core/policy-runtime/policies/op-exp-4.policy';
import { buildPolicyContext } from '../dashboard/ens/core/policy-runtime/policy-context-builder';
import { opExp4CatalogDefinition } from '../dashboard/ens/catalog/op-exp-4';
import { opExp4Configuration } from '../dashboard/ens/configuration/data/op-exp-4-parameters';
import { normalizeWazuhAlerts } from '../dashboard/ens/core/data-source/data-source-engine';
import { resolveEvidenceForControl } from '../dashboard/ens/core/evidence/engine';
import { applyPolicyDecisionsToEvidences } from '../dashboard/ens/core/evaluation/policy-evidence-bridge';
import { evaluateRequirement } from '../dashboard/ens/core/evaluation/requirement/requirement-evaluator';
import type {
  ENSControlConfiguration,
  ENSLevel,
} from '../dashboard/ens/configuration/types';
import type { ENSNormalizedEvent } from '../dashboard/ens/core/data-source/types';

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

// --- fixtures --------------------------------------------------------------

const AHORA = new Date('2026-09-16T12:00:00Z');
const hace = (horas: number): string =>
  new Date(AHORA.getTime() - horas * 3600 * 1000).toISOString().replace('.000Z', 'Z');

let contador = 0;

// Una alerta tal como la deja el manager: agente, regla y `data` con texto.
const alerta = (data: Record<string, unknown>, ts = hace(1)) => {
  contador += 1;

  return {
    _id: `alerta-${contador}`,
    _source: {
      '@timestamp': ts,
      agent: { id: '024', name: 'wazuh-real' },
      rule: { id: '110500', description: 'op.exp.4' },
      location: '/var/log/ensfacil/op_exp_4.json',
      data: Object.fromEntries(
        Object.entries({ ensfacil: 'op.exp.4', ...data }).map(([k, v]) => [k, String(v)])
      ),
    },
  };
};

const eventos = (...alertas: ReturnType<typeof alerta>[]): ENSNormalizedEvent[] =>
  normalizeWazuhAlerts(alertas);

// Configuración a partir del catálogo real de parámetros: se rellena solo lo que
// cada caso declara.
const configuracion = (valores: Record<string, string[]>): ENSControlConfiguration => ({
  ...opExp4Configuration,
  parameters: opExp4Configuration.parameters.map(p => ({
    ...p,
    value: valores[p.id],
  })),
});

const instantanea = (texto: string, abiertas: { cvss: string; detectada: string; cve: string; n?: number }[]) => [
  alerta({
    event: 'vulnerability_inventory',
    evidence_id: 'EV-01,EV-10',
    instantanea: texto,
    abiertas: abiertas.reduce((t, a) => t + (a.n || 1), 0),
    sin_puntuacion: abiertas.filter(a => a.cvss === '-').reduce((t, a) => t + (a.n || 1), 0),
    puntuaciones: abiertas.length,
  }, texto),
  ...abiertas.map(a =>
    alerta({
      event: 'vulnerability_open',
      evidence_id: 'EV-02,EV-10',
      instantanea: texto,
      cvss: a.cvss,
      detectada: a.detectada,
      cve: a.cve,
      paquete: 'linux-image-6.8.0-139-generic',
      abiertas: a.n || 1,
    }, texto)
  ),
];

const evalua = (
  evs: ENSNormalizedEvent[],
  valores: Record<string, string[]>,
  ahora: Date = AHORA,
  nivel: ENSLevel = 'ALTO'
) => {
  const cfg = configuracion(valores);
  const evidencias = resolveEvidenceForControl('op.exp.4', evs, '024', nivel, cfg, ahora);
  const contexto = buildPolicyContext(opExp4CatalogDefinition, cfg, nivel, evs, evidencias, ahora);
  const { decisions } = opExp4PolicyDefinition.evaluator!(contexto);
  const principal = (requisito: string) => decisions.find(d => d.requirementId === requisito)!;
  const deEvidencia = (id: string) =>
    decisions.find(d => d.trace.ruleId.endsWith(`/${id}`));

  return { evidencias, decisions, principal, deEvidencia, cfg, nivel };
};

const P01 = (critica: string) => ['Crítica | ' + critica, 'Alta | 30', 'Media | 90', 'Baja | 180', 'Sin puntuación | 180'];

// --- 1. catálogo -----------------------------------------------------------

bloque('1. Aplicabilidad: refuerzos acumulativos, R3 y R4 fuera del denominador');

{
  const nivelesDe = (id: string) =>
    opExp4CatalogDefinition.requirements.find(r => r.id === id)!.applicability.levels.join(',');

  comprueba('R1 rige en MEDIO y ALTO', nivelesDe('op.exp.4.r1.1') === 'MEDIO,ALTO', nivelesDe('op.exp.4.r1.1'));
  comprueba('R2 rige solo en ALTO', nivelesDe('op.exp.4.r2.1') === 'ALTO', nivelesDe('op.exp.4.r2.1'));
  comprueba('R3 no rige en ningún nivel', nivelesDe('op.exp.4.r3.1') === '');
  comprueba('R4 no rige en ningún nivel', nivelesDe('op.exp.4.r4.1') === '');
  comprueba('la base rige en los tres', ['op.exp.4.1', 'op.exp.4.2', 'op.exp.4.3'].every(id => nivelesDe(id) === 'BAJO,MEDIO,ALTO'));
  comprueba('el control está ACTIVE', opExp4CatalogDefinition.status === 'ACTIVE', opExp4CatalogDefinition.status);

  const policyNiveles = (id: string) =>
    opExp4PolicyDefinition.requirements.find(r => r.requirementId === id)!.levels.join(',');

  comprueba('la policy dice lo mismo que el catálogo para R1 y R2',
    policyNiveles('op.exp.4.r1.1') === 'MEDIO,ALTO' && policyNiveles('op.exp.4.r2.1') === 'ALTO');
}

// --- 2. EV-02: plazo por criticidad ---------------------------------------

bloque('2. EV-02 · la más antigua de cada puntuación contra su plazo');

{
  const evs = eventos(...instantanea(hace(2), [
    { cvss: '9.8', detectada: hace(10 * 24), cve: 'CVE-2026-31536', n: 164 },
    { cvss: '5.5', detectada: hace(10 * 24), cve: 'CVE-2025-1000' },
  ]));

  const siete = evalua(evs, { 'P-01': P01('7') });
  comprueba('crítica abierta 10 días con plazo 7 → NO_CUMPLE', siete.deEvidencia('EV-02')?.status === 'NO_CUMPLE', siete.deEvidencia('EV-02')?.reason);
  comprueba('y el motivo nombra la CVE y el plazo', /CVE-2026-31536.*plazo de 7/.test(siete.deEvidencia('EV-02')?.reason || ''), siete.deEvidencia('EV-02')?.reason);

  const treinta = evalua(evs, { 'P-01': P01('30') });
  comprueba('REVERSIÓN: el MISMO evento con plazo 30 → CUMPLE', treinta.deEvidencia('EV-02')?.status === 'CUMPLE', treinta.deEvidencia('EV-02')?.reason);

  const p08 = evalua(evs, { 'P-01': P01('7'), 'P-08': ['Crítica | 9.9', 'Alta | 7.0', 'Media | 4.0', 'Baja | 0.1'] });
  comprueba('P-08 declara Crítica desde 9,9: el 9,8 pasa a Alta (30 días) → CUMPLE', p08.deEvidencia('EV-02')?.status === 'CUMPLE', p08.deEvidencia('EV-02')?.reason);

  const tarde = evalua(evs, { 'P-01': P01('30') }, new Date(AHORA.getTime() + 25 * 86400000));
  comprueba('25 días después, sin una instantánea nueva, no se afirma nada: NO_EVALUABLE', tarde.deEvidencia('EV-02')?.status === 'NO_EVALUABLE', tarde.deEvidencia('EV-02')?.reason);

  const sinP01 = evalua(evs, {});
  comprueba('sin P-01 → NO_EVALUABLE, nunca CUMPLE', sinP01.deEvidencia('EV-02')?.status === 'NO_EVALUABLE');
}

bloque('3. EV-02 · instantánea incompleta, vieja o sin puntuación');

{
  const incompleta = eventos(...instantanea(hace(2), [
    { cvss: '9.8', detectada: hace(1), cve: 'CVE-A' },
    { cvss: '7.5', detectada: hace(1), cve: 'CVE-B' },
  ]).slice(0, 2));
  const r1 = evalua(incompleta, { 'P-01': P01('7') });
  comprueba('declara 2 puntuaciones y llega 1 → NO_EVALUABLE', r1.deEvidencia('EV-02')?.status === 'NO_EVALUABLE', r1.deEvidencia('EV-02')?.reason);

  const vieja = eventos(...instantanea(hace(30), [{ cvss: '9.8', detectada: hace(40), cve: 'CVE-A' }]));
  const r2 = evalua(vieja, { 'P-01': P01('7') });
  comprueba('instantánea de hace 30 h → NO_EVALUABLE', r2.deEvidencia('EV-01')?.status === 'NO_EVALUABLE' && r2.deEvidencia('EV-02')?.status === 'NO_EVALUABLE');
  const r2b = evalua(vieja, { 'P-01': P01('7') }, new Date(AHORA.getTime() - 20 * 3600000));
  comprueba('REVERSIÓN: la misma instantánea evaluada 20 h antes es vigente', r2b.deEvidencia('EV-01')?.status === 'CUMPLE', r2b.deEvidencia('EV-01')?.reason);

  const sinPuntuacion = eventos(...instantanea(hace(2), [{ cvss: '-', detectada: hace(24), cve: 'CVE-X', n: 706 }]));
  const r3 = evalua(sinPuntuacion, { 'P-01': ['Crítica | 7'] });
  comprueba('sin puntuación y sin fila en P-01 → NO_EVALUABLE', r3.deEvidencia('EV-02')?.status === 'NO_EVALUABLE', r3.deEvidencia('EV-02')?.reason);
  const r3b = evalua(sinPuntuacion, { 'P-01': ['Crítica | 7', 'Sin puntuación | 180'] });
  comprueba('REVERSIÓN: con la fila «Sin puntuación» se juzga → CUMPLE', r3b.deEvidencia('EV-02')?.status === 'CUMPLE', r3b.deEvidencia('EV-02')?.reason);
  const r3c = evalua(sinPuntuacion, { 'P-01': ['Crítica | 7', 'Sin puntuación |'] });
  comprueba('fila «Sin puntuación» con días vacíos = sin plazo declarado → CUMPLE y lo dice', r3c.deEvidencia('EV-02')?.status === 'CUMPLE' && /Sin plazo declarado/.test(r3c.deEvidencia('EV-02')?.reason || ''), r3c.deEvidencia('EV-02')?.reason);
}

// --- 4. EV-03 ---------------------------------------------------------------

bloque('4. EV-03 · pendiente de seguridad y reinicio contra el plazo más largo');

{
  const foto = (extra: Record<string, unknown>) =>
    eventos(alerta({
      event: 'patch_status',
      evidence_id: 'EV-03',
      actualizaciones_pendientes: 36,
      seguridad_pendientes: 0,
      indice_paquetes: hace(3),
      linea_base: hace(24 * 40),
      desde_linea_base: 'no',
      reinicio_pendiente: 'no',
      ...extra,
    }));

  const reinicio = foto({ reinicio_pendiente: 'si', reinicio_pendiente_desde: hace(24 * 48), reinicio_desde_aproximado: 'no', paquetes_que_piden_reinicio: 'libc6,linux-image-6.8.0-139-generic' });
  const r1 = evalua(reinicio, { 'P-01': ['Crítica | 7', 'Alta | 30'] });
  comprueba('reinicio pendiente 48 días con plazo más largo 30 → NO_CUMPLE', r1.deEvidencia('EV-03')?.status === 'NO_CUMPLE', r1.deEvidencia('EV-03')?.reason);
  const r1b = evalua(reinicio, { 'P-01': ['Crítica | 7', 'Alta | 60'] });
  comprueba('REVERSIÓN: con plazo más largo 60 → CUMPLE', r1b.deEvidencia('EV-03')?.status === 'CUMPLE', r1b.deEvidencia('EV-03')?.reason);

  const base = foto({ seguridad_pendientes: 3, seguridad_pendiente_desde: hace(2), linea_base: hace(2), desde_linea_base: 'si' });
  const r2 = evalua(base, { 'P-01': ['Alta | 30'] });
  comprueba('pendiente desde la línea base recién puesta → NO_EVALUABLE (es una cota)', r2.deEvidencia('EV-03')?.status === 'NO_EVALUABLE', r2.deEvidencia('EV-03')?.reason);
  const r2b = evalua(base, { 'P-01': ['Alta | 30'] }, new Date(AHORA.getTime() + 31 * 86400000));
  comprueba('REVERSIÓN: 31 días después sigue pendiente… pero la foto ya no es fresca', r2b.deEvidencia('EV-03')?.status === 'NO_EVALUABLE');

  const indiceViejo = foto({ indice_paquetes: hace(24 * 45) });
  const r3 = evalua(indiceViejo, { 'P-01': ['Alta | 30'] });
  comprueba('índice de apt más viejo que el plazo → NO_EVALUABLE, «0 pendientes» no vale', r3.deEvidencia('EV-03')?.status === 'NO_EVALUABLE', r3.deEvidencia('EV-03')?.reason);
}

bloque('4 bis. EV-03 · un servidor de directorio manda dos fotos y se juzgan las dos');

{
  const sistema = alerta({
    event: 'patch_status', evidence_id: 'EV-03', plano: 'sistema',
    actualizaciones_pendientes: 0, seguridad_pendientes: 0, indice_paquetes: hace(3),
    linea_base: hace(24 * 60), desde_linea_base: 'no', reinicio_pendiente: 'no',
  }, hace(1));
  const directorio = (desdeHoras: number) => alerta({
    event: 'patch_status', evidence_id: 'EV-03', plano: 'directorio', ambito_pendientes: 'parches_zimbra',
    actualizaciones_pendientes: 3, seguridad_pendientes: 3, seguridad_pendiente_desde: hace(desdeHoras),
    indice_paquetes: hace(3), linea_base: hace(24 * 60), desde_linea_base: 'no', reinicio_pendiente: 'no',
  }, hace(2));

  // La foto del directorio es MÁS VIEJA que la del sistema: si ganara la más
  // reciente, el parche de Zimbra atrasado desaparecería del veredicto.
  const r1 = evalua(eventos(directorio(24 * 45), sistema), { 'P-01': ['Alta | 30'] });
  comprueba('parches de Zimbra pendientes 45 días con plazo 30 → NO_CUMPLE aunque el sistema esté al día', r1.deEvidencia('EV-03')?.status === 'NO_CUMPLE' && /Zimbra/.test(r1.deEvidencia('EV-03')?.reason || ''), r1.deEvidencia('EV-03')?.reason);
  const r1b = evalua(eventos(directorio(24 * 10), sistema), { 'P-01': ['Alta | 30'] });
  comprueba('REVERSIÓN: pendientes solo 10 días → CUMPLE', r1b.deEvidencia('EV-03')?.status === 'CUMPLE', r1b.deEvidencia('EV-03')?.reason);
  const r1c = evalua(eventos(directorio(24 * 10)), { 'P-01': ['Alta | 30'] });
  comprueba('sin la foto del plano sistema → NO_EVALUABLE', r1c.deEvidencia('EV-03')?.status === 'NO_EVALUABLE', r1c.deEvidencia('EV-03')?.reason);
}

// --- 5. EV-04 (primitiva) ---------------------------------------------------

bloque('5. EV-04 · actor contra P-02 (primitiva NINGUNO_FUERA_DE_LISTA)');

{
  const cambio = (actor: string) =>
    alerta({ event: 'package_changed', evidence_id: 'EV-04,EV-07,EV-08,EV-09', actor, mecanismo: 'unattended-upgrades', inicio: '2026-09-11T06:14:01+00:00' });
  const latido = alerta({ event: 'collector_run', resultado: 'completada', evidencias_cubiertas: 'EV-04,EV-07' });

  const evs = eventos(cambio('unattended-upgrades'), cambio('dioni'), latido);
  const r1 = evalua(evs, { 'P-02': ['unattended-upgrades | servidores | automático'] });
  const ev04 = (r: ReturnType<typeof evalua>) => r.evidencias.find(e => e.id === 'EV-04')!;
  comprueba('dioni no está en P-02 → NO_CUMPLE', ev04(r1).status === 'NO_CUMPLE', ev04(r1).observations.join(' '));
  const r1b = evalua(evs, { 'P-02': ['unattended-upgrades | servidores | automático', 'dioni | servidores | administrador'] });
  comprueba('REVERSIÓN: se autoriza a dioni → CUMPLE', ev04(r1b).status === 'CUMPLE', ev04(r1b).observations.join(' '));

  const r2 = evalua(eventos(latido), { 'P-02': ['dioni | servidores | administrador'] });
  comprueba('sin cambios y con latido que cubre EV-04 → CUMPLE (barrido limpio)', ev04(r2).status === 'CUMPLE');
  const r2b = evalua(eventos(), { 'P-02': ['dioni | servidores | administrador'] });
  comprueba('REVERSIÓN: sin latido, el silencio no acredita → NO_EVALUABLE', ev04(r2b).status === 'NO_EVALUABLE');
}

// --- 6. EV-07 ---------------------------------------------------------------

bloque('6. EV-07 · ventanas de mantenimiento en hora local');

{
  // 2026-09-02 es miércoles; 06:41 hora local de la máquina.
  const evs = eventos(alerta({ event: 'package_changed', evidence_id: 'EV-04,EV-07,EV-08,EV-09', actor: 'unattended-upgrades', mecanismo: 'unattended-upgrades', inicio: '2026-09-02T06:41:18+02:00' }));

  const r1 = evalua(evs, { 'P-04': ['* | sab 22:00-02:00'] });
  comprueba('miércoles 06:41 con ventana «sab 22:00-02:00» → NO_CUMPLE', r1.deEvidencia('EV-07')?.status === 'NO_CUMPLE', r1.deEvidencia('EV-07')?.reason);
  const r1b = evalua(evs, { 'P-04': ['* | sab 22:00-02:00; * 06:00-07:30'] });
  comprueba('REVERSIÓN: añadir «* 06:00-07:30» → CUMPLE', r1b.deEvidencia('EV-07')?.status === 'CUMPLE', r1b.deEvidencia('EV-07')?.reason);
  const r1c = evalua(evs, { 'P-04': ['* | mar 23:00-07:00'] });
  comprueba('un tramo que cruza la medianoche cubre el día siguiente → CUMPLE', r1c.deEvidencia('EV-07')?.status === 'CUMPLE', r1c.deEvidencia('EV-07')?.reason);
  const r1d = evalua(evs, { 'P-04': ['wazuh-real | lun-vie 06:00-07:00', '* | sab 22:00-02:00'] });
  comprueba('la fila del propio agente manda sobre «*»', r1d.deEvidencia('EV-07')?.status === 'CUMPLE', r1d.deEvidencia('EV-07')?.reason);
  const r1e = evalua(evs, { 'P-04': ['* | los sábados por la noche'] });
  comprueba('una ventana que no se entiende no se adivina → NO_EVALUABLE', r1e.deEvidencia('EV-07')?.status === 'NO_EVALUABLE', r1e.deEvidencia('EV-07')?.reason);
}

// --- 7. EV-05 ---------------------------------------------------------------

bloque('7. EV-05 · fin de soporte: la fecha más temprana entre fabricante y P-05');

{
  const ubuntu = (estandar: string) =>
    eventos(alerta({ event: 'product_support', evidence_id: 'EV-05', producto: 'Ubuntu', version: '24.04', fin_soporte_estandar: estandar, fin_soporte_ampliado: '2034-04-25', soporte_ampliado: 'no_adjunto' }));

  const r1 = evalua(ubuntu('2029-05-31'), { 'P-05': ['Ubuntu | 24.04 | 2029-05-31'] });
  comprueba('Ubuntu 24.04 declarado y en soporte → CUMPLE', r1.deEvidencia('EV-05')?.status === 'CUMPLE', r1.deEvidencia('EV-05')?.reason);
  const r1b = evalua(ubuntu('2029-05-31'), { 'P-05': ['Ubuntu | 24.04 | 2026-01-01'] });
  comprueba('REVERSIÓN: P-05 declara una fecha ya pasada → NO_CUMPLE', r1b.deEvidencia('EV-05')?.status === 'NO_CUMPLE', r1b.deEvidencia('EV-05')?.reason);
  const r1c = evalua(ubuntu('2029-05-31'), { 'P-05': ['Ubuntu | 24.04 | 2035-01-01'] });
  comprueba('una declaración no alarga el soporte más allá del fabricante (usa 2029)', r1c.deEvidencia('EV-05')?.status === 'CUMPLE' && /2029-05-31/.test(r1c.deEvidencia('EV-05')?.reason || ''), r1c.deEvidencia('EV-05')?.reason);
  const r2 = evalua(ubuntu('2029-05-31'), { 'P-05': ['Zimbra | 10.1 | 2027-12-31'] });
  comprueba('producto informado sin fila en P-05 → NO_EVALUABLE', r2.deEvidencia('EV-05')?.status === 'NO_EVALUABLE', r2.deEvidencia('EV-05')?.reason);
  const r3 = evalua(ubuntu('2025-05-29'), { 'P-05': ['Zimbra | 10.1 | 2027-12-31'] });
  comprueba('fecha del fabricante vencida aunque no haya fila → NO_CUMPLE', r3.deEvidencia('EV-05')?.status === 'NO_CUMPLE', r3.deEvidencia('EV-05')?.reason);
}

// --- 8. R1 y R2 -------------------------------------------------------------

bloque('8. R1 sin simular y R2 con precedencia');

{
  const cambio = alerta({ event: 'package_changed', evidence_id: 'EV-04,EV-07,EV-08,EV-09', actor: 'dioni', mecanismo: 'apt', inicio: hace(5) });

  const r1 = evalua(eventos(cambio), { 'P-06': ['wazuh-real | pre-wazuh-real | informe'] });
  comprueba('R1 con P-06 declarado sigue NO_EVALUABLE: no se cruzan dos máquinas', r1.principal('op.exp.4.r1.1').status === 'NO_EVALUABLE', r1.principal('op.exp.4.r1.1').reason);

  const hipervisor = evalua(eventos(cambio), { 'P-07': ['* | hipervisor | snapshot Hetzner | 24'] });
  comprueba('R2 con mecanismo «hipervisor» → NO_EVALUABLE (no deja huella en la máquina)', hipervisor.principal('op.exp.4.r2.1').status === 'NO_EVALUABLE', hipervisor.principal('op.exp.4.r2.1').reason);

  const antes = alerta({ event: 'reversion_point_created', evidence_id: 'EV-09', mecanismo: 'lvm', identificador: 'vg0/pre-parche', creado: hace(7) });
  const despues = alerta({ event: 'reversion_point_created', evidence_id: 'EV-09', mecanismo: 'lvm', identificador: 'vg0/tarde', creado: hace(4) });

  const r2 = evalua(eventos(cambio, antes), { 'P-07': ['* | lvm | snapshot | 24'] });
  comprueba('snapshot LVM 2 h antes del cambio, ventana 24 h → CUMPLE', r2.principal('op.exp.4.r2.1').status === 'CUMPLE', r2.principal('op.exp.4.r2.1').reason);
  const r2b = evalua(eventos(cambio, despues), { 'P-07': ['* | lvm | snapshot | 24'] });
  comprueba('REVERSIÓN: el snapshot es POSTERIOR al cambio → NO_CUMPLE', r2b.principal('op.exp.4.r2.1').status === 'NO_CUMPLE', r2b.principal('op.exp.4.r2.1').reason);
  const r2c = evalua(eventos(cambio, antes), { 'P-07': ['* | lvm | snapshot | 1'] });
  comprueba('REVERSIÓN: ventana previa de 1 h no cubre las 2 h → NO_CUMPLE', r2c.principal('op.exp.4.r2.1').status === 'NO_CUMPLE');
}

// --- 9. EV-10 ---------------------------------------------------------------

bloque('9. EV-10 · la deuda semana a semana');

{
  const cabecera = (horas: number, abiertas: number) =>
    alerta({ event: 'vulnerability_inventory', evidence_id: 'EV-01,EV-10', instantanea: hace(horas), abiertas, puntuaciones: 0, sin_puntuacion: 0 }, hace(horas));

  const crece = evalua(eventos(cabecera(24 * 15, 100), cabecera(24 * 8, 120), cabecera(2, 150)), {});
  comprueba('100 → 120 → 150 en tres semanas → NO_CUMPLE', crece.deEvidencia('EV-10')?.status === 'NO_CUMPLE', crece.deEvidencia('EV-10')?.reason);
  const baja = evalua(eventos(cabecera(24 * 15, 100), cabecera(24 * 8, 160), cabecera(2, 150)), {});
  comprueba('REVERSIÓN: 100 → 160 → 150 no es crecimiento sostenido → CUMPLE', baja.deEvidencia('EV-10')?.status === 'CUMPLE', baja.deEvidencia('EV-10')?.reason);
  const corta = evalua(eventos(cabecera(2, 150)), {});
  comprueba('una sola semana de serie → NO_EVALUABLE', corta.deEvidencia('EV-10')?.status === 'NO_EVALUABLE');
}

// --- 10. el requisito y la tabla de evidencias ------------------------------

bloque('10. El requisito sale de sus evidencias y cada evidencia conserva su color');

{
  const evs = eventos(
    ...instantanea(hace(2), [{ cvss: '9.8', detectada: hace(10 * 24), cve: 'CVE-2026-31536', n: 164 }]),
    alerta({ event: 'collector_run', resultado: 'completada', evidencias_cubiertas: 'EV-04,EV-07' })
  );
  const r = evalua(evs, { 'P-01': P01('7'), 'P-04': ['* | * 00:00-24:00'] });

  const decision = r.principal('op.exp.4.2');
  comprueba('la PRIMERA decisión de op.exp.4.2 es la del requisito, y es NO_CUMPLE', decision.status === 'NO_CUMPLE' && decision.trace.ruleId === 'op.exp.4.2', `${decision.trace.ruleId} ${decision.status}`);

  const requisito = evaluateRequirement(
    opExp4CatalogDefinition.requirements.find(q => q.id === 'op.exp.4.2')!,
    'BAJO',
    r.evidencias,
    false,
    r.decisions,
    'ACTIVE'
  );
  comprueba('evaluateRequirement publica op.exp.4.2 NO_CUMPLE medido', requisito.status === 'NO_CUMPLE' && requisito.evidenced === true, `${requisito.status} ${requisito.evidenced}`);

  const tabla = applyPolicyDecisionsToEvidences(r.evidencias, r.decisions, opExp4CatalogDefinition.requirements);
  const color = (id: string) => tabla.find(e => e.id === id)?.status;
  comprueba('EV-02 sale NO_CUMPLE en la tabla', color('EV-02') === 'NO_CUMPLE', color('EV-02'));
  comprueba('y EV-01, que sí está medida, sale CUMPLE: no hereda el rojo de EV-02', color('EV-01') === 'CUMPLE', color('EV-01'));
  comprueba('EV-07 sin cambios con latido → CUMPLE', color('EV-07') === 'CUMPLE', color('EV-07'));
}

bloque('11. Solo cuentan los hechos de op.exp.4');

{
  const ajeno = normalizeWazuhAlerts([{
    _id: 'otro',
    _source: {
      '@timestamp': hace(1),
      agent: { id: '024', name: 'wazuh-real' },
      data: { ensfacil: 'op.acc.4', event: 'package_changed', actor: 'intruso', inicio: '2026-09-02T03:00:00+00:00' },
    },
  }]);
  const r = evalua(ajeno, { 'P-04': ['* | sab 22:00-02:00'] });
  comprueba('un package_changed de otro control no entra en EV-07', r.deEvidencia('EV-07')?.status === 'NO_EVALUABLE', r.deEvidencia('EV-07')?.reason);
}

// --- salida ----------------------------------------------------------------

console.log('');

if (fallos.length) {
  console.log(`${fallos.length} comprobación(es) fallan:`);
  fallos.forEach(f => console.log(`  - ${f}`));
  process.exit(1);
}

console.log('Todas las comprobaciones pasan.');
