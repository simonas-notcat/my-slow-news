# My Slow News - Web Explorer

A web-based interface for exploring your My Slow News knowledge graph. Built with React, TypeScript, and Vite.

## Overview

The My Slow News Web Explorer is a client-side React application that provides an interactive UI for browsing claims, filtering by subject/predicate/date, and recording your stances on claims. It connects directly to SurrealDB via WebSocket for real-time data access.

### Architecture

- **Frontend**: React + TypeScript + Vite + Tailwind CSS
- **Database**: Direct WebSocket connection to SurrealDB
- **Deployment**: Static hosting on Vercel
- **State Management**: React Context API
- **Styling**: Tailwind CSS with custom components

## Quick Start (Local Development)

### Prerequisites

- Node.js 20 LTS
- npm or yarn
- Running SurrealDB instance (local or cloud)
- Initialized database schema (see [Schema Initialization](#schema-initialization))

### Installation

```bash
# From the web/ directory
npm install
```

### Running Locally

```bash
# Development server with hot reload
npm run dev

# The app will be available at http://localhost:5173
```

### Building for Production

```bash
# Create production build
npm run build

# Preview production build locally
npm run preview
```

## SurrealDB Cloud Setup

The free tier of SurrealDB Cloud is perfect for personal use of My Slow News.

### Create a SurrealDB Cloud Instance

1. **Sign up** at https://surrealdb.com/cloud
2. **Create a new instance**:
   - Select **Free Plan** (1GB storage limit)
   - Choose a region close to your location
   - Wait for provisioning (usually 1-2 minutes)
3. **Save your connection details**:
   - **URL**: `wss://[your-instance].surreal.cloud/rpc`
   - **Namespace**: `myslownews` (recommended)
   - **Database**: `main` (recommended)
   - **Username**: Your root username (from instance creation)
   - **Password**: Your root password (from instance creation)

### Free Tier Limits

- **Storage**: 1GB (read-only mode after limit reached)
- **WebSocket Connections**: ✅ Fully supported
- **Estimated Capacity**: ~50,000-100,000 claims
- **Upgrade Path**: Start tier available at $0.02/hour

## Schema Initialization

Before using the web app, you must initialize the database schema. You have two options:

### Option 1: Via CLI (Recommended)

From the **root project directory** (not web/):

```bash
# Install main project dependencies (if not already done)
npm install

# Set up your .env file with database credentials
cp .env.example .env
# Edit .env and add your SURREALDB_USERNAME, SURREALDB_PASSWORD, DATABASE_URL

# Initialize the schema
npm run db:init
```

If using a cloud instance, set the `DATABASE_URL` environment variable:

```bash
export DATABASE_URL=wss://your-instance.surreal.cloud/rpc
npm run db:init
```

### Option 2: Via SurrealDB Studio

1. Open https://studio.surrealdb.com
2. Connect to your instance
3. Copy and run the schema SQL from `../src/db/schema.ts`
4. Run the migrations from `../src/db/migrations/`

## Deployment to Vercel

### Option 1: Automated Deployment (GitHub Actions)

The repository includes a GitHub Actions workflow that automatically deploys to Vercel when you push to the `main` branch.

#### Setup

1. **Create a Vercel Project**:
   - Go to https://vercel.com/new
   - Import your GitHub repository
   - Set the **Root Directory** to `web`
   - Vercel will auto-detect the Vite framework

2. **Get Vercel Credentials**:
   - Install Vercel CLI: `npm install -g vercel`
   - Run `vercel link` in the web/ directory
   - Note down the values from `.vercel/project.json`:
     - `projectId` → `VERCEL_PROJECT_ID`
     - `orgId` → `VERCEL_ORG_ID`
   - Get your token from https://vercel.com/account/tokens → `VERCEL_TOKEN`

3. **Add GitHub Secrets**:
   - Go to your GitHub repository → Settings → Secrets and variables → Actions
   - Add three secrets:
     - `VERCEL_TOKEN` - Your Vercel API token
     - `VERCEL_ORG_ID` - Your organization ID
     - `VERCEL_PROJECT_ID` - Your project ID

4. **Deploy**:
   - Push to `main` branch
   - GitHub Actions will automatically build and deploy
   - Check the "Actions" tab for deployment status

### Option 2: Manual Deployment (Vercel CLI)

```bash
# From the web/ directory

# Install Vercel CLI globally (if not already installed)
npm install -g vercel

# Deploy to preview
vercel

# Deploy to production
vercel --prod
```

### Option 3: Vercel Dashboard (One-Click)

1. Go to https://vercel.com/new
2. Import your GitHub repository
3. Configure:
   - **Root Directory**: `web`
   - **Framework Preset**: Vite (auto-detected)
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
4. Click **Deploy**

## Environment Variables (Optional)

The web app doesn't require environment variables for deployment since database credentials are entered via the connection dialog. However, you can optionally pre-configure a default connection:

### Vercel Environment Variables

Add these in the Vercel dashboard (Settings → Environment Variables):

```bash
# Optional: Pre-fill database connection dialog
VITE_DEFAULT_DB_URL=wss://your-instance.surreal.cloud/rpc
VITE_DEFAULT_NAMESPACE=myslownews
VITE_DEFAULT_DATABASE=main
```

**Note**: Do NOT store credentials in environment variables for client-side apps. Users will enter credentials via the connection dialog.

## Using the Web App

### First-Time Setup

1. Open the deployed app
2. Click **Connect to Database**
3. Enter your SurrealDB credentials:
   - URL: `wss://your-instance.surreal.cloud/rpc`
   - Username: Your database username
   - Password: Your database password
   - Namespace: `myslownews`
   - Database: `main`
4. Click **Connect**

The connection details are saved in your browser's localStorage for future visits.

### Features

- **Claims List**: Browse all extracted claims
- **Filtering**:
  - By subject (search)
  - By predicate (dropdown)
  - By date range (last N days)
  - By your stance
- **Claim Details**: View full claim information and community sentiment
- **Stance Recording**: Record your agreement/disagreement with claims
- **Pagination**: Navigate large datasets efficiently

## Security Considerations

### Client-Side Architecture Tradeoffs

⚠️ **Important**: The current architecture uses a **direct client-side WebSocket connection** to SurrealDB. This means:

- Database credentials are stored in browser localStorage
- Credentials are transmitted directly from the browser to SurrealDB
- No API rate limiting or server-side validation

### Recommended Security Practices

1. **Use Database-Level Users** (not root credentials):
   ```sql
   -- Create a read-only user for public access
   DEFINE USER viewer ON DATABASE PASSWORD 'secure-password' ROLES VIEWER;
   ```

2. **SurrealDB Security Features**:
   - Enable authentication on your instance
   - Use namespace/database-level users instead of root
   - Configure CORS to allow only your Vercel domain

3. **Production Alternative**: For production use with sensitive data, consider adding a backend API layer:
   - Next.js API routes (deployed on Vercel)
   - Express.js backend (separate deployment)
   - Server-side database connection (credentials hidden)
   - Client → API → Database architecture

### CORS Configuration

SurrealDB Cloud automatically handles CORS. For self-hosted instances, ensure your SurrealDB server allows requests from your Vercel domain:

```bash
# When starting SurrealDB, allow your domain
surreal start --bind 0.0.0.0:8666 --user root --pass root --allow-all
```

## Troubleshooting

### Connection Errors

**Symptom**: "Failed to connect to database"

**Solutions**:
1. Verify your SurrealDB instance is running
2. Check the WebSocket URL format: `wss://` (not `https://`)
3. Ensure credentials are correct
4. Check that namespace/database exist
5. Verify CORS settings (for self-hosted instances)

### CORS Errors

**Symptom**: "CORS policy: No 'Access-Control-Allow-Origin' header"

**Solutions**:
1. SurrealDB Cloud: Should work automatically
2. Self-hosted: Add CORS headers or use `--allow-all` flag
3. Check that you're using `wss://` protocol

### Migration Failures

**Symptom**: "Failed to initialize database schema"

**Solutions**:
1. Ensure you have write permissions to the database
2. Run `npm run db:init` from the root project directory (not web/)
3. Check that `.env` file has correct credentials
4. Verify `DATABASE_URL` environment variable if using cloud

### Empty Claims List

**Symptom**: App loads but shows no claims

**Solutions**:
1. Run the digest generator: `npm run digest` (from root directory)
2. Verify database connection in the web app
3. Check that claims exist: Use SurrealDB Studio to query `SELECT * FROM claim`

### Build Errors

**Symptom**: `npm run build` fails

**Solutions**:
1. Delete `node_modules` and `package-lock.json`, then `npm install`
2. Ensure Node.js 20 LTS is installed
3. Run `npm run typecheck` to identify TypeScript errors
4. Check for missing dependencies

## Development

### Project Structure

```
web/
├── src/
│   ├── main.tsx              # Entry point
│   ├── App.tsx               # Root component
│   ├── components/           # Reusable UI components
│   │   ├── Header.tsx
│   │   ├── FilterBar.tsx
│   │   ├── ClaimsList.tsx
│   │   ├── ClaimDetail.tsx
│   │   ├── ConnectionDialog.tsx
│   │   └── QuickStanceModal.tsx
│   ├── context/              # React Context providers
│   │   ├── AppContext.tsx    # App state management
│   │   └── DatabaseContext.tsx # SurrealDB connection
│   ├── hooks/                # Custom React hooks
│   │   ├── useClaims.ts
│   │   ├── useClaimDetail.ts
│   │   └── usePredicates.ts
│   ├── utils/                # Utility functions
│   │   ├── queries.ts        # SurrealQL query builders
│   │   ├── formatters.ts     # Data formatting
│   │   └── stanceOperations.ts # Stance CRUD operations
│   └── types.ts              # TypeScript types
├── public/                   # Static assets
├── index.html                # HTML template
├── vite.config.ts            # Vite configuration
├── tailwind.config.js        # Tailwind CSS config
├── vercel.json               # Vercel deployment config
└── package.json              # Dependencies and scripts
```

### Available Scripts

```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run preview      # Preview production build
npm run typecheck    # Run TypeScript type checking
npm run test         # Run Vitest tests
npm run test:ci      # Run tests in CI mode
```

### Testing

```bash
# Run tests with watch mode
npm run test

# Run tests once (CI mode)
npm run test:ci

# Type check without running tests
npm run typecheck
```

## Comparison: Web App vs CLI Explorer

| Feature | Web App | CLI Explorer |
|---------|---------|--------------|
| **Interface** | React UI in browser | Terminal-based (Ink) |
| **Database Connection** | User-provided via dialog | Config file + env vars |
| **Deployment** | Vercel static hosting | Local installation only |
| **Filtering** | Mouse + keyboard | Keyboard only |
| **Navigation** | Click + scroll | Arrow keys |
| **Best For** | Visual exploration, sharing | Fast local access, automation |

## Next Steps

After deploying the web app:

1. **Generate Your First Digest**:
   ```bash
   cd ../  # Go to root directory
   npm run digest
   ```

2. **Explore Claims**: Open your deployed app and browse the knowledge graph

3. **Record Stances**: Click on claims and record your opinions

4. **Set Up Automation**: Configure the GitHub Actions workflow for automatic deployments

## Resources

- [SurrealDB Cloud](https://surrealdb.com/cloud)
- [SurrealDB Documentation](https://surrealdb.com/docs)
- [Vercel Documentation](https://vercel.com/docs)
- [Vite Documentation](https://vitejs.dev/guide/)
- [Main Project README](../README.md)

## License

See [LICENSE](../LICENSE) in the root directory.
