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

# Expose port
EXPOSE 80

# Start NGINX
CMD ["nginx", "-g", "daemon off;"]