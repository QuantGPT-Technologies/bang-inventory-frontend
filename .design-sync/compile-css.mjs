import postcss from 'postcss';
import tailwindcss from '@tailwindcss/postcss';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const from = resolve('src/app/globals.css');
const to = resolve('node_modules/bang-inventory-ui/dist/styles.css');
const css = readFileSync(from, 'utf8');

postcss([tailwindcss()])
  .process(css, { from, to })
  .then((result) => {
    writeFileSync(to, result.css);
    console.log('wrote', to, result.css.length, 'bytes');
  })
  .catch((e) => { console.error(e); process.exit(1); });
