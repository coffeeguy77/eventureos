<?php
/**
 * Plugin Name:       EventureOS Bookings
 * Plugin URI:        https://www.eventureos.com.au
 * Description:       Your EventureOS booking form (block + [eventureos_booking] shortcode), and an optional read-only bridge that copies Bookly bookings into EventureOS.
 * Version:           1.1.0
 * Requires at least: 5.8
 * Requires PHP:      7.4
 * Author:            EventureOS
 * License:           GPLv2 or later
 * Text Domain:       eventureos-bookings
 */

if (!defined('ABSPATH')) exit;

define('EOS_BOOKINGS_VERSION', '1.1.0');
define('EOS_BOOKINGS_HOST', 'https://www.eventureos.com.au');

/* ---------------------------------------------------------------- settings */

function eos_opt($k, $d = '') { $v = get_option('eventureos_' . $k, $d); return $v === false ? $d : $v; }
function eos_host() { $h = trim((string) eos_opt('host', EOS_BOOKINGS_HOST)); return preg_match('#^https://[a-z0-9.-]+(:\d+)?$#i', $h) ? $h : EOS_BOOKINGS_HOST; }
function eos_slug() { $s = strtolower(trim((string) eos_opt('slug', ''))); return preg_match('/^[a-z0-9-]{1,80}$/', $s) ? $s : ''; }

/* ---------------------------------------------------------------- the booking form */

function eos_render($atts) {
  $a = shortcode_atts(array('course' => '', 'page' => '', 'session' => '', 'min_height' => '700', 'business' => ''), $atts, 'eventureos_booking');
  $slug = $a['business'] && preg_match('/^[a-z0-9-]{1,80}$/', $a['business']) ? $a['business'] : eos_slug();
  if (!$slug) {
    return current_user_can('manage_options')
      ? '<p style="padding:16px;border:1px dashed #d4d4d8;border-radius:12px">EventureOS booking form: add your business link name in <a href="' . esc_url(admin_url('options-general.php?page=eventureos-bookings')) . '">Settings → EventureOS Bookings</a>.</p>'
      : '';
  }
  wp_enqueue_script('eventureos-embed', eos_host() . '/embed.js', array(), EOS_BOOKINGS_VERSION, true);
  $attrs = ' data-eventureos-book="' . esc_attr($slug) . '"';
  if ($a['course'] && preg_match('/^[a-z0-9-]{1,80}$/', $a['course'])) $attrs .= ' data-course="' . esc_attr($a['course']) . '"';
  if ($a['page'] === 'gift') $attrs .= ' data-page="gift"';
  if ($a['session'] && preg_match('/^[0-9a-f-]{36}$/i', $a['session'])) $attrs .= ' data-session="' . esc_attr($a['session']) . '"';
  $h = max(300, min(3000, intval($a['min_height'])));
  $attrs .= ' data-min-height="' . $h . '"';
  // A link inside works without JavaScript too
  $url = eos_host() . '/book/' . rawurlencode($slug) . ($a['page'] === 'gift' ? '/gift' : ($a['course'] ? '/' . rawurlencode($a['course']) : ''));
  return '<div class="eventureos-booking"' . $attrs . '><p><a href="' . esc_url($url) . '">Book online</a></p></div>';
}
add_shortcode('eventureos_booking', 'eos_render');

add_action('init', function () {
  wp_register_script('eventureos-block', plugins_url('block.js', __FILE__), array('wp-blocks', 'wp-element', 'wp-block-editor', 'wp-components'), EOS_BOOKINGS_VERSION, true);
  if (function_exists('register_block_type')) {
    register_block_type('eventureos/booking', array(
      'editor_script' => 'eventureos-block',
      'attributes' => array('course' => array('type' => 'string', 'default' => ''), 'page' => array('type' => 'string', 'default' => ''), 'minHeight' => array('type' => 'number', 'default' => 700)),
      'render_callback' => function ($attr) { return eos_render(array('course' => $attr['course'] ?? '', 'page' => $attr['page'] ?? '', 'min_height' => $attr['minHeight'] ?? 700)); },
    ));
  }
});

/* ---------------------------------------------------------------- Bookly → EventureOS (read only) */

