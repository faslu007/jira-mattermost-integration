FROM node:18-alpine

# Define build argument for root password
ARG ROOT_PASSWORD
RUN if [ -z "$ROOT_PASSWORD" ] ; then echo "Root password not set" && exit 1; fi

# Set root password from build argument
RUN echo "root:${ROOT_PASSWORD}" | chpasswd

WORKDIR /app

# Install basic tools (optional but useful)
RUN apk add --no-cache \
    bash \
    curl \
    openssh

COPY package*.json ./
RUN npm install

COPY . .

CMD ["npm", "start"]