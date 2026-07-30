#!/usr/bin/env python3
"""
Recolector técnico ENSFácil para op.acc.1.

Evidencias implementadas:
    EV-01 - Inventario de cuentas y unicidad de identificadores.
    EV-02 - Vigilancia de cambios en identidades mediante baseline.
    EV-03 - Observación incremental de autenticaciones.
    EV-04 - Observación de bajas y bloqueo de cuentas.
    EV-05 - Observación de cuentas de servicio y accesos interactivos.
    EV-06 - Observación de membresías privilegiadas e identificadores administrativos.
    EV-07 - Comparación trazable con el registro P-07 de identidades autorizadas.
    EV-08 - Observación de eliminaciones confirmadas y período de retención P-06.

Este componente solamente observa hechos técnicos. No calcula:
    - estado ENS;
    - nivel ENS;
    - score;
    - compliance;
    - control_state;
    - score_snapshot.

La evaluación corresponde al motor común de ENSFácil.

Reglas del manager que emparejan estos hechos:
    agent/rules/ensfacil_op_acc_1_technical_fact_rules.xml

HOY NO SE DESPLIEGA. Lo que instala `install-manager.sh` del runbook es el otro
juego de reglas de op.acc.1 (`ensfacil_op_acc_1_json_rules.xml`), que empareja
los eventos del recolector bash. Este recolector y sus reglas son el punto de
partida del modelo nuevo, del que ya ha migrado op.acc.1/EV-03.
"""

from __future__ import annotations

import argparse
import grp
import hashlib
import json
import os
import pwd
import re
import socket
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

try:
    import spwd
except ImportError:
    spwd = None


SCHEMA_VERSION = "2.0"
COLLECTOR_NAME = "ensfacil-opacc1-linux"
COLLECTOR_VERSION = "2.0.0-dev.1"
CONTROL_ID = "op.acc.1"

SAFE_TEST_CONFIG: dict[str, Any] = {
    "fuente_identidad": "local_linux",
    "uid_min_persona": 1000,
    "cuentas_servicio": [],
    "cuentas_genericas": [],
    "auth_log_paths": [],
    "bajas": {},
    "plazo_max_desactivacion_dias": 1,
    "grupos_privilegiados": [],
    "sufijo_cuenta_admin": ".adm",
    "p07_lista_autorizados": None,
    "periodo_retencion_cuentas_dias": None,
    "p06_eliminaciones_confirmadas": None,
}


class CollectorError(RuntimeError):
    """Error controlado del recolector."""


def now_iso() -> str:
    return (
        datetime.now(timezone.utc)
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z")
    )


def load_config(path: Path, mode: str) -> dict[str, Any]:
    if not path.exists():
        if mode == "production":
            raise CollectorError(
                f"No existe la configuración obligatoria de producción: {path}"
            )

        print(
            "[warning] Configuración no encontrada. "
            "La prueba utilizará valores mínimos seguros.",
            file=sys.stderr,
        )
        return dict(SAFE_TEST_CONFIG)

    try:
        content = path.read_text(encoding="utf-8")
        data = json.loads(content)
    except OSError as exc:
        raise CollectorError(
            f"No se pudo leer la configuración {path}: {exc}"
        ) from exc
    except json.JSONDecodeError as exc:
        raise CollectorError(
            f"La configuración {path} no contiene JSON válido: {exc}"
        ) from exc

    if not isinstance(data, dict):
        raise CollectorError(
            "La configuración debe ser un objeto JSON."
        )

    source = data.get("fuente_identidad", "local_linux")
    uid_min = data.get("uid_min_persona", 1000)
    service_accounts = data.get("cuentas_servicio", [])
    generic_accounts = data.get("cuentas_genericas", [])
    auth_log_paths = data.get("auth_log_paths", [])
    offboarding_records = data.get("bajas", {})
    maximum_disable_days = data.get(
        "plazo_max_desactivacion_dias",
        1,
    )
    privileged_groups = data.get(
        "grupos_privilegiados",
        [],
    )
    admin_account_suffix = data.get(
        "sufijo_cuenta_admin",
        ".adm",
    )
    authorized_registry = data.get(
        "p07_lista_autorizados"
    )

    retention_period_days = data.get(
        "periodo_retencion_cuentas_dias"
    )

    if (
        retention_period_days is None
        and "retencion_min_dias" in data
    ):
        retention_period_days = data.get(
            "retencion_min_dias"
        )

    confirmed_deletion_registry = data.get(
        "p06_eliminaciones_confirmadas"
    )

    if not isinstance(source, str) or not source.strip():
        raise CollectorError(
            "fuente_identidad debe ser una cadena no vacía."
        )

    if (
        isinstance(uid_min, bool)
        or not isinstance(uid_min, int)
        or uid_min < 0
    ):
        raise CollectorError(
            "uid_min_persona debe ser un entero igual o superior a cero."
        )

    if isinstance(service_accounts, dict):
        service_accounts = list(service_accounts.keys())

    if not isinstance(service_accounts, list) or not all(
        isinstance(value, str) and value.strip()
        for value in service_accounts
    ):
        raise CollectorError(
            "cuentas_servicio debe ser una lista o un objeto de cuentas."
        )

    if not isinstance(generic_accounts, list) or not all(
        isinstance(value, str) and value.strip()
        for value in generic_accounts
    ):
        raise CollectorError(
            "cuentas_genericas debe ser una lista de nombres."
        )

    if not isinstance(auth_log_paths, list) or not all(
        isinstance(value, str) and value.strip()
        for value in auth_log_paths
    ):
        raise CollectorError(
            "auth_log_paths debe ser una lista de rutas."
        )

    if not isinstance(offboarding_records, dict):
        raise CollectorError(
            "bajas debe ser un objeto de registros."
        )

    normalized_offboarding: dict[str, dict[str, Any]] = {}

    for username, record in offboarding_records.items():
        if (
            not isinstance(username, str)
            or not username.strip()
            or not isinstance(record, dict)
        ):
            raise CollectorError(
                "bajas contiene un registro inválido."
            )

        normalized_offboarding[
            username.strip()
        ] = dict(record)

    if (
        isinstance(maximum_disable_days, bool)
        or not isinstance(maximum_disable_days, int)
        or maximum_disable_days < 0
    ):
        raise CollectorError(
            "plazo_max_desactivacion_dias debe ser "
            "un entero igual o superior a cero."
        )

    if not isinstance(privileged_groups, list) or not all(
        isinstance(value, str) and value.strip()
        for value in privileged_groups
    ):
        raise CollectorError(
            "grupos_privilegiados debe ser una lista de nombres."
        )

    normalized_privileged_groups = sorted({
        value.strip()
        for value in privileged_groups
    })

    if (
        not isinstance(admin_account_suffix, str)
        or not admin_account_suffix.strip()
    ):
        raise CollectorError(
            "sufijo_cuenta_admin debe ser una cadena no vacía."
        )

    if any(
        character.isspace()
        for character in admin_account_suffix
    ):
        raise CollectorError(
            "sufijo_cuenta_admin no puede contener espacios."
        )

    normalized_authorized_registry = None

    if authorized_registry is not None:
        if not isinstance(authorized_registry, dict):
            raise CollectorError(
                "p07_lista_autorizados debe ser "
                "un objeto versionado o null."
            )

        authorized_users = authorized_registry.get(
            "usuarios"
        )
        registry_reference = authorized_registry.get(
            "referencia"
        )
        registry_version = authorized_registry.get(
            "version"
        )
        registry_account_types = authorized_registry.get(
            "tipos_cuenta"
        )

        if (
            not isinstance(authorized_users, list)
            or not all(
                isinstance(value, str)
                and value.strip()
                for value in authorized_users
            )
        ):
            raise CollectorError(
                "p07_lista_autorizados.usuarios debe "
                "ser una lista de nombres."
            )

        if (
            not isinstance(registry_reference, str)
            or not registry_reference.strip()
        ):
            raise CollectorError(
                "p07_lista_autorizados.referencia debe "
                "ser una cadena no vacía."
            )

        if (
            not isinstance(registry_version, str)
            or not registry_version.strip()
        ):
            raise CollectorError(
                "p07_lista_autorizados.version debe "
                "ser una cadena no vacía."
            )

        allowed_account_types = {
            "person",
            "service",
            "system",
        }

        if (
            not isinstance(registry_account_types, list)
            or not registry_account_types
            or not all(
                isinstance(value, str)
                and value in allowed_account_types
                for value in registry_account_types
            )
        ):
            raise CollectorError(
                "p07_lista_autorizados.tipos_cuenta debe "
                "contener person, service o system."
            )

        normalized_authorized_registry = {
            "usuarios": sorted({
                value.strip()
                for value in authorized_users
            }),
            "referencia": registry_reference.strip(),
            "version": registry_version.strip(),
            "tipos_cuenta": sorted({
                value
                for value in registry_account_types
            }),
        }

    if (
        retention_period_days is not None
        and (
            isinstance(retention_period_days, bool)
            or not isinstance(
                retention_period_days,
                int,
            )
            or retention_period_days < 0
        )
    ):
        raise CollectorError(
            "periodo_retencion_cuentas_dias debe "
            "ser un entero igual o superior a cero, "
            "o null."
        )

    normalized_deletion_registry = None

    if confirmed_deletion_registry is not None:
        if not isinstance(
            confirmed_deletion_registry,
            dict,
        ):
            raise CollectorError(
                "p06_eliminaciones_confirmadas debe "
                "ser un objeto versionado o null."
            )

        deletion_reference = (
            confirmed_deletion_registry.get(
                "referencia"
            )
        )

        deletion_version = (
            confirmed_deletion_registry.get(
                "version"
            )
        )

        deletion_records = (
            confirmed_deletion_registry.get(
                "registros"
            )
        )

        if (
            not isinstance(deletion_reference, str)
            or not deletion_reference.strip()
        ):
            raise CollectorError(
                "p06_eliminaciones_confirmadas."
                "referencia debe ser una cadena "
                "no vacía."
            )

        if (
            not isinstance(deletion_version, str)
            or not deletion_version.strip()
        ):
            raise CollectorError(
                "p06_eliminaciones_confirmadas."
                "version debe ser una cadena "
                "no vacía."
            )

        if (
            not isinstance(deletion_records, list)
            or not all(
                isinstance(record, dict)
                for record in deletion_records
            )
        ):
            raise CollectorError(
                "p06_eliminaciones_confirmadas."
                "registros debe ser una lista "
                "de objetos."
            )

        normalized_deletion_registry = {
            "referencia": (
                deletion_reference.strip()
            ),
            "version": (
                deletion_version.strip()
            ),
            "registros": [
                dict(record)
                for record in deletion_records
            ],
        }

    return {
        "fuente_identidad": source.strip(),
        "uid_min_persona": uid_min,
        "cuentas_servicio": sorted(set(service_accounts)),
        "cuentas_genericas": sorted({
            value.strip().lower()
            for value in generic_accounts
        }),
        "auth_log_paths": [
            value.strip()
            for value in auth_log_paths
        ],
        "bajas": normalized_offboarding,
        "plazo_max_desactivacion_dias": (
            maximum_disable_days
        ),
        "grupos_privilegiados": (
            normalized_privileged_groups
        ),
        "sufijo_cuenta_admin": (
            admin_account_suffix.strip()
        ),
        "p07_lista_autorizados": (
            normalized_authorized_registry
        ),
        "periodo_retencion_cuentas_dias": (
            retention_period_days
        ),
        "p06_eliminaciones_confirmadas": (
            normalized_deletion_registry
        ),
    }


