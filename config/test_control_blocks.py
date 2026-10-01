#!/usr/bin/env python3
"""Pruebas de los bloques de configuración: opciones de los `select` y ejemplos.

Dos agujeros, la misma raíz: la ficha del parámetro documentaba en `example` un
MENÚ de alternativas, y el formulario usa `example` como placeholder, o sea como
sugerencia de qué teclear.

  1. Los tres `select` del producto no declaraban `options`, así que su
     validación degeneraba en "no está vacío": `herramienta_backup =
     'cualquier cosa'` se daba por bueno y el control se declaraba evaluable.
  2. Un auditor que pegase el ejemplo tal cual escribía un valor inválido. En
     tres parámetros OBLIGATORIOS (op.acc.2 P-07 y P-03, mp.info.6 P-06) eso
     tumbaba el control a NO_EVALUABLE con score 0 desde la propia ficha.

Se prueba sobre `config/*-control-block.json`, que es lo que se siembra en el
índice `wazuh-ens-configuration` y por tanto lo que ve el motor en producción, y
se comprueba además que el TypeScript que se compila dice lo mismo.

    python3 test_control_blocks.py

Ejecuta el TypeScript de verdad (el validador y el modelo del desplegable), no
una copia del criterio en Python: una copia pasaría igual con el cambio y sin él.

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
RAIZ = os.path.abspath(os.path.join(AQUI, ".."))
DASHBOARD = os.path.join(RAIZ, "dashboard")


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
# Vive aquí y no como fichero del repo a propósito: cualquier `.ts` que se cuele
# bajo `dashboard/` acaba copiado dentro del árbol del plugin `main` y compilado
# con él. Un arnés de pruebas no tiene por qué viajar al cliente.

ARNES = r"""
import { readFileSync } from 'node:fs';
import process from 'node:process';

import {
  hasParameterOptions,
  resolveSelectFieldModel,
  toParameterListItems,
  validateParameterValue,
} from './repo/dashboard/ens/configuration/services/parameter-value-validator';
import { validateControlConfiguration } from './repo/dashboard/ens/configuration/services/validation-engine';
import { ENSConfigurationRegistry } from './repo/dashboard/ens/configuration/registry';
import { ParameterRendererFactory } from './repo/dashboard/ens/configuration/form-engine/factory';

const casos = JSON.parse(
  readFileSync(process.argv[process.argv.length - 1], 'utf8')
);

