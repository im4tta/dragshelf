# Contributing

1. `npm install && npm start` to run from source.
2. Change code in `src/`. The UI is plain HTML/CSS/JS – no build step.
3. `npm test` must stay green (on Linux: `xvfb-run -a npm test`).
4. If you change the look, run `npm run screenshots` and commit the new images.

Please keep the app small and private: no analytics, no network access besides the opt-in phone transfer.