def get_lock_state(username: str) -> str:
    """
    Determina únicamente si una cuenta está bloqueada.

    No devuelve ni almacena el hash de contraseña.
    Si no hay permisos para consultar shadow, devuelve unknown.
    """
    if spwd is None:
        return "unknown"

    try:
        shadow_entry = spwd.getspnam(username)
    except (KeyError, PermissionError):
        return "unknown"
    except OSError:
        return "unknown"

    password_marker = shadow_entry.sp_pwdp or ""

    if password_marker.startswith(("!", "*")):
        return "locked"

    if not password_marker:
        return "no_password"

    return "unlocked"


def classify_account(
    username: str,
    uid: int,
    service_accounts: set[str],
    uid_min_person: int,
) -> str:
    if username in service_accounts:
        return "service"

    if uid >= uid_min_person and uid != 65534:
        return "person"

    return "system"


def inventory_fingerprint(records: list[dict[str, Any]]) -> str:
    canonical = json.dumps(
        records,
        ensure_ascii=True,
        sort_keys=True,
        separators=(",", ":"),
    )

    return hashlib.sha256(
        canonical.encode("utf-8")
    ).hexdigest()


def get_account_groups(
    username: str,
    primary_gid: int,
) -> list[str]:
    groups: set[str] = set()

    try:
        groups.add(
            grp.getgrgid(primary_gid).gr_name
        )
    except KeyError:
        pass

    for group in grp.getgrall():
        if username in group.gr_mem:
            groups.add(group.gr_name)

    return sorted(groups)


def get_password_last_change_day(
    username: str,
) -> int | None:
    """
    Obtiene únicamente el metadato sp_lstchg.

    No devuelve ni persiste el hash almacenado
    en /etc/shadow.
    """
    if spwd is None:
        return None

    try:
        shadow_entry = spwd.getspnam(username)
    except (KeyError, PermissionError, OSError):
        return None

    value = shadow_entry.sp_lstchg

    if not isinstance(value, int) or value < 0:
        return None

    return value


def build_identity_snapshot(
    config: dict[str, Any],
) -> dict[str, dict[str, Any]]:
    uid_min_person = int(
        config["uid_min_persona"]
    )
    service_accounts = set(
        config["cuentas_servicio"]
    )

    snapshot: dict[str, dict[str, Any]] = {}

    for account in sorted(
        pwd.getpwall(),
        key=lambda item: item.pw_name,
    ):
        snapshot[account.pw_name] = {
            "uid": account.pw_uid,
            "gid": account.pw_gid,
            "home": account.pw_dir,
            "shell": account.pw_shell,
            "groups": get_account_groups(
                account.pw_name,
                account.pw_gid,
            ),
            "account_type": classify_account(
                account.pw_name,
                account.pw_uid,
                service_accounts,
                uid_min_person,
            ),
            "lock_state": get_lock_state(
                account.pw_name
            ),
            "password_last_change_day": (
                get_password_last_change_day(
                    account.pw_name
                )
            ),
        }

    return snapshot


def baseline_fingerprint(
    accounts: dict[str, dict[str, Any]],
) -> str:
    canonical = json.dumps(
        accounts,
        ensure_ascii=True,
        sort_keys=True,
        separators=(",", ":"),
    )

    return hashlib.sha256(
        canonical.encode("utf-8")
    ).hexdigest()


def load_identity_baseline(
    path: Path,
) -> dict[str, Any] | None:
    if not path.exists():
        return None

    try:
        data = json.loads(
            path.read_text(encoding="utf-8")
        )
    except OSError as exc:
        raise CollectorError(
            f"No se pudo leer el baseline {path}: {exc}"
        ) from exc
    except json.JSONDecodeError as exc:
        raise CollectorError(
            f"El baseline {path} no contiene JSON válido: {exc}"
        ) from exc

    if not isinstance(data, dict):
        raise CollectorError(
            "El baseline debe ser un objeto JSON."
        )

    if data.get("baseline_version") != 1:
        raise CollectorError(
            "Versión de baseline no compatible."
        )

    accounts = data.get("accounts")

    if not isinstance(accounts, dict):
        raise CollectorError(
            "El baseline no contiene un inventario válido."
        )

    for username, record in accounts.items():
        if (
            not isinstance(username, str)
            or not isinstance(record, dict)
        ):
            raise CollectorError(
                "El baseline contiene registros inválidos."
            )

        if (
            "pw_hash" in record
            or "sp_pwdp" in record
            or "password_hash" in record
        ):
            raise CollectorError(
                "El baseline contiene material de contraseña prohibido."
            )

    return data


def save_identity_baseline(
    path: Path,
    accounts: dict[str, dict[str, Any]],
    previous: dict[str, Any] | None,
) -> None:
    path.parent.mkdir(
        parents=True,
        exist_ok=True,
        mode=0o750,
    )

    created_at = (
        previous.get("created_at")
        if previous
        else now_iso()
    )

    payload = {
        "baseline_version": 1,
        "schema_version": SCHEMA_VERSION,
        "control": CONTROL_ID,
        "evidence_id": "EV-02",
        "collector": COLLECTOR_NAME,
        "collector_version": COLLECTOR_VERSION,
        "created_at": created_at,
        "updated_at": now_iso(),
        "accounts_sha256": baseline_fingerprint(
            accounts
        ),
        "accounts": accounts,
    }

    temporary = path.with_name(
        f".{path.name}.{uuid.uuid4().hex}.tmp"
    )

    fd = None

    try:
        fd = os.open(
            temporary,
            os.O_WRONLY
            | os.O_CREAT
            | os.O_EXCL,
            0o600,
        )

        with os.fdopen(
            fd,
            "w",
            encoding="utf-8",
        ) as handle:
            fd = None
            json.dump(
                payload,
                handle,
                ensure_ascii=False,
                sort_keys=True,
                indent=2,
            )
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())

        os.replace(
            temporary,
            path,
        )
        os.chmod(
            path,
            0o600,
        )

    except OSError as exc:
        raise CollectorError(
            f"No se pudo guardar el baseline {path}: {exc}"
        ) from exc

    finally:
        if fd is not None:
            os.close(fd)

        try:
            temporary.unlink()
        except FileNotFoundError:
            pass


def collect_ev02(
    *,
    config: dict[str, Any],
    execution_id: str,
    mode: str,
    host: str,
    baseline_path: Path,
) -> list[dict[str, Any]]:
    source_system = str(
        config["fuente_identidad"]
    )

    current_accounts = build_identity_snapshot(
        config
    )

    current_hash = baseline_fingerprint(
        current_accounts
    )

    previous = load_identity_baseline(
        baseline_path
    )

    if previous is None:
        save_identity_baseline(
            baseline_path,
            current_accounts,
            None,
        )

        return [
            create_event(
                execution_id=execution_id,
                mode=mode,
                host=host,
                source_system=source_system,
                evidence_id="EV-02",
                event="identity_baseline_initialized",
                requirement_id="op.acc.1.3",
                total_accounts=len(
                    current_accounts
                ),
                accounts_sha256=current_hash,
                baseline_path=str(
                    baseline_path
                ),
                change_detection_started=True,
            )
        ]

    previous_accounts = previous["accounts"]
    previous_hash = str(
        previous.get(
            "accounts_sha256",
            baseline_fingerprint(
                previous_accounts
            ),
        )
    )

    previous_names = set(
        previous_accounts
    )
    current_names = set(
        current_accounts
    )

    created_accounts = sorted(
        current_names - previous_names
    )
    missing_accounts = sorted(
        previous_names - current_names
    )

    modified_accounts: list[
        tuple[
            str,
            list[str],
            dict[str, Any],
            dict[str, Any],
        ]
    ] = []

    for username in sorted(
        current_names & previous_names
    ):
        previous_record = previous_accounts[
            username
        ]
        current_record = current_accounts[
            username
        ]

        changed_fields = sorted(
            key
            for key in (
                set(previous_record)
                | set(current_record)
            )
            if previous_record.get(key)
            != current_record.get(key)
        )

        if changed_fields:
            modified_accounts.append(
                (
                    username,
                    changed_fields,
                    previous_record,
                    current_record,
                )
            )

    events = [
        create_event(
            execution_id=execution_id,
            mode=mode,
            host=host,
            source_system=source_system,
            evidence_id="EV-02",
            event="identity_baseline_compared",
            requirement_id="op.acc.1.3",
            previous_accounts_sha256=previous_hash,
            current_accounts_sha256=current_hash,
            created_accounts=len(
                created_accounts
            ),
            modified_accounts=len(
                modified_accounts
            ),
            missing_accounts=len(
                missing_accounts
            ),
            total_accounts=len(
                current_accounts
            ),
        )
    ]

    for username in created_accounts:
        events.append(
            create_event(
                execution_id=execution_id,
                mode=mode,
                host=host,
                source_system=source_system,
                evidence_id="EV-02",
                event="account_created",
                requirement_id="op.acc.1.3",
                usuario=username,
                current=current_accounts[
                    username
                ],
                observation=(
                    "present_in_current_"
                    "absent_from_previous"
                ),
            )
        )

    for (
        username,
        changed_fields,
        previous_record,
        current_record,
    ) in modified_accounts:
        events.append(
            create_event(
                execution_id=execution_id,
                mode=mode,
                host=host,
                source_system=source_system,
                evidence_id="EV-02",
                event="account_modified",
                requirement_id="op.acc.1.3",
                usuario=username,
                changed_fields=changed_fields,
                previous=previous_record,
                current=current_record,
            )
        )

    for username in missing_accounts:
        events.append(
            create_event(
                execution_id=execution_id,
                mode=mode,
                host=host,
                source_system=source_system,
                evidence_id="EV-02",
                event="account_missing_from_inventory",
                requirement_id="op.acc.1.4",
                usuario=username,
                previous=previous_accounts[
                    username
                ],
                observation=(
                    "present_in_previous_"
                    "absent_from_current"
                ),
                deletion_confirmed=False,
            )
        )

    save_identity_baseline(
        baseline_path,
        current_accounts,
        previous,
    )

    return events