const salida = casos.map((caso) => {
  if (caso.tipo === 'valor') {
    const verdict = validateParameterValue(caso.parametro, caso.valor);
    return { valid: verdict.valid, reason: verdict.reason || '' };
  }

  if (caso.tipo === 'lista') {
    return { items: toParameterListItems(caso.valor) };
  }

  if (caso.tipo === 'select') {
    const model = resolveSelectFieldModel(caso.parametro, caso.valor);
    return {
      hasOptions: hasParameterOptions(caso.parametro),
      selected: model.selected,
      legacyValue: model.legacyValue || '',
      options: model.options.map((option) => ({
        value: option.value,
        label: option.label,
        legacy: option.legacy,
      })),
    };
  }

  // El bloque tal cual, con el valor que se le pida a cada parámetro. Es el
  // camino real: lo que se siembra en el índice es este documento.
  if (caso.tipo === 'control') {
    const control = {
      ...caso.control,
      parameters: caso.control.parameters.map((parameter) => ({
        ...parameter,
        value: Object.prototype.hasOwnProperty.call(caso.valores, parameter.id)
          ? caso.valores[parameter.id]
          : undefined,
      })),
    };

    const validation = validateControlConfiguration(control, caso.nivel);

    return {
      status: validation.status,
      configured: validation.configured,
      missingRequired: validation.missingRequired.map((p) => p.id),
      invalidRequired: validation.invalidRequired.map((p) => p.id),
      issues: validation.issues.map((i) => `${i.parameterId}: ${i.reason}`),
    };
  }

  // El formulario de verdad: el factory elige renderer y el renderer se pinta
  // contra unos stubs de React y EUI que devuelven el árbol como datos.
  if (caso.tipo === 'render') {
    const publicados = [];

    const elemento = ParameterRendererFactory({
      parameter: caso.parametro,
      value: caso.valor,
      onChange: (nombre, valor) => publicados.push([nombre, valor === undefined ? null : valor]),
    });

    const renderer = elemento.type.name;
    const fila = elemento.type(elemento.props);
    const campo = fila.props.children;

    if (caso.selecciona !== undefined && campo.props.onChange) {
      campo.props.onChange({ target: { value: caso.selecciona } });
    }

    return {
      renderer,
      campo: campo.type.euiName,
      etiqueta: fila.props.label,
      ayuda: fila.props.helpText,
      invalido: fila.props.isInvalid === true,
      error: fila.props.error || [],
      valor: campo.props.value === undefined ? null : campo.props.value,
      opciones: (campo.props.options || []).map((option) => ({
        value: option.value,
        text: option.text,
      })),
      publicados,
    };
  }

  // La rejilla de `table`. A diferencia de los otros renderers, este no es un
  // campo suelto dentro de un EuiFormRow: es un arbol (cabeceras, una fila por
  // entrada, el boton de anadir). Se aplana llamando a cada componente, y asi lo
  // que se comprueba es lo que el auditor tendria delante.
  if (caso.tipo === 'render_tabla') {
    const publicados = [];

    const elemento = ParameterRendererFactory({
      parameter: caso.parametro,
      value: caso.valor,
      onChange: (nombre, valor) =>
        publicados.push([nombre, valor === undefined ? null : valor]),
    });

    const renderer = elemento.type.name;

    const nodos = [];
    const textos = [];

    const aplanar = nodo => {
      if (nodo === null || nodo === undefined || nodo === false || nodo === true) {
        return;
      }

      if (Array.isArray(nodo)) {
        nodo.forEach(aplanar);
        return;
      }

      if (typeof nodo === 'string' || typeof nodo === 'number') {
        textos.push(String(nodo));
        return;
      }

      if (typeof nodo !== 'object') {
        return;
      }

      const tipo = nodo.type;
      const props = nodo.props || {};

      if (typeof tipo === 'function') {
        const resultado = tipo(props);

        if (resultado && resultado.euiComponent) {
          nodos.push({ eui: resultado.euiComponent, props: resultado.props || {} });
          aplanar((resultado.props || {}).children);
          return;
        }

        aplanar(resultado);
        return;
      }

      aplanar(props.children);
    };

    aplanar(elemento);

    const raiz = nodos.find(n => n.eui === 'EuiFormRow') || { props: {} };

    const CAMPOS = ['EuiFieldText', 'EuiSelect', 'EuiComboBox'];
    const campos = nodos.filter(n => CAMPOS.indexOf(n.eui) >= 0);
    const anadir = nodos.find(n => n.eui === 'EuiButtonEmpty');
    const papeleras = nodos.filter(n => n.eui === 'EuiButtonIcon');

    // Acciones del auditor, sobre el arbol recien pintado.
    if (caso.pulsaAnadir && anadir && anadir.props.onClick) {
      anadir.props.onClick();
    }

    if (caso.quitaFila !== undefined && papeleras[caso.quitaFila]) {
      papeleras[caso.quitaFila].props.onClick();
    }

    if (caso.escribe && campos[caso.escribe.campo]) {
      const campo = campos[caso.escribe.campo];

      if (campo.eui === 'EuiComboBox') {
        campo.props.onChange(
          caso.escribe.texto.split(',').map(label => ({ label }))
        );
      } else {
        campo.props.onChange({ target: { value: caso.escribe.texto } });
      }
    }

    return {
      renderer,
      invalido: raiz.props.isInvalid === true,
      error: raiz.props.error || [],
      ayuda: raiz.props.helpText || '',
      etiqueta: raiz.props.label || '',
      textos,
      campos: campos.map(campo => ({
        eui: campo.eui,
        etiqueta: campo.props['aria-label'] || '',
        valor: campo.props.value === undefined ? null : campo.props.value,
        placeholder: campo.props.placeholder || '',
        invalido: campo.props.isInvalid === true,
        opciones: (campo.props.options || []).map(
          option => option.value || option.label || option.text
        ),
        seleccionadas: (campo.props.selectedOptions || []).map(
          option => option.label
        ),
      })),
      papeleras: papeleras.length,
      tieneAnadir: !!anadir,
      publicados,
    };
  }

  if (caso.tipo === 'registro') {
    return {
      controles: ENSConfigurationRegistry.map((control) => ({
        controlId: control.controlId,
        parameters: control.parameters.map((parameter) => ({
          id: parameter.id,
          name: parameter.name,
          type: parameter.type,
          required: parameter.required,
          example: parameter.example === undefined ? null : parameter.example,
          options: parameter.options === undefined ? null : parameter.options,
          columns: parameter.columns === undefined ? null : parameter.columns,
        })),
      })),
    };
  }

  return { error: 'caso desconocido' };
});

console.log(JSON.stringify(salida));
"""


# Stubs de React y EUI. No se instala nada: los renderers son funciones que
# devuelven JSX, así que con un `createElement` que devuelve `{type, props}` el
# árbol pintado se puede leer como datos. Lo que se comprueba es qué renderer
# elige el factory y qué opciones ofrece el campo, no cómo se ve.

REACT_STUB = r"""
const crea = (type, props, ...children) => ({
  type,
  props: Object.assign({}, props || {}, children.length ? { children: children.length === 1 ? children[0] : children } : {}),
});

const React = { createElement: crea, Fragment: 'Fragment' };

module.exports = React;
module.exports.default = React;
module.exports.createElement = crea;
"""

JSX_RUNTIME_STUB = r"""
const jsx = (type, props) => ({ type, props: props || {} });

module.exports = { jsx, jsxs: jsx, jsxDEV: jsx, Fragment: 'Fragment' };
"""

EUI_STUB = r"""
const nombres = [
  'EuiFormRow', 'EuiSelect', 'EuiFieldText', 'EuiFieldNumber', 'EuiComboBox',
  // Los que compone la rejilla de `table`. El stub tiene que exportarlos aunque
  // la prueba no mire cómo se ven: `import { EuiFlexGroup } from '@elastic/eui'`
  // es un error de enlazado si el módulo no lo exporta, y el arnés no arrancaría.
  'EuiFlexGroup', 'EuiFlexItem', 'EuiButtonIcon', 'EuiButtonEmpty',
  'EuiText', 'EuiSpacer',
];