function eos_bookly_tables() {
  global $wpdb;
  $p = $wpdb->prefix . 'bookly_';
  $out = array();
  foreach (array('appointments', 'customer_appointments', 'customers', 'services', 'payments') as $t) {
    $name = $p . $t;
    $exists = $wpdb->get_var($wpdb->prepare('SHOW TABLES LIKE %s', $name)) === $name;
    $cols = array();
    if ($exists) foreach ($wpdb->get_results("SHOW COLUMNS FROM `$name`", ARRAY_A) as $c) $cols[] = $c['Field'];
    $out[$t] = array('name' => $name, 'exists' => $exists, 'columns' => $cols);
  }
  return $out;
}

/** Column if Bookly has it, else NULL — so a Bookly update that renames something can't break the query. */
function eos_col($tables, $t, $alias, $col, $as) {
  return in_array($col, $tables[$t]['columns'], true) ? "$alias.`$col` AS `$as`" : "NULL AS `$as`";
}

function eos_bookly_rows($where, $args, $limit) {
  global $wpdb;
  $T = eos_bookly_tables();
  foreach (array('appointments', 'customer_appointments', 'customers') as $need) if (!$T[$need]['exists']) return new WP_Error('eos_no_bookly', 'Bookly tables not found (' . $T[$need]['name'] . ')');
  foreach (array(array('customer_appointments', 'id'), array('customer_appointments', 'appointment_id'), array('customer_appointments', 'customer_id'), array('appointments', 'id'), array('appointments', 'start_date')) as $req) {
    if (!in_array($req[1], $T[$req[0]]['columns'], true)) return new WP_Error('eos_bookly_cols', 'Bookly table ' . $T[$req[0]]['name'] . ' has no ' . $req[1] . ' column');
  }
  $sel = array(
    'ca.`id` AS ca_id', 'ca.`appointment_id` AS appointment_id',
    eos_col($T, 'customer_appointments', 'ca', 'number_of_persons', 'persons'), eos_col($T, 'customer_appointments', 'ca', 'status', 'status'),
    eos_col($T, 'customer_appointments', 'ca', 'notes', 'notes'), eos_col($T, 'customer_appointments', 'ca', 'created_at', 'created'),
    eos_col($T, 'appointments', 'a', 'service_id', 'service_id'), 'a.`start_date` AS start', eos_col($T, 'appointments', 'a', 'end_date', 'end'),
    eos_col($T, 'appointments', 'a', 'custom_service_name', 'custom_service_name'),
    eos_col($T, 'customers', 'c', 'full_name', 'full_name'), eos_col($T, 'customers', 'c', 'first_name', 'first_name'), eos_col($T, 'customers', 'c', 'last_name', 'last_name'),
    eos_col($T, 'customers', 'c', 'email', 'email'), eos_col($T, 'customers', 'c', 'phone', 'phone'),
  );
  $joinPay = '';
  if ($T['payments']['exists'] && in_array('payment_id', $T['customer_appointments']['columns'], true)) {
    $sel[] = eos_col($T, 'payments', 'p', 'total', 'p_total'); $sel[] = eos_col($T, 'payments', 'p', 'paid', 'p_paid');
    $sel[] = eos_col($T, 'payments', 'p', 'status', 'p_status'); $sel[] = eos_col($T, 'payments', 'p', 'type', 'p_type');
    $joinPay = ' LEFT JOIN `' . $T['payments']['name'] . '` p ON p.id = ca.payment_id';
  }
  $sql = 'SELECT ' . implode(', ', $sel) . ' FROM `' . $T['customer_appointments']['name'] . '` ca JOIN `' . $T['appointments']['name'] . '` a ON a.id = ca.appointment_id LEFT JOIN `' . $T['customers']['name'] . '` c ON c.id = ca.customer_id' . $joinPay
    . ' WHERE ' . $where . ' ORDER BY ca.id ASC LIMIT ' . intval($limit);
  $rows = $wpdb->get_results($args ? $wpdb->prepare($sql, $args) : $sql, ARRAY_A);
  if ($wpdb->last_error) return new WP_Error('eos_sql', $wpdb->last_error);
  $out = array();
  foreach ($rows as $r) {
    $name = trim((string) ($r['full_name'] ?: trim(($r['first_name'] ?? '') . ' ' . ($r['last_name'] ?? ''))));
    $out[] = array(
      'ca_id' => $r['ca_id'], 'appointment_id' => $r['appointment_id'], 'service_id' => $r['service_id'], 'service_title' => $r['custom_service_name'],
      'start' => $r['start'], 'end' => $r['end'], 'persons' => $r['persons'] !== null ? intval($r['persons']) : 1, 'status' => $r['status'], 'notes' => $r['notes'], 'created' => $r['created'],
      'customer' => array('name' => $name, 'email' => $r['email'], 'phone' => $r['phone']),
      'payment' => isset($r['p_status']) ? array('total' => $r['p_total'], 'paid' => $r['p_paid'], 'status' => $r['p_status'], 'type' => $r['p_type']) : null,
    );
  }
  return $out;
}

