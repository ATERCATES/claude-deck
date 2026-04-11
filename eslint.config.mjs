import tseslint from "typescript-eslint";
import nextPlugin from "@next/eslint-plugin-next";
import hooksPlugin from "eslint-plugin-react-hooks";
import eslintConfigPrettier from "eslint-config-prettier";

export default tseslint.config(
  { ignores: [".next/", "node_modules/", "src-tauri/"] },
  ...tseslint.configs.recommended,
  {
    plugins: {
      "@next/next": nextPlugin,
      "react-hooks": hooksPlugin,
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  eslintConfigPrettier
);
