# Instalación

Esta página cubre solo el plugin. La instalación completa, con las reglas, el motor y el agente, está en la [guía de oscompliance-ens](https://github.com/arseniteio/oscompliance-ens/blob/main/docs/es/install.md).

## Requisitos

- Wazuh 4.14.7, 4.14.8 o 4.14.9.
- Docker en la máquina donde se compila el zip, con acceso a GitHub y Docker Hub. Puede ser cualquier máquina.
- `unzip` en el servidor del dashboard, en una instalación por paquetes, y `curl` y `python3` en el host del indexer para dar acceso.

## Compilar el zip

Consulta la versión de OpenSearch Dashboards de tu dashboard. Es 2.19.5 en Wazuh 4.14.7 y 2.19.6 en 4.14.8 y 4.14.9.

```bash
grep -m1 '"version"' /usr/share/wazuh-dashboard/package.json
```

Compila el zip para esa versión en este repositorio. La primera compilación de cada versión crea una imagen de compilación y tarda unos 20 minutos. El resultado es `dist/powerEns-<versión>.zip`. Un zip solo funciona en la versión para la que se compiló.

```bash
ci/build-zip.sh 2.19.6
```

La versión v1.0.0 incluye los dos zips, `power-ens-1.0.0-osd-2.19.5.zip` y `power-ens-1.0.0-osd-2.19.6.zip`, con los scripts y `ci/dashboard.Dockerfile`. Descárgalos en lugar de compilar con `gh release download v1.0.0 -R arseniteio/power-ens`.

## Instalar por paquetes

Copia el zip y `config/deploy-plugin.sh` al servidor del dashboard y ejecuta esto como root. El script valida el zip, guarda una copia de la versión anterior en `/var/backups/power-ens`, instala el plugin y reinicia el dashboard. Si un paso falla, se detiene e indica cómo volver atrás.

```bash
bash deploy-plugin.sh powerEns-2.19.6.zip
```

## Instalar en Docker

El plugin va en una imagen propia, porque lo que se instala en un contenedor en marcha se pierde al recrearlo. Copia el zip y `ci/dashboard.Dockerfile` al host de Docker e indica tu versión de Wazuh.

```bash
docker build -f dashboard.Dockerfile --build-arg WAZUH_VERSION=4.14.8 \
  --build-arg PLUGIN_ZIP=powerEns-2.19.6.zip -t power-ens/wazuh-dashboard:local .
```

La imagen se indica en `docker-compose.override.yml`, junto a tu `docker-compose.yml`, sin tocar este. La instalación completa copia ese fichero desde el paquete de oscompliance-ens. Con el fichero en su sitio, recrea el servicio desde la carpeta del compose.

```bash
docker compose up -d wazuh.dashboard
```

## Dar acceso

Quien tenga acceso al dashboard puede ver Power ENS. Para cambiar la configuración hace falta el rol `power_ens_admin` o `all_access`. En el host del indexer, este script crea el rol y se lo asigna a un usuario.

```bash
bash config/create-admin-role.sh --map <usuario_del_dashboard>
```

Lee los certificados de administrador del indexer de `/etc/wazuh-indexer/certs`. Usa `OS_CERT`, `OS_KEY`, `OS_CA` y `OS_URL` para otras ubicaciones, `OS_RESOLVE` cuando el certificado del indexer lleva otro nombre (en Docker, `wazuh.indexer:9200:127.0.0.1`), y `--dry-run` para ver lo que haría. Añade el usuario y mantiene a los que ya tienen el rol.

## Actualizar

Compila el zip desde el commit que quieras e instálalo de la misma forma. El script sustituye la versión anterior y guarda su copia. En Docker, guarda la imagen actual con `docker tag power-ens/wazuh-dashboard:local power-ens/wazuh-dashboard:previous`, construye la nueva con la etiqueta `local` y recrea el servicio. Si después el navegador muestra una página en blanco, cierra la pestaña y vuelve a entrar.

## Retirar

Por paquetes:

```bash
sudo -u wazuh-dashboard /usr/share/wazuh-dashboard/bin/opensearch-dashboards-plugin remove powerEns
systemctl restart wazuh-dashboard
```

En Docker, quita el servicio `wazuh.dashboard` de `docker-compose.override.yml` y ejecuta `docker compose up -d wazuh.dashboard`.

La configuración se queda en el índice `wazuh-ens-configuration`, y una instalación posterior la encuentra.
