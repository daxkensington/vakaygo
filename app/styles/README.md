# Retained shadcn styles

`shadcn.css` is an unmodified copy of `package/dist/tailwind.css` from the
published **shadcn 4.21.4** npm package:

- Source tarball: https://registry.npmjs.org/shadcn/-/shadcn-4.21.4.tgz
- Upstream project: https://github.com/shadcn-ui/ui/tree/main/packages/shadcn
- Upstream file size: 16,340 bytes
- Upstream file SHA-256: `4c371f7a1ff5d219ae2f7ff28bd256b4346fd546fe46fbae22092e57db2f0fae`
- License: MIT, Copyright (c) 2023 shadcn. The complete, unchanged notice from
  `package/LICENSE.md` is retained in [shadcn-MIT.txt](../../LICENSES/shadcn-MIT.txt).

The application needs these Tailwind variants, animations and utilities. It does
not use the shadcn CLI in its application code, package scripts or CI. Keeping the
stylesheet locally lets us remove that unnecessary CLI dependency tree while
preserving the styles. `app/globals.css` imports it in the original position,
after `tw-animate-css` and before the font fallbacks. The file has no package
imports, plugins, source directives or asset URLs.

To refresh it, obtain a reviewed, explicitly versioned shadcn npm tarball in a
temporary directory without adding the CLI to this project's dependencies or
running it. Extract `package/dist/tailwind.css` and `package/LICENSE.md`; review
their changes, copy the complete files, and update the version, source and hash
above. Preserve the import position and the full license notice. Run the normal
production build and compare compiled CSS with the previous stylesheet when
checking for unintended style changes. Future component scaffolding should keep
the local stylesheet import rather than restoring the CLI dependency for CSS.
