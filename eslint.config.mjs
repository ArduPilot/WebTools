// ESLint for WebTools: correctness rules only, no formatting rules.

import js from '@eslint/js'
import html from 'eslint-plugin-html'
import globals from 'globals'

export default [
  {
    ignores: [
      'modules/**', // submodules and vendored libraries
      'backup/**', // local deployment backups
      'Libraries/FileSaver.js' // vendored
    ]
  },
  {
    files: ['**/*.js', '**/*.html'],
    plugins: { html },
    languageOptions: { ecmaVersion: 'latest', sourceType: 'script', globals: globals.browser },
    rules: js.configs.recommended.rules
  }
]
