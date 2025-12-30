FROM node:20-alpine AS base
WORKDIR /app

# Install dependencies
FROM base AS install
COPY package.json package-lock.json ./
RUN npm ci --only=production

# Development dependencies (for tsx)
FROM base AS install-dev
COPY package.json package-lock.json ./
RUN npm ci

# Production stage
FROM base AS release
COPY --from=install-dev /app/node_modules node_modules
COPY src src
COPY package.json .
COPY tsconfig.json .

# Create digests directory
RUN mkdir -p /app/digests

# Default command
CMD ["npm", "run", "digest"]
