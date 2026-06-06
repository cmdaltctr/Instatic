import { issuePublicFormPageToken } from './challenge'
import { addCspSources, rewriteCspMeta } from '@core/publisher'

export const FORM_RUNTIME_PATH = '/_instatic/form-runtime.js'

const CMS_FORM_PATTERN = /<form\b(?=[^>]*\bdata-instatic-form-mode=(["'])cms\1)(?=[^>]*\bdata-instatic-form-id=(["'])[^"']+\2)[^>]*>/i
const CMS_FORM_TAG_PATTERN = /<form\b(?=[^>]*\bdata-instatic-form-mode=(["'])cms\1)(?=[^>]*\bdata-instatic-form-id=(["'])[^"']+\2)[^>]*>/gi

export const FORM_RUNTIME_JS = `(() => {
  const script = document.querySelector('script[data-instatic-form-runtime]');
  const pageId = script ? script.getAttribute('data-instatic-page-id') || '' : '';
  const forms = document.querySelectorAll('form[data-instatic-form-mode="cms"][data-instatic-form-id]');

  for (const form of forms) attachForm(form);

  function attachForm(form) {
    if (form.__instaticFormRuntimeAttached) return;
    form.__instaticFormRuntimeAttached = true;
    connectLabels(form);
    prepareMessages(form);
    prefetchChallenge(form);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      submitForm(form);
    });
  }

  async function submitForm(form) {
    const formId = form.getAttribute('data-instatic-form-id') || '';
    const pageToken = form.getAttribute('data-instatic-page-token') || '';
    if (!formId || !pageId || !pageToken) {
      setState(form, 'error', 'This form is missing its published form link.');
      return;
    }

    setBusy(form, true);
    setState(form, 'pending', 'Sending...');

    try {
      const challenge = await takeChallenge(form);
      await postJson('/_instatic/form/submit', {
        pageId,
        formId,
        token: challenge.token,
        challenge: challenge.challenge,
        values: collectValues(form),
      });

      const redirectUrl = form.getAttribute('data-instatic-success-redirect') || '';
      if (redirectUrl) {
        window.location.assign(redirectUrl);
        return;
      }

      setState(form, 'success', form.getAttribute('data-instatic-success-message') || 'Thanks. Your submission was received.');
      if (form.getAttribute('data-instatic-reset-on-success') !== 'false') form.reset();
    } catch (err) {
      const message = err instanceof Error && err.message ? err.message : 'Form submission failed.';
      setState(form, 'error', message);
    } finally {
      setBusy(form, false);
      if (form.isConnected) prefetchChallenge(form);
    }
  }

  function prefetchChallenge(form) {
    if (form.__instaticFormChallenge || form.__instaticFormChallengePromise) return form.__instaticFormChallengePromise;
    const request = requestChallenge(form)
      .then((challenge) => {
        form.__instaticFormChallenge = challenge;
        form.__instaticFormChallengePromise = null;
        return challenge;
      })
      .catch((err) => {
        form.__instaticFormChallenge = null;
        form.__instaticFormChallengePromise = null;
        throw err;
      });
    form.__instaticFormChallengePromise = request;
    request.catch(() => {});
    return request;
  }

  async function takeChallenge(form) {
    const existing = form.__instaticFormChallenge;
    if (existing && challengeIsFresh(existing)) {
      form.__instaticFormChallenge = null;
      return existing;
    }
    form.__instaticFormChallenge = null;
    const challenge = await prefetchChallenge(form);
    form.__instaticFormChallenge = null;
    return challenge;
  }

  function requestChallenge(form) {
    const formId = form.getAttribute('data-instatic-form-id') || '';
    const pageToken = form.getAttribute('data-instatic-page-token') || '';
    if (!formId || !pageId || !pageToken) {
      return Promise.reject(new Error('This form is missing its published form link.'));
    }
    return postJson('/_instatic/form/challenge', { pageId, formId, pageToken });
  }

  function challengeIsFresh(challenge) {
    const expiresAt = Date.parse(challenge && challenge.expiresAt ? challenge.expiresAt : '');
    return !Number.isFinite(expiresAt) || Date.now() < expiresAt - 10000;
  }

  async function postJson(path, payload) {
    const response = await fetch(path, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'accept': 'application/json',
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const body = await readJson(response);
    if (!response.ok) throw new Error(errorMessage(body));
    return body;
  }

  async function readJson(response) {
    const text = await response.text();
    if (!text) return {};
    try {
      return JSON.parse(text);
    } catch (_err) {
      return { error: 'Form submission failed.' };
    }
  }

  function errorMessage(body) {
    if (Array.isArray(body.errors) && body.errors.length > 0) {
      return body.errors.map((entry) => entry && entry.message ? entry.message : '').filter(Boolean).join('\\n') || 'Invalid form values.';
    }
    return typeof body.error === 'string' && body.error ? body.error : 'Form submission failed.';
  }

  function collectValues(form) {
    const values = {};
    const data = new FormData(form);
    for (const [name, value] of data.entries()) {
      const normalized = typeof value === 'string' ? value : value.name;
      if (values[name] === undefined) {
        values[name] = normalized;
      } else if (Array.isArray(values[name])) {
        values[name].push(normalized);
      } else {
        values[name] = [values[name], normalized];
      }
    }
    return values;
  }

  function connectLabels(form) {
    const elements = Array.from(form.querySelectorAll('label[data-instatic-label-target="auto"], input:not([type="hidden"]):not([data-instatic-honeypot]), textarea, select'));
    let counter = 0;
    for (const element of elements) {
      if (element.tagName.toLowerCase() !== 'label') continue;
      const index = elements.indexOf(element);
      const control = elements.slice(index + 1).find((candidate) => candidate.tagName.toLowerCase() !== 'label');
      if (!control) continue;
      if (!control.id) {
        counter += 1;
        control.id = 'instatic-form-' + safeToken(form.getAttribute('data-instatic-form-id') || 'form') + '-' + counter;
      }
      element.setAttribute('for', control.id);
    }
  }

  function safeToken(value) {
    return String(value).replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'form';
  }

  function setBusy(form, busy) {
    form.setAttribute('aria-busy', busy ? 'true' : 'false');
    const buttons = form.querySelectorAll('button, input[type="submit"], input[type="button"]');
    for (const button of buttons) {
      if (busy) {
        if (button.disabled) button.setAttribute('data-instatic-was-disabled', 'true');
        button.disabled = true;
      } else if (!button.hasAttribute('data-instatic-was-disabled')) {
        button.disabled = false;
      } else {
        button.removeAttribute('data-instatic-was-disabled');
      }
    }
  }

  function prepareMessages(form) {
    for (const message of formMessages(form)) {
      if (!message.hasAttribute('data-instatic-default-text')) {
        message.setAttribute('data-instatic-default-text', message.textContent || '');
      }
      const kind = message.getAttribute('data-instatic-form-message') || 'status';
      if (kind === 'success' || kind === 'error') message.hidden = true;
    }
  }

  function setState(form, state, text) {
    form.setAttribute('data-instatic-form-state', state);
    const messages = formMessages(form);
    const messageKind = state === 'error' ? 'error' : state === 'success' ? 'success' : 'status';
    const hasExactMessage = messages.some((message) => (message.getAttribute('data-instatic-form-message') || 'status') === messageKind);

    for (const message of messages) {
      if (!message.hasAttribute('data-instatic-default-text')) {
        message.setAttribute('data-instatic-default-text', message.textContent || '');
      }
      const kind = message.getAttribute('data-instatic-form-message') || 'status';
      const shouldShow = kind === messageKind || (!hasExactMessage && kind === 'status');
      if (!shouldShow) {
        message.hidden = true;
        continue;
      }
      message.textContent = text || message.getAttribute('data-instatic-default-text') || '';
      message.hidden = !message.textContent;
    }
  }

  function formMessages(form) {
    const formId = form.getAttribute('data-instatic-form-id') || '';
    return Array.from(document.querySelectorAll('[data-instatic-form-message]')).filter((message) => {
      return form.contains(message) || (formId && message.getAttribute('data-instatic-form-id') === formId);
    });
  }
})();`

export function pageHasCmsNativeForm(html: string): boolean {
  return CMS_FORM_PATTERN.test(html)
}

export function injectFormRuntime(html: string, pageId: string): string {
  if (!pageHasCmsNativeForm(html) || html.includes('data-instatic-form-runtime')) return html
  const withPageTokens = stampFormPageTokens(html, pageId)
  const script = `<script src="${FORM_RUNTIME_PATH}" defer data-instatic-form-runtime data-instatic-page-id="${escapeAttr(pageId)}"></script>`
  const withScript = withPageTokens.includes('</body>')
    ? withPageTokens.replace('</body>', `${script}\n</body>`)
    : `${withPageTokens}\n${script}`
  return relaxScriptCsp(withScript)
}

export function serveFormRuntimeAsset(): Response {
  return new Response(FORM_RUNTIME_JS, {
    headers: {
      'content-type': 'text/javascript; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  })
}

function relaxScriptCsp(html: string): string {
  // The native-form runtime is an external `<script src>` from this origin, so
  // it only needs `script-src 'self'`. Merge it into the page policy as data so
  // the result stays deterministically ordered alongside any plugin / media
  // relaxations applied earlier in the pipeline.
  return rewriteCspMeta(html, (csp) => addCspSources(csp, 'script-src', ["'self'"]))
}

function stampFormPageTokens(html: string, pageId: string): string {
  return html.replace(CMS_FORM_TAG_PATTERN, (tag) => {
    if (/\bdata-instatic-page-token=/.test(tag)) return tag
    const formId = attrValue(tag, 'data-instatic-form-id')
    if (!formId) return tag
    const token = issuePublicFormPageToken({ pageId, formId })
    return tag.replace(/<form\b/i, `<form data-instatic-page-token="${escapeAttr(token)}"`)
  })
}

function attrValue(tag: string, name: string): string {
  const pattern = new RegExp(`\\b${name}=(["'])(.*?)\\1`, 'i')
  const match = tag.match(pattern)
  return match?.[2] ?? ''
}

function escapeAttr(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
