/*
  Build a Brand: Google Tag Manager loader + dataLayer event tracking
  ----------------------------------------------------------------------
  SETUP: paste your GTM container ID below (format GTM-XXXXXXX).
  While it is empty, GTM does not load and nothing is sent to Google.
  Events are still pushed to window.dataLayer so they can be tested.

  GA4 itself is configured inside GTM (Google tag + GA4 event tags),
  so no GA4 Measurement ID is needed in this file.

  PRIVACY: never push names, email addresses, phone numbers or any
  other personal information into the dataLayer.
*/
(function (w, d) {
  'use strict';

  var GTM_ID = 'GTM-KJFSHXQD'; // Build a Brand GTM container

  w.dataLayer = w.dataLayer || [];

  // ---- 1. Load GTM once (guards against double-loading) ----
  if (/^GTM-[A-Z0-9]+$/.test(GTM_ID) && !w.__babGtmLoaded) {
    w.__babGtmLoaded = true;
    w.dataLayer.push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' });
    var f = d.getElementsByTagName('script')[0];
    var j = d.createElement('script');
    j.async = true;
    j.src = 'https://www.googletagmanager.com/gtm.js?id=' + GTM_ID;
    f.parentNode.insertBefore(j, f);
  }

  // ---- 2. Event helper ----
  // Every push resets all known parameters so values from an earlier
  // event never leak into a later one (GTM's data model persists keys).
  var PARAM_KEYS = [
    'button_text', 'button_location', 'link_url', 'link_domain',
    'form_name', 'field_name', 'error_fields', 'error_count', 'error_type',
    'website_type', 'section_name', 'percent_scrolled', 'project_name',
    'lead_id', 'value', 'currency'
  ];
  var BLOCKED = /@|\b\d{9,}\b/; // crude PII guard: emails or long digit strings

  function track(eventName, params) {
    var payload = { event: eventName };
    PARAM_KEYS.forEach(function (k) { payload[k] = undefined; });
    params = params || {};
    Object.keys(params).forEach(function (k) {
      var v = params[k];
      if (typeof v === 'string') {
        v = v.replace(/\s+/g, ' ').trim().slice(0, 100);
        if (k !== 'link_url' && BLOCKED.test(v)) { return; }
      }
      payload[k] = v;
    });
    w.dataLayer.push(payload);
  }
  w.babTrack = track;

  // ---- 3. Helpers ----
  function locationOf(el) {
    if (el.closest('#stickyMobileBar')) return 'sticky_mobile_bar';
    if (el.closest('#privacyModal')) return 'privacy_modal';
    if (el.closest('header')) return 'header';
    if (el.closest('footer')) return 'footer';
    var sec = el.closest('section[id]');
    return sec ? sec.id : 'page';
  }
  function textOf(el) {
    return (el.getAttribute('data-track-text') || el.textContent || el.getAttribute('aria-label') || '')
      .replace(/[→←×]/g, '').replace(/\s+/g, ' ').trim();
  }

  // ---- 4. Click tracking (one delegated listener, covers future links too) ----
  d.addEventListener('click', function (e) {
    var el = e.target.closest ? e.target.closest('a, button') : null;
    if (!el) return;
    if (el.type === 'submit') return; // form submits are tracked by the form logic

    var href = el.getAttribute('href') || '';
    var loc = locationOf(el);
    var text = textOf(el);
    var base = { button_text: text, button_location: loc };

    if (/^mailto:/i.test(href)) {
      track('email_click', { button_text: 'email', button_location: loc, link_url: 'mailto' });
    } else if (/^tel:/i.test(href)) {
      track('phone_click', { button_text: 'phone', button_location: loc, link_url: 'tel' });
    } else if (/wa\.me|whatsapp\.com/i.test(href)) {
      track('whatsapp_click', { button_text: text, button_location: loc, link_url: href.split('?')[0] });
    } else if (el.closest('#our-work') && /^https?:/i.test(href)) {
      var art = el.closest('article');
      var title = art && art.querySelector('.sw-title');
      track('portfolio_click', {
        button_text: text, button_location: loc, link_url: href,
        project_name: title ? title.textContent : undefined
      });
    } else if (href.charAt(0) === '#' && href.length > 1) {
      base.link_url = href;
      track('cta_click', base);
    } else if (el.id === 'openPrivacyModalBtn' || el.id === 'footerPrivacyBtn') {
      track('privacy_policy_open', base);
    } else if (el.tagName === 'A' && href) {
      base.link_url = href;
      track(loc === 'footer' ? 'footer_click' : 'nav_click', base);
    }
  }, true);

  // ---- 5. Section views + form view + scroll depth ----
  function onReady(fn) {
    if (d.readyState !== 'loading') fn(); else d.addEventListener('DOMContentLoaded', fn);
  }

  onReady(function () {
    if ('IntersectionObserver' in w) {
      var seen = {};
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (!en.isIntersecting) return;
          var id = en.target.id;
          if (seen[id]) return;
          seen[id] = true;
          io.unobserve(en.target);
          track('section_view', { section_name: id });
          if (id === 'claim') track('form_view', { form_name: 'black_friday_enquiry' });
        });
      }, { threshold: 0.35 });
      d.querySelectorAll('main section[id]').forEach(function (s) { io.observe(s); });
    }

    var marks = [25, 50, 75, 90], fired = {};
    function onScroll() {
      var h = d.documentElement.scrollHeight - w.innerHeight;
      if (h <= 0) return;
      var pct = (w.scrollY / h) * 100;
      marks.forEach(function (m) {
        if (pct >= m && !fired[m]) { fired[m] = true; track('scroll_depth', { percent_scrolled: m }); }
      });
      if (fired[90]) w.removeEventListener('scroll', onScroll);
    }
    w.addEventListener('scroll', onScroll, { passive: true });

    // ---- 6. Form start + abandonment ----
    var form = d.getElementById('blackFridayForm');
    if (!form) return;
    var started = false, lastField;
    function fieldName(t) { return t && (t.name || t.id) || undefined; }
    function onFirst(e) {
      if (!e.target || !e.target.name || e.target.type === 'hidden') return;
      lastField = fieldName(e.target);
      if (started) return;
      started = true;
      track('form_start', { form_name: 'black_friday_enquiry', field_name: lastField });
    }
    form.addEventListener('focusin', onFirst);
    form.addEventListener('input', onFirst);
    form.addEventListener('change', onFirst);

    var abandonSent = false;
    function onLeave() {
      if (!started || abandonSent || w.__babFormSubmitted) return;
      abandonSent = true;
      track('form_abandon', { form_name: 'black_friday_enquiry', field_name: lastField });
    }
    // pagehide = the visitor closed the tab or left the page.
    // (Not visibilitychange: switching tabs and coming back is not abandonment.)
    w.addEventListener('pagehide', onLeave);
  });
})(window, document);
