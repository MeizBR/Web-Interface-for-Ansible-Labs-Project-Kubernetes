#!/bin/bash

# Exit immediately if a command exits with a non-zero status.
set -e

# --- 1. System Update and Dependency Installation ---
echo "Updating packages and installing dependencies..."
sudo apt update
sudo apt install -y git unzip curl wget software-properties-common

# --- 2. Install Node.js (LTS) ---
echo "Installing Node.js (LTS)..."
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt install -y nodejs

# Verify Node.js installation
echo "Verifying Node.js installation:"
node -v
npm -v

# --- 3. Install Terraform ---
# WARNING: Check the HashiCorp releases page for the latest stable version
TERRAFORM_VERSION="1.13.5" 
TERRAFORM_ZIP="terraform_${TERRAFORM_VERSION}_linux_amd64.zip"

echo "Downloading Terraform v${TERRAFORM_VERSION}..."
wget -q "https://releases.hashicorp.com/terraform/${TERRAFORM_VERSION}/${TERRAFORM_ZIP}"

echo "Unzipping and installing Terraform..."
unzip "${TERRAFORM_ZIP}"
# The 'install' command moves the file and sets executable permissions
sudo install terraform /usr/local/bin/

# Clean up Terraform files
rm "${TERRAFORM_ZIP}"
rm terraform

# Verify Terraform installation
echo "Verifying Terraform installation:"
which terraform
terraform -v

# --- 4. Install AWS CLI v2 ---
echo "Installing AWS CLI v2..."
curl 'https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip' -o 'awscliv2.zip'
unzip awscliv2.zip
sudo ./aws/install

# Clean up AWS CLI files
rm -rf aws awscliv2.zip

# Verify AWS CLI installation
echo "Verifying AWS CLI installation:"
which aws
aws --version

echo "Script execution complete. All tools installed."