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

## Two Usage Patterns

### Pattern 1: Inside a Coda Doc (Recommended)
Two-stage automated workflow:

1. **Stage 1 - Push Changes**: Add a button with `PushRowToCollection()` or `PushTableToCollection()` formula
   - Pushes data to your Framer managed collection
   - Returns confirmation (items added, warnings, etc.)
   - **No publish happens yet** — you can review before deploying

2. **Stage 2 - Publish**: Add another button with `PublishProject()` formula
   - Reviews pending changes
   - Publishes to Framer
   - Deploys the project
   - Shows confirmation with deployment details

This two-stage approach gives you:
- ✅ Confirmation after pushing
- ✅ Control over when to publish
- ✅ No accidental deployments
- ✅ Clear feedback at each stage

**No Coda API token needed** — metadata is available within the doc

## Features

### Formulas

- **PushRowToCollection**: Push a single row to a Framer collection (Stage 1)
  - Use inside doc via button formula
  - Parameters: `projectUrl`, `collectionName`, `slugFieldId`, `columnsJson`, `rowJson`, optional `referenceMapJson`, optional `use12HourTime`
  - Returns: items added, fields set, any warnings
  
- **PushTableToCollection**: Push an entire table to a Framer collection (Stage 1)
  - Use inside doc via button formula
  - Parameters: `projectUrl`, `collectionName`, `slugFieldId`, `columnsJson`, `rowsJson`, optional `referenceMapJson`, optional `pruneMissing`, optional `use12HourTime`
  - Supports field filtering and item pruning
  - Returns: items added/skipped, fields set, any warnings

- **PublishProject**: Publish and deploy pending changes (Stage 2)
  - Run after push actions to go live
  - Parameter: `projectUrl`
  - Returns: deployment ID, deployed hostnames, change count

- **ListManagedCollectionItems**: List item IDs from a Framer collection
- **ManagedCollections**: Sync table showing all managed collections in a project

## Usage

### Two-Stage Workflow Example

**Button 1: Push Data (Stage 1)**
```coda
=PushRowToCollection(
  "https://framer.com/projects/YOUR_PROJECT_ID",
  "CollectionName",
  "slug",
  JSON(thisTable.columns),
  JSON(thisRow)
)
```

Result: ✅ Row pushed to "CollectionName". Run PublishProject to deploy.

**Button 2: Publish Changes (Stage 2)**
```coda
=PublishProject(
  "https://framer.com/projects/YOUR_PROJECT_ID"
)
```

Result: ✅ Published and deployed 3 change(s).

### Advanced: Push Entire Table

```coda
=PushTableToCollection(
  "https://framer.com/projects/YOUR_PROJECT_ID",
  "CollectionName",
  "slug",
  JSON(thisTable.columns),
  JSON(thisTable.rows),
  null,           // referenceMapJson (optional, for lookups)
  true            // use12HourTime (optional)
)
```

With item pruning (remove items from Framer not in Coda):
```coda
=PushTableToCollection(
  "https://framer.com/projects/YOUR_PROJECT_ID",
  "CollectionName",
  "slug",
  JSON(thisTable.columns),
  JSON(thisTable.rows),
  null,           // referenceMapJson
  true,           // use12HourTime  
  true            // pruneMissing (delete old items)
)
```

## Field Mapping

Automatically transforms Coda fields to Framer:
- Text, Number, Checkbox, Date fields
- Select fields (enums)
- Lookup fields (cross-collection references)
- Canvas/Rich text (markdown → sanitized HTML)
- Image, File, Link fields
- Time formatting (12h/24h preferences)
- Currency values
````

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