const modulo = {};

for (const nombre of nombres) {
  const componente = props => ({ euiComponent: nombre, props });
  Object.defineProperty(componente, 'name', { value: nombre });
  componente.euiName = nombre;
  modulo[nombre] = componente;
}

module.exports = modulo;
"""


def escribe(ruta, contenido):
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    with open(ruta, "w", encoding="utf-8") as f:
        f.write(contenido)


def prepara(tmp):
    """Copia el árbol y deja los stubs donde los buscan los imports."""
    shutil.copytree(DASHBOARD, os.path.join(tmp, "repo", "dashboard"))

    # `configuration/services/configuration-http-client.ts` importa
    # '../../../../../kibana-services', que desde services/ son cinco niveles:
    # configuration, ens, dashboard, repo y la carpeta temporal.
    escribe(os.path.join(tmp, "kibana-services.ts"),
            "export const getHttp = () => { throw new Error('stub'); };\n")

    modulos = os.path.join(tmp, "node_modules")

    escribe(os.path.join(modulos, "react", "package.json"), json.dumps({
        "name": "react", "version": "0.0.0-stub", "main": "index.js",
        "exports": {
            ".": "./index.js",
            "./jsx-runtime": "./jsx-runtime.js",
            "./jsx-dev-runtime": "./jsx-runtime.js",
        },
    }))
    escribe(os.path.join(modulos, "react", "index.js"), REACT_STUB)
    escribe(os.path.join(modulos, "react", "jsx-runtime.js"), JSX_RUNTIME_STUB)

    escribe(os.path.join(modulos, "@elastic", "eui", "package.json"), json.dumps({
        "name": "@elastic/eui", "version": "0.0.0-stub", "main": "index.js",
    }))
    escribe(os.path.join(modulos, "@elastic", "eui", "index.js"), EUI_STUB)

    arnes = os.path.join(tmp, "arnes.ts")
    escribe(arnes, ARNES)

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


# --- los bloques ------------------------------------------------------------

BLOQUES = [
    ("op.acc.1", "op-acc-1-control-block.json"),
    ("op.acc.2", "op-acc-2-control-block.json"),
    ("mp.info.6", "mp-info-6-control-block.json"),
]


def carga_bloques():
    bloques = {}

    for control_id, fichero in BLOQUES:
        with open(os.path.join(AQUI, fichero), encoding="utf-8") as f:
            bloque = json.load(f)

        assert bloque["controlId"] == control_id, fichero
        bloques[control_id] = bloque

    return bloques


# Opciones que declara hoy cada `select`. La tabla es explícita para que ampliar
# o recortar la lista sea una decisión, no un descuido: cerrar el conjunto de
# valores de un parámetro cambia qué configuraciones son válidas.
OPCIONES_ESPERADAS = {
    ("op.acc.1", "P-01"): [
        "Active Directory", "LDAP", "Local", "Azure AD", "Otro",
    ],
    ("op.acc.2", "P-05"): [
        "RBAC sobre AD", "ACL granular por recurso",
        "Mínimo privilegio + sudo", "Otro",
    ],
    # `zimbra-ose-declarada` se quitó el 01/10/2026: Zimbra Open Source no está
    # soportado. Las de la lista anterior siguen para no invalidar lo guardado.
    ("mp.info.6", "P-10"): [
        "pbs", "zimbra-ne",
        "Veeam", "Bacula", "Amanda", "rsync", "Windows Backup", "Otro",
    ],
}

# Listas cuyo elemento es ATÓMICO: una ruta, un nombre de cuenta, un actor. Un
# `|` en su ejemplo sería un menú de varias entradas disfrazado de valor, y el
# formulario lo guardaría como UN elemento que no casa con nada.
LISTAS_DE_ELEMENTO_ATOMICO = {
    ("op.acc.1", "P-04"),   # un nombre de cuenta prohibido
    ("op.acc.1", "P-11"),   # un grupo privilegiado
    ("op.acc.2", "P-02"),   # una ruta crítica
    ("op.acc.2", "P-10"),   # un binario SUID autorizado
    ("op.acc.2", "P-11"),   # una ruta world-writable exceptuada
    ("op.acc.2", "P-12"),   # un grupo privilegiado
    ("mp.info.6", "P-07"),  # un usuario o proceso autorizado
}

# Listas cuyo elemento SÍ tiene campos separados por `|` ('srv-bd01 | ALTA', que
# el motor parte en sistema —el alcance de mp.info.6— y criticidad —el plazo de
# P-05—).
#
# Un elemento con campos que además los tiene DECLARADOS es un `table`, y no
# hace falta apuntarlo aquí: sus columnas dicen cuántos campos lleva su ejemplo y
# la comprobación lo verifica contra ellas. Esta tabla se queda solo para las
# listas cuyo elemento tiene campos que nadie ha declarado todavía: es deuda
# reconocida, no una segunda forma de declarar lo mismo.
LISTAS_CON_CAMPOS = {
    ("op.acc.1", "P-02"),
    ("op.acc.1", "P-03"),
    ("op.acc.2", "P-01"),
    ("mp.info.6", "P-04"),
}

# Los menús que documentaban las fichas antes de separarlos. Se dejan escritos
# para que quede constancia de qué se pegaba y siga comprobándose que no vale.
MENUS_ANTIGUOS = [
    ("op.acc.2", "P-07", "022 (permisos 755/644) / 027 (permisos 750/640)"),
    ("op.acc.2", "P-03", "no (ninguno) / sí - /tmp, /var/tmp"),
    ("mp.info.6", "P-06", "/backup | C:\\Backups"),
    ("mp.info.6", "P-09", "/mnt/s3-backup | \\\\nas-dr\\backup"),
    ("mp.info.6", "P-08", "sí / no"),
    ("op.acc.1", "P-08", "sí / no"),
    ("op.acc.1", "P-01", "Active Directory / LDAP / local / Azure AD / otro"),
    ("mp.info.6", "P-10", "Veeam / Bacula / Amanda / rsync / Windows Backup / Otro"),
    ("op.acc.2", "P-05",
     "RBAC sobre AD / ACL granular por recurso / Mínimo privilegio + sudo"),
]


fallos = []


def comprueba(nombre, condicion, detalle=""):
    print("{}  {}{}".format("OK    " if condicion else "FALLA ", nombre,
                            "" if condicion else "  -> " + detalle))
    if not condicion:
        fallos.append(nombre)


def parametro_de(bloque, parametro_id):
    return next(p for p in bloque["parameters"] if p["id"] == parametro_id)


def main():
    runtime = busca_runtime()
    if not runtime:
        print("No hay runtime de TypeScript (bun / deno / node >= 22.6).", file=sys.stderr)
        return 2

    print("runtime: {}\n".format(" ".join(runtime)))

    bloques = carga_bloques()

    with tempfile.TemporaryDirectory() as tmp:
        arnes = prepara(tmp)

        # --- 1. los `select` declaran opciones ------------------------------

        print("== opciones de los select ==\n")

        selects = [
            (control_id, p)
            for control_id, bloque in bloques.items()
            for p in bloque["parameters"]
            if p["type"] == "select"
        ]

        comprueba(
            "los tres select del producto siguen siendo tres",
            sorted((c, p["id"]) for c, p in selects) ==
            sorted(OPCIONES_ESPERADAS),
            str(sorted((c, p["id"]) for c, p in selects)))

        for control_id, parametro in selects:
            clave = (control_id, parametro["id"])
            opciones = parametro.get("options") or []

            comprueba(
                "{} {} declara opciones".format(control_id, parametro["id"]),
                len(opciones) > 0,
                "sin `options`, el select admite cualquier texto")

            comprueba(
                "{} {} declara las opciones esperadas".format(control_id, parametro["id"]),
                opciones == OPCIONES_ESPERADAS.get(clave),
                "{!r} != {!r}".format(opciones, OPCIONES_ESPERADAS.get(clave)))

            comprueba(
                "{} {} no repite opciones".format(control_id, parametro["id"]),
                len({o.strip().lower() for o in opciones}) == len(opciones),
                str(opciones))

            comprueba(
                "{} {} tiene un ejemplo que es una de sus opciones".format(
                    control_id, parametro["id"]),
                parametro.get("example") in opciones,
                "{!r} no está en {!r}".format(parametro.get("example"), opciones))

        # El validador real: un valor inventado ya no pasa, y cada opción sí.
        casos = []
        etiquetas = []

        for control_id, parametro in selects:
            casos.append({"tipo": "valor", "parametro": parametro,
                          "valor": "cualquier cosa"})
            etiquetas.append(("rechaza", control_id, parametro["id"], "cualquier cosa"))

            for opcion in parametro.get("options") or []:
                casos.append({"tipo": "valor", "parametro": parametro, "valor": opcion})
                etiquetas.append(("admite", control_id, parametro["id"], opcion))

        resultados = ejecuta(runtime, arnes, tmp, casos)

        for (modo, control_id, parametro_id, valor), obtenido in zip(etiquetas, resultados):
            if modo == "rechaza":
                comprueba(
                    "{} {} rechaza un valor que no es ninguna opción".format(
                        control_id, parametro_id),
                    obtenido["valid"] is False and "opciones" in obtenido["reason"],
                    str(obtenido))
            else:
                comprueba(
                    "{} {} admite su opción {!r}".format(control_id, parametro_id, valor),
                    obtenido["valid"] is True,
                    str(obtenido))

        print()

        # --- 2. el formulario ofrece lo mismo que el validador acepta -------
        #
        # Declarar opciones sin desplegable sería peor que no declararlas: el
        # campo dejaría escribir valores que el guardado rechaza después.

        print("== el desplegable y el validador, de acuerdo ==\n")

        p10 = parametro_de(bloques["mp.info.6"], "P-10")
        p01 = parametro_de(bloques["op.acc.1"], "P-01")
        sin_opciones = dict(p10)
        sin_opciones.pop("options", None)

        formulario = ejecuta(runtime, arnes, tmp, [
            {"tipo": "select", "parametro": p10, "valor": None},
            {"tipo": "select", "parametro": p10,
             "valor": "Veeam Backup & Replication 12"},
            {"tipo": "select", "parametro": p01, "valor": "  local "},
            {"tipo": "select", "parametro": sin_opciones, "valor": "lo que sea"},
        ])

        vacio, heredado, con_mayusculas, sin_declarar = formulario

        comprueba("el select con opciones se edita como desplegable",
                  vacio["hasOptions"] is True, str(vacio))
        comprueba("un bloque sembrado sin `options` se sigue editando como texto",
                  sin_declarar["hasOptions"] is False, str(sin_declarar))
        comprueba("sin valor no hay selección ni opción heredada",
                  vacio["selected"] == "" and vacio["legacyValue"] == "" and
                  not any(o["legacy"] for o in vacio["options"]), str(vacio))

        # El valor heredado que no casa: ni se borra ni se sustituye por el más
        # parecido. Se enseña, marcado, y sale seleccionado.
        comprueba("el valor heredado que no casa sigue seleccionado y visible",
                  heredado["selected"] == "Veeam Backup & Replication 12" and
                  heredado["legacyValue"] == "Veeam Backup & Replication 12",
                  str(heredado))
        comprueba("el valor heredado se ofrece marcado como fuera de lista",
                  any(o["legacy"] and
                      o["value"] == "Veeam Backup & Replication 12" and
                      "fuera de la lista" in o["label"]
                      for o in heredado["options"]), str(heredado["options"]))
        comprueba("y no se pierde ninguna de las opciones declaradas",
                  [o["value"] for o in heredado["options"] if not o["legacy"]] ==
                  OPCIONES_ESPERADAS[("mp.info.6", "P-10")], str(heredado["options"]))

        comprueba("un heredado que solo difiere en mayúsculas se resuelve a su opción",
                  con_mayusculas["selected"] == "Local" and
                  con_mayusculas["legacyValue"] == "" and
                  not any(o["legacy"] for o in con_mayusculas["options"]),
                  str(con_mayusculas))

        # Ninguna opción que el desplegable ofrece puede ser rechazada por el
        # motor: es la regla que hace que declarar opciones no empeore nada.
        ofrecidas = ejecuta(runtime, arnes, tmp, [
            {"tipo": "valor", "parametro": p10, "valor": o["value"]}
            for o in heredado["options"] if not o["legacy"]
        ])

        comprueba("toda opción ofrecida por el desplegable la acepta el validador",
                  all(r["valid"] for r in ofrecidas), str(ofrecidas))

        print()

        # --- 2b. el formulario pinta el desplegable -------------------------
        #
        # Sin esto, declarar opciones sería un empeoramiento: el campo dejaría
        # escribir texto libre y el guardado lo rechazaría después.

        print("== el formulario ==\n")

        pintado = ejecuta(runtime, arnes, tmp, [
            {"tipo": "render", "parametro": p10, "valor": None},
            {"tipo": "render", "parametro": p10,
             "valor": "Veeam Backup & Replication 12"},
            {"tipo": "render", "parametro": sin_opciones, "valor": "lo que sea"},
            {"tipo": "render", "parametro": p10, "valor": None,
             "selecciona": "zimbra-ne"},
            {"tipo": "render", "parametro": p10, "valor": "zimbra-ne",
             "selecciona": ""},
            {"tipo": "render", "parametro": parametro_de(bloques["op.acc.1"], "P-04"),
             "valor": None},
            {"tipo": "render", "parametro": parametro_de(bloques["mp.info.6"], "P-01"),
             "valor": None},
        ])

        (vacio, con_heredado, texto_libre, elige,
         borra, lista, numero) = pintado

        comprueba("un select con opciones se pinta como desplegable",
                  vacio["renderer"] == "SelectParameterRenderer" and
                  vacio["campo"] == "EuiSelect", str(vacio))
        comprueba("el desplegable ofrece las opciones declaradas y la vacía",
                  [o["value"] for o in vacio["opciones"]] ==
                  [""] + OPCIONES_ESPERADAS[("mp.info.6", "P-10")],
                  str(vacio["opciones"]))
        comprueba("un select sin opciones se sigue pintando como texto libre",
                  texto_libre["renderer"] == "TextParameterRenderer" and
                  texto_libre["campo"] == "EuiFieldText", str(texto_libre))

        # El valor heredado: ni se borra al abrir el formulario ni se sustituye.
        comprueba("el valor heredado se ofrece en el desplegable, no se borra",
                  con_heredado["valor"] == "Veeam Backup & Replication 12" and
                  any(o["value"] == "Veeam Backup & Replication 12" and
                      "fuera de la lista" in o["text"]
                      for o in con_heredado["opciones"]),
                  str(con_heredado["opciones"]))
        comprueba("el campo con valor heredado sale en rojo con el motivo",
                  con_heredado["invalido"] and
                  any("opciones declaradas" in e for e in con_heredado["error"]),
                  str(con_heredado["error"]))
        comprueba("y la ayuda dice que se conserva hasta que se elija",
                  "no se borra solo" in con_heredado["ayuda"],
                  con_heredado["ayuda"])
        comprueba("abrir el formulario no publica ningún cambio",
                  con_heredado["publicados"] == [], str(con_heredado["publicados"]))

        comprueba("elegir una opción la publica por nombre de parámetro",
                  elige["publicados"] == [["herramienta_backup", "zimbra-ne"]],
                  str(elige["publicados"]))
        comprueba("volver a 'sin seleccionar' deja el parámetro sin valor",
                  borra["publicados"] == [["herramienta_backup", None]],
                  str(borra["publicados"]))

        # El desplegable se cuela antes que la lista y el número en el factory:
        # que los demás parámetros sigan donde estaban no es gratis.
        comprueba("una lista sigue usando el renderer de listas",
                  lista["renderer"] == "ListParameterRenderer" and
                  lista["campo"] == "EuiComboBox", str(lista))
        comprueba("un número sigue usando el renderer numérico",
                  numero["renderer"] == "NumberParameterRenderer" and
                  numero["campo"] == "EuiFieldNumber", str(numero))

        print()

        # --- 3. los `example` son valores pegables --------------------------

        print("== los ejemplos de las fichas ==\n")

        casos = []
        etiquetas = []

        for control_id, bloque in bloques.items():
            for parametro in bloque["parameters"]:
                ejemplo = parametro.get("example")

                comprueba(
                    "{} {} tiene ejemplo".format(control_id, parametro["id"]),
                    isinstance(ejemplo, str) and ejemplo.strip() != "",
                    repr(ejemplo))

                if not ejemplo:
                    continue

                # Un ejemplo con ' / ' o con ' | ' fuera de sitio es un menú, no
                # un valor: el placeholder invita a pegarlo y sale un dato que no
                # significa nada.
                clave = (control_id, parametro["id"])
                columnas = parametro.get("columns") or []
                es_tabla = parametro["type"] == "table"
                admite_barra = clave in LISTAS_CON_CAMPOS or es_tabla

                comprueba(
                    "{} {} no documenta un menú en el ejemplo".format(
                        control_id, parametro["id"]),
                    " / " not in ejemplo and (admite_barra or " | " not in ejemplo),
                    repr(ejemplo))

                # En una tabla el `|` del ejemplo no es un menú: separa columnas
                # DECLARADAS. Que separe exactamente tantas como columnas hay es
                # lo que distingue un ejemplo de un menú, y además es el
                # placeholder de cada celda del formulario: si sobran o faltan
                # campos, las sugerencias se pintan corridas de columna.
                if es_tabla:
                    campos = [c.strip() for c in ejemplo.split("|")]
                    comprueba(
                        "{} {} · el ejemplo trae una celda por columna".format(
                            control_id, parametro["id"]),
                        len(campos) == len(columnas) and all(campos),
                        "{} campos para {} columnas: {!r}".format(
                            len(campos), len(columnas), ejemplo))

                # Una tabla sin columnas no se puede validar por columna ni
                # pintar como rejilla: se degrada a lista en los dos sitios, que
                # es la tolerancia con los bloques viejos del índice, no algo que
                # deba salir del repo.
                comprueba(
                    "{} {} · si es tabla, declara columnas".format(
                        control_id, parametro["id"]),
                    not es_tabla or len(columnas) > 0,
                    "type=table sin columns")

                # Una columna `select` o `multiselect` sin opciones admite
                # cualquier cosa: declarar el tipo y no la lista es exactamente
                # la validación de mentira que se quitó de los `select`.
                for columna in columnas:
                    if columna["type"] in ("select", "multiselect"):
                        comprueba(
                            "{} {} · la columna «{}» declara opciones".format(
                                control_id, parametro["id"], columna["label"]),
                            len(columna.get("options") or []) > 0,
                            repr(columna))

                casos.append({"tipo": "valor", "parametro": parametro, "valor": ejemplo})
                etiquetas.append((control_id, parametro["id"], ejemplo))

                if parametro["type"] == "list":
                    casos.append({"tipo": "lista", "valor": ejemplo})
                    etiquetas.append((control_id, parametro["id"], "LISTA"))

        resultados = ejecuta(runtime, arnes, tmp, casos)

        for (control_id, parametro_id, ejemplo), obtenido in zip(etiquetas, resultados):
            if ejemplo == "LISTA":
                comprueba(
                    "{} {} · el ejemplo es UNA entrada de la lista".format(
                        control_id, parametro_id),
                    len(obtenido["items"]) == 1, str(obtenido["items"]))
            else:
                comprueba(
                    "{} {} · el ejemplo es un valor válido".format(control_id, parametro_id),
                    obtenido["valid"] is True,
                    "{!r}: {}".format(ejemplo, obtenido["reason"]))

        # Cada lista está clasificada: una lista nueva obliga a decidir si su
        # elemento lleva campos o no, en vez de colar un menú por descuido.
        listas = {
            (control_id, p["id"])
            for control_id, bloque in bloques.items()
            for p in bloque["parameters"]
            if p["type"] == "list"
        }

        comprueba("toda lista está clasificada por la forma de su elemento",
                  listas == LISTAS_DE_ELEMENTO_ATOMICO | LISTAS_CON_CAMPOS,
                  str(sorted(listas ^ (LISTAS_DE_ELEMENTO_ATOMICO | LISTAS_CON_CAMPOS))))

        print()

        # --- 4. el auditor que pega los ejemplos ----------------------------
        #
        # La prueba del enunciado: pegar lo que la ficha sugiere no puede tumbar
        # el control. Los tres controles, en todos sus niveles.

        print("== pegar todos los ejemplos deja el control configurado ==\n")

        casos = []
        etiquetas = []

        for control_id, bloque in bloques.items():
            valores = {
                p["id"]: p.get("example")
                for p in bloque["parameters"]
            }

            for nivel in bloque["applicableLevels"]:
                casos.append({"tipo": "control", "control": bloque,
                              "valores": valores, "nivel": nivel})
                etiquetas.append((control_id, nivel))

        resultados = ejecuta(runtime, arnes, tmp, casos)

        for (control_id, nivel), obtenido in zip(etiquetas, resultados):
            comprueba(
                "{} en nivel {} · pegar los ejemplos deja el control CONFIGURED".format(
                    control_id, nivel),
                obtenido["status"] == "CONFIGURED" and obtenido["issues"] == [],
                str(obtenido))

        # Y los menús que había antes siguen siendo lo que eran: valores que no
        # significan nada.
        resultados = ejecuta(runtime, arnes, tmp, [
            {"tipo": "valor",
             "parametro": parametro_de(bloques[control_id], parametro_id),
             "valor": menu}
            for control_id, parametro_id, menu in MENUS_ANTIGUOS
        ])

        for (control_id, parametro_id, menu), obtenido in zip(MENUS_ANTIGUOS, resultados):
            comprueba(
                "{} {} · el menú que documentaba la ficha es inválido".format(
                    control_id, parametro_id),
                obtenido["valid"] is False,
                "{!r} se aceptó".format(menu))

        print()

        # --- 4bis. la rejilla de las tablas ---------------------------------
        #
        # Lo que se prueba aquí es el FORMULARIO, no el criterio: que la política
        # que hasta ahora había que escribir por SSH en un .tsv se pueda declarar
        # entera desde la pantalla —añadir filas, escribir celdas, quitarlas— y
        # que una tabla sin configurar se vea VACÍA Y PENDIENTE, no con una fila
        # de ejemplo que alguien pueda tomar por configurada.

        print("== la rejilla de las tablas ==\n")

        acl = parametro_de(bloques["op.acc.2"], "P-08")
        accesos = parametro_de(bloques["op.acc.2"], "P-06")
        autorizados = parametro_de(bloques["op.acc.1"], "P-07")

        FILA_ACL = "/srv/datos | 750 | root:ops | u:auditor:r-x"

        rejilla = ejecuta(runtime, arnes, tmp, [
            {"tipo": "render_tabla", "parametro": acl, "valor": None},
            {"tipo": "render_tabla", "parametro": acl, "valor": None,
             "pulsaAnadir": True},
            {"tipo": "render_tabla", "parametro": acl, "valor": [""]},
            {"tipo": "render_tabla", "parametro": acl, "valor": [""],
             "escribe": {"campo": 0, "texto": "/srv/datos"}},
            {"tipo": "render_tabla", "parametro": acl, "valor": [FILA_ACL]},
            {"tipo": "render_tabla", "parametro": acl, "valor": [FILA_ACL],
             "quitaFila": 0},
            {"tipo": "render_tabla", "parametro": acl, "valor": ["/srv/datos"]},
            {"tipo": "render_tabla", "parametro": accesos,
             "valor": ["ops | /srv/datos | lectura,escritura"]},
            {"tipo": "render_tabla", "parametro": autorizados,
             "valor": ["jgomez"]},
        ])

        (sin_valor, tras_anadir, fila_blanco, tras_escribir, fila_llena,
         tras_quitar, fila_corta, con_multiselect, heredada) = rejilla

        comprueba("factory · una tabla con columnas se pinta como rejilla",
                  sin_valor["renderer"] == "TableParameterRenderer",
                  sin_valor["renderer"])

        # El incidente de los `example`: un valor sugerido que se lee como una
        # decisión tomada. Una tabla sin configurar NO siembra una fila.
        comprueba("tabla sin configurar · CERO filas, ninguna celda que rellenar",
                  sin_valor["campos"] == [] and sin_valor["papeleras"] == 0,
                  str(sin_valor["campos"]))
        comprueba("tabla sin configurar · dice que está pendiente, no en blanco",
                  any("Sin filas" in t for t in sin_valor["textos"]),
                  str(sin_valor["textos"]))
        comprueba("tabla sin configurar · no se pinta en rojo (ausencia no es error)",
                  sin_valor["invalido"] is False and sin_valor["error"] == [],
                  str(sin_valor["error"]))
        comprueba("tabla sin configurar · se puede añadir la primera fila",
                  sin_valor["tieneAnadir"] is True, str(sin_valor))

        # Añadir una fila publica una fila EN BLANCO, que `isEmptyParameterValue`
        # sigue viendo como ausencia: el parámetro no pasa a INVÁLIDO por haber
        # pulsado un botón.
        comprueba("añadir fila · publica una fila en blanco",
                  tras_anadir["publicados"] == [["acl_declarada", [""]]],
                  str(tras_anadir["publicados"]))
        comprueba("fila en blanco · una celda por columna declarada",
                  len(fila_blanco["campos"]) == len(acl["columns"]),
                  str([c["etiqueta"] for c in fila_blanco["campos"]]))
        comprueba("fila en blanco · el parámetro NO sale inválido",
                  fila_blanco["invalido"] is False, str(fila_blanco["error"]))
        comprueba("fila en blanco · las celdas obligatorias se marcan, las opcionales no",
                  [c["invalido"] for c in fila_blanco["campos"]]
                  == [c["required"] for c in acl["columns"]],
                  str([c["invalido"] for c in fila_blanco["campos"]]))

        # El placeholder de cada celda sale del `example` del parámetro, celda a
        # celda. Es la única forma de que la sugerencia caiga en su columna.
        comprueba("fila en blanco · el ejemplo sugiere columna a columna",
                  [c["placeholder"] for c in fila_blanco["campos"]]
                  == [c.strip() for c in acl["example"].split("|")],
                  str([c["placeholder"] for c in fila_blanco["campos"]]))

        # La fila se publica con TODAS sus celdas, aunque estén vacías: las
        # posiciones son las columnas, y recortar las de la derecha movería de
        # columna lo que se escriba después.
        comprueba("escribir en una celda · publica la fila con esa celda puesta",
                  tras_escribir["publicados"]
                  == [["acl_declarada",
                       [" | ".join(["/srv/datos", "", "", ""])]]],
                  str(tras_escribir["publicados"]))

        comprueba("fila completa · cada celda enseña su campo",
                  [c["valor"] for c in fila_llena["campos"]]
                  == [c.strip() for c in FILA_ACL.split("|")],
                  str([c["valor"] for c in fila_llena["campos"]]))
        comprueba("fila completa · ninguna celda en rojo",
                  not any(c["invalido"] for c in fila_llena["campos"]),
                  str(fila_llena["campos"]))
        comprueba("fila completa · el parámetro sale válido",
                  fila_llena["invalido"] is False, str(fila_llena["error"]))

        # Quitar la última fila deja el parámetro SIN CONFIGURAR, no con una
        # tabla de cero filas guardada: son cosas distintas para la fusión de
        # `inject-control.py`, que conserva lo que tiene valor.
        comprueba("quitar la última fila · deja el parámetro sin configurar",
                  tras_quitar["publicados"] == [["acl_declarada", None]],
                  str(tras_quitar["publicados"]))

        comprueba("fila incompleta · la celda que falta sale en rojo",
                  fila_corta["campos"][1]["invalido"] is True
                  and fila_corta["campos"][0]["invalido"] is False,
                  str([c["invalido"] for c in fila_corta["campos"]]))
        comprueba("fila incompleta · el motivo nombra la fila y la columna",
                  any("fila 1" in e and "Modo" in e for e in fila_corta["error"]),
                  str(fila_corta["error"]))

        # Una columna de vocabulario cerrado ofrece SOLO ese vocabulario. Es lo
        # mismo que se arregló en los `select`: declarar las opciones y no
        # ofrecerlas sería peor que no declararlas.
        combo = [c for c in con_multiselect["campos"] if c["eui"] == "EuiComboBox"]
        comprueba("multiselect · la celda ofrece solo el vocabulario declarado",
                  len(combo) == 1
                  and combo[0]["opciones"] == accesos["columns"][2]["options"],
                  str(combo))
        comprueba("multiselect · enseña los valores que ya tenía la celda",
                  len(combo) == 1
                  and combo[0]["seleccionadas"] == ["lectura", "escritura"],
                  str(combo))

        # El valor heredado del fichero de autorizados era un nombre suelto. Se
        # ve en su columna y no se pierde.
        comprueba("valor heredado · el nombre suelto se ve en su columna",
                  [c["valor"] for c in heredada["campos"]] == ["jgomez", "", ""],
                  str([c["valor"] for c in heredada["campos"]]))
        comprueba("valor heredado · sigue siendo válido (solo Usuario es obligatorio)",
                  heredada["invalido"] is False, str(heredada["error"]))

        print()

        # --- 5. el bloque y el TypeScript dicen lo mismo --------------------
        #
        # El bloque se siembra en el índice; el TS es lo que se compila y lo que
        # rellena la configuración por defecto. Si divergen, la pantalla enseña
        # una ficha y el motor juzga con otra.

        print("== bloque sembrado y TypeScript compilado ==\n")

        registro = ejecuta(runtime, arnes, tmp, [{"tipo": "registro"}])[0]
        por_control = {c["controlId"]: c["parameters"] for c in registro["controles"]}

        for control_id, bloque in bloques.items():
            del_ts = por_control.get(control_id)

            comprueba("{} está en el registro TypeScript".format(control_id),
                      del_ts is not None, str(sorted(por_control)))

            if del_ts is None:
                continue

            del_bloque = [
                {
                    "id": p["id"],
                    "name": p["name"],
                    "type": p["type"],
                    "required": p["required"],
                    "example": p.get("example"),
                    "options": p.get("options"),
                    # `columns` entra en la comparación por lo mismo que
                    # `options`: declara qué valores son válidos. Si el bloque y
                    # el TypeScript divergieran en una columna, la pantalla
                    # pediría una cosa y el motor juzgaría otra.
                    "columns": p.get("columns"),
                }
                for p in bloque["parameters"]
            ]

            comprueba(
                "{} · el bloque y el TypeScript declaran los mismos parámetros".format(
                    control_id),
                del_bloque == del_ts,
                "\n    bloque: {}\n    ts:     {}".format(
                    [p for p in del_bloque if p not in del_ts],
                    [p for p in del_ts if p not in del_bloque]))

    print()
    if fallos:
        print("{} prueba(s) fallidas: {}".format(len(fallos), ", ".join(fallos)))
        return 1
    print("todas las pruebas pasan")
    return 0


if __name__ == "__main__":
    sys.exit(main())