def create_event(
    *,
    execution_id: str,
    mode: str,
    host: str,
    source_system: str,
    evidence_id: str,
    event: str,
    requirement_id: str,
    **attributes: Any,
) -> dict[str, Any]:
    entry: dict[str, Any] = {
        "schema_version": SCHEMA_VERSION,
        "event_id": str(uuid.uuid4()),
        "execution_id": execution_id,
        "ensfacil": CONTROL_ID,
        "event": event,
        "event_class": "technical_fact",
        "mode": mode,
        "synthetic": False,
        "ts": now_iso(),
        "host": host,
        "source_system": source_system,
        "collector": COLLECTOR_NAME,
        "collector_version": COLLECTOR_VERSION,
        "evidence_id": evidence_id,
        "requisito": requirement_id,
    }

    entry.update(attributes)
    return entry


def collect_ev01(
    *,
    config: dict[str, Any],
    execution_id: str,
    mode: str,
    host: str,
) -> list[dict[str, Any]]:
    source_system = str(config["fuente_identidad"])
    uid_min_person = int(config["uid_min_persona"])
    service_accounts = set(config["cuentas_servicio"])

    accounts = sorted(
        pwd.getpwall(),
        key=lambda account: (
            account.pw_uid,
            account.pw_name,
        ),
    )

    inventory_records: list[dict[str, Any]] = []
    active_accounts: list[dict[str, Any]] = []
    locked_accounts: list[dict[str, Any]] = []
    unknown_accounts: list[dict[str, Any]] = []

    accounts_by_uid: dict[int, list[str]] = {}

    for account in accounts:
        lock_state = get_lock_state(account.pw_name)
        account_type = classify_account(
            account.pw_name,
            account.pw_uid,
            service_accounts,
            uid_min_person,
        )

        record = {
            "usuario": account.pw_name,
            "uid": account.pw_uid,
            "gid": account.pw_gid,
            "shell": account.pw_shell,
            "tipo": account_type,
            "lock_state": lock_state,
        }

        inventory_records.append(record)
        accounts_by_uid.setdefault(
            account.pw_uid,
            [],
        ).append(account.pw_name)

        if lock_state in {"unlocked", "no_password"}:
            active_accounts.append(record)
        elif lock_state == "locked":
            locked_accounts.append(record)
        else:
            unknown_accounts.append(record)

    duplicate_uids = {
        uid: usernames
        for uid, usernames in accounts_by_uid.items()
        if len(usernames) > 1
    }

    events: list[dict[str, Any]] = []

    events.append(
        create_event(
            execution_id=execution_id,
            mode=mode,
            host=host,
            source_system=source_system,
            evidence_id="EV-01",
            event="account_inventory",
            requirement_id="op.acc.1.3",
            total_accounts=len(inventory_records),
            verified_active_accounts=len(active_accounts),
            verified_locked_accounts=len(locked_accounts),
            unknown_state_accounts=len(unknown_accounts),
            duplicate_uid_groups=len(duplicate_uids),
            inventory_complete=len(unknown_accounts) == 0,
            inventory_sha256=inventory_fingerprint(
                inventory_records
            ),
        )
    )

    for record in active_accounts:
        events.append(
            create_event(
                execution_id=execution_id,
                mode=mode,
                host=host,
                source_system=source_system,
                evidence_id="EV-01",
                event="account_active",
                requirement_id="op.acc.1.3",
                **record,
            )
        )

    for record in locked_accounts:
        events.append(
            create_event(
                execution_id=execution_id,
                mode=mode,
                host=host,
                source_system=source_system,
                evidence_id="EV-01",
                event="account_locked",
                requirement_id="op.acc.1.4",
                **record,
            )
        )

    for record in unknown_accounts:
        events.append(
            create_event(
                execution_id=execution_id,
                mode=mode,
                host=host,
                source_system=source_system,
                evidence_id="EV-01",
                event="account_state_unknown",
                requirement_id="op.acc.1.3",
                **record,
            )
        )

    for uid, usernames in sorted(
        duplicate_uids.items()
    ):
        events.append(
            create_event(
                execution_id=execution_id,
                mode=mode,
                host=host,
                source_system=source_system,
                evidence_id="EV-01",
                event="duplicate_identifier",
                requirement_id="op.acc.1.4",
                uid=uid,
                usuarios=sorted(usernames),
                duplicate_count=len(usernames),
            )
        )

    return events


AUTH_SUCCESS_PATTERN = re.compile(
    r"""
    accepted\s+
    (?P<method>
        password
        |publickey
        |keyboard-interactive(?:/pam)?
    )
    \s+for\s+
    (?P<username>\S+)
    \s+from\s+
    (?P<origin>\S+)
    (?:\s+port\s+(?P<port>\d+))?
    """,
    flags=re.IGNORECASE | re.VERBOSE,
)


def load_auth_cursor(
    path: Path,
    evidence_id: str,
) -> dict[str, Any]:
    if not path.exists():
        return {
            "cursor_version": 1,
            "control": CONTROL_ID,
            "evidence_id": evidence_id,
            "collector": COLLECTOR_NAME,
            "collector_version": COLLECTOR_VERSION,
            "created_at": now_iso(),
            "updated_at": now_iso(),
            "sources": {},
        }

    try:
        data = json.loads(
            path.read_text(encoding="utf-8")
        )
    except OSError as exc:
        raise CollectorError(
            f"No se pudo leer el cursor {path}: {exc}"
        ) from exc
    except json.JSONDecodeError as exc:
        raise CollectorError(
            f"El cursor {path} no contiene JSON válido: {exc}"
        ) from exc

    if not isinstance(data, dict):
        raise CollectorError(
            "El cursor de EV-03 debe ser un objeto JSON."
        )

    if data.get("cursor_version") != 1:
        raise CollectorError(
            "Versión de cursor de autenticación no compatible."
        )

    if data.get("evidence_id") != evidence_id:
        raise CollectorError(
            "El cursor pertenece a otra evidencia."
        )

    sources = data.get("sources")

    if not isinstance(sources, dict):
        raise CollectorError(
            "El cursor EV-03 no contiene sources válidos."
        )

    for source_path, state in sources.items():
        if (
            not isinstance(source_path, str)
            or not isinstance(state, dict)
        ):
            raise CollectorError(
                "El cursor EV-03 contiene una fuente inválida."
            )

        inode = state.get("inode")
        offset = state.get("offset")

        if (
            isinstance(inode, bool)
            or not isinstance(inode, int)
            or inode < 0
        ):
            raise CollectorError(
                "El cursor EV-03 contiene un inode inválido."
            )

        if (
            isinstance(offset, bool)
            or not isinstance(offset, int)
            or offset < 0
        ):
            raise CollectorError(
                "El cursor EV-03 contiene un offset inválido."
            )

    return data


def save_auth_cursor(
    path: Path,
    cursor: dict[str, Any],
) -> None:
    path.parent.mkdir(
        parents=True,
        exist_ok=True,
        mode=0o750,
    )

    cursor["updated_at"] = now_iso()

    temporary = path.with_name(
        f".{path.name}.{uuid.uuid4().hex}.tmp"
    )

    fd = None

    try:
        fd = os.open(
            temporary,
            os.O_WRONLY
            | os.O_CREAT
            | os.O_EXCL,
            0o600,
        )

        with os.fdopen(
            fd,
            "w",
            encoding="utf-8",
        ) as handle:
            fd = None

            json.dump(
                cursor,
                handle,
                ensure_ascii=False,
                sort_keys=True,
                indent=2,
            )
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())

        os.replace(
            temporary,
            path,
        )

        os.chmod(
            path,
            0o600,
        )

    except OSError as exc:
        raise CollectorError(
            f"No se pudo guardar el cursor {path}: {exc}"
        ) from exc

    finally:
        if fd is not None:
            os.close(fd)

        try:
            temporary.unlink()
        except FileNotFoundError:
            pass


def line_fingerprint(
    source_file: str,
    line: str,
) -> str:
    payload = (
        source_file
        + "\0"
        + line.rstrip("\r\n")
    )

    return hashlib.sha256(
        payload.encode(
            "utf-8",
            errors="replace",
        )
    ).hexdigest()


def read_complete_appended_lines(
    path: Path,
    start_offset: int,
) -> tuple[list[str], int, int]:
    try:
        with path.open("rb") as handle:
            handle.seek(start_offset)
            payload = handle.read()
    except PermissionError as exc:
        raise CollectorError(
            f"Sin permisos para leer {path}"
        ) from exc
    except OSError as exc:
        raise CollectorError(
            f"No se pudo leer {path}: {exc}"
        ) from exc

    if not payload:
        return [], start_offset, 0

    complete_payload = payload

    if not payload.endswith(b"\n"):
        last_newline = payload.rfind(b"\n")

        if last_newline == -1:
            complete_payload = b""
        else:
            complete_payload = payload[
                :last_newline + 1
            ]

    consumed_bytes = len(complete_payload)
    end_offset = start_offset + consumed_bytes

    lines = complete_payload.decode(
        "utf-8",
        errors="replace",
    ).splitlines()

    return lines, end_offset, consumed_bytes


