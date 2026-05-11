import './styles/main.css';

// ── Router ───────────────────────────────────────────────────────
// Hash-based routing: #/ = home, #/session/:token = session view

type Route =
  | { name: 'home' }
  | { name: 'session'; token: string }
  | { name: 'notfound' };

function parseRoute(): Route {
  const hash = window.location.hash.replace(/^#/, '') || '/';
  if (hash === '/' || hash === '') return { name: 'home' };
  const sessionMatch = hash.match(/^\/session\/([a-f0-9]{64})$/);
  if (sessionMatch) return { name: 'session', token: sessionMatch[1] };
  return { name: 'notfound' };
}

function navigate(path: string): void {
  window.location.hash = path;
}

// ── App entry ────────────────────────────────────────────────────
const app = document.getElementById('app')!;

async function render(): Promise<void> {
  const route = parseRoute();
  app.innerHTML = '';

  if (route.name === 'home') {
    const { renderHome } = await import('./screens/home');
    renderHome(app, navigate);
  } else if (route.name === 'session') {
    const { renderSession } = await import('./screens/sessionView');
    renderSession(app, route.token, navigate);
  } else {
    app.innerHTML = '<div class="container"><p>Page not found.</p></div>';
  }
}

window.addEventListener('hashchange', render);
render();
