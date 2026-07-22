// Self-contained flat config (no @eslint/js — works with the eslint package alone).
// resource:// and gi:// imports aren't resolved by eslint; their bindings are treated as defined.
const gjsGlobals = {
    console: 'readonly',
    globalThis: 'readonly',
    TextDecoder: 'readonly',
    TextEncoder: 'readonly',
    print: 'readonly',
    printerr: 'readonly',
    log: 'readonly',
    logError: 'readonly',
    imports: 'readonly',
    global: 'readonly',
};

export default [
    {
        ignores: ['fixtures/**', 'node_modules/**', '*.zip'],
    },
    {
        languageOptions: {
            ecmaVersion: 2023,
            sourceType: 'module',
            globals: gjsGlobals,
        },
        rules: {
            'no-undef': 'error',
            'no-unused-vars': ['warn', {argsIgnorePattern: '^_'}],
            'no-const-assign': 'error',
            'no-dupe-keys': 'error',
            'no-dupe-args': 'error',
            'no-unreachable': 'error',
            'no-cond-assign': 'error',
            'no-constant-condition': ['warn', {checkLoops: false}],
            'no-empty': ['warn', {allowEmptyCatch: true}],
            'no-var': 'error',
            'prefer-const': 'warn',
            'eqeqeq': ['warn', 'smart'],
        },
    },
];