def collect_ev03(
    *,
    config: dict[str, Any],
    execution_id: str,
    mode: str,
    host: str,
    cursor_path: Path,
) -> list[dict[str, Any]]:
    source_system = str(
        config["fuente_identidad"]
    )

    generic_accounts = set(
        config["cuentas_genericas"]
    )

    configured_paths = [
        Path(value)
        for value in config["auth_log_paths"]
    ]

    cursor = load_auth_cursor(
        cursor_path,
        "EV-03",
    )

    sources = cursor["sources"]
    events: list[dict[str, Any]] = []

    if not configured_paths:
        events.append(
            create_event(
                execution_id=execution_id,
                mode=mode,
                host=host,
                source_system=source_system,
                evidence_id="EV-03",
                event="authentication_source_unavailable",
                requirement_id="op.acc.1.1",
                reason="no_auth_log_paths_configured",
            )
        )

        save_auth_cursor(
            cursor_path,
            cursor,
        )

        return events

    for configured_path in configured_paths:
        source_path = configured_path.resolve()
        source_key = str(source_path)

        try:
            source_stat = source_path.stat()
        except FileNotFoundError:
            events.append(
                create_event(
                    execution_id=execution_id,
                    mode=mode,
                    host=host,
                    source_system=source_system,
                    evidence_id="EV-03",
                    event="authentication_source_unavailable",
                    requirement_id="op.acc.1.1",
                    source_file=source_key,
                    reason="not_found",
                )
            )
            continue
        except PermissionError:
            events.append(
                create_event(
                    execution_id=execution_id,
                    mode=mode,
                    host=host,
                    source_system=source_system,
                    evidence_id="EV-03",
                    event="authentication_source_unavailable",
                    requirement_id="op.acc.1.1",
                    source_file=source_key,
                    reason="stat_permission_denied",
                )
            )
            continue
        except OSError as exc:
            events.append(
                create_event(
                    execution_id=execution_id,
                    mode=mode,
                    host=host,
                    source_system=source_system,
                    evidence_id="EV-03",
                    event="authentication_source_unavailable",
                    requirement_id="op.acc.1.1",
                    source_file=source_key,
                    reason=type(exc).__name__,
                )
            )
            continue

        if not source_path.is_file():
            events.append(
                create_event(
                    execution_id=execution_id,
                    mode=mode,
                    host=host,
                    source_system=source_system,
                    evidence_id="EV-03",
                    event="authentication_source_unavailable",
                    requirement_id="op.acc.1.1",
                    source_file=source_key,
                    reason="not_regular_file",
                )
            )
            continue

        current_inode = int(
            source_stat.st_ino
        )
        current_size = int(
            source_stat.st_size
        )

        previous_state = sources.get(
            source_key
        )

        if previous_state is None:
            sources[source_key] = {
                "inode": current_inode,
                "offset": current_size,
                "initialized_at": now_iso(),
                "updated_at": now_iso(),
            }

            events.append(
                create_event(
                    execution_id=execution_id,
                    mode=mode,
                    host=host,
                    source_system=source_system,
                    evidence_id="EV-03",
                    event="authentication_cursor_initialized",
                    requirement_id="op.acc.1.1",
                    source_file=source_key,
                    source_inode=current_inode,
                    initial_offset=current_size,
                    replay_existing=False,
                )
            )

            continue

        previous_inode = int(
            previous_state["inode"]
        )
        previous_offset = int(
            previous_state["offset"]
        )

        rotation_detected = False
        rotation_reason = None

        if previous_inode != current_inode:
            start_offset = 0
            rotation_detected = True
            rotation_reason = "inode_changed"

        elif current_size < previous_offset:
            start_offset = 0
            rotation_detected = True
            rotation_reason = "file_truncated"

        else:
            start_offset = previous_offset

        try:
            (
                lines,
                end_offset,
                consumed_bytes,
            ) = read_complete_appended_lines(
                source_path,
                start_offset,
            )
        except CollectorError as exc:
            events.append(
                create_event(
                    execution_id=execution_id,
                    mode=mode,
                    host=host,
                    source_system=source_system,
                    evidence_id="EV-03",
                    event="authentication_source_unavailable",
                    requirement_id="op.acc.1.1",
                    source_file=source_key,
                    reason="read_failed",
                    error_type=type(
                        exc.__cause__
                    ).__name__
                    if exc.__cause__
                    else type(exc).__name__,
                )
            )
            continue

        matched_events = 0
        generic_events = 0

        for line_index, line in enumerate(
            lines,
            start=1,
        ):
            match = AUTH_SUCCESS_PATTERN.search(
                line
            )

            if match is None:
                continue

            username = match.group(
                "username"
            )
            origin = match.group(
                "origin"
            )
            auth_method = match.group(
                "method"
            ).lower()
            port_text = match.group(
                "port"
            )

            event_name = "auth_success"

            if username.lower() in generic_accounts:
                event_name = (
                    "generic_account_login"
                )
                generic_events += 1

            matched_events += 1

            attributes: dict[str, Any] = {
                "usuario": username,
                "origen": origin,
                "auth_method": auth_method,
                "authentication_result": "success",
                "source_file": source_key,
                "source_inode": current_inode,
                "source_line_index": line_index,
                "line_sha256": line_fingerprint(
                    source_key,
                    line,
                ),
            }

            if port_text is not None:
                attributes["source_port"] = int(
                    port_text
                )

            events.append(
                create_event(
                    execution_id=execution_id,
                    mode=mode,
                    host=host,
                    source_system=source_system,
                    evidence_id="EV-03",
                    event=event_name,
                    requirement_id="op.acc.1.1",
                    **attributes,
                )
            )

        sources[source_key] = {
            "inode": current_inode,
            "offset": end_offset,
            "initialized_at": previous_state.get(
                "initialized_at",
                now_iso(),
            ),
            "updated_at": now_iso(),
        }

        events.append(
            create_event(
                execution_id=execution_id,
                mode=mode,
                host=host,
                source_system=source_system,
                evidence_id="EV-03",
                event="authentication_log_batch",
                requirement_id="op.acc.1.1",
                source_file=source_key,
                source_inode=current_inode,
                cursor_start=start_offset,
                cursor_end=end_offset,
                bytes_read=consumed_bytes,
                records_scanned=len(lines),
                matched_authentications=matched_events,
                generic_account_authentications=generic_events,
                rotation_detected=rotation_detected,
                rotation_reason=rotation_reason,
            )
        )

    save_auth_cursor(
        cursor_path,
        cursor,
    )

    return events


def parse_iso_date(
    value: Any,
) -> datetime.date | None:
    if not isinstance(value, str):
        return None

    try:
        return datetime.strptime(
            value,
            "%Y-%m-%d",
        ).date()
    except ValueError:
        return None


def collect_ev04(
    *,
    config: dict[str, Any],
    execution_id: str,
    mode: str,
    host: str,
) -> list[dict[str, Any]]:
    source_system = str(
        config["fuente_identidad"]
    )

    records: dict[str, dict[str, Any]] = (
        config["bajas"]
    )

    maximum_disable_days = int(
        config["plazo_max_desactivacion_dias"]
    )

    events: list[dict[str, Any]] = []

    if not records:
        return [
            create_event(
                execution_id=execution_id,
                mode=mode,
                host=host,
                source_system=source_system,
                evidence_id="EV-04",
                event="offboarding_registry_unavailable",
                requirement_id="op.acc.1.4",
                parameter_id="P-08",
                reason="no_offboarding_records_configured",
            )
        ]

    today = datetime.now(
        timezone.utc
    ).date()

    locked_count = 0
    pending_count = 0
    overdue_count = 0
    missing_count = 0
    unknown_count = 0
    invalid_count = 0

    for username, record in sorted(
        records.items()
    ):
        offboarding_date = parse_iso_date(
            record.get("fecha_baja")
        )

        if offboarding_date is None:
            invalid_count += 1

            events.append(
                create_event(
                    execution_id=execution_id,
                    mode=mode,
                    host=host,
                    source_system=source_system,
                    evidence_id="EV-04",
                    event="offboarding_record_invalid",
                    requirement_id="op.acc.1.4",
                    parameter_id="P-08",
                    usuario=username,
                    reason="invalid_or_missing_offboarding_date",
                )
            )

            continue

        days_since_offboarding = (
            today - offboarding_date
        ).days

        if days_since_offboarding < 0:
            invalid_count += 1

            events.append(
                create_event(
                    execution_id=execution_id,
                    mode=mode,
                    host=host,
                    source_system=source_system,
                    evidence_id="EV-04",
                    event="offboarding_record_invalid",
                    requirement_id="op.acc.1.4",
                    parameter_id="P-08",
                    usuario=username,
                    fecha_baja=offboarding_date.isoformat(),
                    reason="future_offboarding_date",
                    days_since_offboarding=(
                        days_since_offboarding
                    ),
                )
            )

            continue

        try:
            account = pwd.getpwnam(
                username
            )
        except KeyError:
            missing_count += 1

            events.append(
                create_event(
                    execution_id=execution_id,
                    mode=mode,
                    host=host,
                    source_system=source_system,
                    evidence_id="EV-04",
                    event="offboarding_account_missing",
                    requirement_id="op.acc.1.4",
                    parameter_id="P-05",
                    usuario=username,
                    fecha_baja=offboarding_date.isoformat(),
                    days_since_offboarding=(
                        days_since_offboarding
                    ),
                    maximum_disable_days=(
                        maximum_disable_days
                    ),
                    observed_missing_at=now_iso(),
                    deletion_confirmed=False,
                )
            )

            continue
        except OSError as exc:
            unknown_count += 1

            events.append(
                create_event(
                    execution_id=execution_id,
                    mode=mode,
                    host=host,
                    source_system=source_system,
                    evidence_id="EV-04",
                    event="offboarding_account_state_unknown",
                    requirement_id="op.acc.1.4",
                    parameter_id="P-05",
                    usuario=username,
                    fecha_baja=offboarding_date.isoformat(),
                    reason=type(exc).__name__,
                )
            )

            continue

        lock_state = get_lock_state(
            username
        )

        common_attributes: dict[str, Any] = {
            "usuario": username,
            "uid": account.pw_uid,
            "fecha_baja": offboarding_date.isoformat(),
            "days_since_offboarding": (
                days_since_offboarding
            ),
            "maximum_disable_days": (
                maximum_disable_days
            ),
            "parameter_id": "P-05",
            "lock_state": lock_state,
        }

        if lock_state == "locked":
            locked_count += 1

            events.append(
                create_event(
                    execution_id=execution_id,
                    mode=mode,
                    host=host,
                    source_system=source_system,
                    evidence_id="EV-04",
                    event="offboarding_account_locked",
                    requirement_id="op.acc.1.4",
                    **common_attributes,
                )
            )

        elif lock_state in {
            "unlocked",
            "no_password",
        }:
            if (
                days_since_offboarding
                <= maximum_disable_days
            ):
                pending_count += 1
                event_name = (
                    "offboarding_pending"
                )
            else:
                overdue_count += 1
                event_name = (
                    "account_offboarding_overdue"
                )

            events.append(
                create_event(
                    execution_id=execution_id,
                    mode=mode,
                    host=host,
                    source_system=source_system,
                    evidence_id="EV-04",
                    event=event_name,
                    requirement_id="op.acc.1.4",
                    **common_attributes,
                )
            )

        else:
            unknown_count += 1

            events.append(
                create_event(
                    execution_id=execution_id,
                    mode=mode,
                    host=host,
                    source_system=source_system,
                    evidence_id="EV-04",
                    event="offboarding_account_state_unknown",
                    requirement_id="op.acc.1.4",
                    reason="lock_state_unknown",
                    **common_attributes,
                )
            )

    events.append(
        create_event(
            execution_id=execution_id,
            mode=mode,
            host=host,
            source_system=source_system,
            evidence_id="EV-04",
            event="offboarding_registry_checked",
            requirement_id="op.acc.1.4",
            parameter_id="P-05",
            total_records=len(records),
            maximum_disable_days=(
                maximum_disable_days
            ),
            locked_accounts_observed=locked_count,
            pending_accounts=pending_count,
            overdue_accounts=overdue_count,
            missing_accounts=missing_count,
            unknown_accounts=unknown_count,
            invalid_records=invalid_count,
        )
    )

    return events


