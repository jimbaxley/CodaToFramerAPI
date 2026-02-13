import * as coda from "@codahq/packs-sdk";
import { connect, type ManagedCollectionFieldInput } from "framer-api";
import {
  buildFieldsAndItems,
  buildReferenceMap,
  mergeFieldsWithExistingFields,
  normalizeColumns,
  normalizeRows,
  type CodaColumnInput,
  type ReferenceMapEntry,
} from "./mapping";

export const pack = coda.newPack();

pack.addNetworkDomain("framer.com");
pack.addNetworkDomain("coda.io");

pack.setUserAuthentication({
  type: coda.AuthenticationType.HeaderBearerToken,
  instructionsUrl: "https://www.framer.com/developers/server-api-introduction",
});

type AuthContext = coda.ExecutionContext & {
  authentication?: {
    accessToken?: string;
  };
};

function getApiKey(context: coda.ExecutionContext): string {
  const apiKey = (context as AuthContext).authentication?.accessToken;
  if (!apiKey) {
    throw new coda.UserVisibleError(
      "Connect your Framer account to provide an API key for this Pack.",
    );
  }
  return apiKey;
}

function parseJsonParam<T>(raw: string, label: string): T {
  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    throw new coda.UserVisibleError(
      `Invalid ${label} JSON: ${message}. Please provide valid JSON.`,
    );
  }
}

function parseJsonArray<T>(raw: string, label: string): T[] {
  const value = parseJsonParam<unknown>(raw, label);
  if (!Array.isArray(value)) {
    throw new coda.UserVisibleError(`${label} must be a JSON array.`);
  }
  return value as T[];
}

async function getOrCreateManagedCollection(
  projectUrl: string,
  apiKey: string,
  collectionName: string,
): Promise<{ collectionId: string; collectionName: string; created: boolean }> {
  using framer = await connect(projectUrl, apiKey);
  const collections = await framer.getManagedCollections();
  const existing = collections.find((item) => item.name === collectionName);
  if (existing) {
    return {
      collectionId: existing.id,
      collectionName: existing.name,
      created: false,
    };
  }
  const created = await framer.createManagedCollection(collectionName);
  return {
    collectionId: created.id,
    collectionName: created.name,
    created: true,
  };
}

async function setCollectionFields(
  projectUrl: string,
  apiKey: string,
  collectionId: string,
  fields: ManagedCollectionFieldInput[],
): Promise<number> {
  using framer = await connect(projectUrl, apiKey);
  const collections = await framer.getManagedCollections();
  const collection = collections.find((item) => item.id === collectionId);
  if (!collection) {
    throw new coda.UserVisibleError("Managed collection not found.");
  }

  const compatibleFields = fields
    .map((field) => {
      if (
        field.type === "multiCollectionReference" &&
        (!("collectionId" in field) || typeof field.collectionId !== "string")
      ) {
        return null;
      }
      return field;
    })
    .filter((field): field is typeof fields[number] => Boolean(field));

  await collection.setFields(compatibleFields);
  return compatibleFields.length;
}

async function publishIfRequested(
  projectUrl: string,
  apiKey: string,
  publish?: boolean,
): Promise<{ published: boolean; deploymentId?: string; changeCount?: number } | null> {
  if (!publish) return null;
  using framer = await connect(projectUrl, apiKey);
  const changedPaths = await framer.getChangedPaths();
  const changeCount =
    (changedPaths.added?.length ?? 0) +
    (changedPaths.removed?.length ?? 0) +
    (changedPaths.modified?.length ?? 0);
  if (changeCount === 0) {
    return { published: false, changeCount };
  }
  const publishResult = await framer.publish();
  await framer.deploy(publishResult.deployment.id);
  return {
    published: true,
    deploymentId: publishResult.deployment.id,
    changeCount,
  };
}

const ManagedCollectionSchema = coda.makeObjectSchema({
  properties: {
    id: { type: coda.ValueType.String, description: "Collection id." },
    name: { type: coda.ValueType.String, description: "Collection name." },
    managedBy: { type: coda.ValueType.String, description: "Manager type." },
  },
  displayProperty: "name",
  idProperty: "id",
  featuredProperties: ["id", "name", "managedBy"],
});

