# New Repo File List

This document defines what should be included in the new GitHub repository for the current DOF Pro-Series Simulator `V1.2` project.

## Include In The New Repo

### Required

- `.gitignore`
- `README.md`
- `REPO_FILE_LIST.md`
- `package.json`
- `package-lock.json`
- `index.html`
- `style_V1.2.css`
- `app_V1.2.js`
- `builder_json.js`
- `dof_shared_core.js`
- `dof_shared_parser.js`
- `dof_shared_matrix_model.js`
- `dof_shared_matrix_eval.js`
- `dof_shared_qa.js`
- `example_library.js`
- `example_library_matrix.js`
- `example_library_strip.js`

### Optional Later Additions

- `LICENSE`
- screenshots or demo images for the README
- curated sample files that are explicitly safe for public release

## Do Not Include In The New Repo

### Private / Cabinet-Specific Files

- `Cabinet.xml`
- `Pinball Cabinet.json`
- `directoutputconfig.ini`
- `directoutputconfig2.ini`
- `directoutputconfig30.ini`
- `PUPDatabase.db`

### Downloaded Sample / Working Data

- `Pinup Menu Effects 38 CLEAN.csv`
- `Pinup Menu Effects 38 CLEAN.gif`
- `Monster_Bash_config2.json`
- `ACDC Limited Edition_config PUBLIC CONFIGURATION.json`
- any other personal or working JSON exports unless intentionally curated as public examples

### Temp / Cache / Local Tooling Output

- `node_modules/`
- `.npm-cache/`
- `.pw-browsers/`
- `output/`
- temporary screenshots or probe output

## Recommended First Commit Scope

For the first clean commit, include only the files listed in the required section above.

That gives you a clean public baseline without dragging in personal cabinet data or historical workspace clutter from the larger local working folder around this app.

## Recommended New Repo Name

Suggested names:

- `DOF-Pro-Series-Simulator-V1.2`
- `DOF-Pro-Series-Simulator-Next`
- `DOF-Pro-Series-Simulator`

If you want this repo to clearly replace the older public repo, use the same project naming style but keep it as a brand-new repository.
