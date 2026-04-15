FROM node:20-alpine AS base
RUN apk add --no-cache tmux git python3 make g++ zsh

RUN npm i -g pnpm

WORKDIR /app

# Install dependencies
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Copy source and build
COPY . .
RUN pnpm build

# Configure tmux for scroll support
RUN mkdir -p /root && printf '\nset -g mouse on\nset -g history-limit 50000\nset -g default-terminal "xterm-256color"\n' > /root/.tmux.conf

EXPOSE 3011

CMD ["pnpm", "start"]
