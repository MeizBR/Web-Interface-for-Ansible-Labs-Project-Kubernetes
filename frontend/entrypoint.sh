#!/bin/sh

# Generate env.js dynamically from environment variables
cat <<EOF > /usr/share/nginx/html/env.js
window._env_ = {
  REACT_APP_ANSIBLE_LAB_URL: "${REACT_APP_ANSIBLE_LAB_URL}"
};
EOF

# Start NGINX
exec nginx -g "daemon off;"
