import vue from 'rollup-plugin-vue';
import scss from 'rollup-plugin-scss';

export default {
  input: 'src/CLI.vue',
  output: [
    {
      format: 'esm',
      file: 'dist/InteractiveCLI.js'
    }
  ],
  plugins: [
    scss(),
    vue()
  ]
}