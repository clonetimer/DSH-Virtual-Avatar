/**
 * Build the DSH Web/Desktop classic-script client artifact.
 *
 * DSH 0.2.2-rc.1 injects /plugins/.../client.js using a classic <script>,
 * then requires window.__ModuleLoader__.load({ id, factory }).
 * Shipping raw ESM imports makes the complete Web boot fail on Windows.
 *
 * Keep React/ReactDOM as shell-owned module-table externals. Do not embed a
 * second React runtime or evaluate plugin UI code before materialization.
 */
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { Script } from 'node:vm'

const sourceURL = new URL('../src/client/companion.mjs', import.meta.url)
const outputURL = new URL('../lib/client.js', import.meta.url)
const source = readFileSync(sourceURL, 'utf8')
const header = [
  "import React, { useCallback, useEffect, useState } from 'react'",
  "import { createRoot } from 'react-dom/client'",
  '',
].join('\n')
assert.ok(source.startsWith(header), 'unexpected imports in the companion source')

const body = source.slice(header.length)
  .replace(/^export const name =/m, 'const name =')
  .replace(/^export const inject =/m, 'const inject =')
  .replace(/^export function apply\\(/m, 'function apply(')

assert.ok(body.includes("const name = 'dsh-virtual-avatar-client'"), 'missing client plugin name')
assert.ok(body.includes("const inject = ['slots']"), 'missing client slot injection')
assert.ok(body.includes('function apply(ctx)'), 'missing client apply')
assert.ok(!/^(?:import|export)\\s/m.test(body), 'client contains unsupported ESM declarations')

const output = [
  '// Generated from src/client/companion.mjs. Do not edit by hand.',
  '// DSH 0.2.2-rc.1 loads browser plugin scripts as classic scripts.',
  'window.__ModuleLoader__.load({',
  "  id: 'dsh-virtual-avatar',",
  '  factory(require) {',
  "    'use strict'",
  "    const reactNamespace = require('react')",
  '    const React = reactNamespace.default ?? reactNamespace',
  '    const { useCallback, useEffect, useState } = React',
  "    const { createRoot } = require('react-dom/client')",
  body,
  '    return { name, inject, apply }',
  '  },',
  '});',
  '',
].join('\n')

// A successful Node ESM parse is NOT sufficient: the DSH loader uses classic
// script syntax. Check that contract as part of every package build.
new Script(output, { filename: 'lib/client.js' })
writeFileSync(outputURL, output)
console.log('Built DSH classic client module:', output.length, 'bytes')
