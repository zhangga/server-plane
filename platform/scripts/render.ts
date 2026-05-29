#!/usr/bin/env tsx
import { resolve } from 'node:path';
import { Command } from 'commander';
import { COMPOSE_PROJECT_PREFIX, DEFAULT_IMAGE_TAG } from '../src/config.js';
import { EnvironmentExistsError, renderEnvironment } from '../src/compose/render.js';
import { SlotOutOfRangeError } from '../src/compose/slotConfig.js';

const program = new Command();

program
  .name('render')
  .description('Render a docker-compose environment for the given PST slot')
  .requiredOption('--name <name>', 'environment name (kebab-case, becomes compose project pst-<name>)')
  .requiredOption('--slot <number>', 'slot index 1..15', (value) => Number.parseInt(value, 10))
  .option('--image-tag <tag>', 'image tag for all 5 PST services', DEFAULT_IMAGE_TAG)
  .option('--runtime-root <path>', 'where to write runtime/<name>/', resolve(process.cwd(), 'runtime'))
  .option(
    '--template-root <path>',
    'directory containing external_config/ seed templates',
    resolve(process.cwd(), 'templates'),
  );

program.parse();

const opts = program.opts<{
  name: string;
  slot: number;
  imageTag: string;
  runtimeRoot: string;
  templateRoot: string;
}>();

try {
  const result = await renderEnvironment({
    name: opts.name,
    slot: opts.slot,
    imageTag: opts.imageTag,
    runtimeRoot: resolve(opts.runtimeRoot),
    templateRoot: resolve(opts.templateRoot),
  });
  console.log(`rendered: ${result.composeFile}`);
  console.log(
    `to start: docker compose -p ${COMPOSE_PROJECT_PREFIX}${opts.name} -f ${result.composeFile} up -d`,
  );
} catch (err) {
  if (err instanceof SlotOutOfRangeError) {
    console.error(`error: ${err.message}`);
    process.exit(2);
  }

  if (err instanceof EnvironmentExistsError) {
    console.error(`error: environment directory already exists: ${err.path}`);
    process.exit(3);
  }

  throw err;
}
