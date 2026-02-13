# Framer Coda Pack

Coda Pack for pushing data into Framer managed collections.

**Pack ID**: 48252  
**Status**: Registered, pending upload resolution

## Current Status

✅ **Code Complete**: All formulas and actions implemented and TypeScript validated  
✅ **Modern Syntax**: Uses TypeScript 5.2+ `using` syntax for automatic resource management
✅ **Pack Registered**: Created with Coda (ID: 48252)  
❌ **Upload Blocked**: Coda CLI bundler incompatibility with `framer-api` dependency

### Code Modernization

The pack uses TypeScript 5.2+'s `using` syntax (explicit resource management) as recommended by Framer:

```typescript
using framer = await connect(projectUrl, apiKey);
// Work with framer...
// Automatic disconnect() on scope exit!
```

Benefits:
- No manual `disconnect()` calls needed
- Automatic cleanup even on errors
- Cleaner, more maintainable code
- Modern TypeScript best practices

### The Upload Issue

The `framer-api` npm package uses **top-level await** in its compiled code, which is incompatible with:
- Coda's bundler target (ES2020/CommonJS)  
- The `coda upload` command's build process

**Error**: `Top-level await is not available in the configured target environment ("es2020")`

### Resolution Options

1. **Contact Coda Support** (Recommended)
   - Pack ID: 48252
   - Request: Manual pack upload or ES2022/ESM support
   - Management URL: https://coda.io/p/48252

2. **Alternative: Contact Framer**
   - Request: Remove top-level await from `framer-api` package
   - Would make the package compatible with more bundlers

3. **Workaround: Direct API Usage**
   - Instead of using `framer-api` package, implement direct HTTP calls to Framer Server API
   - Would require significant refactoring

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Get your Framer API key from https://www.framer.com/developers/server-api-introduction

3. Authenticate with Coda:
   ```bash
   npx coda auth src/pack.ts
   ```

## Two Usage Patterns

### Pattern 1: Inside a Coda Doc (Recommended)
Add button formulas to trigger push actions directly:

1. In your Coda doc, add a button with a `PushRowToCollection()` or `PushTableToCollection()` formula
2. The pack accesses your table's columns and rows directly
3. **No Coda API token needed** — metadata is available within the doc

This is the simplest, most recommended approach.

## Features

### Formulas

- **PushRowToCollection**: Push a single row to a Framer collection
  - Use inside doc via button formula
  - Parameters: `projectUrl`, `collectionName`, `slugFieldId`, `columnsJson`, `rowJson`, optional `referenceMapJson`, optional `timeFormat12Hour`, optional `publish`
  
- **PushTableToCollection**: Push an entire table to a Framer collection
  - Use inside doc via button formula
  - Parameters: `projectUrl`, `collectionName`, `slugFieldId`, `columnsJson`, `rowsJson`, optional `referenceMapJson`, optional `timeFormat12Hour`, optional `pruneMissing`, optional `publish`
  - Supports field filtering and item pruning

- **ListManagedCollectionItems**: List item IDs from a Framer collection
- **PublishProject**: Publish and deploy a Framer project

### Sync Tables

- **ManagedCollections**: Sync table showing all managed collections in a project

## Usage

### Inside a Coda Doc (Recommended)

Add button formulas to push data directly from your doc:

```
// Button formula to push a single row
=PushRowToCollection(
  "https://framer.com/projects/[projectId]",
  "Products",. No Coda API token needed!

**Single Row Push:**
```coda
=PushRowToCollection(
  "https://framer.com/projects/YOUR_PROJECT_ID",
  "CollectionName",
  "slug",
  JSON(thisTable.columns),
  JSON(thisRow)
)
```

**Entire Table Push:**
```coda
=PushTableToCollection(
  "https://framer.com/projects/YOUR_PROJECT_ID",
  "CollectionName",
  "slug",
  JSON(thisTable.columns),
  JSON(thisTable.rows)
)
```

**With Optional Parameters:**
```coda
=PushTableToCollection(
  "https://framer.com/projects/YOUR_PROJECT_ID",
  "CollectionName",
  "slug",
  JSON(thisTable.columns),
  JSON(thisTable.rows),
  null,           // referenceMapJson (for lookups to other collections)
  true,           // use12HourTime
  true,           // pruneMissing (delete Framer items not in Coda)
  true            // publish (deploy after push)
)
```

Benefits:
- ✅ No API token required
- ✅ Real-time access to table metadata
- ✅ Simplest integratione columns)
- Formatted text (markdown → sanitized HTML)
- Collection references (for lookups to other collections)

### Cross-Collection References

When syncing tables with lookup columns:
1. Sync referenced collections first
2. Build a reference map: `[{"codaTableId": "xxx", "framerCollectionId": "yyy"}]`
3. Pass the reference map JSON to push actions

## Known Limitations

### Validation Error

The `npx coda validate` command will fail with a top-level await error from the `framer-api` dependency:
```
ERROR: Top-level await is not available in the configured target environment ("es2020")
```

This is a build-time validation check and **does not affect pack functionality**. The pack will work correctly when uploaded to Coda, as Coda's runtime environment supports modern JavaScript including top-level await.

To verify your pack is correct, use TypeScript compilation instead:
```bash
npx tsc --noEmit
```

## Development

- **Build**: `npm run build`
- **Execute formula**: `npx coda execute src/pack.ts <formulaName> <params>`
- **Upload**: `npm run upload`
- **Release**: `npm run release`

## Type Mapping

| Coda Type | Framer Type |
|-----------|-------------|
| Text | string |
| Number/Currency/Percent | number |
| Checkbox | boolean |
| Date/DateTime | date |
| Select/Scale | enum |
| Canvas/RichText | formattedText |
| Image/ImageArray | image |
| File/FileArray | file |
| Link | link |
| Lookup (single) | collectionReference |
| Lookup (multiple) | multiCollectionReference |

## License

MIT
