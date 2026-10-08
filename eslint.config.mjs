// ESLint for WebTools: correctness rules only, no formatting rules.
//
// The tools are plain browser scripts. A page's <script> tags share one global scope, so a function
// defined in one file is called from another file, an inline <script> or an on…="" handler. ESLint
// lints one file at a time, so this config reads every HTML page, finds the scripts it loads and
// gives each of them (and the page's inline scripts) the globals declared by the page's scripts.

import js from '@eslint/js'
import html from 'eslint-plugin-html'
import globals from 'globals'
import * as espree from 'espree'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

const root = import.meta.dirname

// Globals of libraries that are minified or loaded from a CDN, keyed by a fragment of the script
// src. These files are not read.
const LIBRARY_GLOBALS = {
  'plotly': ['Plotly'],
  'popper': ['Popper'],
  'tippy': ['tippy'],
  'leaflet': ['L'],
  'turf': ['turf'],
  'gridstack': ['GridStack'],
  'monaco-editor': ['monaco', 'require'],
  'pyodide': ['loadPyodide'],
  'hls.js': ['Hls'],
  'mediabunny': ['Mediabunny'],
  'formio': ['Formio'],
  'tabulator': ['Tabulator'],
  'luxon': ['luxon'],
  'matrix.umd': ['mlMatrix'],
  'fft.js/': ['FFTJS'],
  'marked': ['marked'],
  'dompurify': ['DOMPurify'],
  'osmtogeojson': ['osmtogeojson']
}

// Scripts that publish their globals at run time from inside a function, so cannot be read statically.
const RUNTIME_GLOBALS = {
  // `for (const key of Object.keys(api)) global[key] = api[key]`
  'AirspeedFit/airspeedfit_core.js': [
    'SSL_AIR_DENSITY', 'ISA_GAS_CONSTANT', 'ISA_LAPSE_RATE', 'DEFAULT_Q_WIND', 'isa_temperature_at_alt_c',
    'air_temperature_c', 'eas2tas', 'density_altitude_m', 'auto_window', 'refine', 'calibrate',
    'wind_smoother', 'calibrate_combined', 'course_spread_deg'
  ],
  'modules/MAVLink/mavparam.js': ['MAVParam', 'MAVParamDefinitions'], // Object.assign(root, {…})
  'modules/MAVLink/mavparam-ui.js': ['MAVParamUI'] // root.MAVParamUI = …
}

// Scripts that also run under Node and use CommonJS behind a `typeof module` check.
const DUAL_SCRIPTS = ['AirspeedFit/airspeedfit_core.js', 'SimpleGCS/commands.js']

const libraryGlobals = (src) => LIBRARY_GLOBALS[Object.keys(LIBRARY_GLOBALS).find((key) => src.toLowerCase().includes(key))]

function htmlPages(dir) {
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (['.git', 'node_modules', 'modules', 'backup'].includes(entry.name)) continue
    const path = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...htmlPages(path))
    else if (entry.name.endsWith('.html')) out.push(path)
  }
  return out
}

// Globals an ES module gets from `import 'https://…/library.js'` side-effect imports.
function moduleImportGlobals(source) {
  let ast
  try {
    ast = espree.parse(source, { ecmaVersion: 'latest', sourceType: 'module' })
  } catch {
    return []
  }
  return ast.body
    .filter((node) => node.type === 'ImportDeclaration' && node.specifiers.length === 0)
    .flatMap((node) => libraryGlobals(node.source.value) ?? [])
}