KNOWN_NON_INTERACTIVE_SHELLS = {
    "/bin/false",
    "/sbin/nologin",
    "/usr/bin/false",
    "/usr/sbin/nologin",
}


def collect_ev05(
    *,
    config: dict[str, Any],
    execution_id: str,
    mode: str,
    host: str,
    cursor_path: Path,
) -> list[dict[str, Any]]:
    source_system = str(
        config["fuente_identidad"]
    )

    service_accounts = sorted(
        set(config["cuentas_servicio"])
    )

    configured_paths = [
        Path(value)
        for value in config["auth_log_paths"]
    ]

    cursor = load_auth_cursor(
        cursor_path,
        "EV-05",
    )

    sources = cursor["sources"]
    events: list[dict[str, Any]] = []

    if not service_accounts:
        events.append(
            create_event(
                execution_id=execution_id,
                mode=mode,
                host=host,
                source_system=source_system,
                evidence_id="EV-05",
                event="service_account_registry_unavailable",
                requirement_id="op.acc.1.2",
                reason="no_service_accounts_configured",
            )
        )

        save_auth_cursor(
            cursor_path,
            cursor,
        )

        return events

    existing_accounts = 0
    missing_accounts = 0
    known_non_interactive_shells = 0

    for username in service_accounts:
        try:
            account = pwd.getpwnam(
                username
            )
        except KeyError:
            missing_accounts += 1

            events.append(
                create_event(
                    execution_id=execution_id,
                    mode=mode,
                    host=host,
                    source_system=source_system,
                    evidence_id="EV-05",
                    event="service_account_missing",
                    requirement_id="op.acc.1.2",
                    usuario=username,
                    configured_as_service=True,
                )
            )

            continue
        except OSError as exc:
            events.append(
                create_event(
                    execution_id=execution_id,
                    mode=mode,
                    host=host,
                    source_system=source_system,
                    evidence_id="EV-05",
                    event="service_account_state_unknown",
                    requirement_id="op.acc.1.2",
                    usuario=username,
                    configured_as_service=True,
                    reason=type(exc).__name__,
                )
            )

            continue

        existing_accounts += 1

        shell_is_known_noninteractive = (
            account.pw_shell
            in KNOWN_NON_INTERACTIVE_SHELLS
        )

        if shell_is_known_noninteractive:
            known_non_interactive_shells += 1

        events.append(
            create_event(
                execution_id=execution_id,
                mode=mode,
                host=host,
                source_system=source_system,
                evidence_id="EV-05",
                event="service_account_observed",
                requirement_id="op.acc.1.2",
                usuario=username,
                uid=account.pw_uid,
                gid=account.pw_gid,
                shell=account.pw_shell,
                shell_is_known_noninteractive=(
                    shell_is_known_noninteractive
                ),
                lock_state=get_lock_state(
                    username
                ),
                configured_as_service=True,
            )
        )

    events.append(
        create_event(
            execution_id=execution_id,
            mode=mode,
            host=host,
            source_system=source_system,
            evidence_id="EV-05",
            event="service_account_inventory",
            requirement_id="op.acc.1.2",
            configured_service_accounts=len(
                service_accounts
            ),
            existing_service_accounts=(
                existing_accounts
            ),
            missing_service_accounts=(
                missing_accounts
            ),
            known_noninteractive_shells=(
                known_non_interactive_shells
            ),
        )
    )

    if not configured_paths:
        events.append(
            create_event(
                execution_id=execution_id,
                mode=mode,
                host=host,
                source_system=source_system,
                evidence_id="EV-05",
                event="service_authentication_source_unavailable",
                requirement_id="op.acc.1.2",
                reason="no_auth_log_paths_configured",
            )
        )

        save_auth_cursor(
            cursor_path,
            cursor,
        )

        return events

    service_accounts_lower = {
        username.lower()
        for username in service_accounts
    }

    for configured_path in configured_paths:
        source_path = configured_path.resolve()
        source_key = str(source_path)

        try:
            source_stat = source_path.stat()
        except FileNotFoundError:
            events.append(
                create_event(
                    execution_id=execution_id,
                    mode=mode,
                    host=host,
                    source_system=source_system,
                    evidence_id="EV-05",
                    event="service_authentication_source_unavailable",
                    requirement_id="op.acc.1.2",
                    source_file=source_key,
                    reason="not_found",
                )
            )
            continue
        except PermissionError:
            events.append(
                create_event(
                    execution_id=execution_id,
                    mode=mode,
                    host=host,
                    source_system=source_system,
                    evidence_id="EV-05",
                    event="service_authentication_source_unavailable",
                    requirement_id="op.acc.1.2",
                    source_file=source_key,
                    reason="stat_permission_denied",
                )
            )
            continue
        except OSError as exc:
            events.append(
                create_event(
                    execution_id=execution_id,
                    mode=mode,
                    host=host,
                    source_system=source_system,
                    evidence_id="EV-05",
                    event="service_authentication_source_unavailable",
                    requirement_id="op.acc.1.2",
                    source_file=source_key,
                    reason=type(exc).__name__,
                )
            )
            continue

        if not source_path.is_file():
            events.append(
                create_event(
                    execution_id=execution_id,
                    mode=mode,
                    host=host,
                    source_system=source_system,
                    evidence_id="EV-05",
                    event="service_authentication_source_unavailable",
                    requirement_id="op.acc.1.2",
                    source_file=source_key,
                    reason="not_regular_file",
                )
            )
            continue

        current_inode = int(
            source_stat.st_ino
        )
        current_size = int(
            source_stat.st_size
        )

        previous_state = sources.get(
            source_key
        )

        if previous_state is None:
            sources[source_key] = {
                "inode": current_inode,
                "offset": current_size,
                "initialized_at": now_iso(),
                "updated_at": now_iso(),
            }

            events.append(
                create_event(
                    execution_id=execution_id,
                    mode=mode,
                    host=host,
                    source_system=source_system,
                    evidence_id="EV-05",
                    event=(
                        "service_authentication_"
                        "cursor_initialized"
                    ),
                    requirement_id="op.acc.1.2",
                    source_file=source_key,
                    source_inode=current_inode,
                    initial_offset=current_size,
                    replay_existing=False,
                )
            )

            continue

        previous_inode = int(
            previous_state["inode"]
        )
        previous_offset = int(
            previous_state["offset"]
        )

        rotation_detected = False
        rotation_reason = None

        if previous_inode != current_inode:
            start_offset = 0
            rotation_detected = True
            rotation_reason = "inode_changed"

        elif current_size < previous_offset:
            start_offset = 0
            rotation_detected = True
            rotation_reason = "file_truncated"

        else:
            start_offset = previous_offset

        try:
            (
                lines,
                end_offset,
                consumed_bytes,
            ) = read_complete_appended_lines(
                source_path,
                start_offset,
            )
        except CollectorError as exc:
            events.append(
                create_event(
                    execution_id=execution_id,
                    mode=mode,
                    host=host,
                    source_system=source_system,
                    evidence_id="EV-05",
                    event="service_authentication_source_unavailable",
                    requirement_id="op.acc.1.2",
                    source_file=source_key,
                    reason="read_failed",
                    error_type=type(
                        exc.__cause__
                    ).__name__
                    if exc.__cause__
                    else type(exc).__name__,
                )
            )
            continue

        matched_authentications = 0
        service_authentications = 0

        for line_index, line in enumerate(
            lines,
            start=1,
        ):
            match = AUTH_SUCCESS_PATTERN.search(
                line
            )

            if match is None:
                continue

            matched_authentications += 1

            username = match.group(
                "username"
            )

            if (
                username.lower()
                not in service_accounts_lower
            ):
                continue

            service_authentications += 1

            origin = match.group(
                "origin"
            )
            auth_method = match.group(
                "method"
            ).lower()
            port_text = match.group(
                "port"
            )

            attributes: dict[str, Any] = {
                "usuario": username,
                "origen": origin,
                "auth_method": auth_method,
                "authentication_result": "success",
                "interactive_protocol": "ssh",
                "source_file": source_key,
                "source_inode": current_inode,
                "source_line_index": line_index,
                "line_sha256": line_fingerprint(
                    source_key,
                    line,
                ),
                "configured_as_service": True,
            }

            if port_text is not None:
                attributes["source_port"] = int(
                    port_text
                )

            events.append(
                create_event(
                    execution_id=execution_id,
                    mode=mode,
                    host=host,
                    source_system=source_system,
                    evidence_id="EV-05",
                    event="service_account_interactive",
                    requirement_id="op.acc.1.2",
                    **attributes,
                )
            )

        sources[source_key] = {
            "inode": current_inode,
            "offset": end_offset,
            "initialized_at": previous_state.get(
                "initialized_at",
                now_iso(),
            ),
            "updated_at": now_iso(),
        }

        events.append(
            create_event(
                execution_id=execution_id,
                mode=mode,
                host=host,
                source_system=source_system,
                evidence_id="EV-05",
                event="service_authentication_log_batch",
                requirement_id="op.acc.1.2",
                source_file=source_key,
                source_inode=current_inode,
                cursor_start=start_offset,
                cursor_end=end_offset,
                bytes_read=consumed_bytes,
                records_scanned=len(lines),
                matched_authentications=(
                    matched_authentications
                ),
                service_account_authentications=(
                    service_authentications
                ),
                rotation_detected=rotation_detected,
                rotation_reason=rotation_reason,
            )
        )

    save_auth_cursor(
        cursor_path,
        cursor,
    )

    return events