function eos_bookly_services() {
  global $wpdb;
  $T = eos_bookly_tables();
  if (!$T['services']['exists']) return array();
  $sel = array('s.`id` AS id', eos_col($T, 'services', 's', 'title', 'title'), eos_col($T, 'services', 's', 'duration', 'duration'), eos_col($T, 'services', 's', 'price', 'price'), eos_col($T, 'services', 's', 'capacity_max', 'capacity_max'));
  $rows = $wpdb->get_results('SELECT ' . implode(', ', $sel) . ' FROM `' . $T['services']['name'] . '` s', ARRAY_A);
  $out = array();
  foreach ($rows as $r) $out[] = array('id' => $r['id'], 'title' => (string) $r['title'], 'duration' => $r['duration'] !== null ? intval($r['duration']) : null, 'price' => $r['price'], 'capacity_max' => $r['capacity_max'] !== null ? intval($r['capacity_max']) : null);
  return $out;
}

/** Every Bookly customer (students), including people whose old bookings are no longer in Bookly. */
function eos_bookly_customers($after, $limit) {
  global $wpdb;
  $T = eos_bookly_tables();
  if (!$T['customers']['exists'] || !in_array('id', $T['customers']['columns'], true)) return new WP_Error('eos_no_customers', 'Bookly customers table not found');
  $sel = array('c.`id` AS id', eos_col($T, 'customers', 'c', 'full_name', 'full_name'), eos_col($T, 'customers', 'c', 'first_name', 'first_name'), eos_col($T, 'customers', 'c', 'last_name', 'last_name'),
    eos_col($T, 'customers', 'c', 'email', 'email'), eos_col($T, 'customers', 'c', 'phone', 'phone'), eos_col($T, 'customers', 'c', 'created_at', 'created'));
  $rows = $wpdb->get_results($wpdb->prepare('SELECT ' . implode(', ', $sel) . ' FROM `' . $T['customers']['name'] . '` c WHERE c.id > %d ORDER BY c.id ASC LIMIT ' . intval($limit), array($after)), ARRAY_A);
  if ($wpdb->last_error) return new WP_Error('eos_sql', $wpdb->last_error);
  $out = array();
  foreach ($rows as $r) {
    $name = trim((string) ($r['full_name'] ?: trim(($r['first_name'] ?? '') . ' ' . ($r['last_name'] ?? ''))));
    $out[] = array('id' => $r['id'], 'name' => $name, 'email' => $r['email'], 'phone' => $r['phone'], 'created' => $r['created']);
  }
  return $out;
}

function eos_post($body) {
  $key = (string) eos_opt('key', '');
  if (!preg_match('/^eos_live_[0-9a-f]{48}$/', $key)) return new WP_Error('eos_key', 'Add your EventureOS plugin key first.');
  $res = wp_remote_post(eos_host() . '/api/public/wordpress', array(
    'timeout' => 90, 'headers' => array('Authorization' => 'Bearer ' . $key, 'Content-Type' => 'application/json'), 'body' => wp_json_encode($body), 'data_format' => 'body',
  ));
  if (is_wp_error($res)) return $res;
  $json = json_decode(wp_remote_retrieve_body($res), true);
  if (!is_array($json)) return new WP_Error('eos_http', 'EventureOS replied ' . wp_remote_retrieve_response_code($res));
  if (empty($json['ok'])) return new WP_Error('eos_api', isset($json['error']) ? (string) $json['error'] : 'EventureOS refused the request');
  return $json;
}

