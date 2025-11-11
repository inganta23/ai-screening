# -------------------------------------------------------------------------
# STAGE 1: Builder - Installs dependencies and handles slow native compilation
# -------------------------------------------------------------------------
FROM node:lts-slim AS builder

# Install build tools only in this stage
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    build-essential \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

# Only copy manifest files first
COPY package.json package-lock.json ./

# Use npm ci with production only to reduce size
RUN npm ci --only=production && npm cache clean --force

# -------------------------------------------------------------------------
# STAGE 2: Runner - Creates the final, lightweight image
# -------------------------------------------------------------------------
FROM node:lts-slim 

WORKDIR /usr/src/app

# Copy only production node_modules
COPY --from=builder /usr/src/app/node_modules ./node_modules

# Copy the rest of the application code
COPY . .

EXPOSE 3000

CMD ["npm", "run", "dev"]