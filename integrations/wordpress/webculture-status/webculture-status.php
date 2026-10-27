<?php
/**
 * Plugin Name:       Web Culture status
 * Description:       Lets your hosting provider pause this site with a suspension page (for unpaid hosting) and switch it back on — managed from EventureOS. Logged-in administrators always see the site.
 * Version:           1.0.0
 * Requires at least: 5.6
 * Requires PHP:      7.4
 * Author:            Web Culture
 * License:           GPL-2.0-or-later
 */

if (!defined('ABSPATH')) exit;

define('WCS_HOST', 'https://www.eventureos.com.au');
define('WCS_TTL', 600); // check every 10 minutes

function wcs_key() { $k = trim((string) get_option('wcs_site_key', '')); return preg_match('/^[0-9a-f]{32}$/', $k) ? $k : ''; }
function wcs_host() { $h = trim((string) get_option('wcs_host', WCS_HOST)); return preg_match('#^https://[a-z0-9.-]+(:\d+)?$#i', $h) ? $h : WCS_HOST; }

/** Ask EventureOS (cached). If EventureOS can't be reached, the last answer stands; with no answer, the site stays on. */
function wcs_status($force = false) {
  $key = wcs_key();
  if (!$key) return null;
  $cached = get_transient('wcs_status');
  if (!$force && is_array($cached)) return $cached;
  $res = wp_remote_get(wcs_host() . '/api/public/hosting/status?key=' . rawurlencode($key), array('timeout' => 6, 'headers' => array('Accept' => 'application/json')));
  if (is_wp_error($res)) { $last = get_option('wcs_last'); set_transient('wcs_status', is_array($last) ? $last : array('suspended' => false), 120); return is_array($last) ? $last : null; }
  $code = wp_remote_retrieve_response_code($res);
  $body = json_decode(wp_remote_retrieve_body($res), true);
  if ($code === 404) { $s = array('suspended' => false, 'unknown' => true); }
  elseif ($code !== 200 || !is_array($body) || empty($body['ok'])) { $last = get_option('wcs_last'); set_transient('wcs_status', is_array($last) ? $last : array('suspended' => false), 120); return is_array($last) ? $last : null; }
  else { $s = array('suspended' => !empty($body['suspended'])); foreach (array('title', 'message', 'payUrl', 'contact', 'brand') as $f) if (isset($body[$f]) && is_string($body[$f])) $s[$f] = $body[$f]; }
  update_option('wcs_last', $s, false);
  set_transient('wcs_status', $s, WCS_TTL);
  return $s;
}

add_action('template_redirect', function () {
  if (is_admin() || current_user_can('manage_options')) return;
  if ((defined('DOING_CRON') && DOING_CRON) || (defined('REST_REQUEST') && REST_REQUEST) || wp_doing_ajax()) return;
  $s = wcs_status();
  if (!$s || empty($s['suspended'])) return;
  $title = isset($s['title']) ? $s['title'] : 'This website is temporarily unavailable';
  $msg = isset($s['message']) ? $s['message'] : '';
  $pay = (isset($s['payUrl']) && preg_match('#^https://#', $s['payUrl'])) ? $s['payUrl'] : '';
  $contact = (isset($s['contact']) && is_email($s['contact'])) ? $s['contact'] : '';
  $brand = isset($s['brand']) ? $s['brand'] : '';
  status_header(503);
  header('Retry-After: 3600');
  nocache_headers();
  echo '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>' . esc_html($title) . '</title>';
  echo '<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f4f4f5;font:16px/1.55 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#27272a}main{max-width:520px;margin:24px;background:#fff;border:1px solid #e4e4e7;border-radius:16px;padding:32px}h1{font-size:22px;margin:0 0 12px}a.b{display:inline-block;margin-top:20px;background:#18181b;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600}small{display:block;margin-top:20px;color:#71717a}</style></head><body><main>';
  echo '<h1>' . esc_html($title) . '</h1><p>' . nl2br(esc_html($msg)) . '</p>';
  if ($pay) echo '<a class="b" href="' . esc_url($pay) . '">Pay the hosting invoice</a>';
  if ($contact) echo '<small>Questions: <a href="mailto:' . esc_attr($contact) . '">' . esc_html($contact) . '</a>' . ($brand ? ' · ' . esc_html($brand) : '') . '</small>';
  echo '</main></body></html>';
  exit;
}, 0);

/* ------------------------------------------------------------ settings */
add_action('admin_menu', function () {
  add_options_page('Web Culture status', 'Web Culture status', 'manage_options', 'webculture-status', 'wcs_settings_page');
});
add_action('admin_init', function () {
  register_setting('wcs', 'wcs_site_key', array('type' => 'string', 'sanitize_callback' => function ($v) { $v = strtolower(trim((string) $v)); delete_transient('wcs_status'); return preg_match('/^[0-9a-f]{32}$/', $v) ? $v : ''; }));
  register_setting('wcs', 'wcs_host', array('type' => 'string', 'sanitize_callback' => function ($v) { $v = rtrim(trim((string) $v), '/'); delete_transient('wcs_status'); return preg_match('#^https://[a-z0-9.-]+(:\d+)?$#i', $v) ? $v : WCS_HOST; }));
});
function wcs_settings_page() {
  if (!current_user_can('manage_options')) return;
  $s = wcs_key() ? wcs_status(true) : null;
  echo '<div class="wrap"><h1>Web Culture status</h1><form method="post" action="options.php">';
  settings_fields('wcs');
  echo '<table class="form-table"><tr><th><label for="wcs_site_key">Site key</label></th><td><input id="wcs_site_key" name="wcs_site_key" class="regular-text code" value="' . esc_attr(wcs_key()) . '"><p class="description">From EventureOS → Hosting → this site.</p></td></tr>';
  echo '<tr><th><label for="wcs_host">EventureOS address</label></th><td><input id="wcs_host" name="wcs_host" class="regular-text code" value="' . esc_attr(wcs_host()) . '"></td></tr></table>';
  submit_button();
  echo '</form>';
  if (wcs_key()) {
    if (!$s) echo '<p>Couldn\'t reach EventureOS just now — the site stays as it was.</p>';
    elseif (!empty($s['unknown'])) echo '<p><strong>EventureOS doesn\'t know this key.</strong> Check it was copied in full.</p>';
    else echo '<p>Connected. This site is <strong>' . (empty($s['suspended']) ? 'on' : 'suspended (visitors see the suspension page; you see the site because you\'re logged in)') . '</strong>.</p>';
  }
  echo '</div>';
}
register_deactivation_hook(__FILE__, function () { delete_transient('wcs_status'); });
