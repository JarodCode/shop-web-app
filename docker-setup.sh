#!/bin/bash

echo "Docker MySQL Setup Script"
echo "=============================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo -e "${RED}Docker is not installed. Installing Docker...${NC}"
    sudo apt update
    sudo apt install -y docker.io
    sudo systemctl start docker
    sudo systemctl enable docker
fi

# Check if MySQL container exists
if [ "$(sudo docker ps -aq -f name=mysql-auth)" ]; then
    echo -e "${YELLOW}MySQL container already exists.${NC}"
    
    # Check if it's running
    if [ "$(sudo docker ps -q -f name=mysql-auth)" ]; then
        echo -e "${GREEN}MySQL container is running.${NC}"
    else
        echo -e "${YELLOW}Starting existing MySQL container...${NC}"
        sudo docker start mysql-auth
    fi
else
    echo -e "${YELLOW}Creating new MySQL container...${NC}"
    sudo docker run --name mysql-auth \
      -e MYSQL_ROOT_PASSWORD=mypassword \
      -e MYSQL_DATABASE=auth_db \
      -e MYSQL_USER=auth_user \
      -e MYSQL_PASSWORD=auth_password \
      -p 3306:3306 \
      -d mysql:8.0
    
    echo -e "${YELLOW}Waiting for MySQL to start...${NC}"
    sleep 10
fi

# Test connection
echo -e "${YELLOW}Testing MySQL connection...${NC}"
if sudo docker exec mysql-auth mysqladmin ping -h localhost --silent; then
    echo -e "${GREEN} MySQL is running and accessible!${NC}"
    echo ""
    echo "Connection details:"
    echo "  Host: 127.0.0.1"
    echo "  Port: 3306" 
    echo "  Database: auth_db"
    echo "  Root Password: mypassword"
    echo ""
    echo "Container management:"
    echo "  Start: sudo docker start mysql-auth"
    echo "  Stop:  sudo docker stop mysql-auth"
    echo "  Logs:  sudo docker logs mysql-auth"
else
    echo -e "${RED} MySQL connection failed${NC}"
    echo "Check container logs: sudo docker logs mysql-auth"
fi