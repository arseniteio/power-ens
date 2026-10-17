#!/usr/bin/env python3
"""Pruebas de la validación de valores por tipo (T1.4).

Lo que se prueba es una sola cosa, con sus tres capas: que "configurado" haya
dejado de significar "el campo no está vacío". Un `umask_minimo` de 'abc', un
`retencion_dias` de -5 o de 'treinta' están rellenos y no significan nada, y con
ellos el control se declaraba evaluable y podía salir en verde.

    python3 test_parameter_value_validator.py

Ejecuta el TypeScript de verdad (no una copia del criterio en Python: una copia
pasa igual con el cambio y sin él). Para eso copia `public/` a un temporal,
deja al lado un `kibana-services` de mentira —de la versión integrada; el
arnés no lo necesita— y lanza un arnés con bun.

Requiere un runtime capaz de ejecutar TypeScript: bun o deno.
Sin dependencias de Python más allá de la stdlib.
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.abspath(os.path.join(AQUI, "..", "..", "..", ".."))
DASHBOARD = os.path.join(RAIZ, "public")


# --- localización del runtime -----------------------------------------------

def busca_runtime():
    candidatos = [
        (shutil.which("bun"), ["run"]),
        (os.path.expanduser("~/.bun/bin/bun"), ["run"]),
        (shutil.which("deno"), ["run", "-A", "--no-check"]),
    ]

    for binario, argumentos in candidatos:
        if binario and os.path.exists(binario):
            return [binario] + argumentos

    return None


# --- arnés ------------------------------------------------------------------
#
# Vive aquí y no como fichero del repo a propósito: `public/` es el código del
# plugin que compila `config/build-plugin.sh`, y un arnés de pruebas no tiene
# por qué estar entre lo que se compila y se entrega al cliente.

ARNES = r"""
import { readFileSync } from 'node:fs';
import process from 'node:process';

import { validateParameterValue } from './repo/common/ens/configuration/services/parameter-value-validator';
import {
  validateControlConfiguration,
  validateControlParameterValues,
} from './repo/common/ens/configuration/services/validation-engine';
import { evaluateENSControl } from './repo/common/ens/core/evaluation/evaluation-engine';
import { ENSCatalog } from './repo/common/ens/catalog';
import { ENSConfigurationRegistry } from './repo/common/ens/configuration/registry';

const control = (controlId) =>
  ENSConfigurationRegistry.find((item) => item.controlId === controlId);

const conValores = (controlId, valores) => {
  const base = control(controlId);
  return {
    ...base,
    parameters: base.parameters.map((parameter) =>
      Object.prototype.hasOwnProperty.call(valores, parameter.id)
        ? { ...parameter, value: valores[parameter.id] }
        : parameter
    ),
  };
};

const casos = JSON.parse(
  readFileSync(process.argv[process.argv.length - 1], 'utf8')
);

