import { generateKeyPairSync } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { chmodSync } from "node:fs";
import { join } from "node:path";

import {
  SCHEMA_VERSION,
  SIGNATURE_ALGORITHM,
  nowIso,
  type AgentIdentity,
  type Role
} from "@coc/contracts";

import { sha256Hex } from "./hash.js";

type KeyRegistry = {
  schema_version: string;
  generated_at: string;
  identities: AgentIdentity[];
};

export type LoadedKeyMaterial = {
  identity: AgentIdentity;
  private_key_pem: string;
  public_key_pem: string;
};

const registryFileName = "registry.json";

export const ensureDir = (path: string): void => {
  mkdirSync(path, { recursive: true });
};

export const ensureKeyDirectory = (cocHome: string): string => {
  const keyDir = join(cocHome, "keys");
  ensureDir(keyDir);
  return keyDir;
};

const registryPath = (cocHome: string): string => join(ensureKeyDirectory(cocHome), registryFileName);

export const loadRegistry = (cocHome: string): KeyRegistry => {
  const filePath = registryPath(cocHome);
  if (!existsSync(filePath)) {
    const seed: KeyRegistry = {
      schema_version: SCHEMA_VERSION,
      generated_at: nowIso(),
      identities: []
    };
    writeFileSync(filePath, JSON.stringify(seed, null, 2), "utf8");
    return seed;
  }

  return JSON.parse(readFileSync(filePath, "utf8")) as KeyRegistry;
};

export const saveRegistry = (cocHome: string, registry: KeyRegistry): void => {
  writeFileSync(registryPath(cocHome), JSON.stringify(registry, null, 2), "utf8");
};

const normalizeAgentId = (agentId: string): string => agentId.trim().toLowerCase();

const keyFileBase = (agentId: string, keyId: string): string => `${agentId}.${keyId}`;

const applyPrivateKeyPermissions = (path: string): void => {
  if (process.platform !== "win32") {
    chmodSync(path, 0o600);
  }
};

const createIdentity = (params: {
  agent_id: string;
  display_name: string;
  role_capabilities: Role[];
  key_id: string;
  public_key: string;
}): AgentIdentity => {
  const createdAt = nowIso();
  return {
    agent_id: params.agent_id,
    display_name: params.display_name,
    role_capabilities: params.role_capabilities,
    key_id: params.key_id,
    public_key: params.public_key,
    key_algorithm: SIGNATURE_ALGORITHM,
    status: "active",
    created_at: createdAt,
    updated_at: createdAt
  };
};

export const ensureAgentKey = (params: {
  cocHome: string;
  agentId: string;
  displayName: string;
  roleCapabilities: Role[];
}): LoadedKeyMaterial => {
  const keyDir = ensureKeyDirectory(params.cocHome);
  const agentId = normalizeAgentId(params.agentId);
  const registry = loadRegistry(params.cocHome);

  const existing = registry.identities.find(
    (identity) => identity.agent_id === agentId && identity.status !== "revoked"
  );

  if (existing) {
    const base = keyFileBase(existing.agent_id, existing.key_id);
    const privatePath = join(keyDir, `${base}.private.pem`);
    const publicPath = join(keyDir, `${base}.public.pem`);
    return {
      identity: existing,
      private_key_pem: readFileSync(privatePath, "utf8"),
      public_key_pem: readFileSync(publicPath, "utf8")
    };
  }

  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
  const keyFingerprint = sha256Hex(Buffer.from(publicKey.export({ type: "spki", format: "der" })));
  const keyId = `key_${keyFingerprint.slice(0, 16)}`;
  const base = keyFileBase(agentId, keyId);
  const privatePath = join(keyDir, `${base}.private.pem`);
  const publicPath = join(keyDir, `${base}.public.pem`);

  writeFileSync(privatePath, privateKeyPem, "utf8");
  applyPrivateKeyPermissions(privatePath);
  writeFileSync(publicPath, publicKeyPem, "utf8");

  const identity = createIdentity({
    agent_id: agentId,
    display_name: params.displayName,
    role_capabilities: params.roleCapabilities,
    key_id: keyId,
    public_key: publicKeyPem
  });
  registry.identities.push(identity);
  saveRegistry(params.cocHome, registry);

  return {
    identity,
    private_key_pem: privateKeyPem,
    public_key_pem: publicKeyPem
  };
};

export const listIdentities = (cocHome: string): AgentIdentity[] => loadRegistry(cocHome).identities;

export const resolveIdentityByKeyId = (
  cocHome: string,
  keyId: string
): AgentIdentity | undefined => loadRegistry(cocHome).identities.find((identity) => identity.key_id === keyId);

export const resolvePublicKeyByKeyId = (
  cocHome: string,
  keyId: string
): string | undefined => resolveIdentityByKeyId(cocHome, keyId)?.public_key;
