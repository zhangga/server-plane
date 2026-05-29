import { cp, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render as renderEjs } from 'ejs';
import {
  DEFAULT_IMAGE_TAG,
  ETCD_PASSWORD,
  MONGO_PASSWORD,
  MONGO_USERNAME,
  REDIS_PASSWORD,
} from '../config.js';
import { computeSlotConfig, type SlotConfig } from './slotConfig.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_PATH = resolve(__dirname, 'template.yml.ejs');

export class EnvironmentExistsError extends Error {
  constructor(public readonly path: string) {
    super(`Environment directory already exists: ${path}`);
    this.name = 'EnvironmentExistsError';
  }
}

export interface RenderOptions {
  name: string;
  slot: number;
  imageTag?: string;
  runtimeRoot: string;
  templateRoot: string;
}

export interface RenderResult {
  envDir: string;
  composeFile: string;
}

interface TemplateData extends SlotConfig {
  imageTag: string;
  redisPassword: string;
  mongoUsername: string;
  mongoPassword: string;
  etcdPassword: string;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return false;
    }
    throw err;
  }
}

function createTemplateData(slotConfig: SlotConfig, imageTag: string): TemplateData {
  return {
    ...slotConfig,
    imageTag,
    redisPassword: REDIS_PASSWORD,
    mongoUsername: MONGO_USERNAME,
    mongoPassword: MONGO_PASSWORD,
    etcdPassword: ETCD_PASSWORD,
  };
}

async function renderExternalConfig(
  srcRoot: string,
  dstRoot: string,
  data: TemplateData,
  currentSrc = srcRoot,
): Promise<void> {
  const entries = await readdir(currentSrc, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = join(currentSrc, entry.name);
    const relativePath = relative(srcRoot, srcPath);
    const outputRelativePath = relativePath.endsWith('.ejs')
      ? relativePath.slice(0, -'.ejs'.length)
      : relativePath;
    const dstPath = join(dstRoot, outputRelativePath);

    if (entry.isDirectory()) {
      await mkdir(dstPath, { recursive: true });
      await renderExternalConfig(srcRoot, dstRoot, data, srcPath);
      continue;
    }

    await mkdir(dirname(dstPath), { recursive: true });

    if (entry.isFile() && entry.name.endsWith('.ejs')) {
      const template = await readFile(srcPath, 'utf8');
      await writeFile(dstPath, renderEjs(template, data), 'utf8');
      continue;
    }

    await cp(srcPath, dstPath);
  }
}

export async function renderEnvironment(opts: RenderOptions): Promise<RenderResult> {
  const imageTag = opts.imageTag ?? DEFAULT_IMAGE_TAG;
  const slotConfig = computeSlotConfig(opts.slot);
  const data = createTemplateData(slotConfig, imageTag);
  const envDir = join(opts.runtimeRoot, opts.name);

  if (await pathExists(envDir)) {
    throw new EnvironmentExistsError(envDir);
  }

  await mkdir(envDir, { recursive: true });

  const template = await readFile(TEMPLATE_PATH, 'utf8');
  const composeFile = join(envDir, 'docker-compose.yml');
  await writeFile(composeFile, renderEjs(template, data), 'utf8');

  await renderExternalConfig(
    join(opts.templateRoot, 'external_config'),
    join(envDir, 'external_config'),
    data,
  );

  return { envDir, composeFile };
}