const salida = casos.map((caso) => {
  if (caso.tipo === 'valor') {
    const base = caso.controlId
      ? control(caso.controlId).parameters.find((p) => p.id === caso.parametroId)
      : {};
    const parameter = { ...base, ...(caso.parametro || {}) };
    const verdict = validateParameterValue(parameter, caso.valor);
    return { valid: verdict.valid, reason: verdict.reason || '' };
  }

  if (caso.tipo === 'control') {
    const validation = validateControlConfiguration(
      conValores(caso.controlId, caso.valores),
      caso.nivel
    );
    return {
      status: validation.status,
      estados: validation.parameters.reduce((acc, p) => {
        acc[p.id] = p.status;
        return acc;
      }, {}),
      configured: validation.configured,
      missingRequired: validation.missingRequired.map((p) => p.id),
      invalidRequired: validation.invalidRequired.map((p) => p.id),
      issues: validation.issues.map((i) => `${i.parameterId}: ${i.reason}`),
    };
  }

  if (caso.tipo === 'formulario') {
    // Lo mismo que hace `handleSave` en configuration-session.tsx: los valores
    // van por NOMBRE de parámetro, no por identificador.
    const issues = validateControlParameterValues(
      control(caso.controlId),
      caso.valores
    );
    return { issues: issues.map((i) => `${i.parameterId} · ${i.label}: ${i.reason}`) };
  }

  if (caso.tipo === 'evaluacion') {
    const catalogControl = ENSCatalog.find((item) => item.id === caso.controlId);

    // Evidencias sintéticas en CUMPLE para todos los requisitos del nivel. Sin
    // ellas el control sale NO_EVALUABLE por falta de evidencias y la prueba de
    // "un valor inválido no lo deja en verde" pasaría también sin el cambio.
    const evidencias = caso.evidenciasCumple
      ? Array.from(
          new Set(
            catalogControl.requirements
              .filter((r) => r.applicability.levels.includes(caso.nivel))
              .flatMap((r) => r.evidenceIds)
          )
        ).map((id) => ({
          id,
          controlId: caso.controlId,
          status: 'CUMPLE',
          requirements: [],
          levels: [caso.nivel],
          observations: [],
          relatedRules: [],
        }))
      : [];

    const resultado = evaluateENSControl(
      catalogControl,
      conValores(caso.controlId, caso.valores),
      caso.nivel,
      evidencias,
      undefined,
      []
    );
    const cfg = resultado.nonConformities.find((nc) => nc.id === 'NC-CFG');
    return {
      status: resultado.status,
      score: resultado.score,
      missingParameters: resultado.missingParameters,
      ncCfg: cfg ? { finding: cfg.finding, requiredAction: cfg.requiredAction } : null,
      observations: resultado.observations,
    };
  }

  return { error: 'caso desconocido' };
});