// Names a classic script adds to the page's global scope.
function scriptGlobals(source) {
  let ast
  try {
    ast = espree.parse(source, { ecmaVersion: 'latest', sourceType: 'script' })
  } catch {
    return []
  }
  const names = []
  for (const node of ast.body) {
    if (node.type === 'FunctionDeclaration' || node.type === 'ClassDeclaration') names.push(node.id.name)
    if (node.type === 'VariableDeclaration') {
      for (const d of node.declarations) if (d.id.type === 'Identifier') names.push(d.id.name)
    }
    // A top-level `name = value` without a declaration creates a global.
    if (node.type === 'ExpressionStatement' && node.expression.type === 'AssignmentExpression' &&
        node.expression.left.type === 'Identifier') {
      names.push(node.expression.left.name)
    }
  }
  // Scripts wrapped in a function publish globals as `window.name = …`.
  for (const [, name] of source.matchAll(/\bwindow\.([A-Za-z_$][\w$]*)\s*=[^=]/g)) names.push(name)
  // Libraries loaded with `import('https://…')` add their globals when they arrive.
  for (const [, , src] of source.matchAll(/\bimport\(\s*(["'])(https?:\/\/[^"']+)\1\s*\)/g)) {
    names.push(...(libraryGlobals(src) ?? []))
  }
  return names
}

const scriptTags = (text) => [...text.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)].map(([, attrs, body]) => ({
  src: attrs.match(/\bsrc=(["'])(.+?)\1/)?.[2],
  module: /\btype=(["'])module\1/.test(attrs),
  body
}))

const pages = htmlPages(root).map((path) => {
  const scripts = []
  const modules = []
  const names = []
  for (const tag of scriptTags(readFileSync(path, 'utf8'))) {
    if (tag.module) {
      // ES modules see the page globals but do not add to them.
      if (tag.src !== undefined && !/^(https?:)?\/\//.test(tag.src)) {
        const file = resolve(dirname(path), tag.src.split('?')[0])
        if (existsSync(file)) modules.push(relative(root, file))
      }
      continue
    }
    if (tag.src === undefined) {
      names.push(...scriptGlobals(tag.body))
      continue
    }
    const remote = /^(https?:)?\/\//.test(tag.src)
    if (remote || /(^|\/)modules\//.test(tag.src)) {
      const library = libraryGlobals(tag.src)
      if (library) {
        names.push(...library)
        continue
      }
    }
    if (remote) continue
    const file = resolve(dirname(path), tag.src.split('?')[0])
    if (!existsSync(file)) continue
    const rel = relative(root, file)
    scripts.push(rel)
    names.push(...scriptGlobals(readFileSync(file, 'utf8')), ...(RUNTIME_GLOBALS[rel] ?? []))
  }
  return { page: relative(root, path), scripts, modules, names }
})

export default [
  {
    ignores: [
      'modules/**', // submodules and vendored libraries
      'backup/**', // local deployment backups
      'Libraries/FileSaver.js', // vendored
      // Emscripten-generated glue
      'KinematicTool/Ruckig/ruckig.js',
      'KinematicTool/ardupilot/control.js',
      'SCurveTool/ardupilot/wpnav.js'
    ]
  },
  {
    files: ['**/*.js', '**/*.html'],
    plugins: { html },
    languageOptions: { ecmaVersion: 'latest', sourceType: 'script', globals: globals.browser },
    rules: {
      ...js.configs.recommended.rules,
      // Top-level names are page globals used by other scripts and by on…="" handlers. Unused
      // parameters are kept to match callback and method signatures.
      'no-unused-vars': ['error', { vars: 'local', args: 'none' }],
      // A script's own top-level names are also page globals; only flag redeclaration in a file.
      'no-redeclare': ['error', { builtinGlobals: false }],
      // Errors are deliberately ignored with an empty catch, e.g. when removing a map layer.
      'no-empty': ['error', { allowEmptyCatch: true }]
    }
  },
  // Each page's HTML and scripts see every global the page's scripts declare.
  ...pages.map(({ page, scripts, modules, names }) => ({
    files: [page, ...scripts, ...modules],
    languageOptions: { globals: Object.fromEntries(names.map((name) => [name, 'writable'])) }
  })),
  // Scripts a page loads with type="module".
  ...pages.flatMap(({ modules }) => modules).map((file) => ({
    files: [file],
    languageOptions: {
      sourceType: 'module',
      globals: Object.fromEntries(moduleImportGlobals(readFileSync(file, 'utf8')).map((name) => [name, 'readonly']))
    }
  })),
  { files: DUAL_SCRIPTS, languageOptions: { globals: globals.commonjs } },
  // Command-line scripts run with Node rather than loaded by a page.
  { files: ['SimpleGCS/cli_test.js', 'SimpleGCS/node_ftp.js'], languageOptions: { globals: globals.node } }
]
