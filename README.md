# Branchroom

Branchroom is a local-first browser app for building short, interactive branching videos. It is designed for classroom use: students can combine video clips and still images, arrange scenes on a visual story map, add text and choice buttons, and preview every path without uploading their media.

## V1 features

- Select a local folder or individual video/image files
- Drag media onto a visual branching canvas
- Reposition scene cards and see connections between choices
- Add text overlays and clickable choice buttons
- Link each choice to another scene
- Set video playback to loop or play once and hold
- Set a display duration for still images
- Choose the story's starting scene
- Preview the interactive story in the browser
- Save and reopen lightweight `.branchroom.json` project files
- Relink local media by matching filenames
- Explore a built-in sample project and instructions

Media remains on the local computer. Saved project files contain scene structure and filenames, not the videos or images themselves.

## Run locally

Requires Node.js 18 or later.

```bash
npm start
```

Then open [http://127.0.0.1:4173](http://127.0.0.1:4173).

No dependency installation or build step is required.

## Recommended browser

Current versions of Chrome or Edge provide the most consistent local-file experience. Safari and Firefox can also use the individual-file and folder input controls, though browser security always requires students to select their files again after reopening a project.

## Project files

Branchroom saves a human-readable JSON document containing:

- project title and start scene
- scene positions and playback settings
- overlay text, placement, and destinations
- a media manifest with filenames, types, and stable IDs

When a project is reopened, choose **Relink files** and select its media folder. Files are matched by filename.

## Roadmap

- Export a self-contained playable project package
- Timed overlay entrances and exits
- Keyboard-accessible map editing
- Undo/redo and automatic draft recovery
- Google Drive picker and school-friendly OAuth setup
- Project validation for broken or unreachable story paths

## Privacy

V1 has no backend, analytics, accounts, or network upload. Media is represented with temporary browser object URLs that expire when the page closes.

## License

MIT
