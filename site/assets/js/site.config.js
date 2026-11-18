/* ----------------------------------------------------------------------------
   Configuration du site (hors animation du hero, voir film.config.js).

   FORMULAIRE DE CONTACT — à connecter avant toute mise en service :
   - endpoint : URL qui reçoit la demande en POST (FormData), par exemple un
     formulaire Formspree (https://formspree.io/f/xxxxxxx), Getform, Basin, ou
     votre propre API / CRM. Le site affiche une confirmation UNIQUEMENT si ce
     service répond avec succès (HTTP 2xx).
   - fallbackEmail : adresse proposée en secours (lien e-mail pré-rempli) tant
     que l'endpoint n'est pas configuré ou en cas d'échec d'envoi.
   Tant que les deux sont vides, aucune demande n'est transmise et le visiteur
   en est clairement informé.
---------------------------------------------------------------------------- */
window.SITE_CONFIG = {
  contact: {
    endpoint: '',        // ex. 'https://formspree.io/f/abcdwxyz'
    fallbackEmail: '',   // ex. 'contact@aurelle-residence.ma'
  },
};
