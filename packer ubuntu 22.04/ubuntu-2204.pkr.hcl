packer {
  required_plugins {
    virtualbox = {
      source = "github.com/hashicorp/virtualbox"
      version = "~> 1"
    }

    amazon = {
      source  = "github.com/hashicorp/amazon"
      version = "~> 1"
    }
  }
}

# ===== VirtualBox Builder =====
source "virtualbox-iso" "ubuntu-2204" {
  iso_url           = "https://releases.ubuntu.com/22.04/ubuntu-22.04.5-live-server-amd64.iso"
  iso_checksum      = "sha256:9bc6028870aef3f74f4e16b900008179e78b130e6b0b9a140635434a46aa98b0"

  guest_os_type     = "Ubuntu_64"
  ssh_username      = "ubuntu"
  ssh_password      = "ubuntu"
  ssh_wait_timeout  = "25m"

  headless          = true

  disk_size         = 20000
  memory            = 2048
  cpus              = 2

  http_directory    = "http"

  boot_command = [
    "<tab> autoinstall ds=nocloud-net;s=http://{{ .HTTPIP }}:{{ .HTTPPort }}/ --- <enter>"
  ]

  boot_wait = "5s"

  shutdown_command = "echo 'ubuntu' | sudo -S shutdown -P now"
}

# ===== AWS EC2 Builder =====
source "amazon-ebs" "ubuntu-2204-aws" {
  region             = "eu-west-3"
  instance_type      = "t3.micro"
  ssh_username       = "ubuntu"
  ami_name           = "ans-labs-with-tf-ubuntu-ec2"
  source_ami_filter {
    filters = {
      "name"                = "ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*"
      "virtualization-type" = "hvm"
      "root-device-type"    = "ebs"
    }
    most_recent = true
    owners      = ["099720109477"]
  }
  ssh_wait_timeout    = "20m"
  ami_virtualization_type = "hvm"
  associate_public_ip_address = true
  tags = {
    Name        = "Ubuntu 22.04 Base AMI"
    Environment = "Development"
  }
}

build {
  sources = ["source.virtualbox-iso.ubuntu-2204", "source.amazon-ebs.ubuntu-2204-aws"]

  provisioner "shell" {
    scripts = [
        "install-tools.sh",
        "configure-access.sh"
    ]
  }
}