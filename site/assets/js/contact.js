/* ----------------------------------------------------------------------------
   Formulaire « Demander une présentation privée »
   - Validation réelle (champs requis, e-mail, téléphone, longueurs, consentement),
     messages accessibles, focus sur le premier champ en erreur.
   - Envoi : POST FormData vers SITE_CONFIG.contact.endpoint. La confirmation
     n'est affichée QUE si le service répond 2xx.
   - Sans endpoint configuré : rien n'est envoyé ; le visiteur en est informé
     (et, si fallbackEmail est renseigné, un e-mail pré-rempli lui est proposé).
---------------------------------------------------------------------------- */
(function () {
  'use strict';
  const form = document.querySelector('[data-contact-form]');
  if (!form) return;
  const cfg = (window.SITE_CONFIG && window.SITE_CONFIG.contact) || {};
  const status = form.querySelector('[data-form-status]');
  const submit = form.querySelector('[data-submit]');
  const submitLabel = submit.textContent;

  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const rules = {
    nom:        v => !v.trim() ? 'Veuillez indiquer votre nom et prénom.' : v.trim().length < 2 ? 'Ce nom semble incomplet.' : '',
    entreprise: v => !v.trim() ? 'Veuillez indiquer le nom de votre entreprise.' : '',
    email:      v => !v.trim() ? 'Veuillez indiquer votre adresse e-mail.' : !EMAIL.test(v.trim()) ? 'Cette adresse e-mail ne semble pas valide.' : '',
    telephone:  v => {
      if (!v.trim()) return 'Veuillez indiquer un numéro de téléphone.';
      if (!/^\+?[\d\s().-]+$/.test(v.trim())) return 'Utilisez uniquement des chiffres, espaces et le signe +.';
      const digits = v.replace(/\D/g, '').length;
      return digits < 8 || digits > 15 ? 'Ce numéro de téléphone ne semble pas valide.' : '';
    },
    surface:    v => !v ? 'Veuillez sélectionner la surface recherchée.' : '',
    message:    v => v.length > 2000 ? 'Votre message dépasse 2 000 caractères.' : '',
    consentement: (v, el) => !el.checked ? 'Votre accord est nécessaire pour que nous puissions vous recontacter.' : '',
  };

  function check(el) {
    const rule = rules[el.name];
    if (!rule) return true;
    const msg = rule(el.value || '', el);
    const field = el.closest('.field');
    const err = document.getElementById(el.getAttribute('aria-describedby'));
    if (field) field.classList.toggle('is-invalid', !!msg);
    el.setAttribute('aria-invalid', msg ? 'true' : 'false');
    if (err) err.textContent = msg;
    return !msg;
  }

  const fields = Array.from(form.elements).filter(el => rules[el.name]);
  fields.forEach(el => {
    el.addEventListener('blur', () => { if (el.dataset.touched || el.value) { el.dataset.touched = '1'; check(el); } });
    el.addEventListener(el.type === 'checkbox' || el.tagName === 'SELECT' ? 'change' : 'input', () => { if (el.dataset.touched) check(el); });
  });

  function show(html, isError) {
    status.hidden = false;
    status.classList.toggle('is-error', !!isError);
    status.innerHTML = html;
  }
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function mailtoLink(data) {
    if (!cfg.fallbackEmail) return '';
    const surface = form.querySelector('#f-surface').selectedOptions[0].textContent;
    const body = [
      'Nom et prénom : ' + data.get('nom'), 'Entreprise : ' + data.get('entreprise'),
      'E-mail : ' + data.get('email'), 'Téléphone : ' + data.get('telephone'),
      'Surface recherchée : ' + surface, '', data.get('message') || '',
    ].join('\n');
    const href = 'mailto:' + encodeURIComponent(cfg.fallbackEmail) +
      '?subject=' + encodeURIComponent('Demande de présentation privée — AURELLE Business Residence') +
      '&body=' + encodeURIComponent(body);
    return ' <a href="' + esc(href) + '">Envoyer cette demande par e-mail</a>.';
  }

  form.addEventListener('submit', async e => {
    e.preventDefault();
    status.hidden = true;
    fields.forEach(el => { el.dataset.touched = '1'; });
    const invalid = fields.filter(el => !check(el));
    if (invalid.length) {
      invalid[0].focus();
      show('Merci de vérifier ' + (invalid.length > 1 ? 'les ' + invalid.length + ' champs signalés' : 'le champ signalé') + '.', true);
      return;
    }
    if (form.querySelector('#f-website').value) return;   // robot (champ piège rempli)

    const data = new FormData(form);
    data.delete('site_web');

    if (!cfg.endpoint) {
      show('Votre demande est complète, mais <strong>le service de réception des demandes n\'est pas encore connecté</strong> sur ce site de présentation : elle n\'a pas été transmise.' +
        (mailtoLink(data) || ' Les coordonnées de contact seront communiquées prochainement.'), true);
      return;
    }

    submit.disabled = true;
    submit.textContent = 'Envoi en cours…';
    try {
      data.append('_subject', 'Demande de présentation privée — AURELLE Business Residence');
      const res = await fetch(cfg.endpoint, { method: 'POST', body: data, headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      form.reset();
      fields.forEach(el => { delete el.dataset.touched; el.removeAttribute('aria-invalid'); });
      show('Merci. Votre demande de présentation privée a bien été transmise ; nos équipes reviendront vers vous très prochainement.');
    } catch (err) {
      show('L\'envoi n\'a pas abouti. Veuillez réessayer dans quelques instants.' + mailtoLink(data), true);
    } finally {
      submit.disabled = false;
      submit.textContent = submitLabel;
    }
  });
})();