const PublishResultSchema = coda.makeObjectSchema({
  properties: {
    published: { type: coda.ValueType.Boolean, description: "Publish ran." },
    changeCount: { type: coda.ValueType.Number, description: "Total changes." },
    deploymentId: {
      type: coda.ValueType.String,
      description: "Deployment id if published.",
    },
    hostnames: {
      type: coda.ValueType.Array,
      items: { type: coda.ValueType.String },
      description: "Custom domains deployed.",
    },
    message: { type: coda.ValueType.String, description: "Status message." },
  },
  featuredProperties: ["published", "changeCount", "deploymentId", "message"],
});

const PushResultSchema = coda.makeObjectSchema({
  properties: {
    collectionId: {
      type: coda.ValueType.String,
      description: "Framer collection id.",
    },
    collectionName: {
      type: coda.ValueType.String,
      description: "Framer collection name.",
    },
    itemsAdded: {
      type: coda.ValueType.Number,
      description: "Number of items written.",
    },
    itemsSkipped: {
      type: coda.ValueType.Number,
      description: "Number of items skipped.",
    },
    fieldsSet: {
      type: coda.ValueType.Number,
      description: "Number of fields set on the collection.",
    },
    warnings: {
      type: coda.ValueType.Array,
      items: { type: coda.ValueType.String },
      description: "Mapping warnings.",
    },
    published: {
      type: coda.ValueType.Boolean,
      description: "Whether publish was triggered.",
    },
    deploymentId: {
      type: coda.ValueType.String,
      description: "Deployment id if published.",
    },
    message: { type: coda.ValueType.String, description: "Status message." },
  },
  featuredProperties: [
    "collectionName",
    "itemsAdded",
    "itemsSkipped",
    "fieldsSet",
    "published",
    "message",
  ],
});

pack.addSyncTable({
  name: "ManagedCollections",
  description: "List managed collections for a Framer project.",
  identityName: "ManagedCollection",
  schema: ManagedCollectionSchema,
  formula: {
    name: "SyncManagedCollections",
    description: "Sync managed collections from a Framer project.",
    parameters: [
      coda.makeParameter({
        type: coda.ParameterType.String,
        name: "projectUrl",
        description: "Framer project URL.",
      }),
    ],
    execute: async ([projectUrl], context) => {
      const apiKey = getApiKey(context);
      using framer = await connect(projectUrl, apiKey);
      const collections = await framer.getManagedCollections();

      return {
        result: collections.map((collection) => ({
          id: collection.id,
          name: collection.name,
          managedBy: collection.managedBy,
        })),
      };
    },
  },
});

pack.addFormula({
  name: "ListManagedCollectionItems",
  description: "List items in a managed collection by id.",
  parameters: [
    coda.makeParameter({
      type: coda.ParameterType.String,
      name: "projectUrl",
      description: "Framer project URL.",
    }),
    coda.makeParameter({
      type: coda.ParameterType.String,
      name: "collectionId",
      description: "Managed collection id.",
    }),
  ],
  resultType: coda.ValueType.Array,
  items: { type: coda.ValueType.String },
  execute: async ([projectUrl, collectionId], context) => {
    const apiKey = getApiKey(context);
    using framer = await connect(projectUrl, apiKey);
    const collections = await framer.getManagedCollections();
    const collection = collections.find((item) => item.id === collectionId);
    if (!collection) {
      throw new coda.UserVisibleError("Managed collection not found.");
    }

    return await collection.getItemIds();
  },
});

pack.addFormula({
  name: "PublishProject",
  description: "Publish and deploy pending changes to a Framer project. Run this after PushRowToCollection or PushTableToCollection.",
  isAction: true,
  parameters: [
    coda.makeParameter({
      type: coda.ParameterType.String,
      name: "projectUrl",
      description: "Framer project URL.",
    }),
  ],
  resultType: coda.ValueType.Object,
  schema: PublishResultSchema,
  execute: async ([projectUrl], context) => {
    const apiKey = getApiKey(context);
    using framer = await connect(projectUrl, apiKey);
    const changedPaths = await framer.getChangedPaths();
    const changeCount =
      (changedPaths.added?.length ?? 0) +
      (changedPaths.removed?.length ?? 0) +
      (changedPaths.modified?.length ?? 0);

    if (changeCount === 0) {
      return {
        published: false,
        changeCount,
        deploymentId: "",
        hostnames: [],
        message: "No pending changes. Run PushRowToCollection or PushTableToCollection first.",
      };
    }

    const publishResult = await framer.publish();
    await framer.deploy(publishResult.deployment.id);

    return {
      published: true,
      changeCount,
      deploymentId: publishResult.deployment.id,
      hostnames: publishResult.hostnames.map((hostname) => hostname.hostname),
      message: `✅ Published and deployed ${changeCount} change(s).`,
    };
  },
});

