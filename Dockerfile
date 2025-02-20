FROM --platform=linux/amd64 node:18.17.1-alpine

WORKDIR /app

# Install basic tools (optional but useful)
RUN apk add --no-cache \
    bash \
    curl 

COPY package*.json ./
RUN npm install

COPY . .

CMD ["npm", "start"]