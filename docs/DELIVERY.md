# Prepare a delivery

Add files to a shelf and choose **Prepare a delivery**. The source collection stays on the left; checks, preparation settings and the output preview appear on the right.

1. Choose Client delivery, Social post, Document submission, Research pack or Custom. Expand any requirement to change its name, matching rule or required status. Assign files manually when an automatic rule does not suit the project. These are editable checklists, not a certification of file content.
2. Choose how copies should be named and sized. More options include PNG/JPEG conversion, JPEG quality, grouping, duplicate removal, a per-file size limit and recipient instructions.
3. Select **Review delivery**. Resolve missing required items or file errors. Review the output paths, actual prepared sizes and image dimensions. Changing a setting requires another review.
4. Choose a folder or ZIP and select **Create delivery**. Pick the parent destination. Drag Shelf creates a new uniquely named output, leaving the originals unchanged. A destination inside an included source folder is rejected.

PNG and JPEG images can be resized or converted; images are never enlarged. Other formats are copied unchanged. Processing is limited to images up to 50 MB. Requirements match file types, names or explicit assignments; Drag Shelf does not validate invoice contents or inspect archive contents. Duplicate detection compares file contents with SHA-256.

Optional `README.txt` contains your instructions. `index.html` is an offline visual index with image thumbnails; Khmer indices include an embedded font and its license. `delivery-manifest.json` records filenames, sizes and source/output hashes, without your absolute source paths.

**Save recipe** stores the current requirements and preparation options for another shelf. Project names, source exclusions and manually assigned paths are cleared from recipes. Review notes before reusing a recipe.

**History** keeps the most recent 50 exports locally. Reveal an existing output or restore a shelf with the original source references and settings. Restoring does not recover deleted source files; the next readiness check identifies missing files. Files changed after review must be checked again before export.

Closing the workspace cancels ongoing preparation/export. Incomplete staging files are removed. A completed output remains available even if local history could not be saved.