def collect_ev06(
    *,
    config: dict[str, Any],
    execution_id: str,
    mode: str,
    host: str,
) -> list[dict[str, Any]]:
    """
    Observa membresías privilegiadas e identificadores administrativos.

    No interpreta la pertenencia a un grupo como uso real de privilegios
    y no calcula cumplimiento.
    """
    source_system = str(
        config["fuente_identidad"]
    )

    privileged_groups = set(
        config["grupos_privilegiados"]
    )

    admin_suffix = str(
        config["sufijo_cuenta_admin"]
    )

    service_accounts = set(
        config["cuentas_servicio"]
    )

    uid_min_person = int(
        config["uid_min_persona"]
    )

    events: list[dict[str, Any]] = []

    if not privileged_groups:
        return [
            create_event(
                execution_id=execution_id,
                mode=mode,
                host=host,
                source_system=source_system,
                evidence_id="EV-06",
                event="privileged_group_policy_unavailable",
                requirement_id="op.acc.1.2",
                reason="no_privileged_groups_configured",
                admin_identifier_pattern_type="suffix",
                admin_identifier_pattern=admin_suffix,
            )
        ]

    system_groups = {
        group.gr_name: group
        for group in grp.getgrall()
    }

    existing_privileged_groups = sorted(
        privileged_groups.intersection(
            system_groups
        )
    )

    missing_privileged_groups = sorted(
        privileged_groups.difference(
            system_groups
        )
    )

    for group_name in missing_privileged_groups:
        events.append(
            create_event(
                execution_id=execution_id,
                mode=mode,
                host=host,
                source_system=source_system,
                evidence_id="EV-06",
                event="privileged_group_missing",
                requirement_id="op.acc.1.2",
                group=group_name,
                configured_as_privileged=True,
            )
        )

    accounts = sorted(
        pwd.getpwall(),
        key=lambda item: (
            item.pw_uid,
            item.pw_name,
        ),
    )

    privileged_memberships = 0
    matching_admin_identifiers = 0
    nonmatching_privileged_identifiers = 0
    administrative_identifiers = 0
    administrative_without_privilege = 0

    privileged_users: set[str] = set()

    account_records: list[
        tuple[Any, list[str], list[str], bool]
    ] = []

    for account in accounts:
        account_groups = get_account_groups(
            account.pw_name,
            account.pw_gid,
        )

        matching_groups = sorted(
            privileged_groups.intersection(
                account_groups
            )
        )

        matches_admin_pattern = (
            account.pw_name.endswith(
                admin_suffix
            )
        )

        account_records.append(
            (
                account,
                account_groups,
                matching_groups,
                matches_admin_pattern,
            )
        )

        if not matching_groups:
            continue

        privileged_users.add(
            account.pw_name
        )
        privileged_memberships += 1

        if matches_admin_pattern:
            matching_admin_identifiers += 1
        else:
            nonmatching_privileged_identifiers += 1

        events.append(
            create_event(
                execution_id=execution_id,
                mode=mode,
                host=host,
                source_system=source_system,
                evidence_id="EV-06",
                event="privileged_membership_observed",
                requirement_id="op.acc.1.2",
                usuario=account.pw_name,
                uid=account.pw_uid,
                gid=account.pw_gid,
                account_type=classify_account(
                    account.pw_name,
                    account.pw_uid,
                    service_accounts,
                    uid_min_person,
                ),
                groups=account_groups,
                privileged_groups=matching_groups,
                privileged_group_count=len(
                    matching_groups
                ),
                configured_as_privileged=True,
                admin_identifier_pattern_type="suffix",
                admin_identifier_pattern=admin_suffix,
                matches_admin_identifier_pattern=(
                    matches_admin_pattern
                ),
                lock_state=get_lock_state(
                    account.pw_name
                ),
                privilege_use_observed=False,
            )
        )

    for (
        account,
        account_groups,
        matching_groups,
        matches_admin_pattern,
    ) in account_records:
        if not matches_admin_pattern:
            continue

        administrative_identifiers += 1

        has_privileged_membership = bool(
            matching_groups
        )

        if not has_privileged_membership:
            administrative_without_privilege += 1

        events.append(
            create_event(
                execution_id=execution_id,
                mode=mode,
                host=host,
                source_system=source_system,
                evidence_id="EV-06",
                event="administrative_identifier_observed",
                requirement_id="op.acc.1.r1.2",
                usuario=account.pw_name,
                uid=account.pw_uid,
                gid=account.pw_gid,
                account_type=classify_account(
                    account.pw_name,
                    account.pw_uid,
                    service_accounts,
                    uid_min_person,
                ),
                groups=account_groups,
                privileged_groups=matching_groups,
                has_privileged_membership=(
                    has_privileged_membership
                ),
                admin_identifier_pattern_type="suffix",
                admin_identifier_pattern=admin_suffix,
                matches_admin_identifier_pattern=True,
                lock_state=get_lock_state(
                    account.pw_name
                ),
                privilege_use_observed=False,
            )
        )

    events.append(
        create_event(
            execution_id=execution_id,
            mode=mode,
            host=host,
            source_system=source_system,
            evidence_id="EV-06",
            event="privileged_membership_inventory",
            requirement_id="op.acc.1.2",
            configured_privileged_groups=sorted(
                privileged_groups
            ),
            existing_privileged_groups=(
                existing_privileged_groups
            ),
            missing_privileged_groups=(
                missing_privileged_groups
            ),
            configured_privileged_group_count=len(
                privileged_groups
            ),
            existing_privileged_group_count=len(
                existing_privileged_groups
            ),
            missing_privileged_group_count=len(
                missing_privileged_groups
            ),
            privileged_accounts_observed=(
                privileged_memberships
            ),
            administrative_identifiers_observed=(
                administrative_identifiers
            ),
            privileged_accounts_matching_admin_pattern=(
                matching_admin_identifiers
            ),
            privileged_accounts_not_matching_admin_pattern=(
                nonmatching_privileged_identifiers
            ),
            administrative_identifiers_without_privileged_membership=(
                administrative_without_privilege
            ),
            admin_identifier_pattern_type="suffix",
            admin_identifier_pattern=admin_suffix,
            privilege_use_observed=False,
        )
    )

    return events


def authorized_registry_fingerprint(
    registry: dict[str, Any],
) -> str:
    canonical = json.dumps(
        registry,
        ensure_ascii=True,
        sort_keys=True,
        separators=(",", ":"),
    )

    return hashlib.sha256(
        canonical.encode("utf-8")
    ).hexdigest()


