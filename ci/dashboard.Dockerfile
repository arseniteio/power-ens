ARG WAZUH_VERSION
FROM wazuh/wazuh-dashboard:${WAZUH_VERSION}
ARG PLUGIN_ZIP
COPY --chown=wazuh-dashboard:wazuh-dashboard ${PLUGIN_ZIP} /tmp/power-ens.zip
RUN /usr/share/wazuh-dashboard/bin/opensearch-dashboards-plugin install file:///tmp/power-ens.zip \
 && rm /tmp/power-ens.zip
USER root
# A new build number makes browsers drop the bundles cached for the previous plugin.
RUN python3 -c "import json,time; f='/usr/share/wazuh-dashboard/package.json'; p=json.load(open(f)); p['build']['number']=str(int(p['build']['number'])+int(time.time())//60%1000000); json.dump(p,open(f,'w'),indent=2)"
USER wazuh-dashboard
