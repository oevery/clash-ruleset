import antfu from '@antfu/eslint-config'

export default antfu({
  // 使用 Node 内建测试，不将导入或测试函数自动改写为 Vitest。
  test: false,
  typescript: true,
  ignores: ['.output/**', '.output-*/**', '.tools/**'],
}, {
  files: ['scripts/*.ts'],
  rules: {
    'antfu/no-top-level-await': 'off',
    'no-console': 'off',
  },
}, {
  files: ['config/*.yaml'],
  rules: {
    'yaml/flow-mapping-curly-spacing': ['error', 'always'],
    'yaml/flow-sequence-bracket-spacing': ['error', 'never'],
  },
})