def collect_ev07(
    *,
    config: dict[str, Any],
    execution_id: str,
    mode: str,
    host: str,
) -> list[dict[str, Any]]:
    """
    Compara identidades observadas con el registro P-07.

    No determina la aplicabilidad por nivel ENS ni calcula
    cumplimiento, estado o puntuación.
    """
    source_system = str(
        config["fuente_identidad"]
    )

    registry = config[
        "p07_lista_autorizados"
    ]

    if registry is None:
        return [
            create_event(
                execution_id=execution_id,
                mode=mode,
                host=host,
                source_system=source_system,
                evidence_id="EV-07",
                event=(
                    "authorized_identity_"
                    "registry_unavailable"
                ),
                requirement_id="op.acc.1.r1.3",
                parameter_id="P-07",
                reason=(
                    "authorized_identity_"
                    "registry_not_configured"
                ),
                evaluation_deferred_to_engine=True,
                applicability_deferred_to_engine=True,
            )
        ]

    registry_users = set(
        registry["usuarios"]
    )

    registry_reference = str(
        registry["referencia"]
    )

    registry_version = str(
        registry["version"]
    )

    scope_account_types = set(
        registry["tipos_cuenta"]
    )

    registry_sha256 = (
        authorized_registry_fingerprint(
            registry
        )
    )

    service_accounts = set(
        config["cuentas_servicio"]
    )

    uid_min_person = int(
        config["uid_min_persona"]
    )

    accounts = sorted(
        pwd.getpwall(),
        key=lambda item: (
            item.pw_uid,
            item.pw_name,
        ),
    )

    accounts_by_name = {
        account.pw_name: account
        for account in accounts
    }

    active_in_scope = 0
    password_locked_in_scope = 0
    unknown_in_scope = 0
    active_authorized = 0
    active_missing_from_registry = 0
    authorized_password_locked = 0
    authorized_unknown = 0
    authorized_not_observed = 0
    authorized_outside_scope = 0

    events: list[dict[str, Any]] = []

    common_registry_attributes = {
        "parameter_id": "P-07",
        "registry_reference": (
            registry_reference
        ),
        "registry_version": (
            registry_version
        ),
        "registry_sha256": (
            registry_sha256
        ),
        "scope_account_types": sorted(
            scope_account_types
        ),
        "evaluation_deferred_to_engine": True,
        "applicability_deferred_to_engine": True,
    }

    for account in accounts:
        account_type = classify_account(
            account.pw_name,
            account.pw_uid,
            service_accounts,
            uid_min_person,
        )

        if account_type not in scope_account_types:
            continue

        username = account.pw_name

        listed_as_authorized = (
            username in registry_users
        )

        lock_state = get_lock_state(
            username
        )

        common_identity_attributes = {
            **common_registry_attributes,
            "usuario": username,
            "uid": account.pw_uid,
            "gid": account.pw_gid,
            "account_type": account_type,
            "shell": account.pw_shell,
            "lock_state": lock_state,
            "listed_as_authorized": (
                listed_as_authorized
            ),
        }

        if lock_state == "unknown":
            unknown_in_scope += 1

            if listed_as_authorized:
                authorized_unknown += 1

            events.append(
                create_event(
                    execution_id=execution_id,
                    mode=mode,
                    host=host,
                    source_system=source_system,
                    evidence_id="EV-07",
                    event=(
                        "identity_authorization_"
                        "state_unknown"
                    ),
                    requirement_id="op.acc.1.r1.3",
                    reason="lock_state_unknown",
                    **common_identity_attributes,
                )
            )

            continue

        if lock_state == "locked":
            password_locked_in_scope += 1

            if listed_as_authorized:
                authorized_password_locked += 1

                events.append(
                    create_event(
                        execution_id=execution_id,
                        mode=mode,
                        host=host,
                        source_system=source_system,
                        evidence_id="EV-07",
                        event=(
                            "authorized_identity_"
                            "password_locked"
                        ),
                        requirement_id="op.acc.1.r1.3",
                        reason=(
                            "password_authentication_"
                            "locked"
                        ),
                        **common_identity_attributes,
                    )
                )

            continue

        active_in_scope += 1

        if listed_as_authorized:
            active_authorized += 1
            event_name = (
                "identity_present_in_"
                "authorized_registry"
            )
        else:
            active_missing_from_registry += 1
            event_name = (
                "identity_missing_from_"
                "authorized_registry"
            )

        events.append(
            create_event(
                execution_id=execution_id,
                mode=mode,
                host=host,
                source_system=source_system,
                evidence_id="EV-07",
                event=event_name,
                requirement_id="op.acc.1.r1.3",
                **common_identity_attributes,
            )
        )

    for username in sorted(registry_users):
        account = accounts_by_name.get(
            username
        )

        if account is None:
            authorized_not_observed += 1

            events.append(
                create_event(
                    execution_id=execution_id,
                    mode=mode,
                    host=host,
                    source_system=source_system,
                    evidence_id="EV-07",
                    event=(
                        "authorized_identity_"
                        "not_observed"
                    ),
                    requirement_id="op.acc.1.r1.3",
                    usuario=username,
                    listed_as_authorized=True,
                    reason="identity_not_present_in_system",
                    **common_registry_attributes,
                )
            )

            continue

        account_type = classify_account(
            account.pw_name,
            account.pw_uid,
            service_accounts,
            uid_min_person,
        )

        if account_type in scope_account_types:
            continue

        authorized_outside_scope += 1

        events.append(
            create_event(
                execution_id=execution_id,
                mode=mode,
                host=host,
                source_system=source_system,
                evidence_id="EV-07",
                event=(
                    "authorized_identity_"
                    "outside_declared_scope"
                ),
                requirement_id="op.acc.1.r1.3",
                usuario=username,
                uid=account.pw_uid,
                gid=account.pw_gid,
                account_type=account_type,
                shell=account.pw_shell,
                listed_as_authorized=True,
                reason=(
                    "account_type_not_in_"
                    "registry_scope"
                ),
                **common_registry_attributes,
            )
        )

    events.append(
        create_event(
            execution_id=execution_id,
            mode=mode,
            host=host,
            source_system=source_system,
            evidence_id="EV-07",
            event=(
                "authorized_identity_"
                "registry_compared"
            ),
            requirement_id="op.acc.1.r1.3",
            registry_entries=len(
                registry_users
            ),
            observed_system_accounts=len(
                accounts
            ),
            active_accounts_in_scope=(
                active_in_scope
            ),
            password_locked_accounts_in_scope=(
                password_locked_in_scope
            ),
            unknown_state_accounts_in_scope=(
                unknown_in_scope
            ),
            active_authorized_accounts=(
                active_authorized
            ),
            active_accounts_missing_from_registry=(
                active_missing_from_registry
            ),
            authorized_password_locked_accounts=(
                authorized_password_locked
            ),
            authorized_unknown_state_accounts=(
                authorized_unknown
            ),
            authorized_identities_not_observed=(
                authorized_not_observed
            ),
            authorized_identities_outside_scope=(
                authorized_outside_scope
            ),
            **common_registry_attributes,
        )
    )

    return events


def retention_registry_fingerprint(
    registry: dict[str, Any],
) -> str:
    canonical = json.dumps(
        registry,
        ensure_ascii=True,
        sort_keys=True,
        separators=(",", ":"),
    )

    return hashlib.sha256(
        canonical.encode("utf-8")
    ).hexdigest()


