# Power ENS

[Versión en español](README.es.md)

Power ENS is the Wazuh dashboard plugin of OSCompliance ENS, for the Spanish National Security Framework (ENS, Real Decreto 311/2022). It holds the policy parameters of each control and shows compliance per control and machine.

It judges nothing. Every result is a verdict of the OSCompliance engine, read from the `oscompliance-verdicts` index, so the plugin needs [oscompliance-ens](https://github.com/arseniteio/oscompliance-ens) to show results.

It runs on Wazuh 4.14.7, 4.14.8 and 4.14.9. The screens are in Spanish.

## Install

Download the release and install the zip of your dashboard on the Wazuh server: `osd-2.19.5` for Wazuh 4.14.7, `osd-2.19.6` for 4.14.8 and 4.14.9. The complete procedure, with the engine and the agent, is the [quick install of OSCompliance ENS](https://github.com/arseniteio/oscompliance-ens#quick-install).

```bash
gh release download v1.0.0 -R arseniteio/power-ens
sudo bash deploy-plugin.sh power-ens-1.0.0-osd-2.19.6.zip
```

## Documentation

- [Installation](docs/en/install.md): build the zip, install it, grant access, upgrade and remove it.
- [Usage](docs/en/usage.md): what each screen shows and how to configure a control.

## Build and test

Build the zip for the OpenSearch Dashboards version of your Wazuh: 2.19.5 for 4.14.7, 2.19.6 for 4.14.8 and 4.14.9.

```bash
ci/build-zip.sh 2.19.6
```

Run the tests.

```bash
ci/run-tests.sh
```

## License

Copyright (c) 2026 Arsenite.

Power ENS is licensed under the GNU Affero General Public License version 3 (AGPL-3.0-only). See [LICENSE](LICENSE).

Arsenite also offers Power ENS under a commercial license, for organisations that cannot meet the obligations of the AGPL, such as keeping changes private in a product or a network service. Contact devqs@quersystem.com for terms.
