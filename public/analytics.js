/**
 * PostHog — contrato de eventos ForVzla / Ayuda Venezuela
 *
 * Reglas:
 * - Nunca enviar teléfono, nombre, dirección, coordenadas ni URLs de posts.
 * - need_id / centro_id / asesor_id sí (UUID opacos, útiles para funnels).
 * - persistence: 'cookie' (cuenta visitantes sin localStorage de la app).
 */
(function (global) {
  'use strict';

  /** @type {Record<string, string>} */
  const EVENTS = {
    // ── Sesión / navegación ─────────────────────────────────────────────
    APP_OPENED: 'app_opened',
    SCREEN_VIEWED: 'screen_viewed',
    INFO_MODAL_OPENED: 'info_modal_opened',
    INFO_MODAL_CLOSED: 'info_modal_closed',

    // ── Pedir ayuda (reportar) ────────────────────────────────────────────
    LOCATION_TAB_SELECTED: 'location_tab_selected',
    LOCATION_CONFIRMED: 'location_confirmed',
    LOCATION_FAILED: 'location_failed',
    NEED_SUBMIT_VALIDATION_FAILED: 'need_submit_validation_failed',
    NEED_DUPLICATE_SHOWN: 'need_duplicate_shown',
    NEED_DUPLICATE_CONFIRMED: 'need_duplicate_confirmed',
    NEED_DUPLICATE_FORCED_NEW: 'need_duplicate_forced_new',
    NEED_PUBLISHED: 'need_published',
    NEED_PUBLISH_FAILED: 'need_publish_failed',

    // ── Quiero ayudar ───────────────────────────────────────────────────
    HELP_FILTER_CHANGED: 'help_filter_changed',
    HELP_VIEW_CHANGED: 'help_view_changed',
    HELP_GPS_REQUESTED: 'help_gps_requested',
    HELP_LIST_LOADED: 'help_list_loaded',
    HELP_CONTACT_CLICKED: 'help_contact_clicked',
    HELP_ATTEND_MODAL_OPENED: 'help_attend_modal_opened',
    HELP_ATTEND_CONFIRMED: 'help_attend_confirmed',
    HELP_MARKED_CUBIERTA: 'help_marked_cubierta',
    HELP_SHARE_CLICKED: 'help_share_clicked',
    GUAU_LINK_CLICKED: 'guau_link_clicked',
    MAP_MARKER_CLICKED: 'map_marker_clicked',
    SOS_FAB_CLICKED: 'sos_fab_clicked',

    // ── Centros de acopio ───────────────────────────────────────────────
    ACOPIO_LIST_LOADED: 'acopio_list_loaded',
    ACOPIO_GPS_REQUESTED: 'acopio_gps_requested',
    ACOPIO_FILTER_CHANGED: 'acopio_filter_changed',
    ACOPIO_CONTACT_CLICKED: 'acopio_contact_clicked',

    // ── Donar recurso a centro ──────────────────────────────────────────
    RESOURCE_PUBLISHED: 'resource_published',
    RESOURCE_PUBLISH_FAILED: 'resource_publish_failed',

    // ── Orientación profesional ─────────────────────────────────────────
    ASESORIA_FILTER_CHANGED: 'asesoria_filter_changed',
    ASESORIA_CONTACT_CLICKED: 'asesoria_contact_clicked',
    ASESOR_PUBLISHED: 'asesor_published',
    ASESOR_PUBLISH_FAILED: 'asesor_publish_failed',

    // ── Vista rescatistas (rescatistas.html) ────────────────────────────
    RESCATE_PAGE_OPENED: 'rescate_page_opened',
    RESCATE_LIST_LOADED: 'rescate_list_loaded',
    RESCATE_LOAD_FAILED: 'rescate_load_failed',
    RESCATE_SEARCH: 'rescate_search',
    RESCATE_FILTER_CHANGED: 'rescate_filter_changed',
    RESCATE_VIEW_CHANGED: 'rescate_view_changed',
    RESCATE_EMPTY_SHOWN: 'rescate_empty_shown',
    RESCATE_CONTACT_CLICKED: 'rescate_contact_clicked',
    RESCATE_STATUS_CHANGED: 'rescate_status_changed',
    RESCATE_MAP_MARKER_CLICKED: 'rescate_map_marker_clicked',

    // ── Admin (admin.html) ──────────────────────────────────────────────
    ADMIN_LOGIN_ATTEMPTED: 'admin_login_attempted',
    ADMIN_LOGIN_SUCCEEDED: 'admin_login_succeeded',
    ADMIN_LOGIN_FAILED: 'admin_login_failed',
    ADMIN_TAB_VIEWED: 'admin_tab_viewed',
    ADMIN_POST_APPROVED: 'admin_post_approved',
    ADMIN_POST_REJECTED: 'admin_post_rejected',
    ADMIN_SOL_CUBIERTA: 'admin_sol_cubierta',
    ADMIN_SOL_LIBERADA: 'admin_sol_liberada',
    ADMIN_SOL_EDITED: 'admin_sol_edited',
    ADMIN_SCRAPER_RUN: 'admin_scraper_run',
    ADMIN_CENTRO_SAVED: 'admin_centro_saved',
    ADMIN_EDIFICIO_SAVED: 'admin_edificio_saved',
    ADMIN_ASESOR_PAUSED: 'admin_asesor_paused',
    ADMIN_ASESOR_ACTIVATED: 'admin_asesor_activated',
    ADMIN_INVITED: 'admin_invited',
  };

  /** Pantallas de index.html */
  const SCREENS = [
    'home',
    'reportar',
    'ayudar',
    'acopio',
    'ofrecer',
    'asesoria',
    'ofrecer-asesoria',
  ];

  const BLOCKED_PROP_KEYS = /^(telefono|whatsapp|nombre|direccion|lat|lng|source_url|descripcion|email|password)$/i;

  function sanitizeProps(props) {
    if (!props || typeof props !== 'object') return {};
    const out = {};
    for (const [k, v] of Object.entries(props)) {
      if (BLOCKED_PROP_KEYS.test(k)) continue;
      if (v === undefined || v === null || v === '') continue;
      out[k] = v;
    }
    return out;
  }

  function accuracyBucket(m) {
    if (m == null || Number.isNaN(m)) return null;
    if (m < 50) return 'high';
    if (m < 200) return 'medium';
    return 'low';
  }

  function screenPath(screen) {
    return screen === 'home' ? '/' : '/' + screen;
  }

  function screenFromPath(pathname) {
    const slug = (pathname || '/').replace(/^\/+|\/+$/g, '');
    return slug && SCREENS.includes(slug) ? slug : 'home';
  }

  /**
   * Web Analytics de PostHog solo lee $pageview (no eventos custom).
   * Cambiamos la URL con history.pushState y dejamos que capture_pageview:
   * 'history_change' emita $pageview y $pageleave como en una SPA normal.
   * @param {string} screen
   */
  function capturePageview(screen) {
    const path = screenPath(screen);
    const target = path + (global.location.search || '');
    const current = global.location.pathname + (global.location.search || '');
    if (current === target) {
      if (global.posthog && typeof global.posthog.capture === 'function') {
        global.posthog.capture('$pageview');
      }
      if (global.__FORVZLA_ANALYTICS_DEBUG__) {
        console.debug('[analytics]', '$pageview', { path, screen, mode: 'initial' });
      }
      return;
    }
    global.history.pushState({ screen }, '', target);
    if (global.__FORVZLA_ANALYTICS_DEBUG__) {
      console.debug('[analytics]', '$pageview', { path, screen, mode: 'history_change' });
    }
  }

  /**
   * @param {string} event
   * @param {Record<string, unknown>} [props]
   */
  function track(event, props) {
    const payload = sanitizeProps(props);
    if (global.posthog && typeof global.posthog.capture === 'function') {
      global.posthog.capture(event, payload);
    }
    if (global.__FORVZLA_ANALYTICS_DEBUG__) {
      console.debug('[analytics]', event, payload);
    }
  }

  /**
   * Inicializar PostHog (llamar una vez al cargar index.html / admin.html).
   * @param {string} apiKey — project API key (pública, como la anon de Supabase)
   * @param {{ apiHost?: string }} [opts]
   */
  function initPostHog(apiKey, opts) {
    if (!apiKey || !global.posthog) return;
    if (/(?:^|[?&])ph_debug=1(?:&|$)/.test(global.location.search)) {
      global.__FORVZLA_ANALYTICS_DEBUG__ = true;
    }
    global.posthog.init(apiKey, {
      api_host: (opts && opts.apiHost) || 'https://eu.i.posthog.com',
      ui_host: 'https://eu.posthog.com',
      persistence: 'cookie',
      person_profiles: 'always',
      capture_pageview: 'history_change',
      capture_pageleave: true,
      disable_session_recording: true,
      autocapture: false,
      loaded: function () {
        global.posthog.register({ app: 'ayuda_venezuela', host: global.location.host });
        track(EVENTS.APP_OPENED, {
          path: global.location.pathname,
          referrer_host: (() => {
            try {
              return global.document.referrer ? new URL(global.document.referrer).host : null;
            } catch {
              return null;
            }
          })(),
        });
        const screen = screenFromPath(global.location.pathname);
        if (screen !== 'home' && typeof global.__forvzlaGoScreenFromHistory === 'function') {
          global.__forvzlaGoScreenFromHistory(screen);
        }
        capturePageview(screen);
        track(EVENTS.SCREEN_VIEWED, { screen });
      },
    });
    global.addEventListener('popstate', function () {
      const screen = screenFromPath(global.location.pathname);
      if (typeof global.__forvzlaGoScreenFromHistory === 'function') {
        global.__forvzlaGoScreenFromHistory(screen);
      }
    });
  }

  global.ForVzlaAnalytics = {
    EVENTS,
    SCREENS,
    track,
    capturePageview,
    screenFromPath,
    initPostHog,
    accuracyBucket,
    sanitizeProps,
  };
})(typeof window !== 'undefined' ? window : globalThis);