/**
 * One sync run: everything new since last time (in batches), plus every booking from yesterday onwards
 * (so cancellations and date changes in Bookly reach EventureOS).
 */
function eos_sync($max_batches = 6) {
  if (!eos_opt('sync_bookly', '')) return array('ok' => false, 'error' => 'Bookly sync is off');
  if (get_transient('eos_sync_lock')) return array('ok' => false, 'error' => 'A sync is already running');
  set_transient('eos_sync_lock', 1, 5 * MINUTE_IN_SECONDS);
  $services = eos_bookly_services();
  $tz = function_exists('wp_timezone_string') ? wp_timezone_string() : get_option('timezone_string');
  $total = array('created' => 0, 'updated' => 0, 'skipped' => 0, 'ignored' => 0, 'errors' => array());
  $fail = null;
  // 1. Students: every Bookly customer (sent once; new ones each run)
  $lastCust = intval(eos_opt('last_customer_id', 0));
  $total['students'] = 0;
  for ($i = 0; $i < $max_batches * 2; $i++) {
    $cust = eos_bookly_customers($lastCust, 500);
    if (is_wp_error($cust)) { $total['errors'][] = 'Students: ' . $cust->get_error_message(); break; }
    if (!$cust) break;
    $r = eos_post(array('action' => 'bookly_customers', 'tz' => $tz, 'customers' => $cust));
    // A problem copying students never stops bookings being copied (they count seats)
    if (is_wp_error($r)) { $total['errors'][] = 'Students: ' . $r->get_error_message(); break; }
    $total['students'] += intval($r['created'] ?? 0);
    $lastCust = intval(end($cust)['id']);
    update_option('eventureos_last_customer_id', $lastCust, false);
    if (count($cust) < 500) break;
  }
  // 2. Bookings
  $last = intval(eos_opt('last_ca_id', 0));
  for ($i = 0; $i < $max_batches && !$fail; $i++) {
    $rows = eos_bookly_rows('ca.id > %d', array($last), 300);
    if (is_wp_error($rows)) { $fail = $rows; break; }
    if (!$rows) break;
    $r = eos_post(array('action' => 'bookly_sync', 'tz' => $tz, 'services' => $services, 'appointments' => $rows));
    if (is_wp_error($r)) { $fail = $r; break; }
    foreach (array('created', 'updated', 'skipped', 'ignored') as $k) $total[$k] += intval($r[$k] ?? 0);
    if (!empty($r['errors'])) $total['errors'] = array_slice(array_merge($total['errors'], (array) $r['errors']), 0, 10);
    $last = intval(end($rows)['ca_id']);
    update_option('eventureos_last_ca_id', $last, false);
    if (count($rows) < 300) break;
  }
  if (!$fail) {
    $since = wp_date('Y-m-d 00:00:00', time() - DAY_IN_SECONDS);
    $rows = eos_bookly_rows('a.start_date >= %s AND ca.id <= %d', array($since, $last), 1000);
    if (is_wp_error($rows)) $fail = $rows;
    elseif ($rows) {
      $r = eos_post(array('action' => 'bookly_sync', 'tz' => $tz, 'services' => $services, 'appointments' => $rows));
      if (is_wp_error($r)) $fail = $r; else { $total['updated'] += intval($r['updated'] ?? 0); $total['created'] += intval($r['created'] ?? 0); }
    }
  }
  delete_transient('eos_sync_lock');
  $result = $fail ? array('ok' => false, 'error' => $fail->get_error_message(), 'at' => time()) : array_merge(array('ok' => true, 'at' => time()), $total);
  update_option('eventureos_last_sync', $result, false);
  return $result;
}

add_filter('cron_schedules', function ($s) { $s['eos_ten_minutes'] = array('interval' => 600, 'display' => 'Every 10 minutes (EventureOS)'); return $s; });
add_action('eos_bookly_sync_event', function () { eos_sync(); });
function eos_schedule() {
  $on = eos_opt('sync_bookly', '') && eos_opt('key', '');
  $next = wp_next_scheduled('eos_bookly_sync_event');
  if ($on && !$next) wp_schedule_event(time() + 60, 'eos_ten_minutes', 'eos_bookly_sync_event');
  if (!$on && $next) wp_clear_scheduled_hook('eos_bookly_sync_event');
}
add_action('update_option_eventureos_sync_bookly', 'eos_schedule');
add_action('update_option_eventureos_key', 'eos_schedule');
add_action('add_option_eventureos_sync_bookly', 'eos_schedule');
register_deactivation_hook(__FILE__, function () { wp_clear_scheduled_hook('eos_bookly_sync_event'); });

