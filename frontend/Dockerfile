# Stage 1: Build the React application
FROM node:20.19-alpine as build

# Create a directory and go to the directory
WORKDIR /app

# Copy the package.json file to my current directory to install the necessary dependence  
COPY . .

# Install the dependencies & build the app
RUN npm install && npm run build

# Stage 2: Serve the application with NGINX
FROM nginx:latest as deploy

# Set the working directory
WORKDIR /usr/share/nginx/html

# Copy the build output from the first stage
COPY --from=build /app/build .

# Copy NGINX configuration
COPY --from=build /app/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/nginx/cors.conf /etc/nginx/cors.conf
COPY --from=build /app/nginx/nginx.conf /etc/nginx/nginx.conf

# ----------------------------------------------------
# ✔ ADD: create entrypoint script to inject env.js
# ----------------------------------------------------
COPY --from=build /app/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Expose port
EXPOSE 80

# ----------------------------------------------------
# ✔ ADD: run entrypoint BEFORE nginx
# ----------------------------------------------------
CMD ["/entrypoint.sh"]