pack.addFormula({
  name: "PushRowToCollection",
  description: "Push a single row into a Framer managed collection.",
  isAction: true,
  parameters: [
    coda.makeParameter({
      type: coda.ParameterType.String,
      name: "projectUrl",
      description: "Framer project URL.",
    }),
    coda.makeParameter({
      type: coda.ParameterType.String,
      name: "collectionName",
      description: "Managed collection name (created if missing).",
    }),
    coda.makeParameter({
      type: coda.ParameterType.String,
      name: "slugFieldId",
      description: "Coda column id to use as the slug.",
    }),
    coda.makeParameter({
      type: coda.ParameterType.String,
      name: "columnsJson",
      description: "JSON array of Coda column metadata.",
    }),
    coda.makeParameter({
      type: coda.ParameterType.String,
      name: "rowJson",
      description: "JSON object for the row (with id and values).",
    }),
    coda.makeParameter({
      type: coda.ParameterType.String,
      name: "referenceMapJson",
      description:
        "Optional JSON array mapping lookup table ids to Framer collection ids.",
      optional: true,
    }),
    coda.makeParameter({
      type: coda.ParameterType.Boolean,
      name: "use12HourTime",
      description: "Format time values as 12-hour strings.",
      optional: true,
    }),
  ],
  resultType: coda.ValueType.Object,
  schema: PushResultSchema,
  execute: async (
    [
      projectUrl,
      collectionName,
      slugFieldId,
      columnsJson,
      rowJson,
      referenceMapJson,
      use12HourTime,
    ],
    context,
  ) => {
    const apiKey = getApiKey(context);
    const columns = normalizeColumns(
      parseJsonArray<CodaColumnInput>(columnsJson, "columns"),
    );
    const rowInput = parseJsonParam<unknown>(rowJson, "row");
    const rows = normalizeRows([rowInput]);
    const referenceMap = buildReferenceMap(
      referenceMapJson
        ? parseJsonArray<ReferenceMapEntry>(referenceMapJson, "referenceMap")
        : undefined,
    );

    const collection = await getOrCreateManagedCollection(
      projectUrl,
      apiKey,
      collectionName,
    );

    const mapping = buildFieldsAndItems({
      columns,
      rows,
      slugFieldId,
      referenceMap,
      use12HourTime: Boolean(use12HourTime),
    });

    using framer1 = await connect(projectUrl, apiKey);
    const collections1 = await framer1.getManagedCollections();
    const target1 = collections1.find(
      (item) => item.id === collection.collectionId,
    );
    if (!target1) {
      throw new coda.UserVisibleError("Managed collection not found.");
    }
    const existingFields = await target1.getFields();

    const mergedFields = mergeFieldsWithExistingFields(
      mapping.fields,
      existingFields,
    );
    const fieldsSet = await setCollectionFields(
      projectUrl,
      apiKey,
      collection.collectionId,
      mergedFields,
    );

    using framer2 = await connect(projectUrl, apiKey);
    const collections2 = await framer2.getManagedCollections();
    const target2 = collections2.find(
      (item) => item.id === collection.collectionId,
    );
    if (!target2) {
      throw new coda.UserVisibleError("Managed collection not found.");
    }
    if (mapping.items.length > 0) {
      await target2.addItems(mapping.items);
    }

    return {
      collectionId: collection.collectionId,
      collectionName: collection.collectionName,
      itemsAdded: mapping.items.length,
      itemsSkipped: mapping.skippedCount,
      fieldsSet,
      warnings: mapping.warnings,
      published: false,
      deploymentId: "",
      message: collection.created
        ? `✅ Collection created and row pushed to "${collection.collectionName}". Run PublishProject to deploy.`
        : `✅ Row pushed to "${collection.collectionName}". Run PublishProject to deploy.`,
    };
  },
});

