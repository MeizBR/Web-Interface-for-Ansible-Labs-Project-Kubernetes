#!/bin/bash

# --- VARIABLES (UPDATE THESE VALUES) ---
# NOTE: Using environment variables is the most secure method for CI/CD,
# but for a manual script, you must replace the empty strings below.
AWS_ACCESS_KEY="YOUR_AWS_ACCESS_KEY_HERE"
AWS_SECRET_KEY="YOUR_AWS_SECRET_KEY_HERE"

# Ensure script exits if any critical command fails
set -e

# --- 1. Configure AWS credentials for the 'ubuntu' user ---

echo "Creating .aws directory and credentials file for ubuntu user..."

# Create the .aws directory and set ownership to 'ubuntu'
mkdir -p /home/ubuntu/.aws
chown -R ubuntu:ubuntu /home/ubuntu/.aws

# Use 'sudo -u ubuntu' to write content as the 'ubuntu' user
# This is crucial for permissions and avoiding issues with 'sudo echo' redirecting as root
sudo -u ubuntu bash -c "
  # Create the file with the [default] profile header
  echo '[default]' > /home/ubuntu/.aws/credentials
  
  # Append the Access Key ID
  echo 'aws_access_key_id = ${AWS_ACCESS_KEY}' >> /home/ubuntu/.aws/credentials
  
  # Append the Secret Access Key
  echo 'aws_secret_access_key = ${AWS_SECRET_KEY}' >> /home/ubuntu/.aws/credentials
  
  # Set permissions so only the owner (ubuntu) can read/write the file
  chmod 600 /home/ubuntu/.aws/credentials
"

echo "AWS credentials configured successfully."

# --- 2. Generate SSH key pairs for the 'ubuntu' user ---

echo "Generating SSH key pairs in /home/ubuntu/.ssh/id_rsa..."

# Use 'sudo -u ubuntu' to run ssh-keygen as the 'ubuntu' user
# -t rsa: Key type
# -b 4096: Key size (best practice)
# -N '': Empty passphrase (no password prompt)
# -f: Output filename
sudo -u ubuntu ssh-keygen -t rsa -b 4096 -N '' -f /home/ubuntu/.ssh/id_rsa

echo "SSH key pair generated successfully."

# Copy the Github repositories links to a file
echo "git@github.com:MeizBR/Ansible-labs-with-Terraform.git" >> /home/ubuntu/repo_links.txt
echo "git@github.com:billchurch/webssh2.git" >> /home/ubuntu/repo_links.txt