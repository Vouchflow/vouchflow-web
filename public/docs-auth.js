(function () {
  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[ch]));
  }

  function initials(me) {
    if (me?.name) {
      return me.name.trim().split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase();
    }
    return me?.email ? me.email[0].toUpperCase() : '?';
  }

  function renderSignedOut(authEl) {
    authEl.innerHTML = '<a href="/signup" class="btn-dash" style="text-decoration:none;">Sign in</a>';
  }

  function renderSignedIn(authEl, me) {
    const label = initials(me);
    authEl.innerHTML = `
      <div class="docs-avatar-wrap" id="docs-avatar-wrap">
        <div class="docs-avatar" id="docs-avatar">${escapeHtml(label)}</div>
        <div class="docs-avatar-menu" id="docs-avatar-menu">
          <div class="docs-avatar-menu-header">${escapeHtml(me.email || '')}</div>
          <a class="docs-avatar-item" href="/dashboard">
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><rect x="1" y="1" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.4"/><rect x="8" y="1" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.4"/><rect x="1" y="8" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.4"/><rect x="8" y="8" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.4"/></svg>
            Dashboard
          </a>
          <a class="docs-avatar-item" href="/settings">
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="4" r="2.5" stroke="currentColor" stroke-width="1.4"/><path d="M2 12c0-2.76 2.24-5 5-5s5 2.24 5 5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
            Settings
          </a>
          <button class="docs-avatar-item danger" id="docs-signout" type="button">
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M8.5 4.5L11 7m0 0L8.5 9.5M11 7H5M5 2H3a1 1 0 00-1 1v7a1 1 0 001 1h2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
            Sign out
          </button>
        </div>
      </div>`;

    const avatar = document.getElementById('docs-avatar');
    if (avatar) {
      avatar.addEventListener('click', () => {
        document.getElementById('docs-avatar-menu')?.classList.toggle('open');
      });
      if (me.avatarUrl) {
        const img = document.createElement('img');
        img.src = me.avatarUrl;
        img.alt = '';
        img.style.cssText = 'width:100%;height:100%;border-radius:50%;object-fit:cover;';
        img.onerror = () => { avatar.textContent = label; };
        avatar.textContent = '';
        avatar.appendChild(img);
      }
    }

    document.getElementById('docs-signout')?.addEventListener('click', async () => {
      await fetch('/auth/signout', { method: 'POST', credentials: 'include' });
      window.location.href = '/';
    });

    document.addEventListener('click', (event) => {
      const wrap = document.getElementById('docs-avatar-wrap');
      if (wrap && !wrap.contains(event.target)) {
        document.getElementById('docs-avatar-menu')?.classList.remove('open');
      }
    });
  }

  async function initDocsAuth() {
    const authEl = document.getElementById('topbar-auth');
    if (!authEl) return;
    try {
      const res = await fetch('/web/me', { credentials: 'include' });
      const me = res.ok ? await res.json() : null;
      if (!me) renderSignedOut(authEl);
      else renderSignedIn(authEl, me);
    } catch {
      renderSignedOut(authEl);
    }
  }

  initDocsAuth();
}());