/* ---------------------------------------------------------------- admin page */

add_action('admin_menu', function () {
  add_options_page('EventureOS Bookings', 'EventureOS Bookings', 'manage_options', 'eventureos-bookings', 'eos_admin_page');
});
add_filter('plugin_action_links_' . plugin_basename(__FILE__), function ($l) { array_unshift($l, '<a href="' . esc_url(admin_url('options-general.php?page=eventureos-bookings')) . '">Settings</a>'); return $l; });

add_action('admin_post_eos_save', function () {
  if (!current_user_can('manage_options')) wp_die('Not allowed');
  check_admin_referer('eos_save');
  $slug = strtolower(sanitize_text_field(wp_unslash($_POST['slug'] ?? '')));
  update_option('eventureos_slug', preg_match('/^[a-z0-9-]{1,80}$/', $slug) ? $slug : '');
  $key = trim(sanitize_text_field(wp_unslash($_POST['key'] ?? '')));
  if ($key !== '' && preg_match('/^eos_live_[0-9a-f]{48}$/', $key)) update_option('eventureos_key', $key, false);
  if (!empty($_POST['forget_key'])) update_option('eventureos_key', '', false);
  update_option('eventureos_sync_bookly', !empty($_POST['sync_bookly']) ? '1' : '');
  eos_schedule();
  wp_safe_redirect(admin_url('options-general.php?page=eventureos-bookings&saved=1'));
  exit;
});
add_action('admin_post_eos_test', function () {
  if (!current_user_can('manage_options')) wp_die('Not allowed');
  check_admin_referer('eos_test');
  $r = eos_post(array('action' => 'ping'));
  set_transient('eos_notice', is_wp_error($r) ? array('error', $r->get_error_message()) : array('success', 'Connected to EventureOS: ' . ($r['organisation'] ?? '') . ' — booking page ' . ($r['booking_page'] ?? '')), 60);
  if (!is_wp_error($r) && !eos_slug() && !empty($r['slug'])) update_option('eventureos_slug', $r['slug']);
  wp_safe_redirect(admin_url('options-general.php?page=eventureos-bookings'));
  exit;
});
add_action('admin_post_eos_sync', function () {
  if (!current_user_can('manage_options')) wp_die('Not allowed');
  check_admin_referer('eos_sync');
  $r = eos_sync(20);
  set_transient('eos_notice', $r['ok'] ? array('success', sprintf('Bookly sync done: %d new students, %d bookings added, %d updated, %d already there.', $r['students'] ?? 0, $r['created'], $r['updated'], $r['skipped'])) : array('error', 'Bookly sync: ' . $r['error']), 60);
  wp_safe_redirect(admin_url('options-general.php?page=eventureos-bookings'));
  exit;
});