console.log(JSON.stringify(salida));
"""


def prepara(tmp):
    """Copia el árbol y deja el stub de kibana-services donde lo busca el import."""
    shutil.copytree(DASHBOARD, os.path.join(tmp, "repo", "public"))
    shutil.copytree(os.path.join(RAIZ, "common"), os.path.join(tmp, "repo", "common"))

    # `configuration/services/configuration-http-client.ts` importa
    # '../../../../../kibana-services', que desde services/ son cinco niveles:
    # configuration, ens, public, repo y la carpeta temporal.
    with open(os.path.join(tmp, "kibana-services.ts"), "w", encoding="utf-8") as f:
        f.write("export const getHttp = () => { throw new Error('stub'); };\n")

    arnes = os.path.join(tmp, "arnes.ts")
    with open(arnes, "w", encoding="utf-8") as f:
        f.write(ARNES)

    return arnes


def ejecuta(runtime, arnes, tmp, casos):
    entrada = os.path.join(tmp, "casos.json")
    with open(entrada, "w", encoding="utf-8") as f:
        json.dump(casos, f)

    proceso = subprocess.run(
        runtime + [arnes, entrada],
        capture_output=True, text=True, cwd=tmp,
    )

    if proceso.returncode != 0:
        print(proceso.stdout)
        print(proceso.stderr, file=sys.stderr)
        raise SystemExit("el arnés TypeScript no arrancó")

    return json.loads(proceso.stdout.strip().splitlines()[-1])


# --- casos ------------------------------------------------------------------

# (nombre, caso, comprobación sobre el resultado)
#
# Los parámetros son los REALES del producto, no inventados: si mañana cambia el
# tipo declarado de op.acc.2 P-07, esta prueba lo nota.

def valor(control_id, parametro_id, v, parametro=None):
    caso = {"tipo": "valor", "controlId": control_id,
            "parametroId": parametro_id, "valor": v}
    if parametro:
        caso["parametro"] = parametro
    return caso


def sintetico(parametro, v):
    return {"tipo": "valor", "parametro": parametro, "valor": v}


BASE_SINTETICO = {
    "id": "P-XX", "controlId": "sintetico", "name": "sintetico",
    "label": "Sintético", "description": "", "levels": ["BAJO"],
    "requirements": [], "required": True, "wazuhUsage": "",
    "ensfacilUsage": "", "evidenceIds": [], "ruleIds": [],
    "ifNotConfigured": "",
}


def sint(tipo, **extra):
    return dict(BASE_SINTETICO, type=tipo, **extra)


CASOS_VALOR = [
    # --- duration_days / duration_hours: entero no negativo
    ("duration_days · entero", valor("op.acc.1", "P-06", 365), True),
    ("duration_days · cadena numérica heredada", valor("op.acc.1", "P-06", "365"), True),
    ("duration_days · decimal", valor("op.acc.1", "P-06", 30.5), False),
    ("duration_days · negativo", valor("op.acc.1", "P-06", -5), False),
    ("duration_days · texto", valor("op.acc.1", "P-06", "treinta"), False),
    ("duration_days · número con sufijo", valor("op.acc.1", "P-06", "30 días"), False),
    ("duration_days · con signo +", valor("op.acc.1", "P-06", "+30"), False),
    ("duration_days · por debajo del minValue", valor("op.acc.1", "P-06", 0), False),
    ("duration_days · cero admitido si no hay minValue",
     sintetico(sint("duration_days"), 0), True),
    ("duration_hours · entero", valor("mp.info.6", "P-01", 24), True),
    ("duration_hours · decimal", valor("mp.info.6", "P-01", 1.5), False),

    # --- path: absoluta, y Windows no se queda fuera
    ("path · POSIX absoluta", valor("mp.info.6", "P-06", "/backup"), True),
    ("path · Windows con unidad", valor("mp.info.6", "P-06", "C:\\Backups"), True),
    ("path · Windows con barra normal", valor("mp.info.6", "P-06", "C:/Backups"), True),
    ("path · UNC", valor("mp.info.6", "P-09", "\\\\nas-dr\\backup"), True),
    ("path · URI de repositorio offsite", valor("mp.info.6", "P-09", "s3://bucket/copias"), True),
    ("path · relativa", valor("mp.info.6", "P-06", "backup"), False),
    ("path · relativa con punto", valor("mp.info.6", "P-06", "./backup"), False),
    ("path · tilde de home", valor("mp.info.6", "P-06", "~/backup"), False),
    ("path · el menú del ejemplo pegado tal cual",
     valor("mp.info.6", "P-06", "/backup | C:\\Backups"), False),

    # --- list: al menos un elemento, y NUNCA partir por `|`
    ("list · array con elementos", valor("op.acc.1", "P-04", ["admin", "guest"]), True),
    ("list · cadena heredada con comas", valor("op.acc.1", "P-04", "admin, guest, test"), True),
    ("list · cadena heredada con saltos de línea", valor("op.acc.1", "P-04", "admin\nguest"), True),
    ("list · un elemento con `|` sigue siendo un elemento",
     valor("op.acc.1", "P-02", "srv-dc01 | Windows"), True),
    # Presente pero sin ningún elemento: es un valor escrito que no significa
    # nada, no una ausencia. Inválido, y con motivo.
    ("list · solo separadores", valor("op.acc.1", "P-04", ",,,"), False),
    ("list · lista vacía cuenta como ausencia, no como error",
     valor("op.acc.1", "P-04", []), True),

    # --- boolean: las formas que el producto usa de verdad
    ("boolean · true", valor("mp.info.6", "P-08", True), True),
    ("boolean · 'sí'", valor("mp.info.6", "P-08", "sí"), True),
    ("boolean · 'si' sin tilde", valor("mp.info.6", "P-08", "si"), True),
    ("boolean · 'no'", valor("op.acc.2", "P-03", "no"), True),
    ("boolean · 'true' como cadena", valor("mp.info.6", "P-08", "true"), True),
    ("boolean · 'false' como cadena", valor("mp.info.6", "P-08", "false"), True),
    ("boolean · el menú del ejemplo pegado tal cual",
     valor("op.acc.2", "P-03", "no (ninguno) / sí - /tmp, /var/tmp"), False),
    ("boolean · texto libre", valor("mp.info.6", "P-08", "quizá"), False),

    # --- select
    #
    # Un bloque sembrado en el índice ANTES de que existieran las `options` sigue
    # admitiendo cualquier texto: el formulario lo edita como texto libre, así
    # que rechazarlo aquí sería rechazar lo que el propio campo deja escribir.
    ("select · sin opciones declaradas admite cualquier cosa (bloque sin resembrar)",
     sintetico(sint("select"), "lo que sea"), True),
    ("select · con opciones, valor de la lista",
     sintetico(sint("select", options=["Veeam", "Bacula"]), "Bacula"), True),
    ("select · con opciones, valor fuera de la lista",
     sintetico(sint("select", options=["Veeam", "Bacula"]), "Acronis"), False),
    # Los tres selects REALES del producto, con las opciones que declaran hoy.
    ("select · op.acc.1 P-01 rechaza el texto libre",
     valor("op.acc.1", "P-01", "lo que sea"), False),
    ("select · op.acc.1 P-01 admite una opción declarada",
     valor("op.acc.1", "P-01", "Active Directory"), True),
    ("select · op.acc.1 P-01 tolera mayúsculas y espacios del valor heredado",
     valor("op.acc.1", "P-01", "  local "), True),
    ("select · op.acc.2 P-05 rechaza el texto libre",
     valor("op.acc.2", "P-05", "lo que se nos ocurra"), False),
    ("select · op.acc.2 P-05 admite una opción declarada",
     valor("op.acc.2", "P-05", "Mínimo privilegio + sudo"), True),
    ("select · mp.info.6 P-10 rechaza 'cualquier cosa'",
     valor("mp.info.6", "P-10", "cualquier cosa"), False),
    ("select · mp.info.6 P-10 admite una opción declarada",
     valor("mp.info.6", "P-10", "zimbra-ne"), True),
    ("select · mp.info.6 P-10 sigue admitiendo un valor guardado de la lista anterior",
     valor("mp.info.6", "P-10", "Veeam"), True),
    ("select · el menú del ejemplo pegado tal cual ya no cuela",
     valor("mp.info.6", "P-10",
           "Veeam / Bacula / Amanda / rsync / Windows Backup / Otro"), False),

    # --- url
    ("url · con esquema", sintetico(sint("url"), "https://siem.cliente.es"), True),
    ("url · sin esquema", sintetico(sint("url"), "siem.cliente.es"), False),

    # --- string
    ("string · texto", valor("op.acc.2", "P-04", "Política de acceso v2.1"), True),
    ("string · solo espacios", valor("op.acc.2", "P-04", "   "), True),  # vacío -> sin valor

    # --- umask (op.acc.2 P-07, declarado `string`)
    ("umask · 022", valor("op.acc.2", "P-07", "022"), True),
    ("umask · 0027 con cuarto dígito", valor("op.acc.2", "P-07", "0027"), True),
    ("umask · 'abc'", valor("op.acc.2", "P-07", "abc"), False),
    ("umask · dígito fuera de octal", valor("op.acc.2", "P-07", "088"), False),
    ("umask · dos dígitos", valor("op.acc.2", "P-07", "22"), False),
    ("umask · el ejemplo de la ficha pegado tal cual",
     valor("op.acc.2", "P-07", "022 (permisos 755/644)"), False),

    # --- table: filas con columnas declaradas
    #
    # Lo que se prueba es que "tiene filas" haya dejado de significar
    # "configurado". La política que hasta ahora vivía en un .tsv de la máquina
    # se declara aquí, y media fila no es política: 'jgomez' sin perfil no dice
    # qué se le autoriza, y compararlo contra la máquina daría un resultado
    # inventado.
    ("table · fila completa",
     valor("op.acc.2", "P-08", ["/srv/datos | 750 | root:ops | u:auditor:r-x"]), True),
    ("table · varias filas",
     valor("op.acc.2", "P-08",
           ["/srv/datos | 750 | root:ops | u:auditor:r-x",
            "/srv/informes | 2770 | root:ops | -"]), True),
    ("table · columna opcional vacía es legítima",
     valor("op.acc.2", "P-08", ["/srv/datos | 750 |  | "]), True),
    ("table · falta una columna obligatoria",
     valor("op.acc.2", "P-08", ["/srv/datos"]), False),
    ("table · el modo no es octal",
     valor("op.acc.2", "P-08", ["/srv/datos | 8888 | root:ops | -"]), False),
    ("table · el recurso no es una ruta absoluta",
     valor("op.acc.2", "P-08", ["srv/datos | 750 | root:ops | -"]), False),
    ("table · la fila trae más campos que columnas",
     valor("op.acc.2", "P-08", ["/srv/datos | 750 | root:ops | - | sobra"]), False),
    # Una fila recién añadida en el formulario está en blanco hasta que se
    # teclea: ponerla en rojo antes de escribir la primera letra sería ruido.
    ("table · una fila en blanco junto a otra completa no se juzga",
     valor("op.acc.2", "P-08", ["/srv/datos | 750 |  | ", ""]), True),
    ("table · solo filas en blanco cuenta como ausencia, no como error",
     valor("op.acc.2", "P-08", ["", ""]), True),
    ("table · sin ninguna fila cuenta como ausencia",
     valor("op.acc.2", "P-08", []), True),
    ("table · identificador con espacios",
     valor("op.acc.2", "P-09", ["j gomez | admin | sudo:total"]), False),
    ("table · multiselect dentro del vocabulario ENS",
     valor("op.acc.2", "P-06", ["ops | /srv/datos | lectura,escritura,ejecucion"]), True),
    ("table · multiselect fuera del vocabulario ENS",
     valor("op.acc.2", "P-06", ["ops | /srv/datos | borrado"]), False),
    # La coma separa valores DENTRO de una celda: si la partición en filas
    # partiera por coma, esta fila serían dos filas rotas.
    ("table · la coma no parte filas",
     valor("op.acc.2", "P-06", ["ops | /srv/datos | lectura,escritura"]), True),
    ("table · el formato viejo de P-06 ya no se da por bueno",
     valor("op.acc.2", "P-06", ["ops -> lectura+escritura"]), False),
    ("table · fecha de baja correcta",
     valor("op.acc.1", "P-09", ["mlopez | 2026-03-31"]), True),
    ("table · fecha de baja que no existe en el calendario",
     valor("op.acc.1", "P-09", ["mlopez | 2026-02-31"]), False),
    ("table · fecha de baja en otro formato",
     valor("op.acc.1", "P-09", ["mlopez | 31/03/2026"]), False),
    # Lo que había en el fichero de autorizados eran nombres sueltos. Solo
    # Usuario es obligatorio, así que siguen valiendo y no se pierden.
    ("table · P-07 con el valor heredado de una sola columna",
     valor("op.acc.1", "P-07", ["jgomez", "mlopez"]), True),
    ("table · P-07 con la fila entera",
     valor("op.acc.1", "P-07", ["jgomez | srv01 | ops"]), True),
    ("table · P-07 con un usuario que lleva espacios",
     valor("op.acc.1", "P-07", ["j gomez | srv01 | ops"]), False),

    # --- list con la forma de su elemento declarada
    ("list con columna · SUID con ruta absoluta",
     valor("op.acc.2", "P-10", ["/usr/bin/sudo", "/usr/bin/su"]), True),
    ("list con columna · SUID sin ruta (el NO_CUMPLE falso masivo)",
     valor("op.acc.2", "P-10", ["sudo", "passwd"]), False),
    ("list con columna · ruta crítica relativa",
     valor("op.acc.2", "P-02", ["passwd"]), False),
    ("list con columna · rutas críticas heredadas separadas por comas",
     valor("op.acc.2", "P-02", "/etc/passwd,/etc/shadow"), True),
    ("list con columna · grupo privilegiado con espacios",
     valor("op.acc.2", "P-12", ["grupo con espacios"]), False),
    ("list SIN columna declarada sigue admitiendo cualquier elemento",
     valor("op.acc.1", "P-04", ["admin", "guest"]), True),

    # --- mp.info.6 P-05: duration_days que admite contrato por criticidad
    ("P-05 · entero suelto", valor("mp.info.6", "P-05", 30), True),
    ("P-05 · contrato por criticidad, el ejemplo de la ficha",
     valor("mp.info.6", "P-05", "ALTA=30; MEDIA=90"), True),
    ("P-05 · contrato con umbral no numérico", valor("mp.info.6", "P-05", "ALTA=abc"), False),
    ("P-05 · criticidad desconocida", valor("mp.info.6", "P-05", "CRITICO=30"), False),
    ("P-05 · texto libre", valor("mp.info.6", "P-05", "cuando toque"), False),
]


# op.acc.2 con todos los obligatorios de nivel BAJO rellenos y correctos.
#
# P-08 y P-10 son la política que hasta ahora vivía en ficheros de la máquina
# (opacc2-acl.tsv y opacc2-suid.allow). Entran como obligatorias porque su
# ausencia YA dejaba hoy su evidencia en NO_EVALUABLE en el agente: lo que
# cambia es que ahora se ve en la pantalla en vez de solo en el .tsv.
OPACC2_OK = {
    "P-01": ["srv01 | Linux"],
    "P-02": ["/etc/passwd", "/etc/sudoers"],
    "P-03": "no",
    "P-04": "Política de Control de Acceso v2.1",
    "P-07": "022",
    "P-08": ["/srv/datos | 750 | root:ops | u:auditor:r-x"],
    "P-10": ["/usr/bin/sudo"],
}


fallos = []


def comprueba(nombre, condicion, detalle=""):
    print("{}  {}{}".format("OK    " if condicion else "FALLA ", nombre,
                            "" if condicion else "  -> " + detalle))
    if not condicion:
        fallos.append(nombre)


def main():
    runtime = busca_runtime()
    if not runtime:
        print("No hay runtime de TypeScript (bun / deno / node >= 22.6).", file=sys.stderr)
        return 2

    print("runtime: {}\n".format(" ".join(runtime)))

    with tempfile.TemporaryDirectory() as tmp:
        arnes = prepara(tmp)

        # --- capa 1: el criterio por tipo
        resultados = ejecuta(runtime, arnes, tmp, [caso for _, caso, _ in CASOS_VALOR])

        for (nombre, _, esperado), obtenido in zip(CASOS_VALOR, resultados):
            comprueba(nombre, obtenido["valid"] == esperado,
                      "esperado valid={} y salió {} ({})".format(
                          esperado, obtenido["valid"], obtenido["reason"]))

        print()

        # --- capa 2: el motor de validación de configuración
        capa2 = ejecuta(runtime, arnes, tmp, [
            {"tipo": "control", "controlId": "op.acc.2", "nivel": "BAJO",
             "valores": dict(OPACC2_OK, **{"P-07": "abc"})},
            {"tipo": "control", "controlId": "op.acc.2", "nivel": "BAJO",
             "valores": OPACC2_OK},
            {"tipo": "control", "controlId": "op.acc.2", "nivel": "BAJO",
             "valores": dict(OPACC2_OK, **{"P-07": None, "P-01": None})},
        ])

        invalido, correcto, ausente = capa2

        comprueba("motor · un umask 'abc' NO cuenta como configurado",
                  invalido["estados"]["P-07"] == "INVALID", str(invalido["estados"]))
        comprueba("motor · un umask 'abc' bloquea igual que un obligatorio ausente",
                  invalido["invalidRequired"] == ["P-07"], str(invalido))
        comprueba("motor · el motivo dice qué se esperaba",
                  any("octal" in i for i in invalido["issues"]), str(invalido["issues"]))
        comprueba("motor · el control con valores válidos sale CONFIGURED",
                  correcto["status"] == "CONFIGURED", str(correcto))
        comprueba("motor · sin issues cuando todo es válido",
                  correcto["issues"] == [], str(correcto["issues"]))
        comprueba("motor · lo ausente sigue contándose como ausente, no como inválido",
                  sorted(ausente["missingRequired"]) == ["P-01", "P-07"]
                  and ausente["invalidRequired"] == [], str(ausente))

        print()

        # --- capa 3: el guardado desde el formulario
        formulario = ejecuta(runtime, arnes, tmp, [
            {"tipo": "formulario", "controlId": "op.acc.2",
             "valores": {"umask_minimo": "abc"}},
            {"tipo": "formulario", "controlId": "op.acc.2",
             "valores": {"umask_minimo": "027"}},
            {"tipo": "formulario", "controlId": "op.acc.2",
             "valores": {"umask_minimo": None}},
        ])

        rechazado, aceptado, vacio = formulario

        comprueba("formulario · rechaza el valor inválido",
                  len(rechazado["issues"]) == 1 and
                  rechazado["issues"][0].startswith("P-07"), str(rechazado))
        comprueba("formulario · el rechazo lleva el motivo",
                  any("octal" in i for i in rechazado["issues"]), str(rechazado))
        comprueba("formulario · deja guardar el valor válido",
                  aceptado["issues"] == [], str(aceptado))
        comprueba("formulario · no rechaza un campo que se deja vacío",
                  vacio["issues"] == [], str(vacio))

        print()

        # --- capa 4: la evaluación y el mensaje al auditor
        capa3 = ejecuta(runtime, arnes, tmp, [
            {"tipo": "evaluacion", "controlId": "op.acc.2", "nivel": "BAJO",
             "evidenciasCumple": True,
             "valores": dict(OPACC2_OK, **{"P-07": "abc"})},
            {"tipo": "evaluacion", "controlId": "op.acc.2", "nivel": "BAJO",
             "evidenciasCumple": True,
             "valores": OPACC2_OK},
            {"tipo": "evaluacion", "controlId": "op.acc.2", "nivel": "BAJO",
             "evidenciasCumple": True,
             "valores": dict(OPACC2_OK, **{"P-07": "abc", "P-01": None})},
        ])

        con_invalido, con_valido, mezcla = capa3

        comprueba("evaluación · un valor inválido abre NC-CFG",
                  con_invalido["ncCfg"] is not None, str(con_invalido))
        # Con evidencias en CUMPLE, la configuración es lo ÚNICO que separa el
        # control del verde. Es la prueba del principio rector: sin un dato que
        # signifique algo, no hay afirmación de cumplimiento.
        comprueba("evaluación · con todo en CUMPLE salvo el umask, el control NO sale en verde",
                  con_invalido["status"] == "NO_CUMPLE", str(con_invalido["status"]))
        comprueba("evaluación · con el umask corregido sí sale en verde",
                  con_valido["status"] == "CUMPLE", str(con_valido["status"]))
        # El porcentaje, en los dos lados del mismo eje.
        #
        # HISTORIA DE ESTAS TRES LÍNEAS, porque han cambiado dos veces:
        #
        #   hasta 30/07  se esperaba `score == 0` y la prueba estaba rota
        #                (`KeyError: 'score'`) desde que 346e56b cambió el
        #                contrato;
        #   31/07        346e56b publicaba NO_EVALUABLE y SIN número: un 0 se
        #                pinta en rojo y se leía como «0 % de cumplimiento»
        #                sobre algo que no se había medido;
        #   04/08        decisión del responsable: **lo que no se puede
        #                demostrar NO CUMPLE**. La carga de la prueba es del
        #                auditado, así que un parámetro sin un valor utilizable
        #                no deja el control en gris: lo deja en rojo, con su
        #                número, y ese número es 0 porque no hay ni un requisito
        #                demostrado conforme.
        #
        # El 0 vuelve, pero ya no significa lo que significaba antes del 30/07:
        # entonces era un artefacto del promedio, ahora es una afirmación
        # deliberada. Lo que dice de verdad «cuánto se ha llegado a mirar» es
        # `measuredRequirements`, que viaja aparte y aquí sale a 0.
        #
        # La afirmación es sobre el VALOR y sobre la presencia de la clave: con
        # el criterio nuevo la ausencia de `score` queda reservada a NO_APLICA,
        # y confundir «0» con «sin número» es exactamente lo que hay que evitar.
        comprueba("evaluación · con el umask válido el control mide, y mide 100",
                  con_valido.get("score") == 100, str(con_valido))
        comprueba("evaluación · sin poder demostrar el umask, el informe sale con un 0",
                  con_invalido.get("score") == 0 and "score" in con_invalido,
                  "publica score={}".format(con_invalido.get("score")))
        comprueba("evaluación · lo mismo cuando además falta un obligatorio",
                  mezcla.get("score") == 0 and "score" in mezcla,
                  "publica score={}".format(mezcla.get("score")))
        # Control negativo de las dos anteriores: si el arnés no publicara nunca
        # la clave, «score == 0» pasaría por casualidad en un `.get()`. No pasa:
        # el caso válido trae 100, así que la clave existe y lleva el número.
        comprueba("evaluación · el 0 no es una clave ausente disfrazada",
                  "score" in con_valido and con_valido["score"] != 0,
                  str(con_valido.get("score")))
        comprueba("evaluación · el parámetro inválido aparece como bloqueante",
                  "P-07" in con_invalido["missingParameters"],
                  str(con_invalido["missingParameters"]))
        comprueba("evaluación · NC-CFG dice 'invalido', no 'faltan'",
                  con_invalido["ncCfg"] and
                  "invalido" in con_invalido["ncCfg"]["finding"] and
                  "faltan" not in con_invalido["ncCfg"]["finding"],
                  str(con_invalido["ncCfg"]))
        comprueba("evaluación · NC-CFG lleva el motivo, no solo el identificador",
                  con_invalido["ncCfg"] and
                  "octal" in con_invalido["ncCfg"]["finding"],
                  str(con_invalido["ncCfg"]))
        comprueba("evaluación · NC-CFG pide corregir, no rellenar",
                  con_invalido["ncCfg"] and
                  "Corregir" in con_invalido["ncCfg"]["requiredAction"] and
                  "Rellenar" not in con_invalido["ncCfg"]["requiredAction"],
                  str(con_invalido["ncCfg"]))
        comprueba("evaluación · sin NC-CFG cuando la configuración es válida",
                  con_valido["ncCfg"] is None, str(con_valido["ncCfg"]))
        comprueba("evaluación · distingue los dos casos en el mismo mensaje",
                  mezcla["ncCfg"] and
                  "faltan P-01" in mezcla["ncCfg"]["finding"] and
                  "P-07" in mezcla["ncCfg"]["finding"] and
                  "invalido" in mezcla["ncCfg"]["finding"],
                  str(mezcla["ncCfg"]))

    print()
    if fallos:
        print("{} prueba(s) fallidas: {}".format(len(fallos), ", ".join(fallos)))
        return 1
    print("todas las pruebas pasan")
    return 0


if __name__ == "__main__":
    sys.exit(main())
