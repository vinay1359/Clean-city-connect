import globals from "globals";
import pluginJs from "@eslint/js";


export default [
  {languageOptions: { globals: globals.browser }},
  pluginJs.configs.recommended,

{
  "env": {
    "node": true
  }
},
{
  "plugins": ["node"],
  "rules": {
    "node/no-missing-require": "error"
  }
}
];