#!/bin/sh
cp /etc/alertmanager/alertmanager.yml /tmp/alertmanager-config.yml
for var in SMTP_USERNAME SMTP_PASSWORD SMTP_FROM SMTP_TO; do
  eval val=\$$var
  val_escaped=$(echo "$val" | sed 's|[&/\]|\\&|g')
  sed -i "s|\${$var}|$val_escaped|g" /tmp/alertmanager-config.yml
done
exec /bin/alertmanager --config.file=/tmp/alertmanager-config.yml --storage.path=/alertmanager
