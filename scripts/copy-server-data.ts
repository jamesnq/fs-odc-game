import { cpSync } from 'node:fs';

// Preserve the relative paths used by the compiled game handlers.
cpSync(new URL('../server/src/data/', import.meta.url), new URL('../server/dist/data/', import.meta.url), { recursive: true });
