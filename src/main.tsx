import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { primeAccent } from './theme';
import './styles/index.css';

// Before the first frame, not after: the couple's accent is not known until
// the profile loads, and without this every launch opens cinnabar and then
// changes colour under the reader.
primeAccent();

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