pack.addFormula({
  name: "PushTableToCollection",
  description: "Push multiple rows into a Framer managed collection.",
  isAction: true,
  parameters: [
    coda.makeParameter({
      type: coda.ParameterType.String,
      name: "projectUrl",
      description: "Framer project URL.",
    }),
    coda.makeParameter({
      type: coda.ParameterType.String,
      name: "collectionName",
      description: "Managed collection name (created if missing).",
    }),
    coda.makeParameter({
      type: coda.ParameterType.String,
      name: "slugFieldId",
      description: "Coda column id to use as the slug.",
    }),
    coda.makeParameter({
      type: coda.ParameterType.String,
      name: "columnsJson",
      description: "JSON array of Coda column metadata.",
    }),
    coda.makeParameter({
      type: coda.ParameterType.String,
      name: "rowsJson",
      description: "JSON array of rows (each with id and values).",
    }),
    coda.makeParameter({
      type: coda.ParameterType.String,
      name: "referenceMapJson",
      description:
        "Optional JSON array mapping lookup table ids to Framer collection ids.",
      optional: true,
    }),
    coda.makeParameter({
      type: coda.ParameterType.Boolean,
      name: "pruneMissing",
      description: "Remove items not included in the payload.",
      optional: true,
    }),
    coda.makeParameter({
      type: coda.ParameterType.Boolean,
      name: "use12HourTime",
      description: "Format time values as 12-hour strings.",
      optional: true,
    }),
  ],
  resultType: coda.ValueType.Object,
  schema: PushResultSchema,
  execute: async (
    [
      projectUrl,
      collectionName,
      slugFieldId,
      columnsJson,
      rowsJson,
      referenceMapJson,
      pruneMissing,
      use12HourTime,
    ],
    context,
  ) => {
    const apiKey = getApiKey(context);
    const columns = normalizeColumns(
      parseJsonArray<CodaColumnInput>(columnsJson, "columns"),
    );
    const rowInput = parseJsonArray<unknown>(rowsJson, "rows");
    const rows = normalizeRows(rowInput);
    const referenceMap = buildReferenceMap(
      referenceMapJson
        ? parseJsonArray<ReferenceMapEntry>(referenceMapJson, "referenceMap")
        : undefined,
    );

    const collection = await getOrCreateManagedCollection(
      projectUrl,
      apiKey,
      collectionName,
    );

    const mapping = buildFieldsAndItems({
      columns,
      rows,
      slugFieldId,
      referenceMap,
      use12HourTime: Boolean(use12HourTime),
    });

    using framer1 = await connect(projectUrl, apiKey);
    const collections1 = await framer1.getManagedCollections();
    const target1 = collections1.find(
      (item) => item.id === collection.collectionId,
    );
    if (!target1) {
      throw new coda.UserVisibleError("Managed collection not found.");
    }
    const existingFields = await target1.getFields();

    const mergedFields = mergeFieldsWithExistingFields(
      mapping.fields,
      existingFields,
    );
    const fieldsSet = await setCollectionFields(
      projectUrl,
      apiKey,
      collection.collectionId,
      mergedFields,
    );

    using framer2 = await connect(projectUrl, apiKey);
    const collections2 = await framer2.getManagedCollections();
    const target2 = collections2.find(
      (item) => item.id === collection.collectionId,
    );
    if (!target2) {
      throw new coda.UserVisibleError("Managed collection not found.");
    }
    if (pruneMissing) {
      const existingIds = new Set(await target2.getItemIds());
      const incomingIds = new Set(
        mapping.items.map((item) => item.id).filter(Boolean),
      );
      const toRemove = Array.from(existingIds).filter(
        (id) => !incomingIds.has(id),
      );
      if (toRemove.length > 0) {
        await target2.removeItems(toRemove);
      }
    }
    if (mapping.items.length > 0) {
      await target2.addItems(mapping.items);
    }

    return {
      collectionId: collection.collectionId,
      collectionName: collection.collectionName,
      itemsAdded: mapping.items.length,
      itemsSkipped: mapping.skippedCount,
      fieldsSet,
      warnings: mapping.warnings,
      published: false,
      deploymentId: "",
      message: collection.created
        ? `✅ Collection created and ${mapping.items.length} row(s) pushed to "${collection.collectionName}". Run PublishProject to deploy.`
        : `✅ ${mapping.items.length} row(s) pushed to "${collection.collectionName}". Run PublishProject to deploy.`,
    };
  },
});