function eos_admin_page() {
  if (!current_user_can('manage_options')) return;
  $notice = get_transient('eos_notice'); delete_transient('eos_notice');
  $key = (string) eos_opt('key', '');
  $last = eos_opt('last_sync', array());
  $T = eos_bookly_tables();
  $hasBookly = $T['appointments']['exists'] && $T['customer_appointments']['exists'];
  ?>
  <div class="wrap">
    <h1>EventureOS Bookings</h1>
    <?php if (!empty($_GET['saved'])) echo '<div class="notice notice-success"><p>Saved.</p></div>'; ?>
    <?php if ($notice) echo '<div class="notice notice-' . esc_attr($notice[0]) . '"><p>' . esc_html($notice[1]) . '</p></div>'; ?>
    <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>">
      <?php wp_nonce_field('eos_save'); ?><input type="hidden" name="action" value="eos_save">
      <table class="form-table" role="presentation">
        <tr><th scope="row"><label for="eos-slug">Business link name</label></th>
          <td><input id="eos-slug" name="slug" class="regular-text" value="<?php echo esc_attr(eos_slug()); ?>" placeholder="your-business">
            <p class="description">The part after <code>/book/</code> in your EventureOS booking page address.</p></td></tr>
        <tr><th scope="row"><label for="eos-key">Plugin key</label></th>
          <td><input id="eos-key" name="key" type="password" class="regular-text" autocomplete="off" placeholder="<?php echo $key ? esc_attr(substr($key, 0, 13) . '… (saved)') : 'eos_live_…'; ?>">
            <p class="description">Only needed for the Bookly sync. Make one in EventureOS: Bookings → Website &amp; settings.<?php if ($key) echo ' <label><input type="checkbox" name="forget_key" value="1"> Remove the saved key</label>'; ?></p></td></tr>
        <tr><th scope="row">Bookly</th>
          <td><label><input type="checkbox" name="sync_bookly" value="1" <?php checked(eos_opt('sync_bookly', ''), '1'); ?> <?php disabled(!$hasBookly); ?>> Copy Bookly bookings to EventureOS every 10 minutes</label>
            <p class="description"><?php echo $hasBookly ? 'Read-only: Bookly itself is never changed.' : 'Bookly isn\'t installed on this site.'; ?></p></td></tr>
      </table>
      <?php submit_button('Save'); ?>
    </form>
    <hr>
    <h2>Use it</h2>
    <p>Add the <strong>EventureOS booking</strong> block to a page, or this shortcode: <code>[eventureos_booking]</code> &nbsp; One course: <code>[eventureos_booking course="course-link-name"]</code> &nbsp; Gifts: <code>[eventureos_booking page="gift"]</code></p>
    <p>
      <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>" style="display:inline"><?php wp_nonce_field('eos_test'); ?><input type="hidden" name="action" value="eos_test"><?php submit_button('Test connection', 'secondary', 'submit', false, $key ? array() : array('disabled' => 'disabled')); ?></form>
      &nbsp;
      <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>" style="display:inline"><?php wp_nonce_field('eos_sync'); ?><input type="hidden" name="action" value="eos_sync"><?php submit_button('Sync Bookly now', 'secondary', 'submit', false, ($key && eos_opt('sync_bookly', '')) ? array() : array('disabled' => 'disabled')); ?></form>
    </p>
    <?php if ($last) : ?>
      <p><strong>Last sync:</strong> <?php echo esc_html(wp_date('j M Y g:i a', intval($last['at'] ?? 0))); ?> —
        <?php echo !empty($last['ok']) ? esc_html(sprintf('%d new students, %d bookings added, %d updated, %d already there', $last['students'] ?? 0, $last['created'] ?? 0, $last['updated'] ?? 0, $last['skipped'] ?? 0)) : '<span style="color:#b32d2e">' . esc_html($last['error'] ?? 'failed') . '</span>'; ?>
        <?php if (!empty($last['errors'])) echo '<br><small>' . esc_html(implode(' · ', array_slice((array) $last['errors'], 0, 3))) . '</small>'; ?></p>
      <p><small>Copied up to Bookly customer #<?php echo intval(eos_opt('last_customer_id', 0)); ?> and booking #<?php echo intval(eos_opt('last_ca_id', 0)); ?>. Next automatic run: <?php $n = wp_next_scheduled('eos_bookly_sync_event'); echo $n ? esc_html(wp_date('g:i a', $n)) : 'not scheduled'; ?>.</small></p>
    <?php endif; ?>
    <details><summary>Diagnostics</summary>
      <table class="widefat striped" style="max-width:900px;margin-top:8px"><thead><tr><th>Bookly table</th><th>Found</th><th>Columns</th></tr></thead><tbody>
      <?php foreach ($T as $t) echo '<tr><td><code>' . esc_html($t['name']) . '</code></td><td>' . ($t['exists'] ? 'yes' : 'no') . '</td><td><small>' . esc_html(implode(', ', $t['columns'])) . '</small></td></tr>'; ?>
      </tbody></table>
      <p><small>Plugin <?php echo esc_html(EOS_BOOKINGS_VERSION); ?> · EventureOS <?php echo esc_html(eos_host()); ?> · Site timezone <?php echo esc_html(function_exists('wp_timezone_string') ? wp_timezone_string() : ''); ?></small></p>
    </details>
  </div>
  <?php
}
