/**
 * Framer Motion's animation engine, on its own.
 *
 * This module exists purely so the dynamic import in App.tsx produces a
 * chunk with a recognisable name. Importing `framer-motion` directly gave a
 * build output with two files called `index-<hash>.js` — one the app, one
 * the animation engine — which is a small thing until the day somebody is
 * staring at a waterfall trying to work out which is which.
 *
 * `domAnimation` is the smaller of the two feature bundles: animations,
 * exit animations, and pointer gestures. The larger one adds drag and
 * layout projection, and nothing here uses either.
 */
export { domAnimation as default } from 'framer-motion';