def collect_ev08(
    *,
    config: dict[str, Any],
    execution_id: str,
    mode: str,
    host: str,
) -> list[dict[str, Any]]:
    """
    Observa eliminaciones confirmadas y calcula el tiempo transcurrido
    desde la deshabilitación.

    La ausencia en el inventario no se considera prueba de eliminación.
    La evaluación del período P-06 corresponde al motor ENSFácil.
    """
    source_system = str(
        config["fuente_identidad"]
    )

    retention_period_days = config[
        "periodo_retencion_cuentas_dias"
    ]

    registry = config[
        "p06_eliminaciones_confirmadas"
    ]

    events: list[dict[str, Any]] = []

    if retention_period_days is None:
        events.append(
            create_event(
                execution_id=execution_id,
                mode=mode,
                host=host,
                source_system=source_system,
                evidence_id="EV-08",
                event="retention_period_unavailable",
                requirement_id="op.acc.1.4",
                parameter_id="P-06",
                reason=(
                    "retention_period_not_configured"
                ),
                evaluation_deferred_to_engine=True,
            )
        )

    if registry is None:
        events.append(
            create_event(
                execution_id=execution_id,
                mode=mode,
                host=host,
                source_system=source_system,
                evidence_id="EV-08",
                event=(
                    "confirmed_deletion_"
                    "registry_unavailable"
                ),
                requirement_id="op.acc.1.4",
                parameter_id="P-06",
                reason=(
                    "confirmed_deletion_"
                    "registry_not_configured"
                ),
                deletion_inferred_from_absence=False,
                evaluation_deferred_to_engine=True,
            )
        )

    if (
        retention_period_days is None
        or registry is None
    ):
        return events

    registry_reference = str(
        registry["referencia"]
    )

    registry_version = str(
        registry["version"]
    )

    records = list(
        registry["registros"]
    )

    registry_sha256 = (
        retention_registry_fingerprint(
            registry
        )
    )

    confirmed_count = 0
    unconfirmed_count = 0
    invalid_count = 0
    period_reached_count = 0
    period_not_reached_count = 0

    common_registry_attributes = {
        "parameter_id": "P-06",
        "minimum_retention_days": (
            retention_period_days
        ),
        "registry_reference": (
            registry_reference
        ),
        "registry_version": (
            registry_version
        ),
        "registry_sha256": (
            registry_sha256
        ),
        "deletion_inferred_from_absence": False,
        "evaluation_deferred_to_engine": True,
    }

    for record_index, record in enumerate(
        records
    ):
        username = record.get(
            "usuario"
        )

        deletion_confirmed = record.get(
            "eliminacion_confirmada"
        )

        disabled_date_raw = record.get(
            "fecha_deshabilitacion"
        )

        deletion_date_raw = record.get(
            "fecha_eliminacion"
        )

        source_type = record.get(
            "fuente"
        )

        source_event_reference = record.get(
            "referencia_evento"
        )

        source_event_code = record.get(
            "codigo_evento"
        )

        if (
            not isinstance(username, str)
            or not username.strip()
        ):
            invalid_count += 1

            events.append(
                create_event(
                    execution_id=execution_id,
                    mode=mode,
                    host=host,
                    source_system=source_system,
                    evidence_id="EV-08",
                    event=(
                        "account_deletion_"
                        "record_invalid"
                    ),
                    requirement_id="op.acc.1.4",
                    record_index=record_index,
                    reason=(
                        "invalid_or_missing_username"
                    ),
                    **common_registry_attributes,
                )
            )

            continue

        username = username.strip()

        if not isinstance(
            deletion_confirmed,
            bool,
        ):
            invalid_count += 1

            events.append(
                create_event(
                    execution_id=execution_id,
                    mode=mode,
                    host=host,
                    source_system=source_system,
                    evidence_id="EV-08",
                    event=(
                        "account_deletion_"
                        "record_invalid"
                    ),
                    requirement_id="op.acc.1.4",
                    record_index=record_index,
                    usuario=username,
                    reason=(
                        "deletion_confirmation_"
                        "must_be_boolean"
                    ),
                    **common_registry_attributes,
                )
            )

            continue

        if deletion_confirmed is False:
            unconfirmed_count += 1

            events.append(
                create_event(
                    execution_id=execution_id,
                    mode=mode,
                    host=host,
                    source_system=source_system,
                    evidence_id="EV-08",
                    event=(
                        "account_deletion_"
                        "unconfirmed"
                    ),
                    requirement_id="op.acc.1.4",
                    record_index=record_index,
                    usuario=username,
                    fecha_deshabilitacion=(
                        disabled_date_raw
                    ),
                    fecha_eliminacion=(
                        deletion_date_raw
                    ),
                    deletion_confirmed=False,
                    reason=(
                        "deletion_not_confirmed_"
                        "by_source"
                    ),
                    **common_registry_attributes,
                )
            )

            continue

        if (
            not isinstance(source_type, str)
            or not source_type.strip()
            or not isinstance(
                source_event_reference,
                str,
            )
            or not source_event_reference.strip()
        ):
            invalid_count += 1

            events.append(
                create_event(
                    execution_id=execution_id,
                    mode=mode,
                    host=host,
                    source_system=source_system,
                    evidence_id="EV-08",
                    event=(
                        "account_deletion_"
                        "record_invalid"
                    ),
                    requirement_id="op.acc.1.4",
                    record_index=record_index,
                    usuario=username,
                    reason=(
                        "confirmed_deletion_"
                        "requires_source_reference"
                    ),
                    **common_registry_attributes,
                )
            )

            continue

        disabled_date = parse_iso_date(
            disabled_date_raw
        )

        deletion_date = parse_iso_date(
            deletion_date_raw
        )

        if (
            disabled_date is None
            or deletion_date is None
        ):
            invalid_count += 1

            events.append(
                create_event(
                    execution_id=execution_id,
                    mode=mode,
                    host=host,
                    source_system=source_system,
                    evidence_id="EV-08",
                    event=(
                        "account_deletion_"
                        "record_invalid"
                    ),
                    requirement_id="op.acc.1.4",
                    record_index=record_index,
                    usuario=username,
                    reason=(
                        "invalid_or_missing_"
                        "lifecycle_dates"
                    ),
                    **common_registry_attributes,
                )
            )

            continue

        retained_days = (
            deletion_date - disabled_date
        ).days

        if retained_days < 0:
            invalid_count += 1

            events.append(
                create_event(
                    execution_id=execution_id,
                    mode=mode,
                    host=host,
                    source_system=source_system,
                    evidence_id="EV-08",
                    event=(
                        "account_deletion_"
                        "record_invalid"
                    ),
                    requirement_id="op.acc.1.4",
                    record_index=record_index,
                    usuario=username,
                    fecha_deshabilitacion=(
                        disabled_date.isoformat()
                    ),
                    fecha_eliminacion=(
                        deletion_date.isoformat()
                    ),
                    reason=(
                        "deletion_date_precedes_"
                        "disable_date"
                    ),
                    **common_registry_attributes,
                )
            )

            continue

        retention_period_reached = (
            retained_days
            >= retention_period_days
        )

        retention_shortfall_days = max(
            0,
            retention_period_days
            - retained_days,
        )

        retention_surplus_days = max(
            0,
            retained_days
            - retention_period_days,
        )

        confirmed_count += 1

        if retention_period_reached:
            period_reached_count += 1
        else:
            period_not_reached_count += 1

        attributes: dict[str, Any] = {
            "record_index": record_index,
            "usuario": username,
            "fecha_deshabilitacion": (
                disabled_date.isoformat()
            ),
            "fecha_eliminacion": (
                deletion_date.isoformat()
            ),
            "days_retained": retained_days,
            "retention_period_reached": (
                retention_period_reached
            ),
            "retention_shortfall_days": (
                retention_shortfall_days
            ),
            "retention_surplus_days": (
                retention_surplus_days
            ),
            "deletion_confirmed": True,
            "source_type": (
                source_type.strip()
            ),
            "source_event_reference": (
                source_event_reference.strip()
            ),
        }

        if source_event_code is not None:
            attributes["source_event_code"] = str(
                source_event_code
            )

        events.append(
            create_event(
                execution_id=execution_id,
                mode=mode,
                host=host,
                source_system=source_system,
                evidence_id="EV-08",
                event="account_deleted",
                requirement_id="op.acc.1.4",
                **common_registry_attributes,
                **attributes,
            )
        )

    events.append(
        create_event(
            execution_id=execution_id,
            mode=mode,
            host=host,
            source_system=source_system,
            evidence_id="EV-08",
            event=(
                "account_retention_"
                "registry_checked"
            ),
            requirement_id="op.acc.1.4",
            registry_records=len(
                records
            ),
            confirmed_deletions=(
                confirmed_count
            ),
            unconfirmed_deletions=(
                unconfirmed_count
            ),
            invalid_records=(
                invalid_count
            ),
            confirmed_deletions_reaching_period=(
                period_reached_count
            ),
            confirmed_deletions_before_period=(
                period_not_reached_count
            ),
            **common_registry_attributes,
        )
    )

    return events


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Recolector técnico ENSFácil para op.acc.1. "
            "Evidencias disponibles: EV-01, EV-02, EV-03, EV-04, EV-05, EV-06, EV-07 y EV-08."
        )
    )

    parser.add_argument(
        "--config",
        type=Path,
        default=Path(
            "/etc/ensfacil/op_acc_1.json"
        ),
        help=(
            "Configuración JSON. "
            "Es obligatoria en modo production."
        ),
    )

    parser.add_argument(
        "--mode",
        choices=("test", "production"),
        default="test",
        help=(
            "Modo de ejecución. "
            "El valor predeterminado seguro es test."
        ),
    )

    parser.add_argument(
        "--evidence",
        choices=("EV-01", "EV-02", "EV-03", "EV-04", "EV-05", "EV-06", "EV-07", "EV-08"),
        default="EV-01",
        help="Evidencia que se recogerá.",
    )


    parser.add_argument(
        "--baseline",
        type=Path,
        default=Path(
            "/var/lib/ensfacil/"
            "op_acc_1_ev02_baseline.json"
        ),
        help=(
            "Baseline persistente de EV-02. "
            "En modo test debe estar bajo /tmp."
        ),
    )


    parser.add_argument(
        "--cursor",
        type=Path,
        default=Path(
            "/var/lib/ensfacil/"
            "op_acc_1_ev03_cursor.json"
        ),
        help=(
            "Cursor persistente de EV-03. "
            "En modo test debe estar bajo /tmp."
        ),
    )


    parser.add_argument(
        "--service-cursor",
        type=Path,
        default=Path(
            "/var/lib/ensfacil/"
            "op_acc_1_ev05_cursor.json"
        ),
        help=(
            "Cursor persistente de EV-05. "
            "En modo test debe estar bajo /tmp."
        ),
    )

    parser.add_argument(
        "--execution-id",
        default=None,
        help=(
            "Identificador opcional de ejecución. "
            "Si se omite se genera un UUID."
        ),
    )

    parser.add_argument(
        "--host",
        default=socket.gethostname(),
        help="Hostname técnico asociado al evento.",
    )

    return parser.parse_args()


def main() -> int:
    args = parse_arguments()

    execution_id = (
        args.execution_id
        or str(uuid.uuid4())
    )

    try:
        uuid.UUID(execution_id)
    except ValueError as exc:
        raise CollectorError(
            "execution-id debe tener formato UUID."
        ) from exc

    config = load_config(
        args.config,
        args.mode,
    )

    if args.evidence == "EV-01":
        events = collect_ev01(
            config=config,
            execution_id=execution_id,
            mode=args.mode,
            host=args.host,
        )

    elif args.evidence == "EV-02":
        baseline_path = args.baseline.resolve()

        if (
            args.mode == "test"
            and not str(
                baseline_path
            ).startswith("/tmp/")
        ):
            raise CollectorError(
                "En modo test, el baseline de EV-02 "
                "debe estar situado bajo /tmp."
            )

        events = collect_ev02(
            config=config,
            execution_id=execution_id,
            mode=args.mode,
            host=args.host,
            baseline_path=baseline_path,
        )

    elif args.evidence == "EV-03":
        cursor_path = args.cursor.resolve()

        if (
            args.mode == "test"
            and not cursor_path.is_relative_to(
                Path("/tmp")
            )
        ):
            raise CollectorError(
                "En modo test, el cursor de EV-03 "
                "debe estar situado bajo /tmp."
            )

        auth_paths = [
            Path(value).resolve()
            for value in config[
                "auth_log_paths"
            ]
        ]

        if (
            args.mode == "test"
            and any(
                not auth_path.is_relative_to(
                    Path("/tmp")
                )
                for auth_path in auth_paths
            )
        ):
            raise CollectorError(
                "En modo test, todos los logs de EV-03 "
                "deben estar situados bajo /tmp."
            )

        events = collect_ev03(
            config=config,
            execution_id=execution_id,
            mode=args.mode,
            host=args.host,
            cursor_path=cursor_path,
        )

    elif args.evidence == "EV-04":
        events = collect_ev04(
            config=config,
            execution_id=execution_id,
            mode=args.mode,
            host=args.host,
        )

    elif args.evidence == "EV-05":
        service_cursor_path = (
            args.service_cursor.resolve()
        )

        if (
            args.mode == "test"
            and not service_cursor_path.is_relative_to(
                Path("/tmp")
            )
        ):
            raise CollectorError(
                "En modo test, el cursor de EV-05 "
                "debe estar situado bajo /tmp."
            )

        auth_paths = [
            Path(value).resolve()
            for value in config[
                "auth_log_paths"
            ]
        ]

        if (
            args.mode == "test"
            and any(
                not auth_path.is_relative_to(
                    Path("/tmp")
                )
                for auth_path in auth_paths
            )
        ):
            raise CollectorError(
                "En modo test, todos los logs de EV-05 "
                "deben estar situados bajo /tmp."
            )

        events = collect_ev05(
            config=config,
            execution_id=execution_id,
            mode=args.mode,
            host=args.host,
            cursor_path=service_cursor_path,
        )

    elif args.evidence == "EV-06":
        events = collect_ev06(
            config=config,
            execution_id=execution_id,
            mode=args.mode,
            host=args.host,
        )

    elif args.evidence == "EV-07":
        events = collect_ev07(
            config=config,
            execution_id=execution_id,
            mode=args.mode,
            host=args.host,
        )

    elif args.evidence == "EV-08":
        events = collect_ev08(
            config=config,
            execution_id=execution_id,
            mode=args.mode,
            host=args.host,
        )

    else:
        raise CollectorError(
            f"Evidencia no implementada: {args.evidence}"
        )

    for event in events:
        print(
            json.dumps(
                event,
                ensure_ascii=False,
                separators=(",", ":"),
            )
        )

    print(
        (
            f"[info] control={CONTROL_ID} "
            f"evidence={args.evidence} "
            f"mode={args.mode} "
            f"execution_id={execution_id} "
            f"events={len(events)}"
        ),
        file=sys.stderr,
    )

    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except CollectorError as exc:
        print(
            f"[error] {exc}",
            file=sys.stderr,
        )
        raise SystemExit(2)
