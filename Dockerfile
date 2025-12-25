FROM oven/bun:1 AS base
WORKDIR /app

# Install dependencies
FROM base AS install
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile || bun install

# Build stage
FROM base AS build
COPY --from=install /app/node_modules node_modules
COPY . .

# Production stage
FROM base AS release
COPY --from=install /app/node_modules node_modules
COPY --from=build /app/src src
COPY --from=build /app/package.json .
COPY --from=build /app/tsconfig.json .

# Create digests directory
RUN mkdir -p /app/digests

# Default command
CMD ["bun", "run", "digest"]
