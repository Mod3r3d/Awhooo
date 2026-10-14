/**
 * Cấu hình ESLint (flat config — ESLint 9+).
 */

const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
    js.configs.recommended,

    {
        files: ['**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'commonjs',
            globals: {
                ...globals.node
            }
        },
        rules: {
            // Biến/đối số không dùng là cảnh báo, cho phép tiền tố _ để bỏ qua
            'no-unused-vars': [
                'warn',
                {
                    argsIgnorePattern: '^_',
                    varsIgnorePattern: '^_',
                    caughtErrorsIgnorePattern: '^_'
                }
            ],
            // Cho phép catch rỗng khi dọn dẹp tài nguyên
            'no-empty': ['error', { allowEmptyCatch: true }],
            // Bot ghi log ra console là hợp lệ ở tầng bootstrap
            'no-console': 'off',
            // Cho phép == null để bắt cả null và undefined
            eqeqeq: ['error', 'smart'],
            'prefer-const': 'warn',
            'no-var': 'error',
            'object-shorthand': 'warn',
            // Cho phép khoảng trắng toàn giác (U+3000) dùng để thụt lề trong embed Discord
            'no-irregular-whitespace': ['error', { skipTemplates: true, skipStrings: true }]
        }
    },

    {
        files: ['tests/**/*.js'],
        rules: {
            'no-unused-vars': 'off'
        }
    },

    {
        ignores: ['node_modules/**', 'data/**', 'coverage/**', 'dist/**']
    }
];