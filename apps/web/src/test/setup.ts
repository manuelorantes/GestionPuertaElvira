import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach } from 'vitest';

// Con toda la suite en paralelo algunas pantallas tardan más de 1 s en pintar: más margen para findBy/waitFor.
configure({ asyncUtilTimeout: 4000 });

afterEach(() => {
  cleanup();
});
