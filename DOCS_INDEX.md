# Documentation Index

This file provides a complete map of all documentation in the CollabBoard project.

## Root Documentation

- [`README.md`](README.md) - Main project overview

## Project-Level Documentation

### `/docs/` - Cross-cutting documentation

#### `/docs/bugs/`
- [`OFFLINE_BUG_FIX.md`](docs/bugs/OFFLINE_BUG_FIX.md) - Offline sync bug investigation and fix
- [`OFFLINE_PAGE_REFRESH_EXPLAINED.md`](docs/bugs/OFFLINE_PAGE_REFRESH_EXPLAINED.md) - Page refresh recovery explanation
- [`OFFLINE_SYSTEM.md`](docs/bugs/OFFLINE_SYSTEM.md) - Offline system architecture
- [`TESTING_OFFLINE_SYSTEM.md`](docs/bugs/TESTING_OFFLINE_SYSTEM.md) - Offline testing procedures

#### `/docs/optimizations/`
- [`MULTI_SELECT_PERFORMANCE.md`](docs/optimizations/MULTI_SELECT_PERFORMANCE.md) - Multi-object selection optimization (50x network reduction)
- [`PERFORMANCE_OPTIMIZATION.md`](docs/optimizations/PERFORMANCE_OPTIMIZATION.md) - General performance optimizations
- [`PERFORMANCE_OPTIMIZATIONS_COMPLETE.md`](docs/optimizations/PERFORMANCE_OPTIMIZATIONS_COMPLETE.md) - Completed optimizations summary
- [`SNAPSHOT_OPTIMIZATION.md`](docs/optimizations/SNAPSHOT_OPTIMIZATION.md) - Board snapshot optimization

#### `/docs/prompts/`
- [`RESIZE_ANCHOR_ISSUE_PROMPT.md`](docs/prompts/RESIZE_ANCHOR_ISSUE_PROMPT.md) - Resize anchor issue investigation

---

## App-Specific Documentation

### Web App: `/apps/web/docs/`

#### `/apps/web/docs/` (Root)
- [`Whiteboard_MVP_PRD.md`](apps/web/docs/Whiteboard_MVP_PRD.md) - Product Requirements Document
- [`README.md`](apps/web/README.md) - Web app overview

#### `/apps/web/docs/setup/`
- [`SUPABASE_SETUP.md`](apps/web/docs/setup/SUPABASE_SETUP.md) - Supabase configuration guide

#### `/apps/web/docs/guides/`
- [`QUICK_START.md`](apps/web/docs/guides/QUICK_START.md) - Quick start guide
- [`USER_FLOW.md`](apps/web/docs/guides/USER_FLOW.md) - User flow documentation
- [`REALTIME_PRESENCE_GUIDE.md`](apps/web/docs/guides/REALTIME_PRESENCE_GUIDE.md) - Real-time presence implementation

#### `/apps/web/docs/deployment/`
- [`DEPLOYMENT.md`](apps/web/docs/deployment/DEPLOYMENT.md) - General deployment guide
- [`DEPLOY_STEPS.md`](apps/web/docs/deployment/DEPLOY_STEPS.md) - Step-by-step deployment
- [`DEPLOY_TO_VERCEL.md`](apps/web/docs/deployment/DEPLOY_TO_VERCEL.md) - Vercel deployment instructions
- [`RAILWAY_DEPLOYMENT.md`](apps/web/docs/deployment/RAILWAY_DEPLOYMENT.md) - Railway deployment
- [`RAILWAY_PORT_SETUP.md`](apps/web/docs/deployment/RAILWAY_PORT_SETUP.md) - Railway port configuration
- [`RAILWAY_PERFORMANCE_ANALYSIS.md`](apps/web/docs/deployment/RAILWAY_PERFORMANCE_ANALYSIS.md) - Performance analysis

#### `/apps/web/docs/optimizations/`
- [`CURSOR_SYNC_OPTIMIZATIONS.md`](apps/web/docs/optimizations/CURSOR_SYNC_OPTIMIZATIONS.md) - Cursor sync optimization
- [`SERVER_OPTIMIZATIONS.md`](apps/web/docs/optimizations/SERVER_OPTIMIZATIONS.md) - Server-side optimizations

