import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {authReady,authLanding} from './cloudDatabase';
import App from './App.tsx';
import './index.css';

if (authLanding) document.getElementById('root')!.textContent = 'Completing sign-in…';

void authReady.then(()=>createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
));