#### `/apps/web/docs/components/`
- [`AI_ASSISTANT_README.md`](apps/web/docs/components/AI_ASSISTANT_README.md) - AI Assistant component guide

#### `/apps/web/docs/prompts-and-decisions/`
- [`IMPLEMENTATION_PROMPT.md`](apps/web/docs/prompts-and-decisions/IMPLEMENTATION_PROMPT.md) - Implementation decisions
- [`SUPABASE_SETUP_PROMPT.md`](apps/web/docs/prompts-and-decisions/SUPABASE_SETUP_PROMPT.md) - Supabase setup decisions
- [`CURSOR_DEPLOYMENT_DECISION.md`](apps/web/docs/prompts-and-decisions/CURSOR_DEPLOYMENT_DECISION.md) - Cursor server deployment

#### `/apps/web/docs/refactoring/`
- [`REFACTORING_PLAN.md`](apps/web/docs/refactoring/REFACTORING_PLAN.md) - Refactoring plan
- [`MIGRATION_GUIDE.md`](apps/web/docs/refactoring/MIGRATION_GUIDE.md) - Migration guide
- [`MIGRATION_STATUS.md`](apps/web/docs/refactoring/MIGRATION_STATUS.md) - Migration status
- [`MIGRATION_COMPLETE.md`](apps/web/docs/refactoring/MIGRATION_COMPLETE.md) - Migration completion
- [`CURRENT_STATUS.md`](apps/web/docs/refactoring/CURRENT_STATUS.md) - Current refactoring status
- [`PHASE1_PROGRESS.md`](apps/web/docs/refactoring/PHASE1_PROGRESS.md) - Phase 1 progress
- [`PHASE1_COMPLETE.md`](apps/web/docs/refactoring/PHASE1_COMPLETE.md) - Phase 1 completion
- [`TEST_RESULTS.md`](apps/web/docs/refactoring/TEST_RESULTS.md) - Refactoring test results

#### `/apps/web/docs/testing/`
- [`TEST_RESULTS.md`](apps/web/docs/testing/TEST_RESULTS.md) - Test results

#### `/apps/web/tests/e2e/`
- [`MULTI_USER_TESTING.md`](apps/web/tests/e2e/MULTI_USER_TESTING.md) - E2E multi-user test guide

---

### Hocuspocus Server: `/apps/server/`
- [`README.md`](apps/server/README.md) - Hocuspocus server documentation

---

### Cursor Sync Server: `/apps/cursor-server/docs/`
- [`README.md`](apps/cursor-server/README.md) - Cursor sync server overview
- [`SETUP_GUIDE.md`](apps/cursor-server/docs/SETUP_GUIDE.md) - Setup instructions
- [`DEPLOY.md`](apps/cursor-server/docs/DEPLOY.md) - Deployment guide
- [`DEPLOY_NOW.md`](apps/cursor-server/docs/DEPLOY_NOW.md) - Quick deploy instructions
- [`RAILWAY_QUICK_DEPLOY.md`](apps/cursor-server/docs/RAILWAY_QUICK_DEPLOY.md) - Railway quick deploy

---

## Documentation Organization Principles

1. **Root `/docs/`**: Cross-cutting concerns (optimizations, bugs, prompts)
2. **App-specific `/apps/*/docs/`**: App-specific documentation
3. **Test docs**: Located near tests (`/apps/web/tests/e2e/`)
4. **Component docs**: Located in components folder or `/apps/web/docs/components/`
5. **README.md**: Always at app root for quick overview

## Security Note

All documentation has been scanned for exposed credentials. No hardcoded API keys, tokens, or secrets were found. All credential references are placeholders or truncated examples.

## Adding New Documentation

When creating new documentation:
1. **Optimizations**: Add to `/docs/optimizations/` or `/apps/web/docs/optimizations/`
2. **Bugs/Issues**: Add to `/docs/bugs/`
3. **Deployment**: Add to `/apps/web/docs/deployment/`
4. **Guides**: Add to `/apps/web/docs/guides/`
5. **Prompts**: Add to `/docs/prompts/` or `/apps/web/docs/prompts-and-decisions/`
6. **Never expose**: API keys, secrets, tokens, or passwords
